import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeStoredStrategy, type Strategy, type StrategyStep } from "./strategy";

/**
 * Правка шагов плана словами из чата («убери шаг 3», «сдвинь проверку на 10-й день», «добавь шаг: сфотографировать ведро в комплекте»).
 * Правится только сохранённый план, не принятый владельцем: принятый план уже идёт, его шаги привязаны к выполненным действиям, поэтому его пересобирают.
 * Кабинет WB здесь не затрагивается.
 */
export type PlanEditSpec = { planId?: unknown; op?: unknown; stepIndex?: unknown; day?: unknown; text?: unknown };

const whenOf = (day: number) => (day <= 0 ? "сразу" : day === 1 ? "через 1 день" : `через ${day} дн.`);
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const int = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) ? n : null;
};

/** Чистая правка стратегии. Возвращает новую стратегию и фразу о том, что изменилось, либо причину отказа. */
export function editStrategy(strategy: Strategy, spec: PlanEditSpec): { strategy: Strategy; summary: string } | { error: string } {
  const op = typeof spec.op === "string" ? spec.op : "";
  const steps = strategy.steps.map((s) => ({ ...s }));
  const idx = int(spec.stepIndex);
  const need = () => (idx != null && idx >= 0 && idx < steps.length ? steps[idx]! : null);
  if (op === "remove_step") {
    const s = need();
    if (!s) return { error: "такого шага в плане нет" };
    if (steps.length <= 1) return { error: "в плане остался один шаг: убрать его нельзя, план можно пересобрать" };
    steps.splice(idx!, 1);
    return { strategy: { ...strategy, steps }, summary: `убрал шаг «${s.step.slice(0, 80)}»` };
  }
  if (op === "change_day") {
    const s = need();
    const day = int(spec.day);
    if (!s) return { error: "такого шага в плане нет" };
    if (day == null || day < 0 || day > 90) return { error: "день должен быть от 0 до 90" };
    s.day = day;
    s.when = whenOf(day);
    steps.sort((a, b) => a.day - b.day);
    return { strategy: { ...strategy, steps }, summary: `шаг «${s.step.slice(0, 80)}» теперь ${s.when}` };
  }
  if (op === "change_text") {
    const s = need();
    const text = clean(spec.text, 400);
    if (!s) return { error: "такого шага в плане нет" };
    if (text.length < 5) return { error: "текст шага слишком короткий" };
    if (s.action) return { error: "это действие выполняет программа: текст такого шага не меняется, его можно убрать или сдвинуть" };
    s.step = text;
    return { strategy: { ...strategy, steps }, summary: `переписал шаг: «${text.slice(0, 80)}»` };
  }
  if (op === "add_step") {
    const day = int(spec.day) ?? 0;
    const text = clean(spec.text, 400);
    if (day < 0 || day > 90) return { error: "день должен быть от 0 до 90" };
    if (text.length < 5) return { error: "не хватает текста нового шага" };
    if (steps.length >= 10) return { error: "в плане уже 10 шагов: больше добавить нельзя" };
    const step: StrategyStep = { step: text, by: "human", day, when: whenOf(day), action: null };
    steps.push(step);
    steps.sort((a, b) => a.day - b.day);
    return { strategy: { ...strategy, steps }, summary: `добавил шаг ${whenOf(day)}: «${text.slice(0, 80)}»` };
  }
  return { error: "неизвестная правка" };
}

export type PlanInChat = { id: string; nmId: string; title: string; accepted: boolean; steps: Array<{ i: number; day: number; by: string; step: string }> };

/** Планы этого диалога для ИИ: по ним он понимает, какой шаг имеет в виду владелец. */
export async function loadPlansInChat(db: SupabaseClient, userId: string, chatId: string): Promise<PlanInChat[]> {
  const { data } = await db.from("seller_hub_ai_findings").select("id, nm_id, title, strategy, owner_accepted, status").eq("user_id", userId).eq("origin", "chat").like("fingerprint", `chat:${chatId}:%`);
  return (data ?? [])
    .filter((r) => r.status !== "dismissed")
    .flatMap((r) => {
      const st = normalizeStoredStrategy(r.strategy);
      return st ? [{ id: String(r.id), nmId: String(r.nm_id ?? ""), title: String(r.title ?? ""), accepted: r.owner_accepted === true, steps: st.steps.map((s, i) => ({ i, day: s.day, by: s.by, step: s.step.slice(0, 160) })) }] : [];
    });
}

/** Применяет правки к сохранённым планам диалога. Возвращает фразы о сделанном, причины отказов и id изменённых планов. */
export async function applyPlanEdits(db: SupabaseClient, userId: string, chatId: string, specs: PlanEditSpec[]): Promise<{ done: string[]; refused: string[]; ids: string[] }> {
  const done: string[] = [];
  const refused: string[] = [];
  const ids: string[] = [];
  for (const spec of specs.slice(0, 4)) {
    const id = typeof spec.planId === "string" ? spec.planId : "";
    const { data: row } = await db.from("seller_hub_ai_findings").select("id, strategy, owner_accepted, fingerprint").eq("id", id).eq("user_id", userId).maybeSingle();
    if (!row || typeof row.fingerprint !== "string" || !row.fingerprint.startsWith(`chat:${chatId}:`)) {
      refused.push("такого плана в этом диалоге нет");
      continue;
    }
    if (row.owner_accepted === true) {
      refused.push("план уже принят и идёт: его шаги привязаны к выполненным действиям. Напишите «Отредактируй план…», и я соберу новую версию");
      continue;
    }
    const st = normalizeStoredStrategy(row.strategy);
    if (!st) {
      refused.push("план не удалось прочитать");
      continue;
    }
    const res = editStrategy(st, spec);
    if ("error" in res) {
      refused.push(res.error);
      continue;
    }
    const plan = res.strategy.steps.map((p) => ({ step: `${p.when}: ${p.step}`, by: p.by, action: null }));
    const { error } = await db.from("seller_hub_ai_findings").update({ strategy: res.strategy, plan }).eq("id", id).eq("user_id", userId);
    if (error) {
      refused.push("не удалось сохранить правку");
      continue;
    }
    done.push(res.summary);
    if (!ids.includes(id)) ids.push(id);
  }
  return { done, refused, ids };
}
