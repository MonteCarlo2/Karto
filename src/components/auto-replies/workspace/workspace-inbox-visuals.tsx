"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Copy, ExternalLink, Package2, Star, X, Check } from "lucide-react";
import type { AutoRepliesMarketplaceId } from "@/lib/auto-replies/types";
import {
  getWildberriesProductImageCandidates,
  getWildberriesProductImageProxyUrl,
  getWildberriesProductPageUrl,
} from "@/lib/auto-replies/marketplace-product-image";
import { inboxTheme } from "./inbox-theme";
import { WsGlassPanel, glass, panel, wsSans } from "./settings-ui";

export function InboxProductThumb({
  imageUrl,
  imageCandidates,
  nmId,
  marketplaceId,
  alt,
  size = 48,
  className = "",
  rounded = "0.7rem",
}: {
  imageUrl?: string;
  imageCandidates?: string[];
  nmId?: number;
  marketplaceId?: AutoRepliesMarketplaceId;
  alt: string;
  size?: number;
  className?: string;
  rounded?: string;
}) {
  const candidates = useMemo(() => {
    const list: string[] = [];
    if (nmId && marketplaceId === "wildberries") {
      const proxy = getWildberriesProductImageProxyUrl(nmId);
      if (proxy) list.push(proxy);
      list.push(...getWildberriesProductImageCandidates(nmId));
    }
    if (imageCandidates?.length) list.push(...imageCandidates);
    if (imageUrl) list.push(imageUrl);
    return [...new Set(list)];
  }, [imageCandidates, imageUrl, marketplaceId, nmId]);

  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [nmId, marketplaceId, imageUrl]);
  const src = candidates[index];
  const showImage = Boolean(src) && index < candidates.length;

  return (
    <span
      className={`relative shrink-0 overflow-hidden border ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: rounded,
        borderColor: glass.borderSoft,
        backgroundColor: "rgba(255,255,255,0.88)",
      }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt={alt}
          width={size}
          height={size}
          className="block h-full w-full max-h-full max-w-full object-cover object-center"
          style={{ imageRendering: "auto" }}
          loading="lazy"
          decoding="async"
          onError={() => setIndex((i) => i + 1)}
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center"
          style={{ color: panel.textSubtle }}
        >
          <Package2 className="h-[42%] w-[42%]" strokeWidth={2} />
        </span>
      )}
    </span>
  );
}

export function InboxLabeledRow({
  label,
  children,
  variant = "default",
}: {
  label: string;
  children: ReactNode;
  variant?: "default" | "detail";
}) {
  const isDetail = variant === "detail";
  return (
    <div className={`flex gap-3 leading-[1.45] ${isDetail ? "text-[15px]" : "text-[14px]"}`}>
      <span
        className={`shrink-0 ${isDetail ? "w-[5rem]" : "w-[4.5rem]"}`}
        style={{ ...wsSans, color: panel.textMuted }}
      >
        {label}
      </span>
      <span className="min-w-0 flex-1" style={{ ...wsSans, color: panel.text }}>
        {children}
      </span>
    </div>
  );
}

export function InboxProductHero({
  productName,
  productArticle,
  shopName,
  marketplaceLabel,
  imageUrl,
  nmId,
  marketplaceId,
}: {
  productName: string;
  productArticle: string;
  shopName: string;
  marketplaceLabel: string;
  imageUrl?: string;
  nmId?: number;
  marketplaceId: AutoRepliesMarketplaceId;
}) {
  const [copied, setCopied] = useState(false);
  const productUrl =
    marketplaceId === "wildberries" ? getWildberriesProductPageUrl(nmId) : undefined;

  const copyArticle = async () => {
    const text = productArticle.replace(/^Арт\.\s*/i, "").trim() || productArticle;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="flex items-stretch gap-4 border-b pb-5 sm:gap-5 sm:pb-6"
      style={{ borderColor: panel.borderLight }}
    >
      <a
        href={productUrl ?? undefined}
        target={productUrl ? "_blank" : undefined}
        rel={productUrl ? "noopener noreferrer" : undefined}
        className={`flex w-[7.75rem] shrink-0 self-stretch overflow-hidden rounded-[3px] border sm:w-[8.75rem] ${productUrl ? "transition hover:opacity-90" : "pointer-events-none"}`}
        style={{ borderColor: panel.borderLight, backgroundColor: "rgba(255,255,255,0.88)" }}
        title={productUrl ? "Открыть на Wildberries" : undefined}
      >
        <InboxProductThumb
          nmId={nmId}
          marketplaceId={marketplaceId}
          imageUrl={imageUrl}
          alt={productName}
          size={140}
          rounded="3px"
          className="!h-full !min-h-[7.75rem] !w-full !border-0 sm:!min-h-[8.75rem]"
        />
      </a>
      <div className="min-w-0 flex-1 py-0.5">
        <h2
          className="text-[19px] font-bold leading-[1.32] tracking-[-0.025em] sm:text-[21px]"
          style={{ ...wsSans, color: panel.text }}
        >
          {productName}
        </h2>
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] leading-[1.5] sm:text-[14px]" style={{ ...wsSans, color: panel.textMuted }}>
          <span>
            <span className="font-semibold" style={{ color: panel.text }}>
              {marketplaceLabel}
            </span>
            {" · "}
            {shopName}
            {" · "}
            {productArticle}
          </span>
          <button
            type="button"
            onClick={() => void copyArticle()}
            aria-label={copied ? "Артикул скопирован" : "Копировать артикул"}
            title={copied ? "Скопировано" : "Копировать артикул"}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] transition"
            style={{
              color: copied ? panel.greenDark : panel.textSubtle,
              backgroundColor: copied ? "rgba(185, 255, 75, 0.42)" : undefined,
            }}
          >
            {copied ? (
              <Check className="h-3 w-3" strokeWidth={2.4} />
            ) : (
              <Copy className="h-3 w-3" strokeWidth={2.1} />
            )}
          </button>
          {copied ? (
            <span
              className="text-[11px] font-semibold tracking-[0.01em]"
              style={{ ...wsSans, color: panel.greenDark }}
            >
              Скопировано
            </span>
          ) : null}
        </p>
        {productUrl ? (
          <a
            href={productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 inline-flex items-center gap-1 text-[13px] font-semibold transition hover:underline sm:text-[14px]"
            style={{ ...wsSans, color: panel.textMuted }}
          >
            Подробнее
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.2} />
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function InboxReviewPhotos({ urls }: { urls?: string[] }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!previewUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewUrl(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewUrl]);

  if (!urls?.length) return null;

  return (
    <>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {urls.map((url) => (
          <button
            key={url}
            type="button"
            onClick={() => setPreviewUrl(url)}
            className="block overflow-hidden rounded-[3px] border transition hover:opacity-90"
            style={{ borderColor: glass.borderSoft }}
            aria-label="Открыть фото из отзыва"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="Фото из отзыва"
              className="h-[4.5rem] w-[4.5rem] object-cover sm:h-20 sm:w-20"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {previewUrl ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Просмотр фото из отзыва"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="absolute inset-0 bg-[rgba(10,10,10,0.55)] backdrop-blur-[2px]" />
          <div
            className="relative max-h-[min(72vh,34rem)] max-w-[min(92vw,28rem)] overflow-hidden rounded-xl border shadow-[0_24px_64px_-24px_rgba(0,0,0,0.55)]"
            style={{ borderColor: glass.borderSoft, backgroundColor: "rgba(255,255,255,0.96)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewUrl(null)}
              className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border bg-white/90 transition hover:bg-white"
              style={{ borderColor: glass.borderSoft, color: panel.textMuted }}
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" strokeWidth={2.2} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Фото из отзыва"
              className="block max-h-[min(72vh,34rem)] w-full object-contain"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

export function InboxStarRow({ value, size = "md" }: { value: number; size?: "sm" | "md" | "lg" }) {
  const cls = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-[1.125rem] w-[1.125rem]" : "h-4 w-4";
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => {
        const filled = i < value;
        return (
          <Star
            key={i}
            className={cls}
            fill={filled ? "#F4B942" : "transparent"}
            color={filled ? "#E5A319" : "rgba(10,10,10,0.14)"}
            strokeWidth={1.5}
          />
        );
      })}
    </div>
  );
}

export function InboxMetaChip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "salad";
}) {
  const styles =
    tone === "green"
      ? { bg: panel.greenSoft, color: panel.greenDark, border: "rgba(46,90,67,0.16)" }
      : tone === "salad"
        ? { bg: "rgba(185,255,75,0.22)", color: panel.text, border: "rgba(46,90,67,0.12)" }
        : { bg: "rgba(255,255,255,0.72)", color: panel.textMuted, border: glass.borderSoft };

  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em]"
      style={{ ...wsSans, backgroundColor: styles.bg, color: styles.color, borderColor: styles.border }}
    >
      {children}
    </span>
  );
}

export function InboxActionChip({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-[0.9rem] border px-3.5 py-2 text-[13px] font-semibold transition hover:bg-black/[0.02] disabled:opacity-45"
      style={{
        ...wsSans,
        borderColor: glass.borderSoft,
        backgroundColor: "rgba(255,255,255,0.78)",
        color: panel.text,
      }}
    >
      {children}
    </button>
  );
}

export function InboxSectionPanel({
  step,
  icon,
  title,
  hint,
  tone = "neutral",
  headerAction,
  children,
  className = "",
}: {
  step?: string;
  icon: ReactNode;
  title: string;
  hint?: string;
  tone?: "neutral" | "review" | "reply";
  headerAction?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headerBg =
    tone === "reply"
      ? "linear-gradient(135deg, rgba(238,246,232,0.92) 0%, rgba(185,255,75,0.1) 55%, rgba(243,241,234,0.55) 100%)"
      : tone === "review"
        ? "linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(250,247,240,0.78) 100%)"
        : "linear-gradient(135deg, rgba(243,241,234,0.88) 0%, rgba(255,255,255,0.72) 100%)";
  const bodyBg =
    tone === "reply" ? "rgba(238,246,232,0.28)" : tone === "review" ? "rgba(255,255,255,0.42)" : "rgba(255,255,255,0.35)";
  const borderColor = tone === "reply" ? "rgba(46,90,67,0.14)" : glass.border;

  return (
    <WsGlassPanel
      className={`overflow-hidden shadow-[0_20px_56px_-38px_rgba(46,90,67,0.22)] ${className}`}
      borderColor={borderColor}
    >
      <div
        className="relative border-b px-4 py-3.5 sm:px-5 sm:py-4"
        style={{ borderColor: glass.borderSoft, background: headerBg }}
      >
        {step ? (
          <span
            aria-hidden
            className="pointer-events-none absolute right-3 top-1 text-[2.75rem] font-black leading-none tracking-[-0.06em] sm:text-[3.25rem]"
            style={{ ...wsSans, color: tone === "reply" ? "rgba(46,90,67,0.055)" : "rgba(10,10,10,0.04)" }}
          >
            {step}
          </span>
        ) : null}
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.9rem] border"
              style={{
                borderColor: tone === "reply" ? "rgba(46,90,67,0.16)" : glass.borderSoft,
                backgroundColor: "rgba(255,255,255,0.88)",
                color: panel.greenDark,
                boxShadow:
                  tone === "reply"
                    ? "0 8px 24px -16px rgba(46,90,67,0.35)"
                    : "0 8px 24px -16px rgba(10,10,10,0.1)",
              }}
            >
              {icon}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-[15px] font-bold tracking-[-0.03em] sm:text-[16px]" style={{ ...wsSans, color: panel.text }}>
                {title}
              </p>
              {hint ? (
                <p className="mt-0.5 text-[12px] leading-[1.55] sm:text-[13px]" style={{ ...wsSans, color: panel.textMuted }}>
                  {hint}
                </p>
              ) : null}
            </div>
          </div>
          {headerAction}
        </div>
      </div>
      <div className="px-4 py-4 sm:px-5 sm:py-5" style={{ backgroundColor: bodyBg }}>
        {children}
      </div>
    </WsGlassPanel>
  );
}

export function InboxFieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1 sm:flex-nowrap">
      <span
        className="w-[6.5rem] shrink-0 pt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]"
        style={{ ...wsSans, color: panel.textSubtle }}
      >
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
