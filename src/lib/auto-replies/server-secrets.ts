import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AutoRepliesMarketplaceId } from "./types";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function deriveKey(raw: string): Buffer {
  return scryptSync(raw, "karto-auto-reply-secrets-v1", 32);
}

/** Все кандидаты ключа — если на сервере меняли CRON_SECRET / AUTO_REPLY_SECRETS_KEY, старые токены всё ещё читаются. */
function encryptionKeyCandidates(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (v: string | undefined) => {
    const t = v?.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  add(process.env.AUTO_REPLY_SECRETS_KEY);
  add(process.env.CRON_SECRET);
  add("karto-auto-reply-dev-key");
  return out;
}

function encryptionKey(): Buffer {
  const candidates = encryptionKeyCandidates();
  return deriveKey(candidates[0] ?? "karto-auto-reply-dev-key");
}

export function encryptAutoReplySecret(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

function decryptWithKey(ciphertext: string, key: Buffer): string {
  const [ivB64, tagB64, dataB64] = ciphertext.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Invalid ciphertext");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function decryptAutoReplySecret(ciphertext: string): string {
  const candidates = encryptionKeyCandidates();
  let lastErr: unknown;
  for (const raw of candidates) {
    try {
      return decryptWithKey(ciphertext, deriveKey(raw));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Decrypt failed");
}

export type MarketplaceSecretRow = {
  user_id: string;
  shop_id: string;
  marketplace_id: AutoRepliesMarketplaceId;
  api_key_ciphertext: string;
  client_id?: string | null;
  campaign_id?: string | null;
  business_id?: string | null;
};

export async function upsertMarketplaceSecrets(
  supabase: SupabaseClient,
  userId: string,
  entries: Array<{
    shopId: string;
    marketplaceId: AutoRepliesMarketplaceId;
    apiKey: string;
    clientId?: string | null;
    campaignId?: string | null;
    businessId?: string | null;
  }>
): Promise<void> {
  const now = new Date().toISOString();
  for (const entry of entries) {
    const token = entry.apiKey.trim();
    if (!token) {
      await supabase
        .from("auto_reply_marketplace_secrets")
        .delete()
        .eq("user_id", userId)
        .eq("shop_id", entry.shopId)
        .eq("marketplace_id", entry.marketplaceId);
      continue;
    }
    await supabase.from("auto_reply_marketplace_secrets").upsert(
      {
        user_id: userId,
        shop_id: entry.shopId,
        marketplace_id: entry.marketplaceId,
        api_key_ciphertext: encryptAutoReplySecret(token),
        client_id: entry.clientId ?? null,
        campaign_id: entry.campaignId ?? null,
        business_id: entry.businessId ?? null,
        updated_at: now,
      },
      { onConflict: "user_id,shop_id,marketplace_id" }
    );
  }
}

export async function listMarketplaceSecretsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<Array<{ shopId: string; marketplaceId: AutoRepliesMarketplaceId; apiKey: string; clientId?: string; campaignId?: string; businessId?: string }>> {
  const { data, error } = await supabase
    .from("auto_reply_marketplace_secrets")
    .select("shop_id, marketplace_id, api_key_ciphertext, client_id, campaign_id, business_id")
    .eq("user_id", userId);

  if (error) {
    if (/does not exist|relation.*auto_reply_marketplace_secrets/i.test(error.message)) {
      return [];
    }
    throw error;
  }

  const rows = (data ?? []) as MarketplaceSecretRow[];
  const out: Array<{
    shopId: string;
    marketplaceId: AutoRepliesMarketplaceId;
    apiKey: string;
    clientId?: string;
    campaignId?: string;
    businessId?: string;
  }> = [];

  for (const row of rows) {
    try {
      const apiKey = decryptAutoReplySecret(row.api_key_ciphertext);
      out.push({
        shopId: row.shop_id,
        marketplaceId: row.marketplace_id as AutoRepliesMarketplaceId,
        apiKey,
        clientId: row.client_id ?? undefined,
        campaignId: row.campaign_id ?? undefined,
        businessId: row.business_id ?? undefined,
      });
      const reencrypted = encryptAutoReplySecret(apiKey);
      if (reencrypted !== row.api_key_ciphertext) {
        void supabase
          .from("auto_reply_marketplace_secrets")
          .update({ api_key_ciphertext: reencrypted, updated_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("shop_id", row.shop_id)
          .eq("marketplace_id", row.marketplace_id);
      }
    } catch (e) {
      console.error(
        "[auto-reply] cannot decrypt marketplace secret — ключ НЕ удалён, проверьте AUTO_REPLY_SECRETS_KEY на сервере",
        row.marketplace_id,
        e instanceof Error ? e.message : e
      );
    }
  }
  return out;
}
