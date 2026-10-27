/**
 * Матрица возможностей WB API: какие методы записи есть у Wildberries (из docs/wb-api/swagger через WB_LIMIT_ROWS) и какие из них уже используются в нашем коде.
 * Нужна, чтобы агент охватывал максимум того, чем можно управлять через API, и чтобы видно было, что ещё не подключено.
 *
 *   npx tsx scripts/gen-wb-capability-matrix.ts   (пишет docs/seller-hub/wb-api-capability-matrix.md)
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WB_LIMIT_ROWS } from "@/lib/seller-hub/wb-limits/limits.generated";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".generated.ts") && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}
const corpus = walk(SRC).map((p) => readFileSync(p, "utf8")).join("\n");

/** Путь без параметров: /content/v2/object/charcs/{subjectId} -> /content/v2/object/charcs/ */
const literal = (path: string) => path.replace(/\{[^}]+\}.*$/, "");

const AREA: Array<[RegExp, string]> = [
  [/^\/content\/v2\/(get\/cards|cards\/(update|upload|move|delete)|barcodes|cards\/delete\/trash|cards\/recover)/, "Карточки: чтение, создание, правка, удаление"],
  [/^\/content\/v3\/media|^\/content\/v3\/media\/save/, "Медиа: фото и видео"],
  [/^\/content\/v2\/(object|directory)|^\/api\/content\/v1\/brands/, "Справочники: предметы, характеристики, бренды"],
  [/^\/content\/v2\/tag/, "Ярлыки карточек"],
  [/^\/api\/v2\/(list|upload)|^\/api\/v2\/history|^\/api\/v2\/buffer|^\/api\/v2\/quarantine|^\/api\/v2\/(upload\/task\/club)/, "Цены и скидки"],
  [/^\/api\/v1\/calendar/, "Календарь акций WB"],
  [/^\/adv\/|^\/api\/advert/, "Реклама: кампании, ставки, бюджет"],
  [/^\/api\/v3\/(stocks|warehouses|offices)|^\/api\/v1\/supplier\/stocks/, "Остатки и склады продавца (FBS)"],
  [/^\/api\/v3\/orders|^\/api\/v3\/supplies|^\/api\/marketplace/, "Сборочные задания и поставки FBS"],
  [/^\/api\/v1\/(feedbacks|questions)|^\/api\/feedbacks/, "Отзывы и вопросы"],
  [/^\/api\/(analytics|v2\/nm-report|v2\/search-report)|^\/api\/v1\/analytics/, "Аналитика и воронка"],
  [/^\/api\/v5\/supplier|^\/api\/v1\/supplier|^\/api\/finance|^\/api\/v1\/account/, "Отчёты и финансы"],
  [/^\/api\/v1\/(acceptance|tariffs)|^\/api\/tariffs/, "Тарифы и приёмка"],
  [/^\/api\/communications|^\/api\/v1\/seller-info|^\/api\/common|^\/api\/v1\/(users|user|invite)/, "Профиль продавца, новости, доступы"],
];
const areaOf = (path: string) => AREA.find(([re]) => re.test(path))?.[1] ?? "Прочее";

type Row = { method: string; path: string; write: boolean; used: boolean; area: string };
const rows: Row[] = WB_LIMIT_ROWS.map(([method, path, , readOnly]) => {
  const lit = literal(path);
  const used = lit.length > 3 && corpus.includes(lit);
  return { method, path, write: readOnly === 0, used, area: areaOf(path) };
});

const areas = [...new Set(rows.map((r) => r.area))].sort();
const lines: string[] = [];
lines.push("# Матрица возможностей WB API (генерируется)", "");
lines.push("Источник: `docs/wb-api/swagger` через `WB_LIMIT_ROWS`. Колонка «в коде»: путь метода встречается в нашем коде. Запись = метод изменяет данные в кабинете.", "");
const writes = rows.filter((r) => r.write);
lines.push(`Всего методов: ${rows.length}; методов записи: ${writes.length}; из них используется: ${writes.filter((r) => r.used).length}; не подключено: ${writes.filter((r) => !r.used).length}.`, "");
for (const area of areas) {
  const list = rows.filter((r) => r.area === area);
  const w = list.filter((r) => r.write);
  lines.push(`## ${area}`, `Методов ${list.length}, записи ${w.length}, подключено ${w.filter((r) => r.used).length}.`, "");
  lines.push("| метод | путь | запись | в коде |", "|---|---|---|---|");
  for (const r of list) lines.push(`| ${r.method} | \`${r.path}\` | ${r.write ? "да" : "нет"} | ${r.used ? "да" : "нет"} |`);
  lines.push("");
}
writeFileSync(join(ROOT, "docs/seller-hub/wb-api-capability-matrix.md"), lines.join("\n"), "utf8");
console.log(`методов ${rows.length}, записи ${writes.length}, подключено ${writes.filter((r) => r.used).length}`);
for (const area of areas) {
  const w = rows.filter((r) => r.area === area && r.write);
  console.log(`${area}: записей ${w.length}, подключено ${w.filter((r) => r.used).length}, НЕ подключено: ${w.filter((r) => !r.used).map((r) => `${r.method} ${r.path}`).slice(0, 6).join("; ")}`);
}
