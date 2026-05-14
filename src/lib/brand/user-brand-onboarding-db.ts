import type { SupabaseClient } from "@supabase/supabase-js";

const TABLE = "user_brand_onboarding";

/** Fallback в draft_json, если в БД ещё нет колонок landing_* */
export const KARTO_LANDING_SPEC_KEY = "_kartoLandingSpec";
export const KARTO_LANDING_GENERATED_AT_KEY = "_kartoLandingGeneratedAt";
export const KARTO_LANDING_HERO_URL_KEY = "_kartoLandingHeroUrl";

export type UserBrandOnboardingRow = {
  user_id: string;
  draft_json: Record<string, unknown>;
  active_step: number;
  show_name_gen: boolean;
  wizard_completed_at: string | null;
  landing_spec_json?: unknown | null;
  landing_generated_at?: string | null;
  /** URL hero в черновике (legacy), превью сейчас без генерации изображений */
  landingHeroImageUrl?: string | null;
  updated_at?: string;
};

const SELECT_FULL =
  "user_id,draft_json,active_step,show_name_gen,wizard_completed_at,landing_spec_json,landing_generated_at,updated_at";

const SELECT_LEGACY =
  "user_id,draft_json,active_step,show_name_gen,updated_at";

function isMissingRelationColumnError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("could not find") ||
    m.includes("schema cache")
  );
}

/** Есть ли сохранённый незавершённый прогресс (не полный визард). */
export function hasBrandOnboardingDraftProgress(
  row: {
    draft_json?: unknown;
    active_step?: number;
    wizard_completed_at?: string | null;
  } | null | undefined
): boolean {
  if (!row || row.wizard_completed_at) return false;
  const step = typeof row.active_step === "number" ? row.active_step : 0;
  if (step > 0) return true;
  const raw = row.draft_json;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const d = raw as Record<string, unknown>;
  if (String(d.name ?? "").trim().length >= 2) return true;
  if (String(d.niche ?? "").trim().length > 0) return true;
  if (String(d.description ?? "").trim().length >= 10) return true;
  if (String(d.paletteId ?? "").trim().length > 0) return true;
  if (String(d.styleId ?? "").trim().length > 0) return true;
  if (String(d.toneId ?? "").trim().length > 0) return true;
  const logoMode = String(d.logoMode ?? "").trim();
  if (logoMode.length > 0) return true;
  return false;
}

/** То же условие полноты, что и в миграции wizard_completed_at + шаг лого */
export function isPersistedBrandWizardComplete(
  draft: Record<string, unknown>
): boolean {
  const name = String(draft.name ?? "").trim();
  const niche = String(draft.niche ?? "").trim();
  const desc = String(draft.description ?? "").trim();
  if (name.length < 2 || niche.length === 0 || desc.length < 20) return false;
  if (!String(draft.paletteId ?? "").trim()) return false;
  if (!String(draft.styleId ?? "").trim()) return false;
  if (!String(draft.toneId ?? "").trim()) return false;
  const logoMode = String(draft.logoMode ?? "").trim();
  if (!logoMode) return false;
  if (logoMode === "later") return true;
  if (logoMode === "upload")
    return Boolean(String(draft.logoFileName ?? "").trim());
  if (logoMode === "generate")
    return Boolean(String(draft.logoChosenUrl ?? "").trim());
  return false;
}

export function extractLandingHeroUrl(
  draft: Record<string, unknown>
): string | null {
  const v = draft[KARTO_LANDING_HERO_URL_KEY];
  return typeof v === "string" && /^https?:\/\//i.test(v.trim())
    ? v.trim()
    : null;
}

export function extractLandingFromDraft(draft: Record<string, unknown>): {
  landing_spec_json: unknown | null;
  landing_generated_at: string | null;
} {
  const spec = draft[KARTO_LANDING_SPEC_KEY];
  const atRaw = draft[KARTO_LANDING_GENERATED_AT_KEY];
  return {
    landing_spec_json:
      spec !== undefined && spec !== null ? spec : null,
    landing_generated_at:
      typeof atRaw === "string" && atRaw.trim() ? atRaw.trim() : null,
  };
}

function deriveWizardCompletedAt(
  row: Record<string, unknown>,
  draft: Record<string, unknown>
): string | null {
  if (typeof row.wizard_completed_at === "string" && row.wizard_completed_at)
    return row.wizard_completed_at;
  const updated = row.updated_at;
  if (
    isPersistedBrandWizardComplete(draft) &&
    typeof updated === "string" &&
    updated
  ) {
    return updated;
  }
  return null;
}

function mapRow(data: Record<string, unknown>): UserBrandOnboardingRow {
  const draft =
    data.draft_json &&
    typeof data.draft_json === "object" &&
    !Array.isArray(data.draft_json)
      ? (data.draft_json as Record<string, unknown>)
      : {};

  const fromDraft = extractLandingFromDraft(draft);

  return {
    user_id: String(data.user_id),
    draft_json: draft,
    active_step:
      typeof data.active_step === "number" && Number.isFinite(data.active_step)
        ? data.active_step
        : 0,
    show_name_gen: Boolean(data.show_name_gen),
    wizard_completed_at: deriveWizardCompletedAt(data, draft),
    landing_spec_json:
      data.landing_spec_json !== undefined && data.landing_spec_json !== null
        ? data.landing_spec_json
        : fromDraft.landing_spec_json,
    landing_generated_at:
      typeof data.landing_generated_at === "string"
        ? data.landing_generated_at
        : fromDraft.landing_generated_at,
    landingHeroImageUrl: extractLandingHeroUrl(draft),
    updated_at:
      typeof data.updated_at === "string" ? data.updated_at : undefined,
  };
}

export function mergeLandingIntoDraftJson(
  draft: Record<string, unknown>,
  spec: Record<string, unknown>,
  generatedAtIso: string
): Record<string, unknown> {
  return {
    ...draft,
    [KARTO_LANDING_SPEC_KEY]: spec,
    [KARTO_LANDING_GENERATED_AT_KEY]: generatedAtIso,
  };
}

export async function fetchUserBrandOnboarding(
  supabase: SupabaseClient,
  userId: string
): Promise<UserBrandOnboardingRow | null> {
  let data: Record<string, unknown> | null = null;

  const full = await supabase
    .from(TABLE)
    .select(SELECT_FULL)
    .eq("user_id", userId)
    .maybeSingle();

  if (full.error) {
    if (isMissingRelationColumnError(full.error.message)) {
      const legacy = await supabase
        .from(TABLE)
        .select(SELECT_LEGACY)
        .eq("user_id", userId)
        .maybeSingle();

      if (legacy.error) {
        console.warn("[user_brand_onboarding] fetch:", legacy.error.message);
        return null;
      }
      data = legacy.data as Record<string, unknown> | null;
    } else {
      console.warn("[user_brand_onboarding] fetch:", full.error.message);
      return null;
    }
  } else {
    data = full.data as Record<string, unknown> | null;
  }

  if (!data) return null;
  return mapRow(data);
}

export async function mergeLandingHeroUrlIntoDraft(
  supabase: SupabaseClient,
  userId: string,
  heroUrl: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("draft_json")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[user_brand_onboarding] hero draft fetch:", error.message);
    return false;
  }

  const raw = data?.draft_json;
  const draft =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? ({ ...(raw as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  draft[KARTO_LANDING_HERO_URL_KEY] = heroUrl;

  const { error: upErr } = await supabase
    .from(TABLE)
    .update({
      draft_json: draft,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (upErr) {
    console.warn("[user_brand_onboarding] hero draft update:", upErr.message);
    return false;
  }
  return true;
}

export async function upsertUserBrandOnboarding(
  supabase: SupabaseClient,
  payload: Omit<UserBrandOnboardingRow, "updated_at">
): Promise<boolean> {
  const base = {
    user_id: payload.user_id,
    draft_json: payload.draft_json,
    active_step: payload.active_step,
    show_name_gen: payload.show_name_gen,
    updated_at: new Date().toISOString(),
  };

  const withWizard = {
    ...base,
    wizard_completed_at: payload.wizard_completed_at,
  };

  let error = (
    await supabase.from(TABLE).upsert(withWizard, { onConflict: "user_id" })
  ).error;

  if (error && isMissingRelationColumnError(error.message)) {
    error = (
      await supabase.from(TABLE).upsert(base, { onConflict: "user_id" })
    ).error;
  }

  if (error) {
    console.warn("[user_brand_onboarding] upsert:", error.message);
    return false;
  }
  return true;
}

/** Нормализация строки админ-списка при отсутствии новых колонок */
export function normalizeBrandOnboardingListRow(
  raw: Record<string, unknown>
): Record<string, unknown> {
  const mapped = mapRow(raw);
  return {
    user_id: mapped.user_id,
    draft_json: mapped.draft_json,
    active_step: mapped.active_step,
    show_name_gen: mapped.show_name_gen,
    wizard_completed_at: mapped.wizard_completed_at,
    landing_spec_json: mapped.landing_spec_json ?? null,
    landing_generated_at: mapped.landing_generated_at ?? null,
    landing_hero_image_url: mapped.landingHeroImageUrl ?? null,
    updated_at: mapped.updated_at,
  };
}
