import { KARTO_ARTICLES_A } from "./articles-karto-a";
import { KARTO_ARTICLES_B } from "./articles-karto-b";
import { DEEP_ARTICLES } from "./articles-deep";
import { MORE_ARTICLES } from "./articles-more";
import { PACK3_ARTICLES } from "./articles-pack3";
import { PACK4_ARTICLES } from "./articles-pack4";
import { PACK5_ARTICLES } from "./articles-pack5";
import { PACK6_ARTICLES } from "./articles-pack6";
import { PACK7_ARTICLES } from "./articles-pack7";
import { PACK8_ARTICLES } from "./articles-pack8";
import { PACK9_ARTICLES } from "./articles-pack9";
import { PACK10_ARTICLES } from "./articles-pack10";
import { PACK11_ARTICLES } from "./articles-pack11";
import { PACK12_ARTICLES } from "./articles-pack12";
import { PACK13_ARTICLES } from "./articles-pack13";
import { PACK14_ARTICLES } from "./articles-pack14";
import { PACK15_ARTICLES } from "./articles-pack15";
import { PACK16_ARTICLES } from "./articles-pack16";
import { PACK17_ARTICLES } from "./articles-pack17";
import { WB_ARTICLES_A } from "./articles-wb-a";
import { WB_ARTICLES_B } from "./articles-wb-b";
import { KB_CATEGORIES } from "./categories";
import type { KbArticle, KbBranch } from "./types";

export { searchArticles } from "./search";
export type { KbArticle, KbBranch, KbCategory } from "./types";
export { KB_CATEGORIES };

const BASE: KbArticle[] = [...KARTO_ARTICLES_A, ...KARTO_ARTICLES_B, ...WB_ARTICLES_A, ...WB_ARTICLES_B, ...MORE_ARTICLES];
const DEEP_ALL: KbArticle[] = [...DEEP_ARTICLES, ...PACK3_ARTICLES, ...PACK4_ARTICLES, ...PACK5_ARTICLES, ...PACK6_ARTICLES, ...PACK7_ARTICLES, ...PACK8_ARTICLES, ...PACK9_ARTICLES, ...PACK10_ARTICLES, ...PACK11_ARTICLES, ...PACK12_ARTICLES, ...PACK13_ARTICLES, ...PACK14_ARTICLES, ...PACK15_ARTICLES, ...PACK16_ARTICLES, ...PACK17_ARTICLES];
const deepById = new Map(DEEP_ALL.map((a) => [a.id, a]));
/** Подробные версии заменяют короткие с тем же id, новые добавляются в конец. */
export const KB_ARTICLES: KbArticle[] = [...BASE.map((a) => deepById.get(a.id) ?? a), ...DEEP_ALL.filter((a) => !BASE.some((b) => b.id === a.id))];

/** Главные статьи каждой ветки: показываются крупно на главной. */
export const KB_FEATURED: Record<KbBranch, string[]> = {
  karto: ["k-first-day", "k-connect", "k-ads-metrics", "k-ads-review", "k-ads-campaigns", "k-cards"],
  wb: ["w-start-how", "w-models", "w-commission", "w-ads-auction", "w-report", "w-sales-drop"],
};

/** Время чтения: около 190 слов в минуту. */
export const kbReadMinutes = (a: KbArticle): number => Math.max(1, Math.round(a.body.split(/\s+/).length / 190));

const byId = new Map(KB_ARTICLES.map((a) => [a.id, a]));

export const kbArticle = (id: string): KbArticle | null => byId.get(id) ?? null;
/** Добавляет или заменяет статью, пришедшую с сервера (автообновление). Возвращает true, если список изменился. */
export function registerKbArticle(a: KbArticle): boolean {
  const have = byId.get(a.id);
  if (have && have.title === a.title && have.body === a.body) return false;
  if (have) KB_ARTICLES[KB_ARTICLES.indexOf(have)] = a;
  else KB_ARTICLES.push(a);
  byId.set(a.id, a);
  return true;
}
export const kbCategories = (branch: KbBranch) => KB_CATEGORIES.filter((c) => c.branch === branch);
export const kbArticlesOf = (categoryId: string) => KB_ARTICLES.filter((a) => a.category === categoryId);
export const kbBranchArticles = (branch: KbBranch) => KB_ARTICLES.filter((a) => a.branch === branch);
