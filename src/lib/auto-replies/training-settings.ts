import type { AutoRepliesTrainingSettings, TrainingDocument, TrainingReferenceImage } from "./settings-types";

export const TRAINING_LIMITS = {
  aboutShop: 2500,
  rulesAndFaq: 3500,
} as const;

export function normalizeTrainingText(value: unknown, limit: number): string {
  return String(value ?? "").slice(0, limit);
}

function normalizeDocument(raw: Partial<TrainingDocument>): TrainingDocument | null {
  if (!raw.id || !raw.name) return null;
  const kind = raw.kind === "pdf" || raw.kind === "txt" || raw.kind === "md" ? raw.kind : "txt";
  const extractedText = String(raw.extractedText ?? "").slice(0, 30_000);
  return {
    id: String(raw.id),
    name: String(raw.name).slice(0, 200),
    kind,
    sizeBytes: typeof raw.sizeBytes === "number" ? raw.sizeBytes : 0,
    uploadedAt: raw.uploadedAt ?? new Date().toISOString(),
    extractedText,
    charCount: extractedText.length,
    status: raw.status === "error" ? "error" : "ready",
    errorMessage: raw.errorMessage ? String(raw.errorMessage).slice(0, 200) : undefined,
  };
}

function normalizeReferenceImage(raw: Partial<TrainingReferenceImage>): TrainingReferenceImage | null {
  if (!raw.id || !raw.name) return null;
  return {
    id: String(raw.id),
    name: String(raw.name).slice(0, 200),
    sizeBytes: typeof raw.sizeBytes === "number" ? raw.sizeBytes : 0,
    uploadedAt: raw.uploadedAt ?? new Date().toISOString(),
  };
}

type LegacyTraining = Partial<AutoRepliesTrainingSettings> & {
  negativeGuide?: string;
};

/** Миграция: старый блок «Негатив» сливается в правила, если был заполнен. */
export function normalizeTrainingSettings(raw: LegacyTraining): AutoRepliesTrainingSettings {
  let rulesAndFaq = normalizeTrainingText(raw.rulesAndFaq, TRAINING_LIMITS.rulesAndFaq);
  const legacyNegative = String(raw.negativeGuide ?? "").trim();

  if (legacyNegative) {
    const snippet = legacyNegative.slice(0, 500);
    if (!rulesAndFaq.toLowerCase().includes(snippet.slice(0, 40).toLowerCase())) {
      rulesAndFaq = rulesAndFaq
        ? `${rulesAndFaq.trim()}\n\n${snippet}`.slice(0, TRAINING_LIMITS.rulesAndFaq)
        : snippet;
    }
  }

  const documents = Array.isArray(raw.documents)
    ? raw.documents.map(normalizeDocument).filter(Boolean)
    : [];

  const referenceImages = Array.isArray(raw.referenceImages)
    ? raw.referenceImages.map(normalizeReferenceImage).filter(Boolean)
    : [];

  return {
    aboutShop: normalizeTrainingText(raw.aboutShop, TRAINING_LIMITS.aboutShop),
    rulesAndFaq,
    documents: documents as TrainingDocument[],
    referenceImages: referenceImages as TrainingReferenceImage[],
  };
}

/** Слои настроек для промпта — без пересечения зон ответственности. */
export const AI_SETTINGS_LAYERS = [
  {
    section: "Обучение ИИ",
    role: "Факты, правила и загруженные материалы",
  },
  {
    section: "Текст ответа",
    role: "Формулировка: тон, длина, обращение, эмодзи",
  },
  {
    section: "Подпись",
    role: "Завершение ответа и контакты",
  },
  {
    section: "Ограничения",
    role: "Стоп-слова и лимиты отправки",
  },
] as const;
