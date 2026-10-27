/** Только чтение: текущие минус-фразы пары кампания/товар. npx tsx --env-file=.env.local scripts/minus-read.ts <userId> <advertId> <nmId> [restore] */
import { createServerClient } from "@/lib/supabase/server";
import { openSellerHubWbToken } from "@/lib/seller-hub/wb-token";
import { supabaseSellerHubSecretDb } from "@/lib/seller-hub/wb-token-store";
const [userId, advertId, nmId, mode] = process.argv.slice(2);
(async () => {
  const o = await openSellerHubWbToken(userId, supabaseSellerHubSecretDb(createServerClient()));
  if (!o.ok) throw new Error(o.reason);
  const h = { Authorization: o.token, "Content-Type": "application/json" };
  const B = "https://advert-api.wildberries.ru/adv/v0/normquery";
  const read = async () => { const r = await fetch(`${B}/get-minus`, { method: "POST", headers: h, body: JSON.stringify({ items: [{ advert_id: Number(advertId), nm_id: Number(nmId) }] }) }); const j = (await r.json()) as { items?: Array<{ norm_queries?: string[] }> }; return j.items?.[0]?.norm_queries ?? []; };
  console.log("сейчас:", JSON.stringify(await read()));
  if (mode === "restore-empty") {
    const r = await fetch(`${B}/set-minus`, { method: "POST", headers: h, body: JSON.stringify({ advert_id: Number(advertId), nm_id: Number(nmId), norm_queries: [] }) });
    console.log("возврат к пустому списку:", r.status, "после:", JSON.stringify(await read()));
  }
})().catch((e) => console.error("ОШИБКА", e instanceof Error ? e.message : e));
