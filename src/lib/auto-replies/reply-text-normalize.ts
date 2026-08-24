/** Имя для обращения: «Татьяна С.» → «Татьяна», «Галина Бондарева» → «Галина». */
export function extractBuyerGreetingName(buyerName?: string | null): string | null {
  const raw = buyerName?.trim();
  if (!raw || raw.length < 2) return null;
  const first = raw.split(/\s+/)[0]?.replace(/[.,]+$/g, "").trim();
  if (first && first.length >= 2) return first;
  return raw;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Граница слова для кириллицы (\\b в JS не работает с русскими буквами). */
function nameMentionRe(term: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, "giu");
}

function buildBuyerNameVariants(buyerName: string, greetingName: string): string[] {
  const raw = buyerName.trim();
  const variants = new Set<string>([greetingName, raw]);
  const parts = raw.split(/\s+/);
  if (parts.length >= 2) {
    const initial = parts[1].replace(/[.,]+$/g, "");
    if (initial.length <= 2) {
      variants.add(`${parts[0]} ${parts[1]}`);
      variants.add(`${parts[0]} ${initial}`);
      variants.add(`${parts[0]} ${initial}.`);
    }
  }
  return [...variants].sort((a, b) => b.length - a.length);
}

/** Убирает повторное упоминание имени и полное имя с инициалами. */
export function deduplicateBuyerNameInReply(
  text: string,
  buyerName: string | null | undefined,
  useBuyerName: boolean
): string {
  if (!useBuyerName || !buyerName?.trim()) return text;

  const greetingName = extractBuyerGreetingName(buyerName);
  if (!greetingName) return text;

  let out = text;
  const variants = buildBuyerNameVariants(buyerName, greetingName);

  // Удаляем полное имя и варианты с инициалом — оставляем только короткое обращение.
  for (const variant of variants) {
    if (variant.toLowerCase() === greetingName.toLowerCase()) continue;
    out = out.replace(nameMentionRe(variant), "");
    out = out.replace(new RegExp(`,\\s*${escapeRegExp(variant)}\\s*!`, "giu"), "!");
  }

  // Если короткое имя встречается больше одного раза — оставляем первое.
  const nameRe = nameMentionRe(greetingName);
  let count = 0;
  out = out.replace(nameRe, (match) => {
    count += 1;
    return count === 1 ? match : "";
  });

  out = out
    .replace(/,\s*([.!?])/g, "$1")
    .replace(/([.!?])\s*([.!?])+/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.!?,])/g, "$1")
    .trim();

  // «Елена! спасибо» → «Елена! Спасибо»
  out = out.replace(/!\s+([а-яё])/giu, (_, c) => `! ${c.toUpperCase()}`);

  return out;
}

const PRODUCT_TECH_SPEC_RE =
  /\s*,?\s*\d+\s*(?:л|л\.|ml|мл|шт|шт\.|г|г\.|кг|см|мм|м|уп\.?|pack)\.?(?:\s*,?\s*\d+\s*(?:л|л\.|шт|шт\.|мл|г|г\.|кг)?\.?)*/giu;

const INLINE_TECH_SPEC_RE =
  /\b\d+\s*(?:л|л\.|ml|мл|шт|шт\.|г|г\.|кг|см|мм)\.?\b/giu;

function naturalizeProductPhrase(name: string): string {
  let s = name;
  s = s.replace(/(?<![\p{L}\p{N}])строительное\s+ведро(?![\p{L}\p{N}])/giu, "строительные ведра");
  s = s.replace(/(?<![\p{L}\p{N}])строительных\s+ведро(?![\p{L}\p{N}])/giu, "строительные ведра");
  return s.trim();
}

/** Краткое название товара для промпта — без объёмов, количества и артикулов. */
export function sanitizeProductNameForReply(productName: string): string {
  let s = productName.trim();
  if (!s) return s;

  s = s.replace(/\([^)]*\d+[^)]*\)/g, "");
  s = s.replace(PRODUCT_TECH_SPEC_RE, "");
  s = s.replace(INLINE_TECH_SPEC_RE, "");
  s = s.replace(/\s*,\s*,/g, ",").replace(/,\s*$/g, "").replace(/\s{2,}/g, " ").trim();
  s = naturalizeProductPhrase(s);

  if (s.length > 80) {
    const chunk = s.split(/[,;]/)[0]?.trim();
    if (chunk && chunk.length >= 4) s = chunk;
  }

  return naturalizeProductPhrase(s || productName.trim());
}

/** Убирает технические характеристики из уже сгенерированного текста ответа. */
export function stripTechnicalProductSpecsInReply(text: string): string {
  let out = text.replace(PRODUCT_TECH_SPEC_RE, "");
  out = out.replace(INLINE_TECH_SPEC_RE, "");
  out = out.replace(/\s{2,}/g, " ").replace(/\s+([.!?,])/g, "$1");
  return naturalizeProductPhrase(out);
}

export type GreetingRepairStyle = {
  useBuyerName: boolean;
  addressForm: "vy" | "ty";
};

/** Нормализует начало ответа: «Ирина В., спасибо» → «Здравствуйте, Ирина! Спасибо». */
export function repairBuyerNameGreeting(
  text: string,
  style: GreetingRepairStyle,
  buyerName?: string | null
): string {
  let out = text.trim().replace(/^,\s*/u, "");
  if (!style.useBuyerName) return out;

  const name = extractBuyerGreetingName(buyerName);
  if (!name) return out;

  const raw = buyerName?.trim();
  const vy = style.addressForm === "vy";
  const expectedGreeting = vy ? `Здравствуйте, ${name}!` : `Привет, ${name}!`;

  if (raw) {
    const nameStartRe = new RegExp(`^${escapeRegExp(raw)}\\s*,\\s*`, "iu");
    if (nameStartRe.test(out)) {
      out = out.replace(nameStartRe, `${expectedGreeting} `);
      out = out.replace(
        /^(Здравствуйте, \S+!|Привет, \S+!)\s+([а-яё])/iu,
        (_, greeting, c) => `${greeting} ${c.toUpperCase()}`
      );
    }
  }

  const opener = out.split(/\n\n/)[0] ?? out;
  if (nameMentionRe(name).test(opener.slice(0, 100))) {
    return out;
  }

  if (/^(?:спасибо|благодар)/iu.test(out)) {
    return `${expectedGreeting} ${out.charAt(0).toLowerCase()}${out.slice(1)}`;
  }

  return out;
}

/** Добавляет подпись в конец, если она включена, но модель её не вставила. */
export function enforceReplySignature(
  text: string,
  signatureLine: string | null | undefined,
  enabled: boolean
): string {
  if (!enabled || !signatureLine?.trim()) return text;

  const sig = signatureLine.trim();
  const normalized = text.trimEnd();

  if (normalized.endsWith(sig) || normalized.includes(`\n\n${sig}`)) {
    return normalized;
  }

  const tail = normalized.slice(-Math.min(normalized.length, sig.length + 40));
  if (tail.includes(sig) || /С\s+уважением/i.test(tail)) {
    return normalized;
  }

  return `${normalized}\n\n${sig}`;
}
