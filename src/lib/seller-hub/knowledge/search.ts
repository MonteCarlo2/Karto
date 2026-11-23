import type { KbArticle } from "./types";

/** Приводим слово к основе без окончаний: «комиссии», «комиссия», «комиссией» → одна основа. */
export function stem(word: string): string {
  const w = word.toLowerCase().replace(/ё/g, "е");
  if (w.length <= 4) return w;
  return w.slice(0, Math.max(4, w.length - 2));
}

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^a-zа-я0-9]+/i)
    .filter((t) => t.length >= 2);
}

const STOP = new Set(["как", "что", "это", "для", "или", "при", "над", "под", "про", "где", "кто", "ли", "не", "на", "по", "из", "от", "до", "за", "мне", "мой", "моя", "мои", "если", "чтобы", "можно", "нужно", "почему", "зачем", "какой", "какая", "какие", "есть"]);

export type KbHit = { article: KbArticle; score: number };

/**
 * Поиск по статьям без внешних сервисов: совпадение основ слов с весами (название важнее слов-подсказок, они важнее описания и текста).
 * Все слова запроса должны находиться хотя бы где-то; чем больше слов совпало в названии, тем выше статья.
 */
export function searchArticles(articles: KbArticle[], query: string, opts: { limit?: number } = {}): KbHit[] {
  const words = tokens(query).filter((t) => !STOP.has(t));
  if (words.length === 0) return [];
  const stems = [...new Set(words.map(stem))];
  const hits: KbHit[] = [];
  for (const article of articles) {
    const title = tokens(article.title).map(stem);
    const keys = tokens((article.keywords ?? []).join(" ")).map(stem);
    const summary = tokens(article.summary).map(stem);
    const body = tokens(article.body).map(stem);
    let score = 0;
    let matched = 0;
    for (const s of stems) {
      const inTitle = title.includes(s);
      const inKeys = keys.includes(s);
      const inSummary = summary.includes(s);
      const bodyCount = body.filter((b) => b === s).length;
      const local = (inTitle ? 8 : 0) + (inKeys ? 6 : 0) + (inSummary ? 3 : 0) + Math.min(bodyCount, 4);
      if (local > 0) matched += 1;
      score += local;
    }
    if (matched === 0) continue;
    // Статья, где совпали все слова запроса, выше той, где совпала часть.
    score += (matched / stems.length) * 6;
    if (matched === stems.length && stems.length > 1) score += 6;
    hits.push({ article, score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 20);
}

export type KbSectionHit = { article: KbArticle; heading: string | null; snippet: string; score: number };

/** Текст раздела без служебной разметки статьи: жирный, ссылки, формулы, таблицы, пометки врезок. */
function plain(t: string): string {
  return t
    .replace(/\[\[[^\]]*\]\]/g, " ")
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([a-z0-9-]+\)/g, "$1")
    .replace(/^\s*(>|=|-|\d+\.)\s*/gm, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSections(body: string): Array<{ heading: string | null; text: string }> {
  const out: Array<{ heading: string | null; lines: string[] }> = [{ heading: null, lines: [] }];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("## ")) out.push({ heading: line.slice(3), lines: [] });
    else out[out.length - 1]!.lines.push(line);
  }
  return out.map((s) => ({ heading: s.heading, text: plain(s.lines.join("\n")) })).filter((s) => s.heading || s.text);
}

/**
 * Поиск по разделам статей: для каждой статьи находит самый подходящий раздел и вырезает из него фрагмент вокруг первого совпадения.
 * Нужен для быстрого окна поиска и списка результатов: человек видит не только название статьи, но и где именно ответ.
 */
export function searchSections(articles: KbArticle[], query: string, limit = 8): KbSectionHit[] {
  const words = tokens(query).filter((t) => !STOP.has(t));
  if (words.length === 0) return [];
  const stems = [...new Set(words.map(stem))];
  const need = stems.length <= 2 ? stems.length : Math.ceil(stems.length * 0.6);
  const hits: KbSectionHit[] = [];
  for (const article of articles) {
    const meta = new Set([...tokens(article.title), ...tokens((article.keywords ?? []).join(" ")), ...tokens(article.summary)].map(stem));
    const titleSet = new Set(tokens(article.title).map(stem));
    const seen = new Set<string>();
    for (const s of stems) if (meta.has(s)) seen.add(s);
    let best: { heading: string | null; text: string; score: number } | null = null;
    for (const sec of splitSections(article.body)) {
      const head = new Set(tokens(sec.heading ?? "").map(stem));
      const toks = tokens(sec.text).map(stem);
      let score = 0;
      for (const s of stems) {
        const count = toks.filter((t) => t === s).length;
        if (count > 0 || head.has(s)) seen.add(s);
        score += (head.has(s) ? 6 : 0) + Math.min(count, 3);
      }
      if (!best || score > best.score) best = { ...sec, score };
    }
    if (seen.size < need || !best) continue;
    const titleBonus = stems.filter((s) => titleSet.has(s)).length * 8;
    const text = best.text || article.summary;
    const re = /[a-zа-яё0-9]+/gi;
    let at = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (stems.includes(stem(m[0]))) {
        at = m.index;
        break;
      }
    }
    const from = Math.max(0, at - 70);
    const cut = text.slice(from, from + 190);
    const snippet = `${from > 0 ? "…" : ""}${cut}${from + 190 < text.length ? "…" : ""}`;
    hits.push({ article, heading: best.heading, snippet, score: titleBonus + best.score + (seen.size / stems.length) * 6 });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
