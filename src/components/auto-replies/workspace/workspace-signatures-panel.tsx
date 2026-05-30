"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, ChevronUp, PenLine, Plus, Settings2, Star, Trash2, X } from "lucide-react";
import type {
  AutoRepliesTemplateSettings,
  ReplySignature,
  SignatureRotationMode,
  StarKey,
} from "@/lib/auto-replies/settings-types";
import {
  ALL_STAR_KEYS,
  SIGNATURE_MAX_LENGTH,
  brandSignatureTemplate,
  createSignatureId,
  formatSignatureDate,
  formatSignatureStars,
  getEnabledSequentialOrder,
  reorderSignatures,
  resolveSignatureText,
  toggleStarRating,
} from "@/lib/auto-replies/signature-settings";
import {
  WsSwitch,
  WsWorkspaceSegment,
  panel,
  wsSans,
} from "./settings-ui";

type WorkspaceSignaturesPanelProps = {
  templates: AutoRepliesTemplateSettings;
  brandName?: string | null;
  onPatchTemplates: (patch: Partial<AutoRepliesTemplateSettings>) => void;
};

type SignatureDraft = {
  id: string | null;
  text: string;
  starRatings: StarKey[];
  enabled: boolean;
  createdAt: string | null;
};

function emptyDraft(): SignatureDraft {
  return {
    id: null,
    text: "",
    starRatings: [...ALL_STAR_KEYS],
    enabled: true,
    createdAt: null,
  };
}

function DeleteConfirmModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Закрыть"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[82] cursor-default border-0 bg-[#0A0A0A]/50 backdrop-blur-[2px]"
          />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="fixed left-1/2 top-1/2 z-[83] w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[1.25rem] border px-6 py-6 shadow-[0_24px_70px_-20px_rgba(10,10,10,0.45)]"
            style={{ borderColor: panel.borderStrong, backgroundColor: panel.canvas }}
          >
            <h3 className="text-[18px] font-semibold tracking-[-0.02em]" style={{ ...wsSans, color: panel.text }}>
              Удалить подпись?
            </h3>
            <p className="mt-2 text-[14px] leading-[1.6]" style={{ ...wsSans, color: panel.textMuted }}>
              Её нельзя будет восстановить.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border px-5 py-2.5 text-[14px] font-semibold transition hover:bg-[#0a0a0a]/[0.03]"
                style={{ ...wsSans, borderColor: panel.borderStrong, color: panel.text }}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="rounded-xl px-5 py-2.5 text-[14px] font-semibold transition"
                style={{ ...wsSans, backgroundColor: "#991B1B", color: "#FFF7F7" }}
              >
                Удалить
              </button>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function SignatureEditorModal({
  open,
  mode,
  draft,
  brandName,
  onChange,
  onClose,
  onSave,
}: {
  open: boolean;
  mode: "create" | "edit";
  draft: SignatureDraft;
  brandName?: string | null;
  onChange: (next: SignatureDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const trimmed = draft.text.trim();
  const overLimit = draft.text.length > SIGNATURE_MAX_LENGTH;
  const canSave = trimmed.length > 0 && !overLimit && draft.starRatings.length > 0;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Закрыть"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[80] cursor-default border-0 bg-[#0A0A0A]/45 backdrop-blur-[4px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="signature-modal-title"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            className="fixed left-1/2 top-1/2 z-[81] w-[min(640px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[1.45rem] border shadow-[0_32px_90px_-28px_rgba(10,10,10,0.5)]"
            style={{
              borderColor: panel.borderStrong,
              backgroundColor: panel.surface,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="h-[4px] w-full"
              style={{ backgroundColor: "rgba(185,255,75,0.82)" }}
              aria-hidden
            />

            <div
              className="flex items-center justify-between gap-4 border-b px-7 py-6"
              style={{ borderColor: panel.borderLight, backgroundColor: panel.canvas }}
            >
              <h2
                id="signature-modal-title"
                className="text-[22px] font-semibold tracking-[-0.025em]"
                style={{ ...wsSans, color: panel.text }}
              >
                {mode === "create" ? "Новая подпись" : "Редактирование"}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-2.5 transition hover:bg-[#0a0a0a]/[0.05]"
                aria-label="Закрыть окно"
              >
                <X className="h-5 w-5" style={{ color: panel.textMuted }} strokeWidth={2} />
              </button>
            </div>

            <div className="space-y-7 px-7 py-7">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label
                    htmlFor="signature-text"
                    className="text-[15px] font-semibold"
                    style={{ ...wsSans, color: panel.text }}
                  >
                    Текст
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...draft,
                        text: brandSignatureTemplate(brandName),
                      })
                    }
                    className="inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[13px] font-semibold transition hover:bg-[#0a0a0a]/[0.02]"
                    style={{
                      ...wsSans,
                      borderColor: "rgba(46,90,67,0.22)",
                      backgroundColor: "rgba(185,255,75,0.18)",
                      color: panel.greenDark,
                    }}
                  >
                    <PenLine className="h-4 w-4" strokeWidth={2.1} />
                    Из бренда
                  </button>
                </div>
                <textarea
                  id="signature-text"
                  value={draft.text}
                  onChange={(e) =>
                    onChange({
                      ...draft,
                      text: e.target.value.slice(0, SIGNATURE_MAX_LENGTH),
                    })
                  }
                  rows={5}
                  placeholder="С уважением, команда «{бренд}»"
                  className="mt-4 w-full resize-y rounded-[1.1rem] border px-5 py-4 text-[16px] leading-[1.65] focus:outline-none focus:ring-2 focus:ring-[#2E5A43]/25"
                  style={{
                    ...wsSans,
                    borderColor: overLimit ? "#B45309" : panel.border,
                    backgroundColor: panel.inputBg,
                    color: panel.text,
                    minHeight: "140px",
                  }}
                />
                <div className="mt-2.5 flex items-center justify-end">
                  <span
                    className="text-[13px] font-semibold tabular-nums"
                    style={{
                      ...wsSans,
                      color: overLimit ? "#B45309" : panel.textMuted,
                    }}
                  >
                    {draft.text.length}/{SIGNATURE_MAX_LENGTH}
                  </span>
                </div>
              </div>

              <div
                className="rounded-[1.15rem] border p-5"
                style={{ borderColor: panel.borderLight, backgroundColor: panel.canvas }}
              >
                <p className="text-[15px] font-semibold" style={{ ...wsSans, color: panel.text }}>
                  Рейтинг
                </p>
                <div className="mt-4 grid grid-cols-5 gap-2 sm:gap-3">
                  {ALL_STAR_KEYS.map((star) => {
                    const active = draft.starRatings.includes(star);
                    return (
                      <button
                        key={star}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          onChange({
                            ...draft,
                            starRatings: toggleStarRating(draft.starRatings, star),
                          })
                        }
                        className="flex flex-col items-center gap-2 rounded-[1rem] border px-2 py-3.5 transition"
                        style={{
                          borderColor: active ? "rgba(46,90,67,0.35)" : panel.border,
                          backgroundColor: active ? "rgba(185,255,75,0.34)" : panel.surface,
                        }}
                      >
                        <Star
                          className="h-5 w-5"
                          fill={active ? "#F4B942" : "transparent"}
                          color={active ? "#E5A319" : "rgba(10,10,10,0.18)"}
                          strokeWidth={1.6}
                        />
                        <span
                          className="text-[13px] font-semibold"
                          style={{ ...wsSans, color: active ? panel.greenDark : panel.textMuted }}
                        >
                          {star}★
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div
              className="flex flex-wrap items-center justify-end gap-3 border-t px-7 py-6"
              style={{ borderColor: panel.borderLight, backgroundColor: panel.canvas }}
            >
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border px-6 py-3 text-[15px] font-semibold transition hover:bg-[#0a0a0a]/[0.03]"
                style={{ ...wsSans, borderColor: panel.borderStrong, color: panel.text }}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={!canSave}
                onClick={onSave}
                className="inline-flex items-center gap-2.5 rounded-xl px-7 py-3 text-[15px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  ...wsSans,
                  backgroundColor: canSave ? panel.green : "#C5BFB4",
                  color: panel.saladSoft,
                  boxShadow: canSave ? "0 12px 32px -16px rgba(46,90,67,0.6)" : "none",
                }}
              >
                <Check className="h-4 w-4" strokeWidth={2.5} />
                Сохранить
              </button>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function SignatureDragIndicator() {
  return (
    <div
      aria-hidden
      className="flex shrink-0 select-none flex-col items-center justify-center"
      style={{ color: panel.textSubtle }}
    >
      <ChevronUp className="h-3.5 w-3.5 opacity-35" strokeWidth={2.4} />
      <ChevronDown className="-mt-1 h-3.5 w-3.5 opacity-35" strokeWidth={2.4} />
    </div>
  );
}

function SignatureCard({
  signature,
  brandName,
  enabledOrder,
  showReorder,
  dragOver,
  onEdit,
  onDelete,
  onToggleEnabled,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
}: {
  signature: ReplySignature;
  brandName?: string | null;
  enabledOrder: number | null;
  showReorder: boolean;
  dragOver?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}) {
  const preview = resolveSignatureText(signature.text, brandName);
  const active = signature.enabled !== false;

  return (
    <div
      draggable={showReorder}
      onDragStart={(e) => {
        if ((e.target as HTMLElement).closest("button, [role='switch']")) {
          e.preventDefault();
          return;
        }
        onDragStart();
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", signature.id);
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        onDragEnter();
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={onDragEnd}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={`rounded-[1.3rem] border px-6 py-6 transition sm:px-8 sm:py-7 ${
        showReorder ? "cursor-grab active:cursor-grabbing" : ""
      }`}
      style={{
        borderColor: dragOver
          ? "rgba(46,90,67,0.45)"
          : active
            ? panel.borderStrong
            : panel.borderLight,
        backgroundColor: dragOver
          ? "rgba(185,255,75,0.12)"
          : active
            ? panel.surface
            : "rgba(255,255,255,0.55)",
        boxShadow: active ? "0 16px 48px -36px rgba(10,10,10,0.22)" : "none",
        opacity: active ? 1 : 0.72,
      }}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
          {showReorder ? (
            <div
              className="flex shrink-0 items-start gap-2.5 sm:gap-3"
              aria-label="Перетащите карточку для изменения порядка"
            >
              {enabledOrder != null ? (
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
                  style={{ backgroundColor: "rgba(185,255,75,0.34)", color: panel.greenDark }}
                >
                  {enabledOrder}
                </span>
              ) : (
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                  style={{ ...wsSans, backgroundColor: panel.borderLight, color: panel.textSubtle }}
                  title="Не участвует в ротации"
                >
                  —
                </span>
              )}
              <SignatureDragIndicator />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <p
              className="text-[18px] font-medium leading-[1.6] tracking-[-0.015em] sm:text-[19px]"
              style={{ ...wsSans, color: active ? panel.text : panel.textMuted }}
            >
              {preview}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span
                className="text-[12px] font-semibold uppercase tracking-[0.1em]"
                style={{ ...wsSans, color: panel.green }}
              >
                {formatSignatureStars(signature.starRatings)}
              </span>
              {signature.createdAt ? (
                <span className="text-[13px]" style={{ ...wsSans, color: panel.textSubtle }}>
                  {formatSignatureDate(signature.createdAt)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 sm:pt-1">
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] font-medium" style={{ ...wsSans, color: panel.textMuted }}>
              {active ? "Вкл." : "Выкл."}
            </span>
            <WsSwitch label="Активна" checked={active} onChange={onToggleEnabled} />
          </div>
          <button
            type="button"
            onClick={onEdit}
            aria-label="Редактировать подпись"
            className="rounded-xl border p-3 transition hover:bg-[#0a0a0a]/[0.03]"
            style={{ borderColor: panel.borderStrong, color: panel.text }}
          >
            <Settings2 className="h-5 w-5" strokeWidth={2.1} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Удалить подпись"
            className="rounded-xl border p-3 transition hover:bg-[#0a0a0a]/[0.03]"
            style={{ borderColor: panel.borderStrong, color: panel.textMuted }}
          >
            <Trash2 className="h-5 w-5" strokeWidth={2.1} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function WorkspaceSignaturesPanel({
  templates,
  brandName,
  onPatchTemplates,
}: WorkspaceSignaturesPanelProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [draft, setDraft] = useState<SignatureDraft>(emptyDraft);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const rotationOptions = useMemo(
    () =>
      [
        { value: "random" as SignatureRotationMode, label: "Случайно" },
        { value: "sequential" as SignatureRotationMode, label: "По порядку" },
      ],
    []
  );

  const openCreate = () => {
    setModalMode("create");
    setDraft(emptyDraft());
    setModalOpen(true);
  };

  const openEdit = (sig: ReplySignature) => {
    setModalMode("edit");
    setDraft({
      id: sig.id,
      text: sig.text,
      starRatings: [...sig.starRatings],
      enabled: sig.enabled !== false,
      createdAt: sig.createdAt,
    });
    setModalOpen(true);
  };

  const saveDraft = () => {
    const text = draft.text.trim().slice(0, SIGNATURE_MAX_LENGTH);
    if (!text) return;

    if (modalMode === "edit" && draft.id) {
      onPatchTemplates({
        signatures: templates.signatures.map((s) =>
          s.id === draft.id
            ? {
                ...s,
                text,
                starRatings: [...draft.starRatings],
              }
            : s
        ),
      });
    } else {
      const entry: ReplySignature = {
        id: createSignatureId(),
        text,
        starRatings: [...draft.starRatings],
        enabled: true,
        createdAt: new Date().toISOString(),
      };
      onPatchTemplates({
        signatures: [...templates.signatures, entry],
      });
    }
    setModalOpen(false);
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    onPatchTemplates({
      signatures: templates.signatures.filter((s) => s.id !== deleteId),
    });
    setDeleteId(null);
  };

  const toggleSignatureEnabled = (id: string, enabled: boolean) => {
    onPatchTemplates({
      signatures: templates.signatures.map((s) => (s.id === id ? { ...s, enabled } : s)),
    });
  };

  const isSequential = templates.rotationMode === "sequential";
  const showReorder = isSequential && templates.signatures.length > 1;

  return (
    <div className="w-full space-y-8 pb-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold" style={{ ...wsSans, color: panel.text }}>
                Ротация
              </p>
              <p className="mt-1 text-[13px] leading-[1.5]" style={{ ...wsSans, color: panel.textMuted }}>
                Как выбирается подпись, если подходит несколько активных вариантов.
              </p>
            </div>
            <div className="w-fit shrink-0 sm:min-w-[280px]">
              <WsWorkspaceSegment
                value={templates.rotationMode}
                onChange={(rotationMode) => onPatchTemplates({ rotationMode })}
                tone="brand"
                accentValue="sequential"
                options={rotationOptions}
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex shrink-0 items-center justify-center gap-3 self-end rounded-[1.25rem] px-8 py-4 text-[16px] font-semibold tracking-[-0.01em] transition hover:brightness-105 lg:self-auto"
          style={{
            ...wsSans,
            backgroundColor: panel.text,
            color: panel.salad,
            boxShadow: "0 16px 40px -18px rgba(10,10,10,0.45), inset 0 0 0 1px rgba(185,255,75,0.12)",
          }}
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} />
          Добавить подпись
        </button>
      </div>

      {templates.signatures.length === 0 ? (
        <p className="py-2 text-[15px]" style={{ ...wsSans, color: panel.textSubtle }}>
          Подписей пока нет.
        </p>
      ) : (
        <div className="space-y-5">
          {templates.signatures.map((sig) => (
            <SignatureCard
              key={sig.id}
              signature={sig}
              brandName={brandName}
              enabledOrder={showReorder ? getEnabledSequentialOrder(templates.signatures, sig.id) : null}
              showReorder={showReorder}
              dragOver={dragOverId === sig.id && draggingId !== sig.id}
              onEdit={() => openEdit(sig)}
              onDelete={() => setDeleteId(sig.id)}
              onToggleEnabled={(enabled) => toggleSignatureEnabled(sig.id, enabled)}
              onDragStart={() => setDraggingId(sig.id)}
              onDragEnter={() => setDragOverId(sig.id)}
              onDragEnd={() => {
                setDraggingId(null);
                setDragOverId(null);
              }}
              onDrop={() => {
                if (draggingId && draggingId !== sig.id) {
                  onPatchTemplates({
                    signatures: reorderSignatures(templates.signatures, draggingId, sig.id),
                  });
                }
                setDraggingId(null);
                setDragOverId(null);
              }}
            />
          ))}
        </div>
      )}

      <SignatureEditorModal
        open={modalOpen}
        mode={modalMode}
        draft={draft}
        brandName={brandName}
        onChange={setDraft}
        onClose={() => setModalOpen(false)}
        onSave={saveDraft}
      />

      <DeleteConfirmModal
        open={deleteId != null}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
