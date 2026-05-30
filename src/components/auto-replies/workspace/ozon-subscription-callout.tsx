"use client";

import { ExternalLink } from "lucide-react";
import {
  OZON_MANUAL_MODE_HIGHLIGHT,
  OZON_MARKETPLACE_SELECTED_NOTICE,
  OZON_PREMIUM_PRO_URL,
  OZON_REVIEW_MANAGEMENT_URL,
  OZON_REVIEW_SUBSCRIPTION_DENIED,
  OZON_SUBSCRIPTION_RECOMMENDATION,
  OZON_SUBSCRIPTION_TERMS_NOTE,
} from "@/lib/auto-replies/ozon-subscription";
import { panel, wsSans } from "./settings-ui";

const linkClassName =
  "inline-flex items-center gap-1.5 text-[13px] font-semibold underline decoration-[#2E5A43]/35 underline-offset-4 transition hover:decoration-[#2E5A43]";

type OzonSubscriptionLinksProps = {
  className?: string;
  showTerms?: boolean;
};

export function OzonSubscriptionLinks({ className, showTerms = true }: OzonSubscriptionLinksProps) {
  return (
    <div className={className}>
      {showTerms ? (
        <p className="text-[12px] leading-[1.55] sm:text-[13px]" style={{ ...wsSans, color: panel.textSubtle }}>
          {OZON_SUBSCRIPTION_TERMS_NOTE}
        </p>
      ) : null}
      <div className={`flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-4 ${showTerms ? "mt-2.5" : ""}`}>
        <a
          href={OZON_REVIEW_MANAGEMENT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
          style={{ ...wsSans, color: panel.greenDark }}
        >
          Подключить «Управление отзывами»
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.2} />
        </a>
        <a
          href={OZON_PREMIUM_PRO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
          style={{ ...wsSans, color: panel.greenDark }}
        >
          Подключить Premium Pro
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.2} />
        </a>
      </div>
    </div>
  );
}

/** Шаг 1 онбординга: появляется сразу после выбора Ozon. */
export function OzonMarketplaceSelectedNotice() {
  return (
    <div
      className="mt-10 max-w-2xl rounded-2xl border border-[#2E5A43]/12 bg-white/55 px-5 py-4 shadow-[0_12px_40px_-28px_rgba(46,90,67,0.35)] sm:px-6 sm:py-5"
      style={wsSans}
    >
      <p className="text-[14px] leading-[1.65] text-[#5a420f] sm:text-[15px]">{OZON_MARKETPLACE_SELECTED_NOTICE}</p>
      <p className="mt-2 text-[13px] leading-[1.6] text-[#7a5c20] sm:text-[14px]">{OZON_SUBSCRIPTION_RECOMMENDATION}</p>
    </div>
  );
}

type OzonSubscriptionVerifyResultProps = {
  status: "confirmed" | "denied";
};

/** Результат проверки подписки — под кнопкой «Проверить подключение». При подтверждённой подписке ничего не показываем. */
export function OzonSubscriptionVerifyResult({ status }: OzonSubscriptionVerifyResultProps) {
  if (status === "confirmed") {
    return null;
  }

  return (
    <div className="mt-3">
      <p className="text-[13px] font-semibold leading-[1.55] sm:text-[14px]" style={{ ...wsSans, color: panel.warn }}>
        {OZON_REVIEW_SUBSCRIPTION_DENIED}
      </p>
      <div
        className="mt-2.5 rounded-[0.85rem] border px-3.5 py-3 sm:px-4 sm:py-3.5"
        style={{
          ...wsSans,
          borderColor: "rgba(180,130,40,0.25)",
          backgroundColor: "rgba(255,248,230,0.85)",
          color: "#5a420f",
        }}
      >
        <p className="text-[12px] leading-[1.65] sm:text-[13px]">{OZON_MANUAL_MODE_HIGHLIGHT}</p>
        <OzonSubscriptionLinks className="mt-3" />
      </div>
    </div>
  );
}
