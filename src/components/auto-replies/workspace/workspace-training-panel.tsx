"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { FileText, ImageIcon, Trash2, Upload } from "lucide-react";
import { KartoVoiceTextarea } from "@/components/shared/karto-voice-textarea";
import { AiNeuralDecor } from "./ai-neural-decor";
import type {
  AutoRepliesShopSettings,
  TrainingDocument,
  TrainingReferenceImage,
} from "@/lib/auto-replies/settings-types";
import { TRAINING_LIMITS } from "@/lib/auto-replies/training-settings";
import {
  TRAINING_DOC_ACCEPT,
  TRAINING_DOC_FORMATS,
  TRAINING_IMAGE_ACCEPT,
  TRAINING_KNOWLEDGE_LIMITS,
  createTrainingAssetId,
  detectTrainingDocKind,
  formatFileSize,
} from "@/lib/auto-replies/training-knowledge";
import {
  compressTrainingImage,
  deleteTrainingImage,
  loadTrainingImage,
  saveTrainingImage,
} from "@/lib/auto-replies/training-image-store";
import { panel, wsSans } from "./settings-ui";

type WorkspaceTrainingPanelProps = {
  shopId: string;
  training: AutoRepliesShopSettings["training"];
  brandDescription?: string | null;
  onPatchTraining: (patch: Partial<AutoRepliesShopSettings["training"]>) => void;
};

const surface = {
  ring: "linear-gradient(135deg, rgba(185,255,75,0.45) 0%, rgba(46,90,67,0.18) 50%, rgba(185,255,75,0.28) 100%)",
  fill: "rgba(255,255,255,0.82)",
  line: "rgba(46,90,67,0.1)",
} as const;

function AiKnowledgeFrame({ children }: { children: ReactNode }) {
  return (
    <div className="w-full rounded-[1.35rem] p-[1px]" style={{ background: surface.ring }}>
      <div
        className="relative overflow-hidden rounded-[1.32rem]"
        style={{
          backgroundColor: panel.canvas,
          boxShadow: "0 20px 56px -36px rgba(46,90,67,0.28)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 top-0 h-56 w-56 rounded-full blur-3xl"
          style={{ backgroundColor: "rgba(185,255,75,0.16)" }}
        />
        {children}
      </div>
    </div>
  );
}

function TrainingField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  action,
  limit,
  minHeight = "min-h-[220px]",
  ariaLabel,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  action?: ReactNode;
  limit: number;
  minHeight?: string;
  ariaLabel: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            className="text-[17px] font-semibold tracking-[-0.02em] sm:text-[18px]"
            style={{ ...wsSans, color: panel.text }}
          >
            {label}
          </h3>
          <p className="mt-1 text-[14px] leading-[1.65] sm:text-[15px]" style={{ ...wsSans, color: panel.textMuted }}>
            {hint}
          </p>
        </div>
        {action}
      </div>
      <KartoVoiceTextarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        maxLength={limit}
        minHeightClass={minHeight}
        micSize="lg"
        textareaClassName="focus:outline-none"
        textareaStyle={{
          ...wsSans,
          borderColor: surface.line,
          backgroundColor: surface.fill,
          color: panel.text,
        }}
        hintClassName="text-[13px] font-medium sm:text-[14px]"
        hintStyle={{ ...wsSans, color: panel.textMuted }}
      />
    </section>
  );
}

function DropZone({
  title,
  hint,
  accept,
  busy,
  onFiles,
  formats,
}: {
  title: string;
  hint: string;
  accept: string;
  busy?: boolean;
  onFiles: (files: FileList | File[]) => void;
  formats?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
      }}
      className="cursor-pointer rounded-[1.05rem] border border-dashed px-5 py-8 text-center transition sm:py-10"
      style={{
        borderColor: drag ? panel.green : surface.line,
        backgroundColor: drag ? "rgba(185,255,75,0.1)" : "rgba(255,255,255,0.45)",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        multiple
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div
        className="mx-auto flex h-12 w-12 items-center justify-center rounded-[1rem]"
        style={{ backgroundColor: "rgba(185,255,75,0.2)" }}
      >
        <Upload className="h-5 w-5" style={{ color: panel.green }} strokeWidth={2} />
      </div>
      <p className="mt-3 text-[15px] font-semibold sm:text-[16px]" style={{ ...wsSans, color: panel.text }}>
        {busy ? "Обработка…" : title}
      </p>
      <p className="mt-1.5 text-[13px] sm:text-[14px]" style={{ ...wsSans, color: panel.textMuted }}>
        {hint}
      </p>
      {formats ? <div className="mt-3">{formats}</div> : null}
    </div>
  );
}

function DocRow({ doc, onRemove }: { doc: TrainingDocument; onRemove: () => void }) {
  return (
    <div
      className="flex items-start gap-3 rounded-[0.95rem] border px-4 py-3"
      style={{ borderColor: surface.line, backgroundColor: surface.fill }}
    >
      <FileText className="mt-0.5 h-4 w-4 shrink-0" style={{ color: panel.green }} strokeWidth={2} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold sm:text-[15px]" style={{ ...wsSans, color: panel.text }}>
          {doc.name}
        </p>
        <p className="mt-0.5 text-[12px] sm:text-[13px]" style={{ ...wsSans, color: panel.textMuted }}>
          {doc.kind.toUpperCase()} · {formatFileSize(doc.sizeBytes)} · {doc.charCount.toLocaleString("ru-RU")} симв.
        </p>
        {doc.status === "error" && doc.errorMessage ? (
          <p className="mt-1 text-[12px]" style={{ ...wsSans, color: panel.warn }}>
            {doc.errorMessage}
          </p>
        ) : null}
      </div>
      <button type="button" aria-label="Удалить" onClick={onRemove} className="rounded-lg p-2 hover:bg-black/5">
        <Trash2 className="h-4 w-4" style={{ color: panel.textSubtle }} />
      </button>
    </div>
  );
}

function ImageTile({
  image,
  previewUrl,
  onRemove,
}: {
  image: TrainingReferenceImage;
  previewUrl: string | null;
  onRemove: () => void;
}) {
  return (
    <div
      className="group relative overflow-hidden rounded-[0.95rem] border"
      style={{ borderColor: surface.line, backgroundColor: surface.fill }}
    >
      <div className="aspect-[5/4] w-full bg-[#F3F1EA]">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={image.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageIcon className="h-8 w-8" style={{ color: panel.textSubtle }} />
          </div>
        )}
      </div>
      <div className="px-3 py-2">
        <p className="truncate text-[13px] font-medium" style={{ ...wsSans, color: panel.text }}>
          {image.name}
        </p>
      </div>
      <button
        type="button"
        aria-label="Удалить"
        onClick={onRemove}
        className="absolute right-2 top-2 rounded-lg bg-white/90 p-1.5 opacity-0 shadow transition group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" style={{ color: panel.textSubtle }} />
      </button>
    </div>
  );
}

export function WorkspaceTrainingPanel({
  shopId,
  training,
  brandDescription,
  onPatchTraining,
}: WorkspaceTrainingPanelProps) {
  const canImportFromProfile = brandDescription && brandDescription.trim().length >= 20;
  const [docBusy, setDocBusy] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];

    async function loadPreviews() {
      const next: Record<string, string> = {};
      for (const img of training.referenceImages) {
        try {
          const blob = await loadTrainingImage(shopId, img.id);
          if (blob) {
            const url = URL.createObjectURL(blob);
            urls.push(url);
            next[img.id] = url;
          }
        } catch {
          /* skip */
        }
      }
      if (!cancelled) setPreviews(next);
    }

    void loadPreviews();
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [shopId, training.referenceImages]);

  const ingestDocuments = useCallback(
    async (files: FileList | File[]) => {
      setUploadError(null);
      const list = Array.from(files);
      const room = TRAINING_KNOWLEDGE_LIMITS.maxDocuments - training.documents.length;
      if (room <= 0) {
        setUploadError(`Не больше ${TRAINING_KNOWLEDGE_LIMITS.maxDocuments} файлов`);
        return;
      }

      setDocBusy(true);
      const added: TrainingDocument[] = [];

      for (const file of list.slice(0, room)) {
        const kind = detectTrainingDocKind(file);
        if (!kind) {
          setUploadError("Поддерживаются PDF, TXT и MD");
          continue;
        }
        if (file.size > TRAINING_KNOWLEDGE_LIMITS.maxDocBytes) {
          setUploadError(`«${file.name}» больше 5 МБ`);
          continue;
        }

        try {
          const form = new FormData();
          form.append("file", file);
          const res = await fetch("/api/auto-replies/ingest-training-doc", {
            method: "POST",
            body: form,
          });
          const data = (await res.json()) as {
            extractedText?: string;
            charCount?: number;
            error?: string;
            kind?: TrainingDocument["kind"];
          };

          if (!res.ok) {
            added.push({
              id: createTrainingAssetId(),
              name: file.name,
              kind,
              sizeBytes: file.size,
              uploadedAt: new Date().toISOString(),
              extractedText: "",
              charCount: 0,
              status: "error",
              errorMessage: data.error ?? "Ошибка обработки",
            });
            continue;
          }

          added.push({
            id: createTrainingAssetId(),
            name: file.name,
            kind: data.kind ?? kind,
            sizeBytes: file.size,
            uploadedAt: new Date().toISOString(),
            extractedText: data.extractedText ?? "",
            charCount: data.charCount ?? 0,
            status: "ready",
          });
        } catch {
          setUploadError("Не удалось загрузить файл");
        }
      }

      if (added.length) onPatchTraining({ documents: [...training.documents, ...added] });
      setDocBusy(false);
    },
    [onPatchTraining, training.documents]
  );

  const ingestImages = useCallback(
    async (files: FileList | File[]) => {
      setUploadError(null);
      const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
      const room = TRAINING_KNOWLEDGE_LIMITS.maxImages - training.referenceImages.length;
      if (room <= 0) {
        setUploadError(`Не больше ${TRAINING_KNOWLEDGE_LIMITS.maxImages} фото`);
        return;
      }

      setImgBusy(true);
      const added: TrainingReferenceImage[] = [];

      for (const file of list.slice(0, room)) {
        if (file.size > TRAINING_KNOWLEDGE_LIMITS.maxImageBytes) {
          setUploadError(`«${file.name}» больше 4 МБ`);
          continue;
        }
        try {
          const blob = await compressTrainingImage(file);
          const id = createTrainingAssetId();
          await saveTrainingImage(shopId, id, blob);
          added.push({
            id,
            name: file.name,
            sizeBytes: blob.size,
            uploadedAt: new Date().toISOString(),
          });
        } catch {
          setUploadError("Не удалось обработать изображение");
        }
      }

      if (added.length) onPatchTraining({ referenceImages: [...training.referenceImages, ...added] });
      setImgBusy(false);
    },
    [onPatchTraining, shopId, training.referenceImages]
  );

  const removeDocument = (id: string) => {
    onPatchTraining({ documents: training.documents.filter((d) => d.id !== id) });
  };

  const removeImage = async (id: string) => {
    await deleteTrainingImage(shopId, id).catch(() => undefined);
    onPatchTraining({ referenceImages: training.referenceImages.filter((i) => i.id !== id) });
    setPreviews((prev) => {
      const next = { ...prev };
      if (next[id]) URL.revokeObjectURL(next[id]!);
      delete next[id];
      return next;
    });
  };

  return (
    <div className="w-full pb-6">
      <AiKnowledgeFrame>
        <AiNeuralDecor />

        <div className="space-y-10 px-5 py-7 sm:px-8 sm:py-9">
          <TrainingField
            label="О магазине"
            hint="Чем торгуете, для кого, чем отличаетесь. Можно надиктовать голосом."
            value={training.aboutShop}
            onChange={(aboutShop) => onPatchTraining({ aboutShop })}
            placeholder="Семейный магазин товаров для дома. Упор на натуральные материалы и отправку в день заказа."
            limit={TRAINING_LIMITS.aboutShop}
            minHeight="min-h-[240px]"
            ariaLabel="О магазине"
            action={
              canImportFromProfile ? (
                <button
                  type="button"
                  onClick={() => onPatchTraining({ aboutShop: brandDescription!.trim() })}
                  className="shrink-0 text-[14px] font-semibold underline-offset-2 hover:underline"
                  style={{ ...wsSans, color: panel.blue }}
                >
                  Из профиля
                </button>
              ) : null
            }
          />

          <TrainingField
            label="Правила, возврат и FAQ"
            hint="Сроки, доставка, гарантия — что можно обещать в публичном ответе. Можно надиктовать голосом."
            value={training.rulesAndFaq}
            onChange={(rulesAndFaq) => onPatchTraining({ rulesAndFaq })}
            placeholder={
              "Возврат в течение 14 дней через личный кабинет.\nДоставка — силами маркетплейса.\nПо браку — замена или возврат."
            }
            limit={TRAINING_LIMITS.rulesAndFaq}
            minHeight="min-h-[260px]"
            ariaLabel="Правила, возврат и FAQ"
          />
        </div>

        <div
          className="grid gap-8 border-t px-5 py-7 sm:px-8 sm:py-9 xl:grid-cols-2"
          style={{ borderColor: surface.line }}
        >
          <div>
            <h3 className="text-[17px] font-semibold sm:text-[18px]" style={{ ...wsSans, color: panel.text }}>
              Документы
            </h3>
            <div className="mt-3">
              <DropZone
                title="Перетащите или выберите файлы"
                hint={`PDF, TXT, MD · до ${TRAINING_KNOWLEDGE_LIMITS.maxDocuments} файлов, 5 МБ каждый`}
                accept={TRAINING_DOC_ACCEPT}
                busy={docBusy}
                onFiles={ingestDocuments}
                formats={
                  <div className="flex flex-wrap justify-center gap-2">
                    {TRAINING_DOC_FORMATS.map((f) => (
                      <span
                        key={f.kind}
                        className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]"
                        style={{ ...wsSans, backgroundColor: "rgba(46,90,67,0.08)", color: panel.green }}
                      >
                        {f.label}
                      </span>
                    ))}
                  </div>
                }
              />
            </div>
            {training.documents.length ? (
              <div className="mt-3 space-y-2">
                {training.documents.map((doc) => (
                  <DocRow key={doc.id} doc={doc} onRemove={() => removeDocument(doc.id)} />
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <h3 className="text-[17px] font-semibold sm:text-[18px]" style={{ ...wsSans, color: panel.text }}>
              Фото товаров
            </h3>
            <div className="mt-3">
              <DropZone
                title="Добавить фото"
                hint={`JPG, PNG, WebP · до ${TRAINING_KNOWLEDGE_LIMITS.maxImages} шт., 4 МБ каждое`}
                accept={TRAINING_IMAGE_ACCEPT}
                busy={imgBusy}
                onFiles={ingestImages}
              />
            </div>
            {training.referenceImages.length ? (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
                {training.referenceImages.map((img) => (
                  <ImageTile
                    key={img.id}
                    image={img}
                    previewUrl={previews[img.id] ?? null}
                    onRemove={() => void removeImage(img.id)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {uploadError ? (
          <div className="px-5 pb-6 sm:px-8">
            <p
              className="rounded-[0.85rem] border px-3 py-2 text-[13px]"
              style={{ ...wsSans, borderColor: "rgba(180,83,9,0.25)", backgroundColor: panel.warnSoft, color: panel.warn }}
            >
              {uploadError}
            </p>
          </div>
        ) : null}
      </AiKnowledgeFrame>
    </div>
  );
}
