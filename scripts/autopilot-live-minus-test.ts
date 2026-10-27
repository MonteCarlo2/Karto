/**
 * Живая проба автопилота на минус-фразах с откатом. Один реальный запрос в WB на запись и один на возврат.
 *
 *   npx tsx --env-file=.env.local scripts/autopilot-live-minus-test.ts <userId> <advertId> <nmId>
 *
 * 1. Читает текущие минус-фразы кампании и сохраняет копию в файл (до любых изменений).
 * 2. Проверяет решение автопилота (правила включены, лимит 1 действие).
 * 3. Добавляет одну реальную фразу кластера товара (запрос с кликами и без заказов), через тот же исполнитель, что использует автопилот.
 * 4. Читает список ещё раз и сверяет.
 * 5. Возвращает ровно прежний список (set-minus со старым списком) и сверяет ещё раз.
 */
import { writeFileSync } from "node:fs";
import { createServerClient } from "@/lib/supabase/server";
import { openSellerHubWbToken } from "@/lib/seller-hub/wb-token";
import { supabaseSellerHubSecretDb } from "@/lib/seller-hub/wb-token-store";
import { executeAutopilotAction, decideAutopilot, DEFAULT_AUTOPILOT } from "@/lib/seller-hub/agent/autopilot";
import type { AgentAction } from "@/lib/seller-hub/ads-agent-engine";

const BASE = "https://advert-api.wildberries.ru";
const [userId, advertRaw, nmRaw] = process.argv.slice(2);
const advertId = Number(advertRaw);
const nmId = Number(nmRaw);
const PHRASE = "пластиковые ведра 10 литров без крышки";

async function post(token: string, path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { Authorization: token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, text: await res.text() };
}

async function readMinus(token: string): Promise<string[]> {
  const res = await post(token, "/adv/v0/normquery/get-minus", { items: [{ advert_id: advertId, nm_id: nmId }] });
  if (!res.ok) throw new Error(`чтение минус-фраз: ${res.status}`);
  const json = JSON.parse(res.text) as { items?: Array<{ advert_id?: number; nm_id?: number; norm_queries?: string[] }> };
  const row = (json.items ?? []).find((i) => i.advert_id === advertId && i.nm_id === nmId);
  return row?.norm_queries ?? [];
}

async function main() {
  const opened = await openSellerHubWbToken(userId, supabaseSellerHubSecretDb(createServerClient()));
  if (!opened.ok) throw new Error(`токен: ${opened.reason}`);
  const token = opened.token;

  const before = await readMinus(token);
  writeFileSync(`autopilot-minus-backup-${advertId}-${nmId}.json`, JSON.stringify({ advertId, nmId, before }, null, 2));
  console.log(`1. До: ${before.length} минус-фраз, копия сохранена`);
  if (before.some((q) => q.toLowerCase() === PHRASE)) throw new Error("пробная фраза уже стоит, остановка");

  const action = { type: "minus_phrases", advertId: String(advertId), nmId: String(nmId), queries: [PHRASE] } as AgentAction;
  const decision = decideAutopilot({ action, planAutopilot: true, planRunning: true, settings: { ...DEFAULT_AUTOPILOT, enabled: true, allowedTypes: ["minus_phrases"], maxActionsPerDay: 1 }, usage: { actionsToday: 0, depositToday: 0 } });
  console.log("2. Решение автопилота:", JSON.stringify(decision));
  if (!decision.run) throw new Error("автопилот не разрешил, остановка");

  let reverted = false;
  try {
    const res = await executeAutopilotAction(token, action);
    console.log("3. Запись:", JSON.stringify(res));
    if (!res.ok) throw new Error("запись не удалась");
    const after = await readMinus(token);
    console.log(`4. После: ${after.length} фраз, пробная стоит: ${after.some((q) => q.toLowerCase() === PHRASE)}, прежние сохранились: ${before.every((q) => after.includes(q))}`);
  } finally {
    const back = await post(token, "/adv/v0/normquery/set-minus", { advert_id: advertId, nm_id: nmId, norm_queries: before });
    console.log("5. Возврат:", back.status);
    const final = await readMinus(token);
    reverted = final.length === before.length && before.every((q) => final.includes(q));
    console.log(`6. Итог: ${final.length} фраз, совпадает с исходным: ${reverted}`);
  }
  if (!reverted) process.exitCode = 2;
}

main().catch((e) => {
  console.error("ОШИБКА:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
