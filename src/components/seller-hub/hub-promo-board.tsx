"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildWbProductImageCandidates } from "@/lib/auto-replies/wb-basket-routes";
import { fetchSellerHubPromotionRoster } from "@/lib/seller-hub/client-api";
import { AlertTriangle, ArrowDown, ChevronRight, X } from "lucide-react";
import { saleMargin } from "@/lib/seller-hub/product-signal";
import {
  catalogPaceMedian,
  classifyPromoSku,
  readOrderPace,
  type PromoCohort,
  type PromoSkuAdvice,
} from "@/lib/seller-hub/promo-cohort";
import type {
  SellerCatalogItem,
  SellerCatalogSnapshot,
  SellerFunnelSnapshot,
  SellerPromotionRow,
  SellerRealizationSnapshot,
} from "@/lib/seller-hub/types";
import { formatInt, formatRub, hub, hubNumeric, hubSans } from "./hub-ui";

type SkuLine = {
  item: SellerCatalogItem;
  nmId: number;
  planPrice: number | null;
  current: number | null;
  marginNow: ReturnType<typeof saleMargin>;
  marginPromo: ReturnType<typeof saleMargin>;
  inPromo: boolean;
  planDiscount: number | null;
  advice: PromoSkuAdvice;
};

type BoardRow = {
  promo: SellerPromotionRow;
  inAction: SkuLine[];
};

type PendingAction = {
  nmId: number;
  mode: "apply" | "exit" | "keep";
};

function promoPhoto(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.replace("/images/tm/", "/images/c246x328/").replace("/images/c516x688/", "/images/c246x328/");
}

function basketPhoto(nmId: number): string | undefined {
  if (!Number.isFinite(nmId) || nmId <= 0) return undefined;
  return buildWbProductImageCandidates(nmId, [])[0];
}

function daysUntil(end?: string): number | null {
  if (!end) return null;
  const ms = new Date(end).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.ceil(ms / 86_400_000);
}

function shortPromoDate(iso?: string): string {
  if (!iso) return "—";
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "—";
  return new Date(time).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function formatPromoDates(start?: string, end?: string): string {
  if (!start && !end) return "—";
  if (start && end) return `${shortPromoDate(start)} — ${shortPromoDate(end)}`;
  return start ? `с ${shortPromoDate(start)}` : `до ${shortPromoDate(end)}`;
}

function countdown(end?: string): string | null {
  const days = daysUntil(end);
  if (days == null) return null;
  if (days < 0) return "завершена";
  if (days === 0) return "последний день";
  return `Осталось ${formatInt(days)} дн.`;
}

function linesFor(
  promo: SellerPromotionRow,
  items: SellerCatalogItem[],
  linked: SellerCatalogItem[],
  terms: SellerCatalogSnapshot["promotionEntryTerms"],
  realization: SellerRealizationSnapshot | null | undefined,
  funnel: SellerFunnelSnapshot | null | undefined,
  peerMedian: number | null,
): SkuLine[] {
  const byNm = terms?.[promo.id] ?? {};
  const catalog = new Map<string, SellerCatalogItem>();
  const remember = (item: SellerCatalogItem) => {
    catalog.set(item.externalId, item);
    const nmId = Number(item.externalId);
    if (Number.isFinite(nmId)) catalog.set(String(nmId), item);
  };
  for (const item of items) remember(item);
  for (const item of linked) remember(item);

  const participants = new Set<string>();
  for (const nmId of promo.participantNmIds ?? []) participants.add(String(nmId));
  for (const item of linked) participants.add(item.externalId);
  for (const item of items) {
    if ((item.promotionIds ?? []).includes(promo.id)) participants.add(item.externalId);
  }

  const ids = new Set<string>(participants);
  for (const [nm, term] of Object.entries(byNm)) {
    if (term?.inAction === true || (term?.planPrice != null && term.planPrice > 0)) ids.add(nm);
  }

  const realizationReady = Boolean(realization && !realization.error);
  const rows: SkuLine[] = [];
  for (const nm of ids) {
    const item =
      catalog.get(nm) ??
      ({
        id: nm,
        marketplaceId: "wildberries",
        externalId: nm,
        vendorCode: "",
        title: `Артикул ${nm}`,
      } satisfies SellerCatalogItem);
    const term = byNm[item.externalId] ?? byNm[String(Number(item.externalId))];
    const current = item.discountedPrice ?? item.price ?? null;
    const planPrice = term?.planPrice != null && term.planPrice > 0 ? term.planPrice : null;
    const marginNow = saleMargin({
      realization,
      externalId: item.externalId,
      cost: item.costPrice,
      sale: current,
    });
    const marginPromo = saleMargin({
      realization,
      externalId: item.externalId,
      cost: item.costPrice,
      sale: planPrice,
    });
    const inPromo = participants.has(item.externalId) || participants.has(String(Number(item.externalId))) || term?.inAction === true;
    const advice = classifyPromoSku({
      currentPrice: current,
      planPrice,
      costPrice: item.costPrice,
      realizationReady,
      marginNow: marginNow ? { rub: marginNow.rub, percent: marginNow.percent } : null,
      marginPromo: marginPromo ? { rub: marginPromo.rub, percent: marginPromo.percent } : null,
      pace: readOrderPace(item.externalId, funnel),
      peerMedian,
    });
    rows.push({
      item,
      nmId: Number(item.externalId),
      planPrice,
      current,
      marginNow,
      marginPromo,
      inPromo,
      planDiscount: term?.planDiscount != null && term.planDiscount > 0 ? term.planDiscount : null,
      advice,
    });
  }
  return rows;
}

type PromoPhase = "active" | "upcoming" | "ended";

function ruCount(count: number, one: string, few: string, many: string): string {
  const n10 = Math.abs(count) % 10;
  const n100 = Math.abs(count) % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

function cleanPromoName(name: string): string {
  const cleaned = name
    .replace(/\s*\((?:автоматические скидки|автоакция)\)\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || name;
}

function promoPhase(promo: SellerPromotionRow, now = Date.now()): PromoPhase {
  const start = promo.startAt ? Date.parse(promo.startAt) : NaN;
  const end = promo.endAt ? Date.parse(promo.endAt) : NaN;
  if (Number.isFinite(end) && end < now) return "ended";
  if (Number.isFinite(start) && start > now) return "upcoming";
  return "active";
}

function reportedSku(promo: SellerPromotionRow): number {
  const raw = promo.inPromoTotal ?? promo.participatingSkuCount ?? 0;
  return raw > 0 ? raw : 0;
}

function phaseSortKey(board: BoardRow, phase: PromoPhase): number {
  switch (phase) {
    case "upcoming": {
      const start = Date.parse(board.promo.startAt ?? "");
      return Number.isFinite(start) ? start : Number.MAX_SAFE_INTEGER;
    }
    case "active":
    case "ended": {
      const end = Date.parse(board.promo.endAt ?? "");
      return Number.isFinite(end) ? end : Number.MAX_SAFE_INTEGER;
    }
    default: {
      const unexpected: never = phase;
      return unexpected;
    }
  }
}

function boardsOfPhase(boards: BoardRow[], phase: PromoPhase): BoardRow[] {
  return boards
    .filter((board) => promoPhase(board.promo) === phase)
    .sort((a, b) => phaseSortKey(a, phase) - phaseSortKey(b, phase));
}

function deadlineBadge(promo: SellerPromotionRow): { text: string; urgent: boolean } | null {
  const phase = promoPhase(promo);
  if (phase === "ended") return { text: "Завершена", urgent: false };
  if (phase === "upcoming") {
    const days = daysUntil(promo.startAt);
    if (days == null || days < 0) return null;
    return {
      text: days === 0 ? "Старт сегодня" : `Старт через ${formatInt(days)} дн.`,
      urgent: days <= 3,
    };
  }
  const text = countdown(promo.endAt);
  if (!text) return null;
  const days = daysUntil(promo.endAt);
  return { text, urgent: days != null && days >= 0 && days <= 3 };
}

function cohortLines(board: BoardRow, cohort: PromoCohort): SkuLine[] {
  return board.inAction.filter((line) => line.advice.cohort === cohort);
}

function maxReachedBoost(promo: SellerPromotionRow): { boost: number; rate: number; reached: boolean } | null {
  const rows = (promo.ranging ?? []).filter(
    (row): row is { participationRate: number; boost: number } =>
      typeof row.boost === "number" &&
      Number.isFinite(row.boost) &&
      row.boost > 0 &&
      typeof row.participationRate === "number" &&
      Number.isFinite(row.participationRate),
  );
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a.participationRate - b.participationRate);
  const percent = promo.participationPercent;
  if (percent == null) {
    const top = sorted[sorted.length - 1];
    if (!top) return null;
    return { boost: top.boost, rate: top.participationRate, reached: false };
  }
  const reached = [...sorted].reverse().find((row) => percent >= row.participationRate);
  if (reached) return { boost: reached.boost, rate: reached.participationRate, reached: true };
  const next = sorted[0];
  if (!next) return null;
  return { boost: next.boost, rate: next.participationRate, reached: false };
}

function rangingPhrase(promo: SellerPromotionRow): string | null {
  const tier = maxReachedBoost(promo);
  if (!tier) return null;
  if (tier.reached) {
    return `В поиске WB это +${formatInt(tier.boost)}%.`;
  }
  return `До +${formatInt(tier.boost)}% в поиске, если участие дойдёт до ${formatInt(tier.rate)}%.`;
}

function advantageSentence(advantages: string[] | undefined): string | null {
  const words = (advantages ?? []).map((item) => item.trim()).filter((item) => item.length > 0).slice(0, 4);
  if (words.length === 0) return null;
  const lowered = words.map((word) => word.charAt(0).toLocaleLowerCase("ru-RU") + word.slice(1));
  if (lowered.length === 1) return `WB обещает: ${lowered[0]}.`;
  const last = lowered[lowered.length - 1];
  return `WB обещает: ${lowered.slice(0, -1).join(", ")} и ${last}.`;
}

function spineNote(promo: SellerPromotionRow): string {
  const phase = promoPhase(promo);
  if (phase === "ended") return "закрыта";
  const days = daysUntil(phase === "upcoming" ? promo.startAt : promo.endAt);
  if (days == null || days < 0) return phase === "upcoming" ? "скоро" : "";
  if (days === 0) return "сегодня";
  return phase === "upcoming" ? `через ${formatInt(days)} дн.` : `ещё ${formatInt(days)} дн.`;
}

type PromoPolicy = {
  mode: "never" | "ifSafe";
  maxDiscount: number | null;
};

const OPEN_POLICY: PromoPolicy = { mode: "ifSafe", maxDiscount: null };

function discountShare(current: number | null, plan: number | null): number | null {
  if (current == null || plan == null || current <= 0) return null;
  if (plan >= current) return 0;
  return ((current - plan) / current) * 100;
}

function participationSentence(promo: SellerPromotionRow): string | null {
  const inn = reportedSku(promo);
  const out = typeof promo.notInPromoTotal === "number" && promo.notInPromoTotal >= 0 ? promo.notInPromoTotal : null;
  if (inn <= 0 && (out == null || out <= 0)) return null;
  if (inn > 0 && out != null) {
    return `${formatInt(inn)} участвуют, ${formatInt(out)} не участвуют.`;
  }
  if (inn > 0) return `${formatInt(inn)} участвуют.`;
  return `${formatInt(out ?? 0)} не участвуют.`;
}

function marginSentence(board: BoardRow): string | null {
  const boost = cohortLines(board, "boost").length;
  const hold = cohortLines(board, "hold").length;
  const loss = cohortLines(board, "loss").length;
  if (boost + hold + loss === 0) return null;
  const parts: string[] = [];
  if (boost > 0) parts.push(`можно входить — ${formatInt(boost)}`);
  if (hold > 0) parts.push(`цену лучше не отдавать — ${formatInt(hold)}`);
  if (loss > 0) parts.push(`уйдёт в минус — ${formatInt(loss)}`);
  return `По рублям с 1 штуки: ${parts.join(", ")}.`;
}

export function HubPromoBoard({
  promotions,
  items,
  linkedByPromo,
  terms,
  realization,
  funnel,
  connected,
  busy,
  onApply,
  onExit,
}: {
  promotions: SellerPromotionRow[];
  items: SellerCatalogItem[];
  linkedByPromo: Map<string, SellerCatalogItem[]>;
  terms: SellerCatalogSnapshot["promotionEntryTerms"];
  realization: SellerRealizationSnapshot | null | undefined;
  funnel: SellerFunnelSnapshot | null | undefined;
  connected?: boolean;
  busy: boolean;
  onApply: (promo: SellerPromotionRow, nmIds: number[]) => Promise<boolean>;
  onExit: (promo: SellerPromotionRow, nmIds: number[]) => Promise<boolean>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [liveMembers, setLiveMembers] = useState<Record<string, number[]>>({});
  const [liveTerms, setLiveTerms] = useState<
    Record<string, Record<string, { planPrice?: number; planDiscount?: number; price?: number; inAction?: boolean }>>
  >({});
  const peerMedian = useMemo(() => catalogPaceMedian(items, funnel), [items, funnel]);
  const promoKey = promotions.map((promo) => `${promo.id}:${promo.type ?? ""}`).join("|");
  const catalogKey = items.map((item) => item.externalId).join(",");
  const promotionsRef = useRef(promotions);
  const itemsRef = useRef(items);
  promotionsRef.current = promotions;
  itemsRef.current = items;

  useEffect(() => {
    if (!connected || promoKey.length === 0) return;
    let cancelled = false;
    const nmIds = itemsRef.current
      .map((item) => Number(item.externalId))
      .filter((id) => Number.isFinite(id) && id > 0)
      .slice(0, 500);
    const phaseRank: Record<PromoPhase, number> = { active: 0, upcoming: 1, ended: 2 };
    const queue = [...promotionsRef.current].sort((a, b) => {
      const phaseA = promoPhase(a);
      const phaseB = promoPhase(b);
      if (phaseRank[phaseA] !== phaseRank[phaseB]) return phaseRank[phaseA] - phaseRank[phaseB];
      return phaseSortKey({ promo: a, inAction: [] }, phaseA) - phaseSortKey({ promo: b, inAction: [] }, phaseB);
    });
    void (async () => {
      for (let index = 0; index < queue.length; index += 1) {
        if (cancelled) return;
        if (index > 0) await new Promise((resolve) => setTimeout(resolve, 700));
        if (cancelled) return;
        const promo = queue[index];
        if (!promo) continue;
        const promotionId = Number(promo.id);
        if (!Number.isFinite(promotionId) || promotionId <= 0) continue;
        const result = await fetchSellerHubPromotionRoster({
          promotionId,
          nmIds,
          isAuto: promo.type === "auto",
        });
        if (!result.ok || cancelled) continue;
        const memberIds = result.participating.map((row) => row.nmId);
        const byNm: Record<string, { planPrice?: number; planDiscount?: number; price?: number; inAction?: boolean }> = {};
        for (const row of [...result.participating, ...result.eligible]) {
          byNm[String(row.nmId)] = {
            planPrice: row.planPrice,
            planDiscount: row.planDiscount,
            price: row.price,
            inAction: row.inAction,
          };
        }
        setLiveMembers((prev) => ({ ...prev, [promo.id]: memberIds }));
        setLiveTerms((prev) => ({ ...prev, [promo.id]: byNm }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, promoKey, catalogKey]);

  const boards = useMemo<BoardRow[]>(() => {
    return promotions.map((promo) => {
      const members = liveMembers[promo.id];
      const extra = liveTerms[promo.id];
      const mergedPromo = members
        ? { ...promo, participantNmIds: [...new Set([...(promo.participantNmIds ?? []), ...members])] }
        : promo;
      const mergedTerms = extra
        ? { ...(terms ?? {}), [promo.id]: { ...(terms?.[promo.id] ?? {}), ...extra } }
        : terms;
      return {
        promo: mergedPromo,
        inAction: linesFor(
          mergedPromo,
          items,
          linkedByPromo.get(promo.id) ?? [],
          mergedTerms,
          realization,
          funnel,
          peerMedian,
        ),
      };
    });
  }, [promotions, items, linkedByPromo, terms, realization, funnel, peerMedian, liveMembers, liveTerms]);

  const open = boards.find((board) => board.promo.id === openId) ?? null;
  const openBoard = (id: string) => {
    setPending(null);
    setOpenId(id);
  };

  const ordered = [
    ...boardsOfPhase(boards, "active"),
    ...boardsOfPhase(boards, "upcoming"),
    ...boardsOfPhase(boards, "ended"),
  ];

  return (
    <div>
      <PromoStage
        boards={ordered}
        focusId={focusId}
        onFocus={setFocusId}
        onOpen={openBoard}
        connected={connected}
        busy={busy}
        onApply={onApply}
        onExit={onExit}
      />

      {open ? (
        <PromoDrawer
          board={open}
          policy={OPEN_POLICY}
          connected={connected}
          busy={busy}
          pending={pending}
          onPending={setPending}
          onClose={() => {
            setPending(null);
            setOpenId(null);
          }}
          onApply={onApply}
          onExit={onExit}
        />
      ) : null}
    </div>
  );
}

function PromoRule({
  policy,
  busy,
  canExit,
  armed,
  onChange,
  onArm,
  onCancelExit,
  onExitAll,
}: {
  policy: PromoPolicy;
  busy: boolean;
  canExit: boolean;
  armed: boolean;
  onChange: (policy: PromoPolicy) => void;
  onArm: () => void;
  onCancelExit: () => void;
  onExitAll: () => void;
}) {
  return (
    <>
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <label className="flex items-center gap-2 text-[14px]" style={{ ...hubSans, color: hub.text }}>
          Не предлагать скидку больше
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={90}
            disabled={policy.mode === "never"}
            value={policy.maxDiscount ?? ""}
            placeholder="—"
            onChange={(event) => {
              const raw = event.target.value.trim();
              if (!raw) {
                onChange({ mode: "ifSafe", maxDiscount: null });
                return;
              }
              const next = Number(raw);
              if (!Number.isFinite(next)) return;
              onChange({ mode: "ifSafe", maxDiscount: Math.min(90, Math.max(1, Math.round(next))) });
            }}
            className="h-8 w-14 rounded-md border bg-white px-2 text-center text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-[#0E1116] disabled:opacity-40"
            style={{ ...hubSans, ...hubNumeric, borderColor: hub.border, color: hub.text }}
          />
          %
        </label>
        <label className="flex items-center gap-2 text-[14px]" style={{ ...hubSans, color: hub.text }}>
          <input
            type="checkbox"
            checked={policy.mode === "never"}
            onChange={(event) => onChange({ ...policy, mode: event.target.checked ? "never" : "ifSafe" })}
            className="h-4 w-4 accent-[#1F4E3D]"
          />
          Держать товары вне акций
        </label>
        {canExit && policy.mode === "never" && !armed ? (
          <button
            type="button"
            onClick={onArm}
            className="text-[14px] underline decoration-[#E3E6EB] underline-offset-4 outline-none hover:decoration-[#0E1116] focus-visible:ring-2 focus-visible:ring-[#0E1116]"
            style={{ ...hubSans, color: hub.text }}
          >
            Снять текущие скидки
          </button>
        ) : null}
      </div>
      {armed ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
            Скидка станет 0%. В кабинет WB уйдёт только по этой кнопке.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={onExitAll}
            className="inline-flex h-8 items-center rounded-lg bg-[#0E1116] px-3 text-[13px] font-medium text-white outline-none hover:bg-[#2A3038] disabled:opacity-45"
            style={hubSans}
          >
            {busy ? "Записываю" : "Записать"}
          </button>
          <button type="button" onClick={onCancelExit} className="text-[13px] underline" style={{ ...hubSans, color: hub.textMuted }}>
            Отмена
          </button>
        </div>
      ) : null}
    </>
  );
}

type PosterTone = { bg: string; fg: string; quiet: string; line: string };

const FAMILY_PAINTS: PosterTone[] = [
  { bg: "#E7F6C9", fg: "#1A2E26", quiet: "#3E5C48", line: "rgba(26,46,38,0.16)" },
  { bg: "#F4E4C4", fg: "#2C2416", quiet: "#6A5430", line: "rgba(44,36,22,0.16)" },
  { bg: "#F6D8C8", fg: "#3A2418", quiet: "#7A4E38", line: "rgba(58,36,24,0.16)" },
  { bg: "#D7E8DC", fg: "#163028", quiet: "#3A5C4C", line: "rgba(22,48,40,0.16)" },
];

function promoFamilyKey(name: string): string {
  const stem = cleanPromoName(name).split(":")[0]?.trim().toLocaleLowerCase("ru-RU") ?? "";
  return stem || name.trim().toLocaleLowerCase("ru-RU");
}

function posterTone(promo: SellerPromotionRow): PosterTone {
  const key = promoFamilyKey(promo.name);
  if (key.includes("осен")) return FAMILY_PAINTS[0]!;
  if (key.includes("распродаж")) return FAMILY_PAINTS[1]!;
  if (key.includes("хит")) return FAMILY_PAINTS[2]!;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 33 + key.charCodeAt(i)) >>> 0;
  return FAMILY_PAINTS[hash % FAMILY_PAINTS.length] ?? FAMILY_PAINTS[0]!;
}

function posterDay(promo: SellerPromotionRow): { day: string; month: string } {
  const phase = promoPhase(promo);
  const iso = phase === "upcoming" ? promo.startAt : promo.endAt ?? promo.startAt;
  const time = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(time)) return { day: "—", month: "" };
  const date = new Date(time);
  return {
    day: String(date.getDate()),
    month: date.toLocaleDateString("ru-RU", { month: "short" }).replace(".", ""),
  };
}

function lineTitle(line: SkuLine): string {
  const title = line.item.title?.trim();
  return title && title.length > 0 ? title : line.item.externalId;
}

function joinTitles(lines: SkuLine[], limit = 3): string {
  const shown = lines.slice(0, limit).map(lineTitle);
  const rest = lines.length - shown.length;
  if (shown.length === 0) return "";
  return rest > 0 ? `${shown.join(", ")} и ещё ${formatInt(rest)}` : shown.join(", ");
}

function discountValues(board: BoardRow): number[] {
  const values: number[] = [];
  for (const line of board.inAction) {
    if (line.planDiscount != null && line.planDiscount > 0 && line.planDiscount < 100) {
      values.push(line.planDiscount);
      continue;
    }
    const share = discountShare(line.current, line.planPrice);
    if (share != null && share > 0 && share < 100) values.push(share);
  }
  return values;
}

function formatDiscount(values: number[]): string | null {
  if (values.length === 0) return null;
  const rounded = values.map((value) => Math.round(value));
  const min = Math.min(...rounded);
  const max = Math.max(...rounded);
  return min === max ? `${formatInt(min)}%` : `${formatInt(min)}–${formatInt(max)}%`;
}

type PromoMove = {
  headline: string;
  body: string;
  discountLabel: string | null;
  discountNote: string;
  addIds: number[];
  exitIds: number[];
  addNote: string;
  exitNote: string;
};

function promoMove(board: BoardRow): PromoMove {
  const promo = board.promo;
  const lines = board.inAction;
  const isAuto = promo.type === "auto" || promo.canManageProducts === false;
  const addLines = lines.filter((line) => !line.inPromo && line.advice.cohort === "boost" && line.planPrice != null);
  const lossIn = lines.filter((line) => line.inPromo && line.advice.cohort === "loss");
  const holdIn = lines.filter((line) => line.inPromo && line.advice.cohort === "hold");
  const lossOut = lines.filter((line) => !line.inPromo && line.advice.cohort === "loss");
  const openLines = lines.filter((line) => line.advice.cohort === "open");
  const exitLines = [...lossIn, ...holdIn];
  const discountLabel = formatDiscount(discountValues(board));
  const inn = reportedSku(promo);
  const out = typeof promo.notInPromoTotal === "number" ? promo.notInPromoTotal : null;
  const search = rangingPhrase(promo);
  const promised = advantageSentence(promo.advantages);
  const margin = marginSentence(board);
  const addIds = isAuto ? [] : addLines.map((line) => line.nmId);
  const exitIds = exitLines.map((line) => line.nmId);

  let addNote = "Состав для записи ещё не пришёл.";
  if (isAuto) addNote = "В автоакцию товары ставит WB. Календарь добавление не принимает.";
  else if (addIds.length > 0) addNote = "Цена входа выше порога убытка. В кабинет уйдёт после подтверждения.";
  else if (lossOut.length > 0) addNote = "Цена акции ниже порога убытка. Эти товары не добавляю.";
  else if (lines.length > 0) addNote = "Товаров, которым цена акции выгодна, нет.";

  let exitNote = "Артикулов в скидке здесь нет.";
  if (exitIds.length > 0) exitNote = "Скидка станет 0%. Запись только после подтверждения.";
  else if (inn > 0 && lines.length === 0) exitNote = "Счётчик WB есть, артикулы не названы. Сбрасывать скидку пока не на ком.";

  const extras = [margin, promised, search].filter((line): line is string => Boolean(line));
  const excluded =
    promo.type === "auto" && (promo.exceptionProductsCount ?? 0) > 0
      ? `До старта исключены ${formatInt(promo.exceptionProductsCount ?? 0)}.`
      : null;

  if (lines.length === 0) {
    const counts =
      inn > 0 && out != null
        ? `${formatInt(inn)} участвуют, ${formatInt(out)} не участвуют.`
        : inn > 0
          ? `${formatInt(inn)} участвуют.`
          : out != null && out > 0
            ? `${formatInt(out)} не участвуют.`
            : "Счётчики участия по этой акции пустые.";
    return {
      headline: counts,
      body: [
        "Имена товаров в этом снимке не сопоставились со счётчиком. Список артикулов не подставляю.",
        excluded,
        ...extras,
      ]
        .filter((line): line is string => Boolean(line))
        .join(" "),
      discountLabel: null,
      discountNote: "Процент появится, когда WB назовёт цену входа по артикулам.",
      addIds,
      exitIds,
      addNote,
      exitNote,
    };
  }

  const sentences: string[] = [];
  if (addIds.length > 0) {
    sentences.push(
      `Можно добавить ${formatInt(addIds.length)} ${ruCount(addIds.length, "товар", "товара", "товаров")}: ${joinTitles(addLines)}. После цены акции с 1 штуки ещё остаются деньги.`,
    );
  } else if (addLines.length > 0 && isAuto) {
    sentences.push(
      `${formatInt(addLines.length)} ${ruCount(addLines.length, "товар держит маржу", "товара держат маржу", "товаров держат маржу")} (${joinTitles(addLines)}). В автоакцию их ставит WB.`,
    );
  }
  if (lossIn.length > 0) {
    sentences.push(
      `Выйти из ${formatInt(lossIn.length)} ${ruCount(lossIn.length, "товара", "товаров", "товаров")}: ${joinTitles(lossIn)}. Цена акции ниже порога убытка, опускать скидку до неё не стоит.`,
    );
  }
  if (holdIn.length > 0) {
    sentences.push(
      `${formatInt(holdIn.length)} уже в акции и продаются не хуже остальных. Скидку лучше снять: прирост заказов WB не обещает.`,
    );
  }
  if (lossOut.length > 0) {
    sentences.push(`Не входить в ${formatInt(lossOut.length)}: ${joinTitles(lossOut)}.`);
  }
  if (openLines.length > 0) {
    sentences.push(
      `${formatInt(openLines.length)} без вердикта: нет себестоимости, отчёта реализации или цены входа.`,
    );
  }
  if (discountLabel) {
    sentences.push(
      `WB просит скидку ${discountLabel}. Свой процент KARTO в кабинет не отправляет: либо цена входа WB, либо скидка 0%.`,
    );
  }
  if (excluded) sentences.push(excluded);
  sentences.push(...extras);

  const headline = lossIn.length > 0
    ? "Из этой акции лучше выйти там, где цена уводит в минус."
    : addIds.length > 0
      ? "В эту акцию можно войти: после скидки WB с продажи остаются деньги."
      : holdIn.length > 0
        ? "Скидку лучше снять: эти товары и так не отстают по заказам."
        : isAuto
          ? "Состав считает WB. Здесь видно маржу только по тем артикулам, которые уже сопоставились."
          : "По этой акции нет ни входа, ни выхода.";

  return {
    headline,
    body: sentences.join(" "),
    discountLabel,
    discountNote: discountLabel ? "Цена входа, которую прислал WB." : "Скидку по артикулу покажу, когда список товаров есть в снимке.",
    addIds,
    exitIds,
    addNote,
    exitNote,
  };
}

function PromoStage({
  boards,
  focusId,
  onFocus,
  onOpen,
  connected,
  busy,
  onApply,
  onExit,
}: {
  boards: BoardRow[];
  focusId: string | null;
  onFocus: (id: string) => void;
  onOpen: (id: string) => void;
  connected?: boolean;
  busy: boolean;
  onApply: (promo: SellerPromotionRow, nmIds: number[]) => Promise<boolean>;
  onExit: (promo: SellerPromotionRow, nmIds: number[]) => Promise<boolean>;
}) {
  const [confirm, setConfirm] = useState<{ id: string; mode: "apply" | "exit" } | null>(null);
  if (boards.length === 0) return null;
  const focus = boards.find((board) => board.promo.id === focusId) ?? boards[0];
  if (!focus) return null;
  const focusPaint = posterTone(focus.promo);
  const namedIn = focus.inAction.filter((line) => line.inPromo);
  const share = focus.promo.participationPercent;
  const boostTier = maxReachedBoost(focus.promo);
  const entryLines = focus.inAction.filter(
    (line) => !line.inPromo && (line.planPrice != null || (line.planDiscount != null && line.planDiscount > 0)),
  );
  const listLines = [...namedIn, ...entryLines];
  const promoDiscount = formatDiscount(discountValues({ ...focus, inAction: listLines }));
  const planPrices = listLines
    .map((line) => line.planPrice)
    .filter((price): price is number => price != null && price > 0);
  const priceDoor =
    planPrices.length > 0
      ? (() => {
          const min = Math.min(...planPrices);
          const max = Math.max(...planPrices);
          return min === max ? `до ${formatRub(min)}` : `до ${formatRub(min)}–${formatRub(max)}`;
        })()
      : null;

  return (
    <div>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:thin] [scrollbar-color:rgba(14,17,22,0.28)_transparent] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(14,17,22,0.28)]">
        {boards.map((board) => {
          const promo = board.promo;
          const selected = promo.id === focus.promo.id;
          const paint = posterTone(promo);
          const date = posterDay(promo);
          const cardIn = reportedSku(promo);
          const cardOut = typeof promo.notInPromoTotal === "number" && promo.notInPromoTotal >= 0 ? promo.notInPromoTotal : null;
          const note = spineNote(promo);
          return (
            <button
              key={promo.id}
              type="button"
              onClick={() => {
                setConfirm(null);
                onFocus(promo.id);
              }}
              aria-pressed={selected}
              className="flex min-h-[212px] w-[360px] shrink-0 snap-start flex-col rounded-2xl px-5 py-4 text-left outline-none transition-[box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[#0E1116] focus-visible:ring-offset-2 motion-reduce:transition-none"
              style={{
                ...hubSans,
                backgroundColor: paint.bg,
                color: paint.fg,
                boxShadow: selected ? `inset 0 0 0 2px ${paint.fg}` : "inset 0 1px 0 rgba(255,255,255,0.35)",
              }}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-[34px] font-semibold leading-none tracking-[-0.04em]" style={hubNumeric}>
                  {date.day}
                  <span className="ml-1.5 text-[15px] font-medium" style={{ color: paint.quiet }}>
                    {date.month}
                  </span>
                </span>
                {note ? (
                  <span className="text-[14px] font-medium" style={{ color: paint.quiet }}>
                    {note}
                  </span>
                ) : null}
              </span>
              <span className="mt-3 line-clamp-2 text-balance text-[24px] font-semibold leading-7" title={cleanPromoName(promo.name)}>
                {cleanPromoName(promo.name)}
              </span>
              <span className="mt-1 text-[13px]" style={{ color: paint.quiet }}>
                {promo.type === "auto" ? "Автоакция" : "Сезонная"}
              </span>
              <span className="mt-auto grid grid-cols-2 gap-3 border-t pt-3" style={{ borderColor: paint.line }}>
                <span>
                  <span className="block text-[24px] font-semibold leading-none" style={hubNumeric}>
                    {formatInt(cardIn)}
                  </span>
                  <span className="mt-1.5 block text-[13px] leading-4" style={{ color: paint.quiet }}>
                    участвуют
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-[24px] font-semibold leading-none" style={hubNumeric}>
                    {cardOut != null ? formatInt(cardOut) : "—"}
                  </span>
                  <span className="mt-1.5 block text-[13px] leading-4" style={{ color: paint.quiet }}>
                    не участвуют
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <section
        className="mt-4 grid items-start gap-5 rounded-2xl border-2 border-[#0E1116] px-5 py-4 lg:grid-cols-[minmax(280px,440px)_minmax(0,1fr)]"
        style={{ backgroundColor: `color-mix(in srgb, ${focusPaint.bg} 16%, #F4F6F8)` }}
      >
        <div>
          <h3 className="text-balance text-[28px] font-semibold leading-8 tracking-[-0.03em]" style={{ ...hubSans, color: focusPaint.fg }}>
            {cleanPromoName(focus.promo.name)}
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {share != null ? (
              <MoveStat
                label="Доля участия"
                value={`${formatInt(Math.round(share))}%`}
                tint={focusPaint.bg}
                ink={focusPaint.fg}
              />
            ) : null}
            {boostTier ? (
              <MoveStat
                label="Буст"
                value={`+${formatInt(boostTier.boost)}%`}
                tint={focusPaint.bg}
                ink={focusPaint.fg}
              />
            ) : null}
            {promoDiscount ? (
              <MoveStat label="Порог входа" value={promoDiscount} tint={focusPaint.bg} ink={focusPaint.fg} />
            ) : null}
            {priceDoor ? (
              <MoveStat label="Цена входа" value={priceDoor} tint={focusPaint.bg} ink={focusPaint.fg} />
            ) : null}
          </div>
        </div>
        <PromoGoods lines={listLines} ink={focusPaint.fg} />
      </section>

      <section className="mt-5">
        <h3 className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
          Рекомендации по всем акциям
        </h3>
        <ul className="mt-3 flex flex-col gap-2">
          {boards.map((board) => {
            const move = promoMove(board);
            const paint = posterTone(board.promo);
            const selected = board.promo.id === focus.promo.id;
            const inn = reportedSku(board.promo);
            const out = typeof board.promo.notInPromoTotal === "number" ? board.promo.notInPromoTotal : null;
            return (
              <li
                key={board.promo.id}
                className="rounded-2xl border bg-white px-4 py-3"
                style={{
                  borderColor: selected ? paint.fg : "rgba(14,17,22,0.08)",
                  boxShadow: selected ? `inset 3px 0 0 ${paint.bg}` : undefined,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setConfirm(null);
                    onFocus(board.promo.id);
                  }}
                  className="flex w-full items-start gap-3 text-left outline-none"
                >
                  <span className="mt-1 h-12 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: paint.bg }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="text-[16px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                        {cleanPromoName(board.promo.name)}
                      </span>
                      <span className="text-[13px]" style={{ ...hubSans, ...hubNumeric, color: hub.textMuted }}>
                        {formatInt(inn)} участвуют
                        {out != null ? ` · ${formatInt(out)} не участвуют` : ""}
                      </span>
                    </span>
                    <span className="mt-1 block text-pretty text-[14px] leading-5" style={{ ...hubSans, color: hub.text }}>
                      {move.headline}
                    </span>
                  </span>
                </button>
                {connected && (move.exitIds.length > 0 || move.addIds.length > 0) ? (
                <div className="mt-2 flex flex-wrap gap-2 pl-[1.35rem]">
                  {move.exitIds.length > 0 ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirm({ id: board.promo.id, mode: "exit" })}
                      className="inline-flex h-9 items-center rounded-lg bg-[#0E1116] px-3 text-[13px] font-medium text-white outline-none hover:bg-[#2A3038] disabled:opacity-45"
                      style={hubSans}
                    >
                      Снять скидку с {formatInt(move.exitIds.length)}
                    </button>
                  ) : null}
                  {move.addIds.length > 0 && connected ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirm({ id: board.promo.id, mode: "apply" })}
                      className="inline-flex h-9 items-center rounded-lg border bg-white px-3 text-[13px] font-medium outline-none hover:bg-[#F4F6F8] disabled:opacity-45"
                      style={{ ...hubSans, borderColor: hub.border, color: hub.text }}
                    >
                      Записать цену для {formatInt(move.addIds.length)}
                    </button>
                  ) : null}
                </div>
                ) : null}
                {confirm?.id === board.promo.id && board.promo.id !== focus.promo.id && confirm.mode === "exit" ? (
                  <div className="pl-[1.35rem]">
                    <ConfirmBox
                      text={`Скидка станет 0% на ${formatInt(move.exitIds.length)} ${ruCount(move.exitIds.length, "товаре", "товарах", "товарах")}.`}
                      confirmLabel="Записать в WB"
                      busy={busy}
                      onCancel={() => setConfirm(null)}
                      onConfirm={() => {
                        void onExit(board.promo, move.exitIds).then((ok) => {
                          if (ok) setConfirm(null);
                        });
                      }}
                    />
                  </div>
                ) : null}
                {confirm?.id === board.promo.id && board.promo.id !== focus.promo.id && confirm.mode === "apply" ? (
                  <div className="pl-[1.35rem]">
                    <ConfirmBox
                      text={`В WB уйдёт цена входа на ${formatInt(move.addIds.length)} ${ruCount(move.addIds.length, "товар", "товара", "товаров")}.`}
                      confirmLabel="Записать в WB"
                      busy={busy}
                      onCancel={() => setConfirm(null)}
                      onConfirm={() => {
                        void onApply(board.promo, move.addIds).then((ok) => {
                          if (ok) setConfirm(null);
                        });
                      }}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function PromoThumb({ line }: { line: SkuLine }) {
  const primary = promoPhoto(line.item.imageUrl);
  const fallback = basketPhoto(line.nmId);
  const [src, setSrc] = useState(primary ?? fallback);
  return (
    <span className="h-14 w-11 shrink-0 overflow-hidden rounded-md bg-[#F4F6F8]">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => {
            if (fallback && src !== fallback) setSrc(fallback);
            else setSrc(undefined);
          }}
        />
      ) : null}
    </span>
  );
}

function PromoGoods({ lines, ink }: { lines: SkuLine[]; ink: string }) {
  if (lines.length === 0) return null;
  return (
    <ul className="max-h-[360px] overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(14,17,22,0.28)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(14,17,22,0.28)]">
      {lines.map((line) => {
        const share = line.planDiscount ?? discountShare(line.current, line.planPrice);
        return (
          <li key={`${line.item.id}-${line.nmId}`} className="flex items-center gap-3 border-b py-2 last:border-b-0" style={{ borderColor: "rgba(14,17,22,0.08)" }}>
            <PromoThumb line={line} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold leading-5" style={{ ...hubSans, color: ink }}>
                {lineTitle(line)}
              </span>
              <span className="mt-0.5 block truncate text-[13px] leading-4" style={{ ...hubSans, color: ink }}>
                {line.inPromo ? "в акции" : "порог входа"}
                {line.current != null ? ` · ${formatRub(line.current)}` : ""}
                {line.planPrice != null ? ` → ${formatRub(line.planPrice)}` : ""}
              </span>
            </span>
            {share != null && share > 0 ? (
              <span className="shrink-0 text-[18px] font-semibold" style={{ ...hubSans, ...hubNumeric, color: ink }}>
                {formatInt(Math.round(share))}%
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function MoveStat({ label, value, tint, ink }: { label: string; value: string; tint: string; ink: string }) {
  return (
    <div className="rounded-2xl px-4 py-4" style={{ backgroundColor: tint }}>
      <p className="text-[15px] font-medium" style={{ ...hubSans, color: ink }}>
        {label}
      </p>
      <p className="mt-2 text-[32px] font-semibold leading-none tracking-[-0.03em]" style={{ ...hubSans, ...hubNumeric, color: ink }}>
        {value}
      </p>
    </div>
  );
}
const DRAWER_COHORTS: Array<{ id: PromoCohort; label: string; color: string }> = [
  { id: "boost", label: "Можно входить", color: hub.text },
  { id: "hold", label: "Цену лучше не отдавать", color: hub.text },
  { id: "loss", label: "Уйдёт в минус", color: hub.danger },
  { id: "open", label: "Пока без вердикта", color: hub.textMuted },
];

function PromoDrawer({
  board,
  policy,
  connected,
  busy,
  pending,
  onPending,
  onClose,
  onApply,
  onExit,
}: {
  board: BoardRow;
  policy: PromoPolicy;
  connected?: boolean;
  busy: boolean;
  pending: PendingAction | null;
  onPending: (action: PendingAction | null) => void;
  onClose: () => void;
  onApply: (promo: SellerPromotionRow, nmIds: number[]) => Promise<boolean>;
  onExit: (promo: SellerPromotionRow, nmIds: number[]) => Promise<boolean>;
}) {
  const promo = board.promo;
  const isAuto = promo.type === "auto";
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/35" onClick={onClose} aria-hidden />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col border-l bg-white shadow-[-12px_0_40px_-20px_rgba(14,17,22,0.28)]"
        style={{ borderColor: hub.border }}
        role="dialog"
        aria-label={promo.name}
      >
        <div className="border-b px-5 py-4" style={{ borderColor: hub.borderSoft }}>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-[20px] font-semibold tracking-[-0.02em]" style={{ ...hubSans, color: hub.text }}>
                {cleanPromoName(promo.name)}
              </h2>
              <p className="mt-1 text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
                {isAuto ? "Автоакция" : "Сезонная"}
                {" · "}
                {formatPromoDates(promo.startAt, promo.endAt)}
              </p>
              <p className="mt-2 text-pretty text-[13px] leading-5" style={{ ...hubSans, color: hub.text }}>
                {isAuto
                  ? "Скидку включает WB. Снять её — ваша кнопка, и скидка станет 0%."
                  : "Войти — записать цену акции. Выйти — скидка 0%. Оба шага только после подтверждения."}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 outline-none hover:bg-[#F4F6F8] focus-visible:ring-2 focus-visible:ring-[#1F4E3D]"
              aria-label="Закрыть разбор"
            >
              <X className="h-4 w-4" style={{ color: hub.textMuted }} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {board.inAction.length === 0 ? (
            <div className="px-1 py-2">
              <p className="text-[14px] leading-6" style={{ ...hubSans, color: hub.text }}>
                {participationSentence(promo) ?? "В этой акции нет ваших товаров."}
              </p>
              {reportedSku(promo) > 0 ? (
                <p className="mt-2 text-[14px] leading-6" style={{ ...hubSans, color: hub.textMuted }}>
                  Имена товаров в этом снимке не сопоставились со счётчиком, поэтому скидку по каждому артикулу здесь не считаю.
                </p>
              ) : null}
            </div>
          ) : (
            DRAWER_COHORTS.map((group) => {
              const lines = cohortLines(board, group.id);
              if (lines.length === 0) return null;
              return (
                <section key={group.id} className="mb-6">
                  <h3 className="mb-1 text-[13px] font-semibold" style={{ ...hubSans, color: group.color }}>
                    {group.label}
                    <span className="ml-1" style={hubNumeric}>{formatInt(lines.length)}</span>
                  </h3>
                  <ul>
                    {lines.map((line) => (
                      <AdviceRow
                        key={line.item.id}
                        line={line}
                        promo={promo}
                        policy={policy}
                        connected={connected}
                        busy={busy}
                        pending={pending?.nmId === line.nmId ? pending : null}
                        onPending={onPending}
                        onApply={onApply}
                        onExit={onExit}
                      />
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}

function AdviceRow({
  line,
  promo,
  policy,
  connected,
  busy,
  pending,
  onPending,
  onApply,
  onExit,
}: {
  line: SkuLine;
  promo: SellerPromotionRow;
  policy: PromoPolicy;
  connected?: boolean;
  busy: boolean;
  pending: PendingAction | null;
  onPending: (action: PendingAction | null) => void;
  onApply: (promo: SellerPromotionRow, nmIds: number[]) => Promise<boolean>;
  onExit: (promo: SellerPromotionRow, nmIds: number[]) => Promise<boolean>;
}) {
  const photo = promoPhoto(line.item.imageUrl);
  const share = discountShare(line.current, line.planPrice);
  const overCap = policy.mode === "ifSafe" && policy.maxDiscount != null && share != null && share > policy.maxDiscount;
  const blockedByRule = policy.mode === "never" || overCap;
  const canApply = Boolean(connected) && line.advice.cohort !== "loss" && line.planPrice != null && !blockedByRule;
  const canExit = Boolean(connected) && line.inPromo;
  const drop = line.advice.dropRub;
  return (
    <li className="border-b py-4" style={{ borderColor: hub.borderSoft }}>
      <div className="flex gap-3">
        <div className="h-14 w-11 shrink-0 overflow-hidden rounded-md bg-[#F4F6F8]">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
            {line.item.title}
          </p>
          <p className="mt-1 text-[14px] font-semibold" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
            {line.current != null ? formatRub(line.current) : "—"}
            {line.planPrice != null ? (
              <span style={{ color: hub.textMuted }}>
                {" → "}
                {formatRub(line.planPrice)}
              </span>
            ) : null}
            {drop != null && drop > 0 ? (
              <span className="ml-1 inline-flex items-center font-medium" style={{ color: hub.textMuted }}>
                <ArrowDown className="h-3.5 w-3.5" />
                {formatRub(drop)}
              </span>
            ) : null}
          </p>
          <p className="mt-2 text-[13px] leading-5" style={{ ...hubSans, color: hub.text }}>
            {line.advice.verdict}
          </p>
          {line.advice.cohort === "loss" ? (
            <p className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold" style={{ ...hubSans, color: hub.danger }}>
              <AlertTriangle className="h-3.5 w-3.5" />
              В акцию не отправляю
            </p>
          ) : null}
          {policy.mode === "never" ? (
            <p className="mt-2 text-[12px] font-semibold" style={{ ...hubSans, color: hub.text }}>
              По правилу в акции не входим.
            </p>
          ) : null}
          {overCap && policy.maxDiscount != null ? (
            <p className="mt-2 text-[12px] font-semibold" style={{ ...hubSans, color: hub.text }}>
              Скидка {formatInt(Math.round(share ?? 0))}% больше вашего порога {formatInt(policy.maxDiscount)}%.
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {canApply && pending?.mode !== "apply" ? (
              <button
                type="button"
                onClick={() => onPending({ nmId: line.nmId, mode: "apply" })}
                className="inline-flex h-8 items-center rounded-lg bg-[#0E1116] px-3 text-[12px] font-medium text-white outline-none hover:bg-[#2A3038]"
                style={hubSans}
              >
                Применить акционную цену
              </button>
            ) : null}
            {canExit && pending?.mode !== "exit" ? (
              <button
                type="button"
                onClick={() => onPending({ nmId: line.nmId, mode: "exit" })}
                className="inline-flex h-8 items-center rounded-[11px] border bg-white px-3 text-[12px] font-semibold outline-none hover:bg-[#F4F6F8]"
                style={{ ...hubSans, borderColor: hub.border, color: hub.text }}
              >
                Удержать цену вне акции
              </button>
            ) : null}
            {!line.inPromo && line.advice.cohort !== "loss" && pending?.mode !== "keep" ? (
              <button
                type="button"
                onClick={() => onPending({ nmId: line.nmId, mode: "keep" })}
                className="inline-flex h-8 items-center rounded-[11px] border bg-white px-3 text-[12px] font-semibold outline-none hover:bg-[#F4F6F8]"
                style={{ ...hubSans, borderColor: hub.border, color: hub.text }}
              >
                Оставить текущую цену
              </button>
            ) : null}
          </div>
          {pending?.mode === "apply" ? (
            <ConfirmBox
              text={`Запишу в WB цену не выше ${line.planPrice != null ? formatRub(line.planPrice) : "порога акции"}.`}
              confirmLabel="Записать в WB"
              busy={busy}
              onCancel={() => onPending(null)}
              onConfirm={() => {
                void onApply(promo, [line.nmId]).then((ok) => {
                  if (ok) onPending(null);
                });
              }}
            />
          ) : null}
          {pending?.mode === "exit" ? (
            <ConfirmBox
              text={`Скидка станет 0%${line.item.price != null ? `, цена ${formatRub(line.item.price)}` : ""}. Товар выйдет из цены акции.`}
              confirmLabel="Записать в WB"
              busy={busy}
              onCancel={() => onPending(null)}
              onConfirm={() => {
                void onExit(promo, [line.nmId]).then((ok) => {
                  if (ok) onPending(null);
                });
              }}
            />
          ) : null}
          {pending?.mode === "keep" ? (
            <div className="mt-2 rounded-lg border px-3 py-2" style={{ borderColor: hub.border, backgroundColor: hub.surfaceMuted }}>
              <p className="text-[12px] leading-[1.45]" style={{ ...hubSans, color: hub.text }}>
                Цена не меняется. В WB ничего не отправляю.
              </p>
              <button
                type="button"
                onClick={() => onPending(null)}
                className="mt-2 text-[12px] font-semibold underline"
                style={{ color: hub.textMuted }}
              >
                Понятно
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function ConfirmBox({
  text,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  text: string;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-2 rounded-lg border px-3 py-2" style={{ borderColor: hub.border, backgroundColor: hub.surfaceMuted }}>
      <p className="text-[12px] leading-[1.45]" style={{ ...hubSans, color: hub.text }}>
        {text}
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="inline-flex h-8 items-center rounded-lg bg-[#0E1116] px-3 text-[12px] font-medium text-white outline-none hover:bg-[#2A3038] disabled:opacity-45"
          style={hubSans}
        >
          {busy ? "Записываю" : confirmLabel}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="text-[12px] font-semibold underline"
          style={{ color: hub.textMuted }}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

