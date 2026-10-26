/**
 * Таблица отзывов Seller Hub + сверка с feedbackRating воронки.
 * force-синк (orderStatus), без полной диагностики.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { syncSellerHubFeedbacks } from "../src/lib/seller-hub/feedbacks/sync";
import { decryptSellerHubWbToken } from "../src/lib/seller-hub/wb-token";
import { fetchSalesFunnel } from "../src/lib/services/wildberries/analytics-client";

function loadEnv(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

const env = loadEnv(".env.local");
process.env.AUTO_REPLY_SECRETS_KEY = env.AUTO_REPLY_SECRETS_KEY;
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
if (!url || !key || !process.env.AUTO_REPLY_SECRETS_KEY) {
  console.error(JSON.stringify({ ok: false, reason: "missing env" }));
  process.exit(1);
}

const sb = createClient(url, key);
const { data, error } = await sb
  .from("auto_reply_marketplace_secrets")
  .select("user_id, api_key_ciphertext")
  .eq("marketplace_id", "wildberries")
  .eq("shop_id", "seller-hub")
  .limit(1)
  .maybeSingle();

if (error || !data?.api_key_ciphertext || typeof data.user_id !== "string") {
  console.error(JSON.stringify({ ok: false, reason: error?.message ?? "no secret" }));
  process.exit(1);
}

const token = decryptSellerHubWbToken(data.api_key_ciphertext);
const userId = data.user_id;

console.error("[feedbacks-table] funnel…");
const funnel = await fetchSalesFunnel(token);
const wbFeedbackRatingByNm: Record<string, number | null> = {};
for (const [nmId, row] of Object.entries(funnel.byNm ?? {})) {
  wbFeedbackRatingByNm[nmId] = row.feedbackRating;
}

console.error("[feedbacks-table] force sync feedbacks…");
const feedbacks = await syncSellerHubFeedbacks({
  supabase: sb,
  userId,
  token,
  force: true,
  wbFeedbackRatingByNm,
});

const nmIds = new Set([
  ...Object.keys(feedbacks.byNm),
  ...Object.keys(wbFeedbackRatingByNm),
]);

const products = [...nmIds]
  .map((nmId) => {
    const row = feedbacks.byNm[nmId];
    const wbRaw = wbFeedbackRatingByNm[nmId];
    const wbFeedbackRating =
      wbRaw == null || !Number.isFinite(wbRaw) || wbRaw === 0 ? null : Math.round(wbRaw * 100) / 100;
    return {
      nmId,
      reviewCount180: row?.reviewCount180 ?? 0,
      ourRating: row?.ratingAvg ?? null,
      wbFeedbackRating,
      unansweredNegative: row?.unansweredNegative ?? 0,
      unansweredQuestions: row?.unansweredQuestions ?? 0,
      mismatch:
        feedbacks.ratingMismatches.find((m) => m.nmId === nmId) != null,
    };
  })
  .sort((a, b) => b.reviewCount180 - a.reviewCount180 || a.nmId.localeCompare(b.nmId));

console.log(
  JSON.stringify(
    {
      ok: true,
      feedbacksStatus: feedbacks.status,
      error: feedbacks.error ?? null,
      ratingMismatches: feedbacks.ratingMismatches,
      products,
    },
    null,
    2,
  ),
);
