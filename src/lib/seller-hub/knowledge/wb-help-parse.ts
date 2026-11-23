import { createHash } from "node:crypto";

/**
 * Разбор официальной справки Wildberries (seller.wildberries.ru/instructions) для автообновления базы знаний.
 * Только чистые функции: без сети, базы и нейросети. Страницы справки отдаются как RSC-поток (заголовок `RSC: 1`).
 */

export const WB_HELP_BASE = "https://seller.wildberries.ru/instructions/ru/ru";

export type WbHelpEntry = { id: string; title: string; slug: string; category: string | null };
export type WbHelpArticle = { updated: string | null; text: string; hash: string };
export type WbFact = { was: string | null; now: string | null };

/** Разделы справки, которые не пересказываем: юридический текст оферты. */
const SKIP_CATEGORIES = new Set(["Оферта"]);

function unescape(s: string): string {
  try {
    return JSON.parse(`"${s}"`) as string;
  } catch {
    return s;
  }
}

/** Дерево справки: все статьи с названием, адресом и ближайшей категорией. */
export function parseWbHelpTree(rsc: string): WbHelpEntry[] {
  const out = new Map<string, WbHelpEntry>();
  let category: string | null = null;
  const re = /\{"id":"[0-9a-f-]{36}","slug":"[^"]*","title":"((?:[^"\\]|\\.)*)"|"id":"(A-\d+)","title":"((?:[^"\\]|\\.)*)","type":"article","slug":"([^"]*)"/g;
  for (const m of rsc.matchAll(re)) {
    if (m[1] != null) {
      category = unescape(m[1]);
      continue;
    }
    if (category && SKIP_CATEGORIES.has(category)) continue;
    if (!out.has(m[2]!)) out.set(m[2]!, { id: m[2]!, title: unescape(m[3]!).replace(/\s+/g, " ").trim(), slug: m[4]!, category });
  }
  return [...out.values()];
}

const NOISE = /^(Такой страницы нет|Возможно, страница удалена или в её адресе была ошибка|Видеоинструкция|нажмите, чтобы развернуть)$/;

/** Текст статьи без служебных строк и дата «Обновлено». Отпечаток считается по тексту без даты. */
export function parseWbHelpArticle(rsc: string, title?: string): WbHelpArticle {
  const lines: string[] = [];
  let updated: string | null = null;
  for (const m of rsc.matchAll(/"children":"((?:[^"\\]|\\.)*)"/g)) {
    const raw = m[1]!;
    if (raw.startsWith("$") || raw.length < 2) continue;
    const line = unescape(raw).replace(/\s+/g, " ").trim();
    if (!line || NOISE.test(line) || line === title) continue;
    const d = /^Обновлено (\d{2}\.\d{2}\.\d{4})$/.exec(line);
    if (d) {
      updated = d[1]!;
      continue;
    }
    if (lines[lines.length - 1] !== line) lines.push(line);
  }
  const text = lines.join("\n");
  return { updated, text, hash: createHash("sha256").update(text).digest("hex").slice(0, 32) };
}

/** Статья закрыта для незарегистрированных или пуста: такие не пересказываем. */
export function isWbHelpReadable(text: string): boolean {
  return text.length >= 400 && !/Статья доступна только продавцам/.test(text);
}

/** Числа с единицами из текста: «25 000 ₽», «33,3%», «192 часов», «60 дней», «0,08 ₽». */
export function numbersOf(text: string): string[] {
  const out: string[] = [];
  const re = /(\d[\d  ]*(?:[.,]\d+)?)\s?(₽|%|руб\w*|час\w*|дн\w*|день|дня|минут\w*|литр\w*|л\b|кг|см|м³|штук\w*|шт\b|млн ₽|раз\w*)/g;
  for (const m of text.matchAll(re)) out.push(`${m[1]!.replace(/[  ]/g, "").replace(".", ",")} ${m[2]!.replace(/^руб\w*$/, "₽")}`);
  return out;
}

const digitsOf = (text: string): Set<string> => new Set([...text.matchAll(/\d[\d  ]*(?:[.,]\d+)?/g)].map((m) => m[0].replace(/[  ]/g, "").replace(".", ",")));

/** Каждое число из пересказа должно быть в первоисточнике. Возвращает числа, которых там нет. */
export function unknownNumbers(derived: string, source: string): string[] {
  const known = digitsOf(source);
  // Номера шагов и мелкие счётчики (1–10) не считаем фактами.
  return [...digitsOf(derived)].filter((n) => !known.has(n) && !/^(?:[0-9]|10)$/.test(n));
}

/** Строки, которые исчезли и появились: основа для «было → стало». Только строки с числами. */
export function diffWbHelp(before: string, after: string): WbFact[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const inA = new Set(a);
  const inB = new Set(b);
  const gone = a.filter((l) => !inB.has(l) && /\d/.test(l));
  const added = b.filter((l) => !inA.has(l) && /\d/.test(l));
  const facts: WbFact[] = [];
  const used = new Set<number>();
  const words = (s: string) => new Set(s.toLowerCase().replace(/[\d.,%₽]/g, " ").split(/\s+/).filter((w) => w.length > 3));
  for (const was of gone) {
    const w = words(was);
    let best = -1;
    let bestScore = 0;
    added.forEach((now, i) => {
      if (used.has(i)) return;
      const n = words(now);
      const common = [...w].filter((x) => n.has(x)).length;
      const score = common / Math.max(1, Math.max(w.size, n.size));
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0 && bestScore >= 0.6) {
      used.add(best);
      facts.push({ was: was.slice(0, 400), now: added[best]!.slice(0, 400) });
    } else facts.push({ was: was.slice(0, 400), now: null });
  }
  added.forEach((now, i) => {
    if (!used.has(i)) facts.push({ was: null, now: now.slice(0, 400) });
  });
  return facts.slice(0, 20);
}

/**
 * Переименования: в паре «было → стало» заменилось ровно одно слово-название (латиница заглавными вроде FBS, DBS).
 * Это только кандидат: принимается, лишь когда то же самое случилось минимум в двух разных статьях справки.
 */
export function renameCandidates(before: string, after: string): Array<{ from: string; to: string }> {
  const a = before.split("\n");
  const b = after.split("\n");
  const inA = new Set(a);
  const inB = new Set(b);
  const gone = a.filter((l) => !inB.has(l));
  const added = b.filter((l) => !inA.has(l));
  const out: Array<{ from: string; to: string }> = [];
  const tok = (l: string) => l.split(/\s+/);
  const clean = (w: string) => w.replace(/^[(«"“]+|[)»"”.,;:!?]+$/g, "");
  const name = (w: string) => /^[A-Z][A-Z0-9&+-]{1,9}$/.test(w);
  for (const g of gone) {
    const gt = tok(g);
    for (const n of added) {
      const nt = tok(n);
      if (nt.length !== gt.length) continue;
      const diff = gt.map((w, i) => [w, nt[i]!] as const).filter(([x, y]) => x !== y);
      if (diff.length !== 1) continue;
      const from = clean(diff[0]![0]);
      const to = clean(diff[0]![1]);
      if (from !== to && name(from) && name(to)) out.push({ from, to });
    }
  }
  return out;
}

export type KbPatch = { articleId: string; find: string; replace: string };

/**
 * Точечная правка нашей статьи допустима, только если: фрагмент встречается в тексте ровно один раз, он короткий,
 * меняются именно числа (слова остаются), и каждое новое число есть в новой версии справки.
 */
export function validateKbPatch(patch: KbPatch, body: string, newSource: string): string | null {
  const { find, replace } = patch;
  if (!find || !replace || find === replace) return "пустая правка";
  if (find.length > 300 || replace.length > 320) return "слишком длинный фрагмент";
  if (body.split(find).length !== 2) return "фрагмент не найден или встречается не один раз";
  const strip = (s: string) => s.replace(/\d[\d  ]*(?:[.,]\d+)?/g, "#").replace(/\s+/g, " ").trim();
  if (strip(find) !== strip(replace)) return "меняются не только числа";
  const unknown = unknownNumbers(replace, newSource);
  if (unknown.length > 0) return `числа нет в справке: ${unknown.join(", ")}`;
  return null;
}

/** Применяет проверенные правки поверх текста статьи. Исходный текст не меняется. */
export function applyKbPatches(body: string, patches: Array<{ find: string; replace: string }>): string {
  let out = body;
  for (const p of patches) if (out.split(p.find).length === 2) out = out.replace(p.find, p.replace);
  return out;
}
