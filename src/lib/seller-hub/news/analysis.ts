import { EVENT_GROUP, type SellerEventKind, type SellerProductEvent } from "@/lib/seller-hub/event-engine/types";
import type { WbNewsItem } from "@/lib/services/wildberries/news-client";

/**
 * Анализ новостей портала WB для конкретного продавца. Всё детерминированно и проверяемо:
 *  - «персональная новость» — пометка самого WB (адресована этому продавцу);
 *  - категории и бренды продавца ищутся в заголовке и тексте новости;
 *  - тон («скорее хорошая или неприятная») определяется по словам заголовка и подписан как наша оценка;
 *  - даты акций берутся из текста новости и превращаются в напоминания о старте и окончании;
 *  - мусор (обучение, пресс-центр, дайджесты, чужие склады) в ленту по умолчанию не попадает.
 * Пересказ выбирается из самого текста новости (первые предложения), ничего не придумывается.
 */

export type NewsProfile = {
  /** Категории (предметы WB) и бренды товаров продавца. */
  categories: string[];
  brands: string[];
  worksFbs: boolean;
  worksFbw: boolean;
  /** Названия акций из календаря WB: по ним напоминания уже строятся из календаря, из новостей их не дублируем. */
  promoNames?: string[];
  /** Рубрики WB, которые пользователь попросил не показывать («Маркетинг», «Обучение»…). Персональные и «Важно» всё равно показываются. */
  mutedRubrics?: string[];
  /** Продавец использует рекламу WB (есть кампании): новости «WB Продвижение» ему по делу. */
  usesAds?: boolean;
  /** Склады и СЦ продавца, если известны (названия или города). */
  warehouseNames: string[];
};

export type NewsTone = "good" | "bad" | "neutral";

export type NewsInsight = {
  topic: string;
  tone: NewsTone;
  personal: boolean;
  important: boolean;
  matchedCategories: string[];
  matchedBrands: string[];
  matchedWarehouse: boolean;
  /** Почему новость касается именно вас (для показа). */
  reasons: string[];
  relevance: "high" | "medium" | "low";
  /** Показывать в ленте по умолчанию. */
  relevant: boolean;
  /** Пометка «Обратить внимание». */
  attention: boolean;
  dates: { from: string | null; to: string | null } | null;
  summary: string;
};

const MONTHS: Record<string, number> = { января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6, июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12 };
const MONTH_RE = "(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)";

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");

function isoDay(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

/** Год даты по дате публикации: ближайший к ней, а не прошедший давно. */
function inferYear(day: number, month: number, published: string): number {
  const pub = new Date(published);
  const y = pub.getUTCFullYear();
  const candidate = Date.UTC(y, month - 1, day);
  return candidate < pub.getTime() - 45 * 86_400_000 ? y + 1 : y;
}

/** Даты акции или события из текста новости: «с 25 октября по 3 ноября», «с 14 по 20 октября», «до 14 сентября», «с 19 октября». */
export function parseRuDateRange(text: string, published: string): { from: string | null; to: string | null } | null {
  const t = norm(text);
  let m = new RegExp(`с\\s+(\\d{1,2})\\s+${MONTH_RE}\\s+по\\s+(\\d{1,2})\\s+${MONTH_RE}`).exec(t);
  if (m) {
    const fm = MONTHS[m[2]!]!;
    const tm = MONTHS[m[4]!]!;
    const fromYear = inferYear(Number(m[1]), fm, published);
    const toYear = tm < fm ? fromYear + 1 : inferYear(Number(m[3]), tm, published);
    return { from: isoDay(fromYear, fm, Number(m[1])), to: isoDay(Math.max(toYear, fromYear), tm, Number(m[3])) };
  }
  m = new RegExp(`с\\s+(\\d{1,2})\\s+по\\s+(\\d{1,2})\\s+${MONTH_RE}`).exec(t);
  if (m) {
    const mo = MONTHS[m[3]!]!;
    const y = inferYear(Number(m[2]), mo, published);
    return { from: isoDay(y, mo, Number(m[1])), to: isoDay(y, mo, Number(m[2])) };
  }
  m = new RegExp(`до\\s+(\\d{1,2})\\s+${MONTH_RE}`).exec(t);
  if (m) {
    const mo = MONTHS[m[2]!]!;
    return { from: null, to: isoDay(inferYear(Number(m[1]), mo, published), mo, Number(m[1])) };
  }
  m = new RegExp(`с\\s+(\\d{1,2})\\s+${MONTH_RE}`).exec(t);
  if (m) {
    const mo = MONTHS[m[2]!]!;
    return { from: isoDay(inferYear(Number(m[1]), mo, published), mo, Number(m[1])), to: null };
  }
  return null;
}

/** «СЦ» как отдельное слово. \\b в JavaScript не работает с кириллицей, поэтому граница задана явно. */
const SC_WORD = /(^|[^а-я0-9])сц([^а-я0-9]|$)/;
/** Уведомление о работе склада: СЦ и слова про приёмку или возобновление. «FBS: довезти заказ в СЦ или ПВЗ» уведомлением о приёмке не является. */
const SC_NOTICE = /(не принима|не будет принимать|перестан|возобнови|начал[иа] принимать|открыли новый|закрыл)/;
const isScNotice = (h: string) => SC_WORD.test(h) && SC_NOTICE.test(h);

const BAD = /(временно не принима|не принима(ют|ем)|перестан(ет|ут) принимать|не будет принимать|приостанов|прекращ|повышени|повышаем|увелич\w+ (комисси|тариф|стоимост|штраф)|вводим|штраф|блокиров|ограничен|отмен(а|яем|им)\b|снижени\w* (скидк|бустинг)|ухудш)/;
const GOOD = /(возобнови|снижени\w* (комисси|тариф|стоимост)|снижаем|уменьш\w+ (комисси|тариф|стоимост)|бесплатн|бустинг|улучш|перерасч|пересчет|пересчёт|дарим|продлеваем|открыли новый|теперь (вы )?можете|запустили|добавили|расширили)/;

export function newsTone(header: string): NewsTone {
  const h = norm(header);
  const bad = BAD.test(h);
  const good = GOOD.test(h);
  // «Не снизили вам комиссию — сделаем перерасчёт»: проверяем отрицание отдельно, чтобы перерасчёт считался хорошей новостью.
  if (/перерасч|пересчет/.test(h)) return "good";
  if (bad && good) return "neutral";
  return bad ? "bad" : good ? "good" : "neutral";
}

export function newsTopic(types: string[], header: string): string {
  const h = norm(header);
  if (/комисси/.test(h)) return "Комиссии";
  if (/штраф|удержани/.test(h)) return "Штрафы";
  if (/тариф/.test(h)) return "Тарифы";
  const has = (name: string) => types.some((t) => t === name);
  if (has("Обучение")) return "Обучение";
  if (has("Пресс-центр")) return "Прочее";
  if (has("Дайджесты")) return "Дайджест";
  if (has("Акции")) return "Акции";
  if (has("Маркетинг")) return "Продвижение";
  if (has("Аналитика")) return "Аналитика";
  if (has("Условия сотрудничества")) return "Условия работы";
  if (has("Товары")) return "Карточки";
  if (has("FBS") || has("FBW") || isScNotice(h)) return "Склады и поставки";
  if (has("WB Partners")) return "Новые возможности";
  return "Новости WB";
}

/** Основа слова для сопоставления падежей: «ведра» и «ведро» дают «ведр». */
function stem(word: string): string {
  const w = norm(word);
  if (w.length >= 7) return w.slice(0, w.length - 2);
  if (w.length >= 5) return w.slice(0, w.length - 1);
  return w;
}

function containsStem(haystack: string, stemText: string): boolean {
  if (stemText.length < 4) return false;
  return new RegExp(`(^|[^а-я0-9])${stemText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(haystack);
}

/** Какие из названий (категорий) упомянуты в тексте: совпадают все значимые слова названия по основе. */
export function matchNames(text: string, names: string[]): string[] {
  const h = norm(text);
  const out: string[] = [];
  for (const name of names) {
    const words = name.split(/[\s,/()-]+/).filter((w) => norm(w).length >= 4);
    if (words.length === 0) continue;
    if (words.every((w) => containsStem(h, stem(w)))) out.push(name);
  }
  return [...new Set(out)];
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Первые предложения самого текста новости (до ~260 знаков). Нет текста — пусто: заголовок уже есть. */
export function extractSummary(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  // Предложение кончается точкой, за которой пробел и начало нового (заглавная буква, кавычка, цифра): «11.11» не режем.
  const sentences = flat.split(/(?<=[.!?])\s+(?=[«"A-ZА-ЯЁ0-9])/);
  let out = "";
  for (const sentence of sentences) {
    if (out && (out + " " + sentence).length > 260) break;
    out = out ? `${out} ${sentence}` : sentence;
  }
  return clip(out.trim(), 280);
}

const MONEY_TOPICS = new Set(["Комиссии", "Штрафы", "Тарифы"]);

export function analyzeNews(item: WbNewsItem, profile: NewsProfile, todayKey: string | null = null): NewsInsight {
  const header = item.header;
  const body = `${item.header}\n${item.text}`;
  const personal = item.types.includes("Персональная новость");
  const important = item.types.includes("Важно");
  const topic = newsTopic(item.types, header);
  const tone = newsTone(header);
  const matchedCategories = matchNames(body, profile.categories);
  const matchedBrands = matchNames(body, profile.brands);
  const isSc = isScNotice(norm(header));
  const warehouseText = norm(body);
  const matchedWarehouse = isSc && profile.warehouseNames.some((w) => norm(w).length >= 4 && warehouseText.includes(norm(w)));
  const isFbs = item.types.includes("FBS");
  const isFbw = item.types.includes("FBW");

  const reasons: string[] = [];
  if (personal) reasons.push("персональная новость: WB адресовал её вашему кабинету");
  if (important) reasons.push("WB пометил новость как важную");
  if (matchedCategories.length > 0) reasons.push(`затрагивает ваши категории: ${matchedCategories.join(", ")}`);
  if (matchedBrands.length > 0) reasons.push(`упоминает ваш бренд: ${matchedBrands.join(", ")}`);
  if (matchedWarehouse) reasons.push("касается вашего склада или СЦ");
  else if (!isSc && isFbs && profile.worksFbs) reasons.push("вы работаете по FBS");
  else if (!isSc && isFbw && profile.worksFbw) reasons.push("вы работаете по FBW");
  if (topic === "Продвижение" && profile.usesAds === true) reasons.push("вы используете рекламу WB");
  if (MONEY_TOPICS.has(topic) && !personal && matchedCategories.length === 0) reasons.push("касается условий и расходов продавцов на WB");

  const dates = item.types.includes("Акции") || personal ? parseRuDateRange(body, item.date) : null;

  let relevance: NewsInsight["relevance"] = "low";
  if (personal || matchedCategories.length > 0 || matchedBrands.length > 0 || matchedWarehouse) relevance = "high";
  else if (
    important ||
    MONEY_TOPICS.has(topic) ||
    (!isSc && ((isFbs && profile.worksFbs) || (isFbw && profile.worksFbw))) ||
    (topic === "Акции" && !isSc) ||
    (topic === "Продвижение" && profile.usesAds === true)
  )
    relevance = "medium";

  const junkTopic = topic === "Обучение" || topic === "Прочее" || topic === "Дайджест";
  const mutedByUser = !personal && !important && item.types.some((t) => (profile.mutedRubrics ?? []).includes(t));
  const relevant = !mutedByUser && (!junkTopic ? relevance !== "low" : personal);

  // «Обратить внимание» ставим только там, где что-то нужно проверить или решить: актуальная акция, деньги и условия, плохая весть, важное от WB.
  const promoLive = topic === "Акции" && (dates?.to == null || todayKey == null || dates.to >= todayKey);
  const mine = matchedCategories.length > 0 || matchedBrands.length > 0;
  const attention =
    !mutedByUser &&
    ((personal && promoLive) ||
    (personal && MONEY_TOPICS.has(topic)) ||
    (personal && tone === "bad") ||
    (important && relevance !== "low") ||
    (mine && (tone === "bad" || MONEY_TOPICS.has(topic))) ||
    (matchedWarehouse && tone === "bad"));

  return { topic, tone, personal, important, matchedCategories, matchedBrands, matchedWarehouse, reasons, relevance, relevant, attention, dates, summary: extractSummary(item.text) };
}

const make = (kind: SellerEventKind, severity: SellerProductEvent["severity"], title: string, detail: string, createdAt: string, key: string): SellerProductEvent => ({
  id: `${kind}:store:${key}`,
  createdAt,
  kind,
  group: EVENT_GROUP[kind],
  severity,
  title,
  detail,
  productTitle: null,
  vendorCode: null,
  nmId: null,
  itemId: null,
});

const TONE_TEXT: Record<NewsTone, string> = { good: "Скорее хорошая новость для вас (по нашей оценке заголовка)", bad: "Скорее неприятная новость для вас (по нашей оценке заголовка)", neutral: "" };

const ruDays = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "день" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "дня" : "дней");
const daysBetween = (fromKey: string, toKey: string) => Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
const fmtDay = (key: string) => new Date(`${key}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });

/** Сколько дней до старта и окончания считаем «пора напомнить». */
export const START_REMINDER_DAYS = 3;
export const END_REMINDER_DAYS = 2;

/**
 * События по списку новостей: одна запись на новость (в ленте по умолчанию или «общая») и напоминания о стартах и окончаниях акций.
 * Время новости — момент её публикации WB; напоминание помечено моментом обнаружения.
 * @param todayKey сегодняшняя дата по Москве
 */
export function newsToEvents(items: WbNewsItem[], profile: NewsProfile, todayKey: string, nowIso: string): SellerProductEvent[] {
  const out: SellerProductEvent[] = [];
  for (const item of items) {
    const insight = analyzeNews(item, profile, todayKey);
    if (insight.topic === "Дайджест") continue;
    const lines: string[] = [];
    if (insight.summary) lines.push(insight.summary);
    lines.push(`Рубрика WB: ${item.types.length > 0 ? item.types.filter((t) => t !== "Персональная новость" && t !== "Важно").join(", ") || insight.topic : insight.topic}`);
    if (insight.reasons.length > 0) lines.push(`Почему это вам: ${insight.reasons.join("; ")}`);
    if (TONE_TEXT[insight.tone] && insight.relevant) lines.push(TONE_TEXT[insight.tone]);
    const kind: SellerEventKind = insight.relevant ? "news_item" : "news_general";
    out.push(make(kind, insight.attention ? "important" : "info", item.header, lines.join("\n"), item.date, String(item.id)));

    // Напоминания по акциям: только по тем, что касаются продавца (персональные и подходящие).
    const inCalendar = (profile.promoNames ?? []).some((n) => norm(n).length >= 4 && norm(item.header).includes(norm(n)));
    if (insight.dates && insight.relevant && insight.topic === "Акции" && !inCalendar) {
      const { from, to } = insight.dates;
      if (from) {
        const left = daysBetween(todayKey, from);
        if (left > 0 && left <= START_REMINDER_DAYS) {
          out.push(
            make(
              "promo_deadline",
              "important",
              `Акция стартует через ${left} ${ruDays(left)}`,
              `${item.header}\nСтарт: ${fmtDay(from)}${to ? `, окончание: ${fmtDay(to)}` : ""}. Проверьте условия участия и свои цены в разделе «Продвижение».`,
              nowIso,
              `${item.id}:start`,
            ),
          );
        }
      }
      if (to) {
        const left = daysBetween(todayKey, to);
        if (left >= 0 && left <= END_REMINDER_DAYS && (!from || daysBetween(from, todayKey) >= 0)) {
          out.push(
            make(
              "promo_deadline",
              "important",
              left === 0 ? "Акция заканчивается сегодня" : `Акция заканчивается через ${left} ${ruDays(left)}`,
              `${item.header}\nОкончание: ${fmtDay(to)}. Проверьте, какие товары участвуют, и что будет с ценами после акции.`,
              nowIso,
              `${item.id}:end`,
            ),
          );
        }
      }
    }
  }
  return out;
}

/** Рубрики из подробностей события новости («Рубрика WB: Маркетинг, FBS»). */
export function newsRubricsOf(detail: string): string[] {
  const m = /Рубрика WB:\s*([^\n]+)/.exec(detail);
  return m ? m[1]!.split(",").map((x) => x.trim()).filter(Boolean) : [];
}

/** Скрыта ли новость по рубрике, которую пользователь отключил. Уведомления с «Обратить внимание» и персональные не скрываются. */
export function hiddenByRubric(event: { kind: string; severity: string; detail: string }, muted: ReadonlySet<string>): boolean {
  if (muted.size === 0 || (event.kind !== "news_item" && event.kind !== "news_general")) return false;
  if (event.severity !== "info" || /персональная новость/.test(event.detail)) return false;
  return newsRubricsOf(event.detail).some((r) => muted.has(r));
}

export const parseRubricList = (raw: string): string[] => raw.split("|").map((x) => x.trim()).filter(Boolean).slice(0, 30);
export const serializeRubricList = (list: string[]): string => list.join("|");
export const isValidRubricListString = (v: unknown): boolean => typeof v === "string" && v.length <= 600 && !/[\n\r]/.test(v);
