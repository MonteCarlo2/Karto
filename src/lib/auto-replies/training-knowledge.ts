import type { TrainingDocKind, TrainingDocument } from "./settings-types";

export const TRAINING_DOC_ACCEPT = ".pdf,.txt,.md,text/plain,text/markdown,application/pdf";

export const TRAINING_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export const TRAINING_KNOWLEDGE_LIMITS = {
  maxDocuments: 8,
  maxImages: 6,
  maxDocBytes: 5 * 1024 * 1024,
  maxImageBytes: 4 * 1024 * 1024,
  maxExtractedChars: 30_000,
} as const;

export const TRAINING_DOC_FORMATS: {
  kind: TrainingDocKind;
  label: string;
  hint: string;
}[] = [
  {
    kind: "md",
    label: "MD / TXT",
    hint: "Лучший формат для ИИ — читается без потерь.",
  },
  {
    kind: "pdf",
    label: "PDF",
    hint: "Текст извлекается автоматически при загрузке.",
  },
];

export function detectTrainingDocKind(file: File): TrainingDocKind | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".md")) return "md";
  if (name.endsWith(".txt")) return "txt";
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (file.type === "text/plain") return "txt";
  if (file.type === "text/markdown") return "md";
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function createTrainingAssetId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function buildTrainingKnowledgeSnippet(training: {
  aboutShop: string;
  rulesAndFaq: string;
  documents: TrainingDocument[];
}): string | null {
  const parts: string[] = [];

  if (training.aboutShop.trim()) {
    parts.push(`О МАГАЗИНЕ:\n${training.aboutShop.trim()}`);
  }
  if (training.rulesAndFaq.trim()) {
    parts.unshift(
      `ПРАВИЛА, ВОЗВРАТ И ОГРАНИЧЕНИЯ (высший приоритет — строго соблюдать, перекрывают шаблоны по умолчанию):\n${training.rulesAndFaq.trim()}`
    );
  }

  for (const doc of training.documents) {
    if (doc.status === "ready" && doc.extractedText.trim()) {
      parts.push(`[${doc.name}]\n${doc.extractedText.trim()}`);
    }
  }

  if (!parts.length) return null;
  return parts.join("\n\n").slice(0, 12_000);
}

export function countReadyDocuments(documents: TrainingDocument[]): number {
  return documents.filter((d) => d.status === "ready").length;
}
