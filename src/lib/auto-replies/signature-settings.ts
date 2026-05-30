import type { AutoRepliesTemplateSettings, ReplySignature, StarKey } from "./settings-types";

export const SIGNATURE_MAX_LENGTH = 200;

export const ALL_STAR_KEYS: StarKey[] = ["1", "2", "3", "4", "5"];

export function brandSignatureTemplate(brandName?: string | null): string {
  const name = brandName?.trim();
  if (name) {
    return `С уважением, команда «${name}»`.slice(0, SIGNATURE_MAX_LENGTH);
  }
  return "С уважением, команда «{бренд}»";
}

export function resolveSignatureText(text: string, brandName?: string | null): string {
  const brand = brandName?.trim() || "магазина";
  return text.replace(/\{бренд\}/gi, brand).trim();
}

export function signatureMatchesStar(sig: ReplySignature, star: StarKey): boolean {
  if (sig.starRatings.length === 0) return true;
  return sig.starRatings.includes(star);
}

export function formatSignatureStars(starRatings: StarKey[]): string {
  if (starRatings.length === 0 || starRatings.length === ALL_STAR_KEYS.length) {
    return "Все рейтинги";
  }
  return [...starRatings]
    .sort((a, b) => Number(a) - Number(b))
    .map((s) => `${s}★`)
    .join(", ");
}

export function pickSignatureForStar(
  templates: AutoRepliesTemplateSettings,
  star: StarKey,
  brandName?: string | null
): { text: string | null; nextRotationIndex: number } {
  if (!templates.signaturesEnabled) {
    return { text: null, nextRotationIndex: templates.rotationIndex };
  }

  const hasActiveSignatures = templates.signatures.some(
    (sig) => sig.enabled !== false && sig.text.trim().length > 0
  );
  if (!hasActiveSignatures) {
    return { text: null, nextRotationIndex: templates.rotationIndex };
  }

  const pool = templates.signatures.filter(
    (sig) =>
      sig.enabled !== false &&
      sig.text.trim().length > 0 &&
      signatureMatchesStar(sig, star)
  );

  if (pool.length === 0) {
    return { text: null, nextRotationIndex: templates.rotationIndex };
  }

  let picked: ReplySignature;
  let nextRotationIndex = templates.rotationIndex;

  if (templates.rotationMode === "random") {
    picked = pool[Math.floor(Math.random() * pool.length)]!;
  } else {
    const idx = templates.rotationIndex % pool.length;
    picked = pool[idx]!;
    nextRotationIndex = templates.rotationIndex + 1;
  }

  return {
    text: resolveSignatureText(picked.text, brandName),
    nextRotationIndex,
  };
}

export function inferStarFromReview(reviewText: string): StarKey {
  const t = reviewText.toLowerCase();
  if (/5\s*★|★\s*5|пять\s*зв/i.test(t)) return "5";
  if (/4\s*★|★\s*4|четыре\s*зв/i.test(t)) return "4";
  if (/3\s*★|★\s*3|три\s*зв/i.test(t)) return "3";
  if (/2\s*★|★\s*2|две\s*зв|два\s*зв/i.test(t)) return "2";
  if (/1\s*★|★\s*1|одна\s*зв|одну\s*зв/i.test(t)) return "1";
  if (/ужас|кошмар|брак|обман|разочар|плох|отврат|не рекоменд/.test(t)) return "1";
  if (/спасиб|отлич|супер|рекоменд|довол|класс/.test(t)) return "5";
  return "4";
}

export function createSignatureId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sig-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function defaultTemplateSettings(): AutoRepliesTemplateSettings {
  return {
    signaturesEnabled: true,
    rotationMode: "random",
    rotationIndex: 0,
    signatures: [
      {
        id: "sig-default",
        text: "С уважением, команда магазина",
        starRatings: [...ALL_STAR_KEYS],
        enabled: true,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

type LegacyTemplates = {
  signature?: string;
  snippets?: unknown;
};

export function normalizeTemplateSettings(
  raw: Partial<AutoRepliesTemplateSettings> & LegacyTemplates
): AutoRepliesTemplateSettings {
  if (Array.isArray(raw.signatures)) {
    return {
      signaturesEnabled: raw.signaturesEnabled ?? true,
      rotationMode: raw.rotationMode === "sequential" ? "sequential" : "random",
      rotationIndex: typeof raw.rotationIndex === "number" ? raw.rotationIndex : 0,
      signatures: raw.signatures.map((sig) => ({
        id: sig.id || createSignatureId(),
        text: String(sig.text ?? "").slice(0, SIGNATURE_MAX_LENGTH),
        starRatings: normalizeStarRatings(sig.starRatings),
        enabled: sig.enabled ?? true,
        createdAt: sig.createdAt ?? new Date().toISOString(),
      })),
    };
  }

  const legacy = String(raw.signature ?? "").trim().slice(0, SIGNATURE_MAX_LENGTH);
  return {
    signaturesEnabled: legacy.length > 0,
    rotationMode: "random",
    rotationIndex: 0,
        signatures: legacy
      ? [
          {
            id: "sig-default",
            text: legacy,
            starRatings: [...ALL_STAR_KEYS],
            enabled: true,
            createdAt: new Date().toISOString(),
          },
        ]
      : [],
  };
}

function normalizeStarRatings(input: StarKey[] | undefined): StarKey[] {
  if (!input?.length) return [...ALL_STAR_KEYS];
  const valid = input.filter((k): k is StarKey => ALL_STAR_KEYS.includes(k));
  return valid.length ? valid : [...ALL_STAR_KEYS];
}

export function countEnabledSignatures(signatures: ReplySignature[]): number {
  return signatures.filter((sig) => sig.enabled !== false).length;
}

export function getEnabledSequentialOrder(
  signatures: ReplySignature[],
  id: string
): number | null {
  const target = signatures.find((sig) => sig.id === id);
  if (!target || target.enabled === false) return null;

  let order = 0;
  for (const sig of signatures) {
    if (sig.enabled === false) continue;
    order += 1;
    if (sig.id === id) return order;
  }
  return null;
}

export function moveSignatureInOrder(
  signatures: ReplySignature[],
  id: string,
  direction: -1 | 1
): ReplySignature[] {
  const index = signatures.findIndex((sig) => sig.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= signatures.length) return signatures;
  const next = [...signatures];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export function reorderSignatures(
  signatures: ReplySignature[],
  fromId: string,
  toId: string
): ReplySignature[] {
  const fromIndex = signatures.findIndex((sig) => sig.id === fromId);
  const toIndex = signatures.findIndex((sig) => sig.id === toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return signatures;

  const next = [...signatures];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved!);
  return next;
}

export function formatSignatureDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function toggleStarRating(current: StarKey[], star: StarKey): StarKey[] {
  const has = current.includes(star);
  if (has) {
    const next = current.filter((s) => s !== star);
    return next.length ? next : current;
  }
  return [...current, star].sort((a, b) => Number(a) - Number(b));
}
