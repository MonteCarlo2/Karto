import type { WbFeedback } from "@/lib/services/wildberries/types";
import { feedbackCountsOnCard } from "./card-visibility";
import type { SellerFeedbackRow, SellerQuestionRow } from "./types";
import type { WbQuestion } from "./wb-read";

function clip(value: string | null | undefined, max: number): string {
  const t = (value ?? "").trim();
  return t.length > max ? t.slice(0, max) : t;
}

function isAnsweredFeedback(row: WbFeedback): boolean {
  return (row.answer?.text?.trim() ?? "").length >= 2;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t : null;
}

export function mapWbFeedback(row: WbFeedback): SellerFeedbackRow | null {
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const nmId = row.productDetails?.nmId != null ? String(row.productDetails.nmId) : "";
  if (!id || !nmId) return null;
  const rating = Math.round(Number(row.productValuation ?? 0));
  if (!(rating >= 1 && rating <= 5)) return null;
  const createdAt = row.createdDate?.trim();
  if (!createdAt) return null;
  const answered = isAnsweredFeedback(row);
  const orderStatus = textOrNull(row.orderStatus);
  const childFeedbackId = textOrNull(row.childFeedbackId);
  const parentFeedbackId = textOrNull(row.parentFeedbackId);
  return {
    id,
    nmId,
    rating,
    createdAt,
    answered,
    answeredAt: answered ? row.answer?.createDate?.trim() || createdAt : null,
    text: clip(row.text, 4000),
    pros: clip(row.pros, 2000),
    cons: clip(row.cons, 2000),
    orderStatus,
    state: textOrNull(row.state),
    imtId: row.productDetails?.imtId != null ? String(row.productDetails.imtId) : null,
    parentFeedbackId,
    childFeedbackId,
    countsOnCard: feedbackCountsOnCard({ orderStatus, childFeedbackId }),
  };
}

export function mapWbQuestion(row: WbQuestion): SellerQuestionRow | null {
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const nmId = row.productDetails?.nmId != null ? String(row.productDetails.nmId) : "";
  if (!id || !nmId) return null;
  const createdAt = row.createdDate?.trim();
  if (!createdAt) return null;
  const answerText = row.answer?.text?.trim() ?? "";
  const answered = answerText.length >= 2;
  return {
    id,
    nmId,
    createdAt,
    answered,
    answeredAt: answered ? row.answer?.createDate?.trim() || createdAt : null,
    text: clip(row.text, 4000),
  };
}

export function previewText(row: { text: string; pros: string; cons: string }, max = 200): string {
  const chunks = [row.text, row.pros ? `Плюсы: ${row.pros}` : "", row.cons ? `Минусы: ${row.cons}` : ""]
    .map((s) => s.trim())
    .filter(Boolean);
  const joined = chunks.join(" ").trim() || "Без текста";
  return joined.length > max ? `${joined.slice(0, max)}…` : joined;
}
