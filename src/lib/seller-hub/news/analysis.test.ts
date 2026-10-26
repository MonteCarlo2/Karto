import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeNews, extractSummary, hiddenByRubric, matchNames, newsRubricsOf, newsToEvents, newsTone, newsTopic, parseRubricList, parseRuDateRange, serializeRubricList, type NewsProfile } from "./analysis";
import { parseWbNews, stripHtml, type WbNewsItem } from "@/lib/services/wildberries/news-client";

const news = (header: string, types: string[], over: Partial<WbNewsItem> = {}): WbNewsItem => ({ id: 1, header, text: "", date: "2026-10-18T10:00:00.000Z", types, tags: [], ...over });
const profile = (over: Partial<NewsProfile> = {}): NewsProfile => ({ categories: ["Ведра", "Кашпо"], brands: ["KARTO"], worksFbs: true, worksFbw: false, warehouseNames: [], ...over });

describe("новости WB: разбор ответа", () => {
  it("берёт поле content как текст, чистит разметку, пропускает неполные записи", () => {
    const items = parseWbNews({ data: [{ id: 5, header: "Заголовок", content: "<p>Первый&nbsp;абзац.</p><p>Второй <b>абзац</b>.</p>", date: "2026-10-18T10:00:00+03:00", types: [{ name: "Акции" }, "FBS"] }, { id: 6, header: "", date: "2026-10-18" }, { header: "без id", date: "2026-10-18" }] });
    assert.equal(items.length, 1);
    assert.equal(items[0]!.text, "Первый абзац.\nВторой абзац.");
    assert.deepEqual(items[0]!.types, ["Акции", "FBS"]);
    assert.equal(stripHtml("a<br>b&amp;c"), "a\nb&c");
    assert.deepEqual(parseWbNews(null), []);
  });
});

describe("даты из новостей", () => {
  const pub = "2026-10-18T10:00:00.000Z";
  it("диапазоны и одиночные даты, как их пишет WB", () => {
    assert.deepEqual(parseRuDateRange("Автоакция «11.11: выгодные предложения» пройдет с 25 октября по 3 ноября", pub), { from: "2026-10-25", to: "2026-11-03" });
    assert.deepEqual(parseRuDateRange("Участвуйте с 18 по 27 сентября", "2026-09-10T00:00:00Z"), { from: "2026-09-18", to: "2026-09-27" });
    assert.deepEqual(parseRuDateRange("Продлеваем распродажу до 14 сентября включительно", "2026-09-08T00:00:00Z"), { from: null, to: "2026-09-14" });
    assert.deepEqual(parseRuDateRange("С 19 октября улучшились условия", pub), { from: "2026-10-19", to: null });
    assert.equal(parseRuDateRange("Дат здесь нет", pub), null);
  });
  it("диапазон через Новый год получает следующий год", () => {
    assert.deepEqual(parseRuDateRange("Акция с 28 декабря по 10 января", "2026-12-20T00:00:00Z"), { from: "2026-12-28", to: "2027-01-10" });
  });
});

describe("тема и тон", () => {
  it("тема по рубрике WB, комиссии и штрафы важнее рубрики", () => {
    assert.equal(newsTopic(["Акции"], "Автоакция"), "Акции");
    assert.equal(newsTopic(["FBS"], "СЦ «Курск» временно не принимает товары"), "Склады и поставки");
    assert.equal(newsTopic(["Маркетинг"], "Повышаем комиссию для категорий"), "Комиссии");
    assert.equal(newsTopic(["Обучение"], "Запускаем бесплатный практикум"), "Обучение");
  });
  it("тон по заголовку: остановка приёмки плохо, возобновление и перерасчёт хорошо, обычное нейтрально", () => {
    assert.equal(newsTone("СЦ «Воронеж СГТ» временно не принимает товары, ожидаем возобновления работы"), "bad");
    assert.equal(newsTone("СЦ «Воронеж СГТ» возобновил работу"), "good");
    assert.equal(newsTone("СЦ «Белые Столбы» перестанет принимать отгрузки по модели FBS с 11 сентября"), "bad");
    assert.equal(newsTone("По ошибке не снизили вам комиссию за быструю отгрузку — сделаем перерасчёт"), "good");
    assert.equal(newsTone("Теперь вы можете настраивать главное фото под разных покупателей"), "good");
    assert.equal(newsTone("Сервис «Помощник»: добавили новый вид мониторинга"), "good");
    assert.equal(newsTone("Укажите объём или вес для товаров из категории «Красота»"), "neutral");
    assert.equal(newsTone("Повышаем комиссии для нескольких категорий"), "bad");
  });
});

describe("сопоставление с категориями продавца", () => {
  it("ловит падежи и формы слова, не путает чужие категории", () => {
    assert.deepEqual(matchNames("Комиссии повышаются для категорий: ведра, лопаты", ["Ведра", "Кашпо"]), ["Ведра"]);
    assert.deepEqual(matchNames("В категории «Красота» укажите объём", ["Красота", "Ведра"]), ["Красота"]);
    assert.deepEqual(matchNames("Изменения для кашпо и вёдер", ["Кашпо", "Ведра"]), ["Кашпо"]);
    assert.deepEqual(matchNames("Новости про одежду", ["Кашпо"]), []);
  });
  it("составная категория совпадает, только если упомянуты все значимые слова", () => {
    assert.deepEqual(matchNames("Новые правила для садового инвентаря", ["Садовый инвентарь"]), ["Садовый инвентарь"]);
    assert.deepEqual(matchNames("Правила для садового освещения", ["Садовый инвентарь"]), []);
  });
});

describe("персонализация и «Обратить внимание»", () => {
  it("персональная акция WB: своя, с датами, требует внимания", () => {
    const i = analyzeNews(news("Автоакция «11.11: выгодные предложения» пройдет с 25 октября по 3 ноября", ["Персональная новость", "Акции"]), profile());
    assert.equal(i.personal, true);
    assert.equal(i.relevant, true);
    assert.equal(i.attention, true);
    assert.deepEqual(i.dates, { from: "2026-10-25", to: "2026-11-03" });
    assert.match(i.reasons.join(";"), /персональная новость/);
  });

  it("комиссии повышаются для категорий продавца — внимание; для чужих — общая новость без пометки", () => {
    const text = "С 1 ноября комиссия повышается в категориях: ведра, лопаты.";
    const mine = analyzeNews(news("Повышаем комиссии для нескольких категорий", ["Условия сотрудничества"], { text }), profile());
    assert.deepEqual(mine.matchedCategories, ["Ведра"]);
    assert.equal(mine.tone, "bad");
    assert.equal(mine.attention, true);
    assert.match(mine.reasons.join(";"), /ваши категории: Ведра/);
    const other = analyzeNews(news("Повышаем комиссии для нескольких категорий", ["Условия сотрудничества"], { text: "С 1 ноября комиссия повышается в категориях: одежда, обувь." }), profile());
    assert.equal(other.matchedCategories.length, 0);
    // Новость о комиссиях полезна любому продавцу, но «внимание» ставим только при совпадении с вашими категориями.
    assert.equal(other.attention, false);
    assert.equal(other.relevant, true);
    assert.match(other.reasons.join(";"), /условий и расходов/);
  });

  it("мусор не в ленте: обучение, пресс-центр, дайджест, чужие склады; свой склад — внимание", () => {
    assert.equal(analyzeNews(news("Запускаем бесплатный онлайн-практикум по продажам", ["Обучение"]), profile()).relevant, false);
    assert.equal(analyzeNews(news("Мобильный банк для iPhone", ["Персональная новость", "Пресс-центр"]), profile()).relevant, true); // персональная: WB адресовал
    assert.equal(analyzeNews(news("Мобильный банк для iPhone", ["Пресс-центр"]), profile()).relevant, false);
    const sc = news("СЦ «Курск» и «Курск КГТ+» перестанут принимать товары", ["FBS"]);
    assert.equal(analyzeNews(sc, profile()).relevant, false);
    const mine = analyzeNews(sc, profile({ warehouseNames: ["Курск"] }));
    assert.equal(mine.relevant, true);
    assert.equal(mine.attention, true);
    assert.equal(mine.matchedWarehouse, true);
  });

  it("рубрика FBS для продавца FBS — относится к нему, для продавца без FBS — нет", () => {
    const n = news("FBS: переносите не принятые в ПВЗ заказы в новую поставку", ["FBS"]);
    assert.equal(analyzeNews(n, profile({ worksFbs: true })).relevant, true);
    assert.equal(analyzeNews(n, profile({ worksFbs: false })).relevant, false);
  });

  it("«Важно» от WB — внимание продавцу, которого это касается", () => {
    const i = analyzeNews(news("Важное изменение правил отгрузки FBS", ["Важно", "FBS"]), profile());
    assert.equal(i.important, true);
    assert.equal(i.attention, true);
  });
});

describe("события из новостей", () => {
  const promo = news("Автоакция «11.11: выгодные предложения» пройдет с 25 октября по 3 ноября", ["Персональная новость", "Акции"], { id: 14800, text: "Приглашаем вас принять участие. Условия смотрите в календаре акций. Вторая строка." });

  it("новость становится событием с пересказом, рубрикой и причиной; время — публикация WB", () => {
    const [e] = newsToEvents([promo], profile(), "2026-10-21", "2026-10-21T12:00:00Z");
    assert.equal(e!.kind, "news_item");
    assert.equal(e!.group, "news");
    assert.equal(e!.severity, "important");
    assert.equal(e!.createdAt, "2026-10-18T10:00:00.000Z");
    assert.equal(e!.id, "news_item:store:14800");
    assert.match(e!.detail, /^Приглашаем вас принять участие/);
    assert.match(e!.detail, /Рубрика WB: Акции/);
    assert.match(e!.detail, /Почему это вам: персональная новость/);
  });

  it("напоминание о старте за 3 дня и об окончании за 2: ни раньше, ни позже", () => {
    const at = (today: string) => newsToEvents([promo], profile(), today, `${today}T12:00:00Z`).filter((x) => x.kind === "promo_deadline");
    assert.equal(at("2026-10-21").length, 0); // до старта 4 дня
    const start = at("2026-10-22");
    assert.equal(start.length, 1);
    assert.equal(start[0]!.title, "Акция стартует через 3 дня");
    assert.equal(start[0]!.id, "promo_deadline:store:14800:start");
    assert.equal(at("2026-10-26").length, 0); // идёт, до конца далеко
    const end = at("2026-11-02");
    assert.equal(end.length, 1);
    assert.equal(end[0]!.title, "Акция заканчивается через 1 день");
    assert.equal(at("2026-11-03")[0]!.title, "Акция заканчивается сегодня");
    assert.equal(at("2026-11-04").length, 0);
  });

  it("общая новость — отдельный вид (по умолчанию скрыта), дайджест не попадает вовсе, напоминаний нет", () => {
    const general = news("Запускаем бесплатный онлайн-практикум", ["Обучение"], { id: 2 });
    const digest = news("Важные новости с 12 по 16 октября", ["Важно", "Дайджесты"], { id: 3 });
    const out = newsToEvents([general, digest], profile(), "2026-10-21", "2026-10-21T12:00:00Z");
    assert.deepEqual(out.map((e) => e.kind), ["news_general"]);
    assert.equal(extractSummary(""), "");
    assert.ok(extractSummary("Первое. Второе. Третье.").startsWith("Первое."));
  });
});

describe("уточнения разбора", () => {
  it("уведомление о работе СЦ отличается от инструкции для продавцов FBS, где СЦ упомянут между делом", () => {
    const instruction = news("FBS: перенесите заказ в новую поставку, если нужно довезти его в СЦ или ПВЗ", ["FBS"]);
    assert.equal(newsTopic(instruction.types, instruction.header), "Склады и поставки");
    assert.equal(analyzeNews(instruction, profile({ worksFbs: true })).relevant, true);
    assert.equal(analyzeNews(news("СЦ «Курск» возобновил работу", ["FBS"]), profile()).relevant, false);
  });

  it("новости «WB Продвижение» касаются тех, кто рекламируется; удержания и штрафы касаются всех", () => {
    const ads = news("Делаем продвижение доступнее: аукцион второй цены в CPC-кампаниях", ["Маркетинг"]);
    assert.equal(analyzeNews(ads, profile({ usesAds: true })).relevant, true);
    assert.equal(analyzeNews(ads, profile({ usesAds: false })).relevant, false);
    assert.equal(newsTopic(["WB Partners"], "В отчёте по удержаниям снова отображаются верные данные"), "Штрафы");
    assert.equal(analyzeNews(news("В отчёте по удержаниям снова отображаются верные данные", ["WB Partners"]), profile()).relevant, true);
  });

  it("«Обратить внимание» не ставится на рекламу банковских услуг и хорошие новости, но ставится на живую акцию и деньги", () => {
    const bank = analyzeNews(news("Ведите электронный документооборот и бухгалтерию в одном сервисе", ["Персональная новость", "Условия сотрудничества"]), profile());
    assert.equal(bank.relevant, true);
    assert.equal(bank.attention, false);
    const insurance = analyzeNews(news("С 19 октября улучшились условия добровольного страхования заказов", ["Персональная новость", "Условия сотрудничества"]), profile());
    assert.equal(insurance.tone, "good");
    assert.equal(insurance.attention, false);
    const promoDone = analyzeNews(news("Продлеваем распродажу «Летние скидки» до 14 сентября включительно", ["Персональная новость", "Акции"], { date: "2026-09-08T10:00:00.000Z" }), profile(), "2026-10-21");
    assert.equal(promoDone.attention, false); // акция давно прошла
    const promoLive = analyzeNews(news("Автоакция «Осенние скидки»: с 27 октября по 20 ноября", ["Персональная новость", "Акции"], { date: "2026-10-19T10:00:00.000Z" }), profile(), "2026-10-21");
    assert.equal(promoLive.attention, true);
    const fee = analyzeNews(news("Меняем тарифы на хранение", ["Персональная новость", "Условия сотрудничества"]), profile());
    assert.equal(fee.attention, true);
  });

  it("пересказ не режется по «11.11» и берёт первые предложения целиком", () => {
    const text = "Приближается распродажа «11.11» и стартующая «Чёрная пятница». Приглашаем поучаствовать, чтобы привлечь больше покупателей. Условия смотрите в календаре акций.";
    const summary = extractSummary(text);
    assert.ok(summary.startsWith("Приближается распродажа «11.11»"));
    assert.ok(!summary.startsWith("11"));
  });
});

describe("скрытые рубрики", () => {
  it("рубрика, которую пользователь отключил, убирает обычные новости, но не персональные, не «Важно» и не тех, что требуют внимания", () => {
    const p = profile({ usesAds: true, mutedRubrics: ["Маркетинг"] });
    const ads = news("Делаем продвижение доступнее: аукцион второй цены", ["Маркетинг"]);
    assert.equal(analyzeNews(ads, profile({ usesAds: true })).relevant, true);
    assert.equal(analyzeNews(ads, p).relevant, false);
    const personal = news("Вы вошли в число продавцов с новой вкладкой", ["Персональная новость", "Маркетинг"]);
    assert.equal(analyzeNews(personal, p).relevant, true);
    const important = news("Важное изменение для рекламных кампаний", ["Важно", "Маркетинг"]);
    assert.equal(analyzeNews(important, p).relevant, true);
    assert.equal(analyzeNews(important, p).attention, true);
  });

  it("в ленте скрытие по рубрике работает по тексту уведомления; внимание и персональные остаются", () => {
    const muted = new Set(["Маркетинг"]);
    const ev = (over: Partial<{ kind: string; severity: string; detail: string }>) => ({ kind: "news_item", severity: "info", detail: "Текст.\nРубрика WB: Маркетинг", ...over });
    assert.equal(hiddenByRubric(ev({}), muted), true);
    assert.equal(hiddenByRubric(ev({ severity: "important" }), muted), false);
    assert.equal(hiddenByRubric(ev({ detail: "Текст.\nРубрика WB: Маркетинг\nПочему это вам: персональная новость: WB адресовал её вашему кабинету" }), muted), false);
    assert.equal(hiddenByRubric(ev({ kind: "price_changed" }), muted), false);
    assert.equal(hiddenByRubric(ev({ detail: "Рубрика WB: FBS" }), muted), false);
    assert.deepEqual(newsRubricsOf("Текст\nРубрика WB: Маркетинг, FBS\nПочему это вам: x"), ["Маркетинг", "FBS"]);
  });

  it("список скрытых рубрик: запись и разбор туда-обратно", () => {
    assert.deepEqual(parseRubricList(serializeRubricList(["Маркетинг", "Обучение"])), ["Маркетинг", "Обучение"]);
    assert.deepEqual(parseRubricList(""), []);
  });
});

