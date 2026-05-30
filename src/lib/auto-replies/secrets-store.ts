const SECRETS_PREFIX = "karto-auto-replies-secrets-v1:";

export type AutoReplySecretsRoot = {
  version: 1;
  /** Ключ mpKey (shopId:marketplace) → API-токен. Только локально, никогда в Supabase. */
  tokens: Record<string, string>;
  updatedAt: string;
};

function secretsKey(userId: string): string {
  return `${SECRETS_PREFIX}${userId}`;
}

function emptySecrets(): AutoReplySecretsRoot {
  return { version: 1, tokens: {}, updatedAt: new Date().toISOString() };
}

export function readAutoReplySecrets(userId: string): AutoReplySecretsRoot {
  if (typeof window === "undefined" || !userId) return emptySecrets();
  try {
    const raw = localStorage.getItem(secretsKey(userId));
    if (!raw) return emptySecrets();
    const data = JSON.parse(raw) as AutoReplySecretsRoot;
    return {
      version: 1,
      tokens: data.tokens && typeof data.tokens === "object" ? data.tokens : {},
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
    };
  } catch {
    return emptySecrets();
  }
}

export function writeAutoReplySecrets(userId: string, root: AutoReplySecretsRoot) {
  if (typeof window === "undefined" || !userId) return;
  try {
    localStorage.setItem(
      secretsKey(userId),
      JSON.stringify({
        version: 1,
        tokens: root.tokens,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch {
    /* noop */
  }
}

export function upsertAutoReplySecretToken(userId: string, mpKey: string, apiKey: string) {
  const root = readAutoReplySecrets(userId);
  const token = apiKey.trim();
  if (!token) {
    delete root.tokens[mpKey];
  } else {
    root.tokens[mpKey] = token;
  }
  writeAutoReplySecrets(userId, root);
}

export function persistSecretsFromSettingsRoot(
  userId: string,
  tokens: Record<string, string>
) {
  writeAutoReplySecrets(userId, {
    version: 1,
    tokens,
    updatedAt: new Date().toISOString(),
  });
}

export function removeAutoReplySecretToken(userId: string, mpKey: string) {
  const root = readAutoReplySecrets(userId);
  delete root.tokens[mpKey];
  writeAutoReplySecrets(userId, root);
}

export function removeAutoReplySecretsForShop(userId: string, shopId: string) {
  const root = readAutoReplySecrets(userId);
  const prefix = `${shopId}:`;
  for (const key of Object.keys(root.tokens)) {
    if (key.startsWith(prefix)) delete root.tokens[key];
  }
  writeAutoReplySecrets(userId, root);
}

/** Миграция из legacy global settings (без user_id). */
export function migrateLegacyGlobalSecretsToUser(userId: string, tokens: Record<string, string>) {
  if (!userId || Object.keys(tokens).length === 0) return;
  const existing = readAutoReplySecrets(userId);
  const merged = { ...existing.tokens };
  for (const [key, token] of Object.entries(tokens)) {
    if (!merged[key]?.trim() && token.trim()) merged[key] = token.trim();
  }
  persistSecretsFromSettingsRoot(userId, merged);
}
