import { NextRequest, NextResponse } from "next/server";
import {
  getUserFromBearerToken,
  isTransientAuthFailureHint,
} from "@/lib/supabase/get-user-from-bearer";
import {
  buildBrandLogoBasePrompt,
  brandLogoAlternateSuffix,
  brandLogoVariantSuffix,
  type BrandLogoPromptInput,
  type LogoConceptVariant,
} from "@/lib/brand/build-brand-logo-prompt";
import { sanitizeLogoReferenceInputs } from "@/lib/brand/logo-reference-hosts";
import { generateWithKieAi } from "@/lib/services/kie-ai";
import { kieErrorToClient } from "@/lib/services/kie-ai-errors";
import { isSupabaseNetworkError } from "@/lib/supabase/network-error";

/** После этого времени без успеха запускаем вторую генерацию для того же слота (параллельно с первой). */
const LOGO_SLOT_STALL_MS = 145_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function firstAvailableNonEmpty(primaryTask: Promise<string>, backupTask: Promise<string>): Promise<string> {
  return new Promise((resolve) => {
    let resolved = false;
    const tryResolve = (u: string) => {
      const t = u.trim();
      if (!t || resolved) return;
      resolved = true;
      resolve(t);
    };

    primaryTask.then((u) => tryResolve(u)).catch(() => {});
    backupTask.then((u) => tryResolve(u)).catch(() => {});

    Promise.allSettled([primaryTask, backupTask]).then((results) => {
      if (resolved) return;
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.trim()) {
          resolved = true;
          resolve(r.value.trim());
          return;
        }
      }
      resolve("");
    });
  });
}

async function generateLogoImageUrl(
  prompt: string,
  imageInputArg: string[] | undefined,
  aspectRatio: string
): Promise<string> {
  const { imageUrl } = await generateWithKieAi(prompt, imageInputArg, aspectRatio, "png", "2K");
  return imageUrl?.trim() ?? "";
}

async function generateLogoSlotWithDelayedAlternate(
  primaryPrompt: string,
  alternatePrompt: string,
  imageInputArg: string[] | undefined,
  aspectRatio: string,
  stallMs: number
): Promise<string> {
  let primaryOutcome: string | undefined;

  const primaryTask = generateLogoImageUrl(primaryPrompt, imageInputArg, aspectRatio)
    .then((u) => {
      const t = u.trim();
      primaryOutcome = t;
      return t;
    })
    .catch(() => {
      primaryOutcome = "";
      return "";
    });

  const backupTask = sleep(stallMs).then(() => {
    if (primaryOutcome !== undefined && primaryOutcome !== "") {
      return "";
    }
    return generateLogoImageUrl(alternatePrompt, imageInputArg, aspectRatio)
      .then((u) => u.trim())
      .catch(() => "");
  });

  return firstAvailableNonEmpty(primaryTask, backupTask);
}

/** Долгая генерация логотипа (KIE); на Vercel поднимает лимит таймаута функции. */
export const maxDuration = 300;
export const runtime = "nodejs";

type GenerateLogoBody = {
  mode: "pair" | "single";
  brand: Partial<BrandLogoPromptInput> & { brandName?: string };
  refinement?: string;
  /** До 2 референсов: data:image… base64 или прямой HTTPS URL (как в свободном творчестве — KIE сам подтягивает URL). */
  referenceImageDataUrls?: string[];
  /** только для mode === "single" */
  singleVariant?: LogoConceptVariant | "alternate";
};

function sanitizeBrand(input: GenerateLogoBody["brand"]): BrandLogoPromptInput {
  const brandName = String(input?.brandName ?? "").trim();
  const niche = String(input?.niche ?? "").trim();
  const description = String(input?.description ?? "").trim();
  const visualStyleSummary = String(input?.visualStyleSummary ?? "").trim();
  const toneTitle = String(input?.toneTitle ?? "").trim();
  const paletteTitle = input?.paletteTitle ? String(input.paletteTitle).trim() : undefined;
  const paletteColors = Array.isArray(input?.paletteColors)
    ? input.paletteColors.map((c) => String(c).trim()).filter(Boolean)
    : [];

  return {
    brandName,
    niche,
    description,
    paletteColors,
    paletteTitle,
    visualStyleSummary,
    toneTitle,
    paletteOptOut: Boolean(input?.paletteOptOut),
  };
}

/**
 * Генерация логотипа по данным бренда (модель на стороне сервиса).
 * Не списывает лимит «Свободное творчество».
 */
export async function POST(request: NextRequest) {
  if (!process.env.KIE_AI_API_KEY && !process.env.KIE_API_KEY) {
    return NextResponse.json(
      {
        success: false,
        error: "KIE_AI_API_KEY не настроен",
      },
      { status: 500 }
    );
  }

  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json({ success: false, error: "Войдите в аккаунт" }, { status: 401 });
    }

    const { user, failureHint } = await getUserFromBearerToken(token);
    if (!user) {
      const transient = isTransientAuthFailureHint(failureHint);
      return NextResponse.json(
        {
          success: false,
          error: transient
            ? failureHint ?? "Сервис авторизации временно недоступен. Обновите страницу и повторите."
            : failureHint ?? "Войдите в аккаунт",
        },
        { status: transient ? 503 : 401 }
      );
    }

    const body = (await request.json()) as GenerateLogoBody;
    const brand = sanitizeBrand(body.brand ?? {});
    const refinement =
      typeof body.refinement === "string" ? body.refinement.trim().slice(0, 520) : "";
    const rawRefs = Array.isArray(body.referenceImageDataUrls) ? body.referenceImageDataUrls : [];
    const referenceInputs = sanitizeLogoReferenceInputs(rawRefs);
    const hasAnyBrandContext =
      Boolean(brand.brandName) ||
      Boolean(brand.niche) ||
      Boolean(brand.description) ||
      Boolean(brand.visualStyleSummary) ||
      Boolean(brand.toneTitle) ||
      brand.paletteColors.length > 0;
    if (!hasAnyBrandContext && !refinement && referenceInputs.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Добавьте идею, референсы или включите хотя бы один контекст бренда для генерации логотипа.",
        },
        { status: 400 }
      );
    }

    const basePrompt = buildBrandLogoBasePrompt(brand);
    const refBlock =
      referenceInputs.length > 0
        ? `

Reference images attached: use only as loose mood/composition inspiration — output must be original and trademark-safe; never copy marks, mascots, or lettering verbatim from references.`
        : "";
    const base = basePrompt + refBlock;
    const suffixRefinement = refinement
      ? `\nFounder's idea to try (short cues only — not a full brief): ${refinement}`
      : "";

    const aspectRatio = "1:1";
    const imageInputArg = referenceInputs.length > 0 ? referenceInputs : undefined;

    if (body.mode === "pair") {
      const prompts = [
        base + brandLogoVariantSuffix("emblem") + suffixRefinement,
        base + brandLogoVariantSuffix("wordmark") + suffixRefinement,
      ];

      const results = await Promise.all(
        prompts.map((prompt, idx) =>
          generateLogoSlotWithDelayedAlternate(
            prompt,
            `${prompt}${brandLogoAlternateSuffix()}\nRetry for logo slot ${idx + 1}: substantially different composition or metaphor than the still-running attempt; stay strictly on-brand and trademark-safe.`,
            imageInputArg,
            aspectRatio,
            LOGO_SLOT_STALL_MS
          )
        )
      );

      const urls = results.filter((u) => Boolean(u?.trim()));
      if (urls.length === 0) {
        throw new Error("Не удалось получить изображения логотипа");
      }

      return NextResponse.json({ success: true, imageUrls: urls });
    }

    const singleVariant: LogoConceptVariant | "alternate" = body.singleVariant ?? "alternate";
    const variantSuffix =
      singleVariant === "alternate"
        ? brandLogoAlternateSuffix()
        : brandLogoVariantSuffix(singleVariant);

    const prompt = base + variantSuffix + suffixRefinement;
    const { imageUrl } = await generateWithKieAi(prompt, imageInputArg, aspectRatio, "png", "2K");

    return NextResponse.json({ success: true, imageUrls: [imageUrl] });
  } catch (error: unknown) {
    console.error("[brand/generate-logo]", error);
    const err = error as { message?: string };
    const errorString = String(err?.message ?? error);

    if (isSupabaseNetworkError(error) || errorString.includes("fetch failed")) {
      return NextResponse.json(
        { success: false, error: "Сервис временно недоступен. Попробуйте позже." },
        { status: 503 }
      );
    }

    if (/abort|terminated|ECONNRESET|socket/i.test(errorString)) {
      return NextResponse.json(
        { success: false, error: "Соединение прервалось во время генерации. Попробуйте ещё раз." },
        { status: 503 }
      );
    }

    const { message, code } = kieErrorToClient(error);
    const status = code === "CONTENT_FILTER" ? 422 : 500;
    return NextResponse.json(
      { success: false, error: message, ...(code ? { code } : {}) },
      { status }
    );
  }
}
