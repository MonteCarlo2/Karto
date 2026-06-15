import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";
import type { AutoRepliesMarketplaceId } from "@/lib/auto-replies/types";

export type TelegramLinkRow = {
  user_id: string;
  telegram_user_id: number;
  chat_id: number;
  username: string | null;
  first_name: string | null;
  linked_at: string;
  notify_enabled: boolean;
};

export type TelegramReviewMessageRow = {
  id: string;
  user_id: string;
  shop_id: string;
  marketplace_id: string;
  review_id: string;
  telegram_message_id: number;
  chat_id: number;
  reply_draft: string;
  status: "pending" | "sent" | "cancelled";
  notified_at: string;
  resolved_at: string | null;
  has_photo?: boolean;
};

export type TelegramSessionState =
  | "idle"
  | "awaiting_email"
  | "awaiting_code"
  | "awaiting_edit_text"
  | "awaiting_regen_hint";

export type ConsumedLinkToken = {
  userId: string;
  shopId: string;
  marketplaceId: AutoRepliesMarketplaceId | null;
};

const VALID_MP = new Set<AutoRepliesMarketplaceId>(["wildberries", "ozon", "yandex"]);

export function parseTelegramMarketplaceId(value: string | null | undefined): AutoRepliesMarketplaceId | null {
  const id = value?.trim() as AutoRepliesMarketplaceId | undefined;
  return id && VALID_MP.has(id) ? id : null;
}

export function hashTelegramCode(code: string): string {
  return createHash("sha256").update(`karto-tg:${code}`).digest("hex");
}

export function generateLinkToken(): string {
  return randomBytes(24).toString("hex");
}

export function generateSixDigitCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function shortCallbackId(uuid: string): string {
  return uuid.replace(/-/g, "").slice(0, 12);
}

export async function fetchTelegramLinkByUserId(
  supabase: SupabaseClient,
  userId: string
): Promise<TelegramLinkRow | null> {
  const { data } = await supabase
    .from("auto_reply_telegram_links")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as TelegramLinkRow | null) ?? null;
}

export async function fetchTelegramLinkByTelegramUserId(
  supabase: SupabaseClient,
  telegramUserId: number
): Promise<TelegramLinkRow | null> {
  const { data } = await supabase
    .from("auto_reply_telegram_links")
    .select("*")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  return (data as TelegramLinkRow | null) ?? null;
}

export async function upsertTelegramLink(
  supabase: SupabaseClient,
  row: {
    userId: string;
    telegramUserId: number;
    chatId: number;
    username?: string | null;
    firstName?: string | null;
  }
): Promise<void> {
  await supabase.from("auto_reply_telegram_links").upsert(
    {
      user_id: row.userId,
      telegram_user_id: row.telegramUserId,
      chat_id: row.chatId,
      username: row.username ?? null,
      first_name: row.firstName ?? null,
      linked_at: new Date().toISOString(),
      notify_enabled: true,
    },
    { onConflict: "user_id" }
  );
}

export async function isTelegramMarketplaceEnabled(
  supabase: SupabaseClient,
  userId: string,
  shopId: string,
  marketplaceId: AutoRepliesMarketplaceId
): Promise<boolean> {
  const { data } = await supabase
    .from("auto_reply_telegram_marketplaces")
    .select("notify_enabled")
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .eq("marketplace_id", marketplaceId)
    .maybeSingle();

  if (!data) return false;
  return Boolean(data.notify_enabled);
}

export async function enableTelegramMarketplace(
  supabase: SupabaseClient,
  input: {
    userId: string;
    shopId: string;
    marketplaceId: AutoRepliesMarketplaceId;
  }
): Promise<void> {
  await supabase.from("auto_reply_telegram_marketplaces").upsert(
    {
      user_id: input.userId,
      shop_id: input.shopId,
      marketplace_id: input.marketplaceId,
      notify_enabled: true,
      enabled_at: new Date().toISOString(),
    },
    { onConflict: "user_id,shop_id,marketplace_id" }
  );
}

export async function disableTelegramMarketplace(
  supabase: SupabaseClient,
  input: {
    userId: string;
    shopId: string;
    marketplaceId: AutoRepliesMarketplaceId;
  }
): Promise<void> {
  await supabase.from("auto_reply_telegram_marketplaces").upsert(
    {
      user_id: input.userId,
      shop_id: input.shopId,
      marketplace_id: input.marketplaceId,
      notify_enabled: false,
      enabled_at: new Date().toISOString(),
    },
    { onConflict: "user_id,shop_id,marketplace_id" }
  );
}

/** Отключить Telegram только для одной площадки (аккаунт в боте сохраняется). */
export async function cleanupTelegramMarketplaceUnlink(
  supabase: SupabaseClient,
  userId: string,
  shopId: string,
  marketplaceId: AutoRepliesMarketplaceId
): Promise<void> {
  await Promise.all([
    disableTelegramMarketplace(supabase, { userId, shopId, marketplaceId }),
    supabase
      .from("auto_reply_telegram_review_messages")
      .delete()
      .eq("user_id", userId)
      .eq("shop_id", shopId)
      .eq("marketplace_id", marketplaceId)
      .eq("status", "pending"),
  ]);
}

export async function deleteTelegramLink(supabase: SupabaseClient, userId: string): Promise<void> {
  await supabase.from("auto_reply_telegram_links").delete().eq("user_id", userId);
}

/** Полное отключение: ссылка, сессии бота, ожидающие TG-карточки. */
export async function cleanupTelegramOnUnlink(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const link = await fetchTelegramLinkByUserId(supabase, userId);

  await Promise.all([
    supabase
      .from("auto_reply_telegram_review_messages")
      .delete()
      .eq("user_id", userId)
      .eq("status", "pending"),
    link
      ? supabase.from("auto_reply_telegram_sessions").delete().eq("telegram_user_id", link.telegram_user_id)
      : Promise.resolve(),
    deleteTelegramLink(supabase, userId),
  ]);
}

export async function createLinkToken(
  supabase: SupabaseClient,
  userId: string,
  opts?: {
    shopId?: string;
    marketplaceId?: AutoRepliesMarketplaceId;
    ttlMinutes?: number;
  }
): Promise<string> {
  const token = generateLinkToken();
  const expiresAt = new Date(Date.now() + (opts?.ttlMinutes ?? 30) * 60_000).toISOString();
  await supabase.from("auto_reply_telegram_link_tokens").insert({
    token,
    user_id: userId,
    expires_at: expiresAt,
    shop_id: (opts?.shopId ?? "main").trim() || "main",
    marketplace_id: opts?.marketplaceId ?? null,
  });
  return token;
}

export async function consumeLinkToken(
  supabase: SupabaseClient,
  token: string
): Promise<ConsumedLinkToken | null> {
  return resolveLinkTokenForConnect(supabase, token.trim());
}

/** Атомарно занять токен или повторно использовать свежий (дубль webhook / двойной /start). */
export async function resolveLinkTokenForConnect(
  supabase: SupabaseClient,
  token: string
): Promise<ConsumedLinkToken | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const nowIso = new Date().toISOString();

  const { data: claimed } = await supabase
    .from("auto_reply_telegram_link_tokens")
    .update({ used_at: nowIso })
    .eq("token", trimmed)
    .is("used_at", null)
    .gt("expires_at", nowIso)
    .select("user_id, shop_id, marketplace_id")
    .maybeSingle();

  if (claimed) {
    return {
      userId: claimed.user_id as string,
      shopId: (claimed.shop_id as string | null)?.trim() || "main",
      marketplaceId: parseTelegramMarketplaceId(claimed.marketplace_id as string | null),
    };
  }

  const { data: row } = await supabase
    .from("auto_reply_telegram_link_tokens")
    .select("user_id, shop_id, marketplace_id, expires_at, used_at")
    .eq("token", trimmed)
    .maybeSingle();

  if (!row?.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  const usedAgoMs = Date.now() - new Date(row.used_at as string).getTime();
  if (usedAgoMs > 20 * 60_000) return null;

  return {
    userId: row.user_id as string,
    shopId: (row.shop_id as string | null)?.trim() || "main",
    marketplaceId: parseTelegramMarketplaceId(row.marketplace_id as string | null),
  };
}

export async function releaseLinkToken(supabase: SupabaseClient, token: string): Promise<void> {
  await supabase
    .from("auto_reply_telegram_link_tokens")
    .update({ used_at: null })
    .eq("token", token.trim());
}

export async function findAuthUserIdByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<{ id: string; email: string } | null> {
  const { data, error } = await supabase.rpc("find_auth_user_by_email", {
    p_email: email.trim().toLowerCase(),
  });
  if (error || !data?.[0]?.id) return null;
  return { id: data[0].id as string, email: data[0].email as string };
}

export async function saveTelegramVerifyCode(
  supabase: SupabaseClient,
  input: {
    email: string;
    code: string;
    telegramUserId: number;
    chatId: number;
    ttlMinutes?: number;
  }
): Promise<void> {
  const expiresAt = new Date(Date.now() + (input.ttlMinutes ?? 10) * 60_000).toISOString();
  await supabase.from("auto_reply_telegram_verify_codes").insert({
    email: input.email.trim().toLowerCase(),
    code_hash: hashTelegramCode(input.code),
    telegram_user_id: input.telegramUserId,
    chat_id: input.chatId,
    expires_at: expiresAt,
  });
}

export async function verifyTelegramEmailCode(
  supabase: SupabaseClient,
  input: { email: string; code: string; telegramUserId: number }
): Promise<boolean> {
  const email = input.email.trim().toLowerCase();
  const { data } = await supabase
    .from("auto_reply_telegram_verify_codes")
    .select("id, code_hash, expires_at, attempts")
    .eq("email", email)
    .eq("telegram_user_id", input.telegramUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return false;
  if (new Date(data.expires_at).getTime() < Date.now()) return false;
  if ((data.attempts as number) >= 5) return false;

  const ok = data.code_hash === hashTelegramCode(input.code);
  await supabase
    .from("auto_reply_telegram_verify_codes")
    .update({ attempts: (data.attempts as number) + 1 })
    .eq("id", data.id);

  return ok;
}

export async function getTelegramSession(
  supabase: SupabaseClient,
  telegramUserId: number
): Promise<{ state: TelegramSessionState; payload: Record<string, unknown>; chatId: number } | null> {
  const { data } = await supabase
    .from("auto_reply_telegram_sessions")
    .select("state, payload, chat_id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  if (!data) return null;
  return {
    state: data.state as TelegramSessionState,
    payload: (data.payload as Record<string, unknown>) ?? {},
    chatId: data.chat_id as number,
  };
}

export async function setTelegramSession(
  supabase: SupabaseClient,
  input: {
    telegramUserId: number;
    chatId: number;
    state: TelegramSessionState;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  await supabase.from("auto_reply_telegram_sessions").upsert(
    {
      telegram_user_id: input.telegramUserId,
      chat_id: input.chatId,
      state: input.state,
      payload: input.payload ?? {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: "telegram_user_id" }
  );
}

export async function clearTelegramSession(
  supabase: SupabaseClient,
  telegramUserId: number
): Promise<void> {
  await supabase.from("auto_reply_telegram_sessions").delete().eq("telegram_user_id", telegramUserId);
}

export async function fetchReviewMessageByShortId(
  supabase: SupabaseClient,
  shortId: string,
  telegramUserId: number
): Promise<TelegramReviewMessageRow | null> {
  const link = await fetchTelegramLinkByTelegramUserId(supabase, telegramUserId);
  if (!link) return null;

  const { data } = await supabase
    .from("auto_reply_telegram_review_messages")
    .select("*")
    .eq("user_id", link.user_id)
    .eq("status", "pending")
    .order("notified_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as TelegramReviewMessageRow[];
  return rows.find((r) => shortCallbackId(r.id) === shortId) ?? null;
}

export async function upsertTelegramReviewMessage(
  supabase: SupabaseClient,
  row: Omit<TelegramReviewMessageRow, "resolved_at" | "notified_at" | "status"> & {
    status?: TelegramReviewMessageRow["status"];
  }
): Promise<TelegramReviewMessageRow | null> {
  const { data, error } = await supabase
    .from("auto_reply_telegram_review_messages")
    .upsert(
      {
        user_id: row.user_id,
        shop_id: row.shop_id,
        marketplace_id: row.marketplace_id,
        review_id: row.review_id,
        telegram_message_id: row.telegram_message_id,
        chat_id: row.chat_id,
        reply_draft: row.reply_draft,
        status: row.status ?? "pending",
        has_photo: row.has_photo ?? false,
        notified_at: new Date().toISOString(),
      },
      { onConflict: "user_id,shop_id,marketplace_id,review_id" }
    )
    .select("*")
    .maybeSingle();

  if (error) return null;
  return data as TelegramReviewMessageRow;
}

export async function markTelegramReviewMessageSent(
  supabase: SupabaseClient,
  input: {
    userId: string;
    shopId: string;
    marketplaceId: string;
    reviewId: string;
  }
): Promise<TelegramReviewMessageRow | null> {
  const { data } = await supabase
    .from("auto_reply_telegram_review_messages")
    .update({
      status: "sent",
      resolved_at: new Date().toISOString(),
    })
    .eq("user_id", input.userId)
    .eq("shop_id", input.shopId)
    .eq("marketplace_id", input.marketplaceId)
    .eq("review_id", input.reviewId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  return (data as TelegramReviewMessageRow | null) ?? null;
}

export async function updateTelegramReviewDraft(
  supabase: SupabaseClient,
  messageId: string,
  replyDraft: string
): Promise<void> {
  await supabase
    .from("auto_reply_telegram_review_messages")
    .update({ reply_draft: replyDraft })
    .eq("id", messageId)
    .eq("status", "pending");
}
