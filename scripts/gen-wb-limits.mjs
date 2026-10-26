// Строит src/lib/seller-hub/wb-limits/limits.generated.ts из swagger WB (docs/wb-api/swagger).
// Запуск: node scripts/gen-wb-limits.mjs
// Лимиты в спецификации записаны таблицами в описании метода: «Тип | Период | Лимит | Интервал | Всплеск»
// или без колонки типа (один для всех); часть методов делит один лимит на всю категорию.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "docs", "wb-api", "swagger");
const out = path.join(root, "src", "lib", "seller-hub", "wb-limits", "limits.generated.ts");

const UNIT_MS = { "мс": 1, "сек": 1000, "с": 1000, "мин": 60_000, "ч": 3_600_000 };
function dur(text) {
  // В JS \b не работает с кириллицей: граница слова задана явно.
  const m = /(\d+(?:[.,]\d+)?)\s*(мс|сек|мин|ч|с)(?![а-яё])/i.exec(text.trim());
  return m ? Math.round(Number(m[1].replace(",", ".")) * UNIT_MS[m[2].toLowerCase()]) : null;
}
function count(text) {
  const m = /(\d+)/.exec(text);
  return m ? Number(m[1]) : null;
}
function rowOf(cells) {
  const row = [dur(cells[0]), count(cells[1]), dur(cells[2]), count(cells[3])];
  return row.every((v) => v != null) ? row : null;
}

const ops = [];
const issues = [];
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort()) {
  // Часть описаний записана одной строкой в кавычках с литеральными \n: разворачиваем только такие строки.
  const lines = fs
    .readFileSync(path.join(dir, file), "utf8")
    .split(/\r?\n/)
    .flatMap((l) => (l.includes("\\n|") ? l.split("\\n").map((s) => "      " + s) : [l]));
  let inPaths = false;
  let curPath = null;
  let curMethod = null;
  let op = null;
  for (const line of lines) {
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (!inPaths) continue;
    if (/^\S/.test(line)) {
      inPaths = false;
      continue;
    }
    let m = /^  (\/[^\s:]*):\s*$/.exec(line);
    if (m) {
      curPath = m[1];
      curMethod = null;
      op = null;
      continue;
    }
    m = /^    (get|post|put|patch|delete):\s*$/.exec(line);
    if (m && curPath) {
      curMethod = m[1].toUpperCase();
      op = { file, method: curMethod, path: curPath, readonly: false, group: null, personal: null, service: null, all: null };
      ops.push(op);
      continue;
    }
    if (!op) continue;
    if (/^      x-readonly-method: true/.test(line)) op.readonly = true;
    m = /для всех методов категории <strong>(.*?)<\/strong>/.exec(line);
    if (m) op.group = m[1].trim();
    m = /^\s*\|\s*(\d+(?:[.,]\d+)?\s*(?:мс|сек|мин|ч|с)(?![а-яё]))\s*\|(.*)\|\s*$/i.exec(line);
    if (m) {
      const row = rowOf([m[1], ...m[2].split("|")].map((c) => c.trim()));
      if (!row) issues.push(`${file} ${op.method} ${op.path}: «${line.trim()}»`);
      else if (!op.all) op.all = row;
      continue;
    }
    m = /^\s*\|\s*(Персональный|Сервисный)\s*\|(.*)\|\s*$/.exec(line);
    if (m) {
      const row = rowOf(m[2].split("|").map((c) => c.trim()));
      if (!row) issues.push(`${file} ${op.method} ${op.path}: «${line.trim()}»`);
      else if (m[1] === "Персональный" && !op.personal) op.personal = row;
      else if (m[1] === "Сервисный" && !op.service) op.service = row;
    }
  }
}
if (issues.length > 0) {
  console.error(issues.join("\n"));
  process.exit(1);
}

const rows = ops
  .filter((o) => o.personal || o.service || o.all)
  .map((o) => {
    const personal = o.personal ?? o.all;
    const service = o.service ?? o.all;
    return `  [${JSON.stringify(o.method)}, ${JSON.stringify(o.path)}, ${JSON.stringify(o.group)}, ${o.readonly ? 1 : 0}, ${JSON.stringify(personal)}, ${JSON.stringify(service)}],`;
  });
const without = ops.filter((o) => !(o.personal || o.service || o.all)).map((o) => `${o.method} ${o.path}`);

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  `// Файл создан скриптом scripts/gen-wb-limits.mjs из docs/wb-api/swagger. Не править вручную.
// Метод, путь, общая категория лимита (null — лимит у метода свой), только чтение (1/0),
// лимит персонального токена и сервисного: [период мс, запросов за период, интервал между запросами мс, всплеск].
export type RawWbLimit = readonly [number, number, number, number] | null;
export type RawWbLimitRow = readonly [string, string, string | null, 0 | 1, RawWbLimit, RawWbLimit];

export const WB_LIMIT_ROWS: readonly RawWbLimitRow[] = [
${rows.join("\n")}
];

/** Методы, для которых спецификация не указывает лимит: ходим с осторожным общим лимитом. */
export const WB_METHODS_WITHOUT_LIMIT: readonly string[] = ${JSON.stringify(without)};
`,
);
console.log(`Записано ${rows.length} методов, без лимита: ${without.length}`);
