import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import type { SellerHubScopeState } from "./types";

/** Отдельная строка хаба. Не `main`: туда автоответы пишут свой токен. */
export const SELLER_HUB_WB_SHOP_ID = "seller-hub";
export const SELLER_HUB_WB_MARKETPLACE_ID = "wildberries";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const SALT = "karto-seller-hub-wb-v1";

export class SellerHubTokenKeyError extends Error {
  constructor() {
    super("seller hub token key missing");
    this.name = "SellerHubTokenKeyError";
  }
}

export function wbAuthorization(token: string): string {
  const trimmed = token.trim();
  const raw = trimmed.toLowerCase().startsWith("bearer ") ? trimmed.slice(7).trim() : trimmed;
  return `Bearer ${raw}`;
}

export function sellerHubSecretsKey(): string | null {
  const raw = process.env.AUTO_REPLY_SECRETS_KEY?.trim();
  return raw ? raw : null;
}

function deriveKey(raw: string): Buffer {
  return scryptSync(raw, SALT, 32);
}

export function encryptSellerHubWbToken(plain: string): string {
  const raw = sellerHubSecretsKey();
  if (!raw) throw new SellerHubTokenKeyError();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, deriveKey(raw), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decryptSellerHubWbToken(ciphertext: string): string {
  const raw = sellerHubSecretsKey();
  if (!raw) throw new SellerHubTokenKeyError();
  const [ivB64, tagB64, dataB64] = ciphertext.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Invalid ciphertext");
  const decipher = createDecipheriv(ALGO, deriveKey(raw), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

export function safeSellerHubMessage(message: string, secret?: string): string {
  let text = message.replace(/Bearer\s+\S+/gi, "");
  const token = secret?.trim();
  if (token && token.length > 0) text = text.split(token).join("");
  if (/ciphertext|AUTO_REPLY_SECRETS_KEY|CRON_SECRET|api_key_ciphertext|karto-auto-reply-dev-key/i.test(text)) {
    return "Не удалось выполнить запрос к Wildberries";
  }
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.slice(0, 300) || "Не удалось выполнить запрос к Wildberries";
}

export function logSellerHubTokenIssue(kind: "missing" | "unavailable" | "unreadable"): void {
  console.error(`[seller-hub] wb token ${kind}`);
}

export type SellerHubSecretDb = {
  findHub(userId: string): Promise<{ ciphertext: string } | null>;
  upsertHub(userId: string, ciphertext: string): Promise<void>;
  deleteHub(userId: string): Promise<void>;
};

export type OpenSellerHubToken =
  | { ok: true; token: string }
  | { ok: false; reason: "missing" | "unavailable" | "unreadable" };

export async function openSellerHubWbToken(userId: string, db: SellerHubSecretDb): Promise<OpenSellerHubToken> {
  if (!sellerHubSecretsKey()) return { ok: false, reason: "unavailable" };
  let row: { ciphertext: string } | null;
  try {
    row = await db.findHub(userId);
  } catch {
    logSellerHubTokenIssue("unavailable");
    return { ok: false, reason: "unavailable" };
  }
  if (!row?.ciphertext) return { ok: false, reason: "missing" };
  try {
    const token = decryptSellerHubWbToken(row.ciphertext);
    if (!token.trim()) return { ok: false, reason: "unreadable" };
    return { ok: true, token };
  } catch (error) {
    if (error instanceof SellerHubTokenKeyError) return { ok: false, reason: "unavailable" };
    logSellerHubTokenIssue("unreadable");
    return { ok: false, reason: "unreadable" };
  }
}

export async function callWbWithStoredToken<T>(
  userId: string,
  db: SellerHubSecretDb,
  run: (token: string) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; reason: "missing" | "unavailable" | "unreadable" }> {
  const opened = await openSellerHubWbToken(userId, db);
  if (!opened.ok) return opened;
  return { ok: true, value: await run(opened.token) };
}

export type WbTokenCheck = {
  sellerName: string | null;
  sampleCount?: number;
  totalCards?: number | null;
  scopes?: SellerHubScopeState;
};

export type WbTokenFlowResult =
  | {
      ok: true;
      alreadyStored?: boolean;
      /** true, если уже лежащий на сервере секрет проверили вызовом WB без отдачи токена клиенту. */
      serverVerified?: boolean;
      sellerName?: string | null;
      verifiedAt?: string;
      sampleCount?: number;
      totalCards?: number | null;
      scopes?: SellerHubScopeState;
    }
  | { ok: false; error: string; keepLocal: boolean; alreadyStored?: boolean };

/** Локальный apiKey стираем только после успешного переноса или после проверки уже лежащего секрета. */
export function shouldClearLocalApiKeyAfterMigrate(result: {
  ok: boolean;
  keepLocal?: boolean;
  alreadyStored?: boolean;
  serverVerified?: boolean;
}): boolean {
  if (!result.ok || result.keepLocal) return false;
  if (result.alreadyStored) return result.serverVerified === true;
  return true;
}

/** WB-токен в снимке кабинета не пишем: черновик живёт только в UI state. */
export function stripWbApiKeyForPersist<T extends { apiKey?: string }>(
  marketplaceId: string,
  patch: T,
): T {
  if (marketplaceId !== "wildberries") return patch;
  return { ...patch, apiKey: "" };
}

const SAVE_ERROR = "Не удалось сохранить подключение";
const READ_ERROR = "Не удалось прочитать подключение кабинета";
const VERIFY_ERROR = "Wildberries не подтвердил токен";

function publicFailure(error: unknown, token: string, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  return safeSellerHubMessage(message, token) || fallback;
}

async function confirmStored(userId: string, db: SellerHubSecretDb, token: string): Promise<boolean> {
  const row = await db.findHub(userId);
  if (!row) return false;
  return decryptSellerHubWbToken(row.ciphertext) === token;
}

export async function connectSellerHubWbToken(
  userId: string,
  token: string,
  db: SellerHubSecretDb,
  verify: (token: string) => Promise<WbTokenCheck>,
): Promise<WbTokenFlowResult> {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, error: "Укажите API-токен Wildberries", keepLocal: true };
  if (!sellerHubSecretsKey()) return { ok: false, error: SAVE_ERROR, keepLocal: true };
  const existing = await openSellerHubWbToken(userId, db);
  if (existing.ok) {
    return { ok: false, error: "Кабинет уже подключён. Замена токена — отдельное действие.", keepLocal: true };
  }
  if (existing.reason !== "missing") return { ok: false, error: READ_ERROR, keepLocal: true };
  let checked: WbTokenCheck;
  try {
    checked = await verify(trimmed);
  } catch (error) {
    return { ok: false, error: publicFailure(error, trimmed, VERIFY_ERROR), keepLocal: true };
  }
  try {
    await db.upsertHub(userId, encryptSellerHubWbToken(trimmed));
    if (!(await confirmStored(userId, db, trimmed))) throw new Error("confirm");
  } catch {
    try {
      await db.deleteHub(userId);
    } catch {
      logSellerHubTokenIssue("unavailable");
    }
    return { ok: false, error: SAVE_ERROR, keepLocal: true };
  }
  return {
    ok: true,
    sellerName: checked.sellerName,
    verifiedAt: new Date().toISOString(),
    sampleCount: checked.sampleCount,
    totalCards: checked.totalCards,
    scopes: checked.scopes,
  };
}

export async function migrateSellerHubWbToken(
  userId: string,
  token: string,
  db: SellerHubSecretDb,
  verify: (token: string) => Promise<WbTokenCheck>,
): Promise<WbTokenFlowResult> {
  const existing = await openSellerHubWbToken(userId, db);
  if (existing.ok) {
    try {
      const checked = await verify(existing.token);
      return {
        ok: true,
        alreadyStored: true,
        serverVerified: true,
        sellerName: checked.sellerName,
        verifiedAt: new Date().toISOString(),
        sampleCount: checked.sampleCount,
        totalCards: checked.totalCards,
        scopes: checked.scopes,
      };
    } catch (error) {
      const scrubbed = publicFailure(
        error,
        existing.token,
        "На сервере уже есть подключение, но проверить его не удалось. Локальный токен сохранён. Если нужен другой ключ — замените токен явно.",
      );
      return {
        ok: false,
        alreadyStored: true,
        keepLocal: true,
        error: safeSellerHubMessage(scrubbed, token),
      };
    }
  }
  if (existing.reason !== "missing") return { ok: false, error: READ_ERROR, keepLocal: true };
  return connectSellerHubWbToken(userId, token, db, verify);
}

export async function replaceSellerHubWbToken(
  userId: string,
  token: string,
  db: SellerHubSecretDb,
  verify: (token: string) => Promise<WbTokenCheck>,
): Promise<WbTokenFlowResult> {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, error: "Укажите API-токен Wildberries", keepLocal: true };
  if (!sellerHubSecretsKey()) return { ok: false, error: SAVE_ERROR, keepLocal: true };
  let previous: { ciphertext: string } | null;
  try {
    previous = await db.findHub(userId);
  } catch {
    return { ok: false, error: READ_ERROR, keepLocal: true };
  }
  let checked: WbTokenCheck;
  try {
    checked = await verify(trimmed);
  } catch (error) {
    return { ok: false, error: publicFailure(error, trimmed, VERIFY_ERROR), keepLocal: true };
  }
  const nextCipher = encryptSellerHubWbToken(trimmed);
  try {
    await db.upsertHub(userId, nextCipher);
    if (!(await confirmStored(userId, db, trimmed))) {
      if (previous) await db.upsertHub(userId, previous.ciphertext);
      else await db.deleteHub(userId);
      return { ok: false, error: SAVE_ERROR, keepLocal: true };
    }
  } catch {
    if (previous) {
      try {
        await db.upsertHub(userId, previous.ciphertext);
      } catch {
        logSellerHubTokenIssue("unavailable");
      }
    }
    return { ok: false, error: SAVE_ERROR, keepLocal: true };
  }
  return {
    ok: true,
    sellerName: checked.sellerName,
    verifiedAt: new Date().toISOString(),
    sampleCount: checked.sampleCount,
    totalCards: checked.totalCards,
    scopes: checked.scopes,
  };
}

export async function disconnectSellerHubWbToken(userId: string, db: SellerHubSecretDb): Promise<WbTokenFlowResult> {
  try {
    await db.deleteHub(userId);
  } catch {
    return { ok: false, error: READ_ERROR, keepLocal: true };
  }
  return { ok: true };
}

export function localRootAfterWbMigration<T extends { connections: { wildberries?: { apiKey: string } } }>(
  root: T,
  result: { ok: boolean; keepLocal?: boolean; alreadyStored?: boolean; serverVerified?: boolean },
): T {
  if (!shouldClearLocalApiKeyAfterMigrate(result)) return root;
  const current = root.connections.wildberries;
  if (!current) return root;
  return {
    ...root,
    connections: {
      ...root.connections,
      wildberries: { ...current, apiKey: "" },
    },
  };
}
