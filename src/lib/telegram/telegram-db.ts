import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "crypto";
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
  extra_message_ids?: number[];
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

/** ≤32 hex + префикс link_ укладываются в лимит Telegram deep-link (64 символа). */
export function generateLinkToken(): string {
  return randomBytes(16).toString("hex");
}

function isMissingTelegramMarketplacesTable(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "PGRST205" || /auto_reply_telegram_marketplaces/i.test(error?.message ?? "");
}

function isMissingLinkTokenMarketplaceColumns(error: { message?: string } | null): boolean {
  const msg = error?.message ?? "";
  return /shop_id|marketplace_id|schema cache/i.test(msg);
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
  const { data, error } = await supabase
    .from("auto_reply_telegram_marketplaces")
    .select("notify_enabled")
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .eq("marketplace_id", marketplaceId)
    .maybeSingle();

  if (isMissingTelegramMarketplacesTable(error)) {
    const account = await fetchTelegramLinkByUserId(supabase, userId);
    return Boolean(account?.notify_enabled ?? account);
  }

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
  const { error } = await supabase.from("auto_reply_telegram_marketplaces").upsert(
    {
      user_id: input.userId,
      shop_id: input.shopId,
      marketplace_id: input.marketplaceId,
      notify_enabled: true,
      enabled_at: new Date().toISOString(),
    },
    { onConflict: "user_id,shop_id,marketplace_id" }
  );
  if (isMissingTelegramMarketplacesTable(error)) return;
  if (error) throw new Error(error.message);
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

/** Полное отключение Telegram для аккаунта KARTO — как при первом подключении. */
export async function cleanupTelegramFullUnlink(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const link = await fetchTelegramLinkByUserId(supabase, userId);

  await Promise.all([
    supabase.from("auto_reply_telegram_review_messages").delete().eq("user_id", userId),
    supabase.from("auto_reply_telegram_marketplaces").delete().eq("user_id", userId),
    supabase.from("auto_reply_telegram_link_tokens").delete().eq("user_id", userId),
    link
      ? supabase.from("auto_reply_telegram_sessions").delete().eq("telegram_user_id", link.telegram_user_id)
      : Promise.resolve(),
    deleteTelegramLink(supabase, userId),
  ]);
}

/** @deprecated Используйте cleanupTelegramFullUnlink */
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
  const shopId = (opts?.shopId ?? "main").trim() || "main";

  const fullRow = {
    token,
    user_id: userId,
    expires_at: expiresAt,
    shop_id: shopId,
    marketplace_id: opts?.marketplaceId ?? null,
  };

  let { error } = await supabase.from("auto_reply_telegram_link_tokens").insert(fullRow);

  if (error && isMissingLinkTokenMarketplaceColumns(error)) {
    ({ error } = await supabase.from("auto_reply_telegram_link_tokens").insert({
      token,
      user_id: userId,
      expires_at: expiresAt,
    }));
  }

  if (error) {
    console.error("[telegram] createLinkToken failed", error);
    throw new Error(error.message || "Не удалось сохранить ссылку подключения в базе");
  }

  return token;
}

/** Проверить токен без пометки used_at — помечаем только после успешной привязки. */
export async function peekLinkToken(
  supabase: SupabaseClient,
  token: string
): Promise<ConsumedLinkToken | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const { data: row, error } = await supabase
    .from("auto_reply_telegram_link_tokens")
    .select("user_id, expires_at, used_at")
    .eq("token", trimmed)
    .maybeSingle();

  if (error || !row) return null;
  if (new Date(row.expires_at as string).getTime() < Date.now()) return null;

  if (row.used_at) {
    const usedAgoMs = Date.now() - new Date(row.used_at as string).getTime();
    if (usedAgoMs > 20 * 60_000) return null;
  }

  let shopId = "main";
  let marketplaceId: AutoRepliesMarketplaceId | null = null;

  const { data: ext, error: extError } = await supabase
    .from("auto_reply_telegram_link_tokens")
    .select("shop_id, marketplace_id")
    .eq("token", trimmed)
    .maybeSingle();

  if (!extError && ext) {
    shopId = (ext.shop_id as string | null)?.trim() || "main";
    marketplaceId = parseTelegramMarketplaceId(ext.marketplace_id as string | null);
  }

  return {
    userId: row.user_id as string,
    shopId,
    marketplaceId,
  };
}

export async function consumeLinkToken(
  supabase: SupabaseClient,
  token: string
): Promise<ConsumedLinkToken | null> {
  return peekLinkToken(supabase, token.trim());
}

/** @deprecated Используйте peekLinkToken + markLinkTokenUsed */
export async function resolveLinkTokenForConnect(
  supabase: SupabaseClient,
  token: string
): Promise<ConsumedLinkToken | null> {
  return peekLinkToken(supabase, token);
}

export async function markLinkTokenUsed(supabase: SupabaseClient, token: string): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) return;
  await supabase
    .from("auto_reply_telegram_link_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", trimmed)
    .is("used_at", null);
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
  const trimmed = shortId.trim();
  if (!trimmed) return null;

  const link = await fetchTelegramLinkByTelegramUserId(supabase, telegramUserId);
  if (!link) return null;

  const { data } = await supabase
    .from("auto_reply_telegram_review_messages")
    .select("*")
    .eq("user_id", link.user_id)
    .order("notified_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as TelegramReviewMessageRow[];
  return rows.find((r) => shortCallbackId(r.id) === trimmed) ?? null;
}

/** Стабильный id строки TG-карточки (совпадает с callback_data в кнопках). */
export async function resolveTelegramReviewMessageRowId(
  supabase: SupabaseClient,
  input: {
    userId: string;
    shopId: string;
    marketplaceId: string;
    reviewId: string;
  }
): Promise<string> {
  const { data } = await supabase
    .from("auto_reply_telegram_review_messages")
    .select("id, status")
    .eq("user_id", input.userId)
    .eq("shop_id", input.shopId)
    .eq("marketplace_id", input.marketplaceId)
    .eq("review_id", input.reviewId)
    .maybeSingle();

  if (data?.id && data.status === "pending") {
    return data.id as string;
  }
  return randomUUID();
}

export async function upsertTelegramReviewMessage(
  supabase: SupabaseClient,
  row: Omit<TelegramReviewMessageRow, "resolved_at" | "notified_at" | "status"> & {
    status?: TelegramReviewMessageRow["status"];
  }
): Promise<TelegramReviewMessageRow | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("auto_reply_telegram_review_messages")
    .upsert(
      {
        id: row.id,
        user_id: row.user_id,
        shop_id: row.shop_id,
        marketplace_id: row.marketplace_id,
        review_id: row.review_id,
        telegram_message_id: row.telegram_message_id,
        chat_id: row.chat_id,
        reply_draft: row.reply_draft,
        status: row.status ?? "pending",
        has_photo: row.has_photo ?? false,
        extra_message_ids: row.extra_message_ids ?? [],
        notified_at: now,
      },
      { onConflict: "user_id,shop_id,marketplace_id,review_id" }
    )
    .select("*")
    .maybeSingle();

  if (error) {
    console.warn("[telegram] upsertTelegramReviewMessage failed", error.message);
    return null;
  }
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

export async function revertTelegramReviewMessageSent(
  supabase: SupabaseClient,
  input: {
    userId: string;
    shopId: string;
    marketplaceId: string;
    reviewId: string;
  }
): Promise<void> {
  await supabase
    .from("auto_reply_telegram_review_messages")
    .update({
      status: "pending",
      resolved_at: null,
    })
    .eq("user_id", input.userId)
    .eq("shop_id", input.shopId)
    .eq("marketplace_id", input.marketplaceId)
    .eq("review_id", input.reviewId)
    .eq("status", "sent");
}

export async function updateTelegramReviewMessageIds(
  supabase: SupabaseClient,
  input: {
    messageRowId: string;
    telegramMessageId: number;
    hasPhoto: boolean;
    extraMessageIds?: number[];
  }
): Promise<void> {
  await supabase
    .from("auto_reply_telegram_review_messages")
    .update({
      telegram_message_id: input.telegramMessageId,
      has_photo: input.hasPhoto,
      extra_message_ids: input.extraMessageIds ?? [],
    })
    .eq("id", input.messageRowId)
    .eq("status", "pending");
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
