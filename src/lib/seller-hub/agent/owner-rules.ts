import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PRICE_GUARD, type PriceGuardConfig } from "./guardrails";
import type { Criterion, PlanAction, Strategy } from "./strategy";

/**
 * Постоянные правила владельца для ИИ-менеджера (раздел «Агенты»): что ИИ не трогает никогда и какая маржа нижняя.
 * Правила действуют на все планы: и по сигналам алгоритмов, и из диалога. Соблюдение проверяет программа после ответа ИИ, а не просьба в тексте:
 * запрещённые шаги вычёркиваются из плана, а нижняя маржа добавляется ограничителем (если план нарушит её, он останавливается).
 */

export const FORBID_AREAS = ["prices", "ads", "cards"] as const;
export type ForbidArea = (typeof FORBID_AREAS)[number];

export const FORBID_LABEL: Record<ForbidArea, string> = {
  prices: "Цены, скидки и акции",
  ads: "Реклама (ставки, кампании, минус-фразы, бюджет)",
  cards: "Карточки (название, описание, характеристики)",
};

export type OwnerRules = { forbid: ForbidArea[]; minMarginPct: number };

export const NO_RULES: OwnerRules = { forbid: [], minMarginPct: 0 };

export const isForbidArea = (v: string): v is ForbidArea => (FORBID_AREAS as readonly string[]).includes(v);

/** Значение настройки «ai.forbid»: области через запятую. Пустая строка: ничего не запрещено. */
export function parseForbid(value: unknown): ForbidArea[] {
  if (typeof value !== "string") return [];
  return [...new Set(value.split(",").map((s) => s.trim()).filter(isForbidArea))];
}

export const isValidForbidString = (value: unknown): boolean => typeof value === "string" && value.length <= 40 && value.split(",").map((s) => s.trim()).filter(Boolean).every(isForbidArea);

export function areaOf(action: PlanAction): ForbidArea {
  if (action.type === "price" || action.type === "club_discount" || action.type === "promo_join" || action.type === "promo_exit") return "prices";
  if (action.type === "content_edit" || action.type === "characteristics_edit") return "cards";
  return "ads";
}

/**
 * Ограничитель «не должно ухудшиться» не может быть нарушен уже в день начала: если метрика сейчас хуже границы, граница опускается до текущего значения
 * (план не должен ухудшать то, что есть), а цель плана остаётся в критериях успеха. Иначе план остановился бы сам в первый же день.
 */
export function relaxStartedGuards(strategy: Strategy, current: Partial<Record<string, number>>): Strategy {
  const guards = strategy.guards.map((g) => {
    const now = current[g.metric];
    if (now == null || !Number.isFinite(now)) return g;
    if (g.op === ">=" && now < g.value) return { ...g, value: Math.floor(now * 10) / 10 };
    if (g.op === "<=" && now > g.value) return { ...g, value: Math.ceil(now * 10) / 10 };
    return g;
  });
  return { ...strategy, guards };
}

/**
 * Вычёркивает запрещённые шаги и добавляет нижнюю маржу ограничителем. План без шагов после вычёркивания возвращается как null.
 * current: текущие значения метрик товара из проверенных доказательств решения; по ним нижняя маржа не ставится выше того, что есть сейчас.
 */
export function applyOwnerRules(strategy: Strategy | null, rules: OwnerRules, current: Partial<Record<string, number>> = {}): Strategy | null {
  if (!strategy) return null;
  let out = strategy;
  if (rules.forbid.length > 0) {
    const steps = out.steps.filter((s) => !s.action || !rules.forbid.includes(areaOf(s.action)));
    if (steps.length === 0) return null;
    out = { ...out, steps };
  }
  if (rules.minMarginPct > 0) {
    const own = out.guards.find((g) => g.metric === "margin_pct" && g.op === ">=");
    const guards: Criterion[] = own ? out.guards.map((g) => (g === own ? { ...g, value: Math.max(g.value, rules.minMarginPct) } : g)) : [...out.guards, { metric: "margin_pct", op: ">=", value: rules.minMarginPct } as Criterion].slice(0, 4);
    out = { ...out, guards };
  }
  return relaxStartedGuards(out, current);
}

/** Текущие значения метрик из доказательств решения. */
export const currentFromEvidence = (evidence: Array<{ key: string; value: number }>): Record<string, number> => Object.fromEntries(evidence.filter((e) => typeof e.value === "number").map((e) => [e.key, e.value]));

export async function loadOwnerRules(db: SupabaseClient, userId: string): Promise<OwnerRules> {
  const { data } = await db.from("seller_hub_user_settings").select("setting_key, value").eq("user_id", userId).in("setting_key", ["ai.forbid", "ai.minMarginPct"]);
  const byKey = new Map((data ?? []).map((r) => [String((r as { setting_key: string }).setting_key), (r as { value: unknown }).value]));
  const margin = Number(byKey.get("ai.minMarginPct"));
  return { forbid: parseForbid(byKey.get("ai.forbid")), minMarginPct: Number.isFinite(margin) ? Math.min(60, Math.max(0, Math.round(margin))) : 0 };
}

/** Строка для подсказки ИИ: знание правил экономит ему попытки; соблюдение всё равно проверяет программа. */
export function ownerRulesPrompt(rules: OwnerRules): string {
  const parts: string[] = [];
  if (rules.forbid.length > 0) parts.push(`владелец запретил менять: ${rules.forbid.map((a) => FORBID_LABEL[a].toLowerCase()).join("; ")}. Таких шагов в плане быть не должно`);
  if (rules.minMarginPct > 0) parts.push(`нижняя маржа владельца ${rules.minMarginPct}%: план не должен её нарушать`);
  return parts.length > 0 ? `Постоянные правила владельца: ${parts.join("; ")}.` : "";
}

/** Добавляет правила владельца в JSON-нагрузку для ИИ. Нагрузка не JSON: возвращается как есть. */
export function withOwnerRules(payload: string, rules: OwnerRules): string {
  const text = ownerRulesPrompt(rules);
  if (!text) return payload;
  try {
    const obj = JSON.parse(payload) as Record<string, unknown>;
    return JSON.stringify({ ...obj, owner_standing_rules: text });
  } catch {
    return payload;
  }
}

/**
 * Ограничители цены владельца. Только строже стандартных: запас над безубыточностью не меньше 5%, шаг не больше 5%, пауза между шагами не меньше 24 часов.
 * Значения вне допустимых диапазонов или не заданные заменяются стандартными.
 */
export const PRICE_GUARD_LIMITS = { cushionPct: { min: 5, max: 30, def: 5 }, stepPct: { min: 1, max: 5, def: 5 }, cooldownHours: { min: 24, max: 168, def: 24 } } as const;

export function priceGuardFromSettings(values: { cushionPct?: unknown; stepPct?: unknown; cooldownHours?: unknown }): PriceGuardConfig {
  const pick = (v: unknown, lim: { min: number; max: number; def: number }) => (Number.isFinite(Number(v)) && Number(v) >= lim.min && Number(v) <= lim.max ? Math.round(Number(v)) : lim.def);
  return { ...DEFAULT_PRICE_GUARD, breakEvenCushion: pick(values.cushionPct, PRICE_GUARD_LIMITS.cushionPct) / 100, maxStep: pick(values.stepPct, PRICE_GUARD_LIMITS.stepPct) / 100, cooldownHours: pick(values.cooldownHours, PRICE_GUARD_LIMITS.cooldownHours) };
}

export async function loadOwnerPriceGuard(db: SupabaseClient, userId: string): Promise<PriceGuardConfig> {
  const { data } = await db.from("seller_hub_user_settings").select("setting_key, value").eq("user_id", userId).in("setting_key", ["ai.priceCushionPct", "ai.priceStepPct", "ai.priceCooldownHours"]);
  const by = new Map((data ?? []).map((r) => [String((r as { setting_key: string }).setting_key), (r as { value: unknown }).value]));
  return priceGuardFromSettings({ cushionPct: by.get("ai.priceCushionPct"), stepPct: by.get("ai.priceStepPct"), cooldownHours: by.get("ai.priceCooldownHours") });
}
