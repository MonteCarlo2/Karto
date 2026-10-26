import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

/**
 * Защита от случайной потери функционала при редизайне: ключевые файлы из docs/seller-hub/feature-inventory.md должны существовать.
 * Удалить или переименовать файл можно только осознанно, обновив реестр.
 */
describe("реестр функций Seller Hub", () => {
  const root = process.cwd();
  const doc = fs.readFileSync(path.join(root, "docs", "seller-hub", "feature-inventory.md"), "utf8");
  const section = doc.split("## Файлы (проверяются тестом)")[1] ?? "";
  const files = [...section.matchAll(/^- `([^`]+)`/gm)].map((m) => m[1]!);

  it("в реестре есть файлы", () => {
    assert.ok(files.length >= 40, `в реестре ${files.length} файлов`);
  });

  it("все файлы реестра существуют", () => {
    const missing = files.filter((file) => !fs.existsSync(path.join(root, file)));
    assert.deepEqual(missing, [], `Потеряны файлы: ${missing.join(", ")}. Если это сознательное решение, обновите docs/seller-hub/feature-inventory.md`);
  });
});
