import { createHash } from "crypto";

import {
  WELCOME_PERKS_DEVICE_LIMIT,
  WELCOME_PERKS_WINDOW_MS,
} from "@/lib/welcome-perks/constants";

/** FingerprintJS visitorId: буквы, цифры, точка, дефис, подчёркивание. */
const DEVICE_ID_RE = /^[a-zA-Z0-9._-]{8,128}$/;

export function parseRegistrationDeviceId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!DEVICE_ID_RE.test(trimmed)) return null;
  return trimmed;
}

function deviceHashSalt(): string {
  return (
    process.env.WELCOME_DEVICE_SALT?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 24) ||
    "karto-welcome-device-v1"
  );
}

export function hashRegistrationDeviceId(deviceId: string): string {
  return createHash("sha256")
    .update(`${deviceHashSalt()}:${deviceId}`)
    .digest("hex");
}

export type WelcomePerksStatus = {
  eligible: boolean;
  /** Дней до следующей возможности (только если !eligible и известен device). */
  retryAfterDays: number | null;
};

export function welcomePerksBlockedMessageRu(retryAfterDays: number | null): string {
  const daysPart =
    retryAfterDays != null && retryAfterDays > 0
      ? ` Новый набор будет доступен через ${retryAfterDays} ${daysLabelRu(retryAfterDays)}.`
      : "";
  return (
    `Стартовые бонусы уже были активированы на других аккаунтах.${daysPart} ` +
    "Вы можете пользоваться сервисом и пополнить баланс в любой момент."
  );
}

function daysLabelRu(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "дней";
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дня";
  return "дней";
}

function windowStartIso(): string {
  return new Date(Date.now() - WELCOME_PERKS_WINDOW_MS).toISOString();
}

function retryAfterDaysFromOldest(oldestEligibleAt: string | null): number | null {
  if (!oldestEligibleAt) return null;
  const unlockAt = new Date(oldestEligibleAt).getTime() + WELCOME_PERKS_WINDOW_MS;
  const diffMs = unlockAt - Date.now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

async function countEligibleDeviceClaims(
  supabase: { from: (table: string) => any },
  deviceHash: string
): Promise<number> {
  const { count, error } = await supabase
    .from("welcome_perk_registrations")
    .select("user_id", { count: "exact", head: true })
    .eq("device_hash", deviceHash)
    .eq("perks_eligible", true)
    .gte("registered_at", windowStartIso());

  if (error) {
    console.error("[welcome-perks] count device claims:", error.message);
    return 0;
  }
  return count ?? 0;
}

async function oldestEligibleDeviceClaimAt(
  supabase: { from: (table: string) => any },
  deviceHash: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("welcome_perk_registrations")
    .select("registered_at")
    .eq("device_hash", deviceHash)
    .eq("perks_eligible", true)
    .gte("registered_at", windowStartIso())
    .order("registered_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[welcome-perks] oldest claim:", error.message);
    return null;
  }
  return (data as { registered_at?: string } | null)?.registered_at ?? null;
}

/**
 * Существующие аккаунты без строки — eligible (не ломаем старых пользователей).
 */
export async function isWelcomePerksEligible(
  supabase: { from: (table: string) => any },
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("welcome_perk_registrations")
    .select("perks_eligible")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[welcome-perks] eligibility select:", error.message);
    return true;
  }
  if (!data) return true;
  return Boolean((data as { perks_eligible?: boolean }).perks_eligible);
}

export async function fetchWelcomePerksStatus(
  supabase: { from: (table: string) => any },
  userId: string
): Promise<WelcomePerksStatus> {
  const { data, error } = await supabase
    .from("welcome_perk_registrations")
    .select("perks_eligible, device_hash")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[welcome-perks] status select:", error.message);
    return { eligible: true, retryAfterDays: null };
  }
  if (!data) {
    return { eligible: true, retryAfterDays: null };
  }

  const row = data as { perks_eligible?: boolean; device_hash?: string | null };
  if (row.perks_eligible !== false) {
    return { eligible: true, retryAfterDays: null };
  }

  let retryAfterDays: number | null = null;
  if (row.device_hash) {
    const oldest = await oldestEligibleDeviceClaimAt(supabase, row.device_hash);
    retryAfterDays = retryAfterDaysFromOldest(oldest);
  }

  return { eligible: false, retryAfterDays };
}

export type RecordWelcomePerkRegistrationResult = WelcomePerksStatus & {
  recorded: boolean;
};

/**
 * Фиксирует завершение регистрации и решает, положен ли welcome-пакет.
 * Без валидного device_id — fail-open (eligible=true).
 */
export async function recordWelcomePerkRegistration(
  supabase: { from: (table: string) => any },
  userId: string,
  rawDeviceId: unknown
): Promise<RecordWelcomePerkRegistrationResult> {
  const { data: existing, error: existingErr } = await supabase
    .from("welcome_perk_registrations")
    .select("perks_eligible, device_hash")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingErr) {
    console.error("[welcome-perks] existing select:", existingErr.message);
    return { recorded: false, eligible: true, retryAfterDays: null };
  }

  if (existing) {
    const status = await fetchWelcomePerksStatus(supabase, userId);
    return { recorded: false, ...status };
  }

  const deviceId = parseRegistrationDeviceId(rawDeviceId);
  if (!deviceId) {
    const { error: insErr } = await supabase.from("welcome_perk_registrations").insert({
      user_id: userId,
      device_hash: null,
      perks_eligible: true,
    });
    if (insErr && insErr.code !== "23505") {
      console.error("[welcome-perks] insert fail-open:", insErr.message);
    }
    return { recorded: true, eligible: true, retryAfterDays: null };
  }

  const deviceHash = hashRegistrationDeviceId(deviceId);
  const priorEligible = await countEligibleDeviceClaims(supabase, deviceHash);
  const perksEligible = priorEligible < WELCOME_PERKS_DEVICE_LIMIT;

  const { error: insErr } = await supabase.from("welcome_perk_registrations").insert({
    user_id: userId,
    device_hash: deviceHash,
    perks_eligible: perksEligible,
  });

  if (insErr) {
    if (insErr.code === "23505") {
      const status = await fetchWelcomePerksStatus(supabase, userId);
      return { recorded: false, ...status };
    }
    console.error("[welcome-perks] insert:", insErr.message);
    return { recorded: false, eligible: true, retryAfterDays: null };
  }

  if (!perksEligible) {
    const oldest = await oldestEligibleDeviceClaimAt(supabase, deviceHash);
    const retryAfterDays = retryAfterDaysFromOldest(oldest);
    console.info(
      `[welcome-perks] user=${userId.slice(0, 8)}… perks blocked (device claims=${priorEligible})`
    );
    return { recorded: true, eligible: false, retryAfterDays };
  }

  return { recorded: true, eligible: true, retryAfterDays: null };
}
