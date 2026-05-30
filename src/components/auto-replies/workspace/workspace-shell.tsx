"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Plug } from "lucide-react";
import type { WorkspaceNavKey } from "./workspace-panels";
import type { AutoRepliesUsageId } from "@/lib/auto-replies/types";
import {
  SECTION_COPY,
  WORKSPACE_TABS,
  type WorkspaceTab,
} from "./workspace-nav";
import { panel, wsSans } from "./settings-ui";

export type WorkspaceArea = "settings" | "inbox" | "analytics" | "integration";

export function WorkspaceShell({
  area,
  navKey,
  onNavChange,
  children,
  inboxChildren,
  analyticsChildren,
  integrationChildren,
  onOpenIntegration,
  connectionLabel,
  connectionTone = "muted",
  usage = "manual",
}: {
  area: WorkspaceArea;
  navKey: WorkspaceNavKey;
  onNavChange: (key: WorkspaceNavKey) => void;
  children: ReactNode;
  inboxChildren?: ReactNode;
  analyticsChildren?: ReactNode;
  integrationChildren?: ReactNode;
  onOpenIntegration?: () => void;
  connectionLabel?: string;
  connectionTone?: "ok" | "warn" | "muted";
  usage?: AutoRepliesUsageId;
}) {
  const section =
    area === "settings" && navKey !== "overview" && navKey !== "integration" && navKey !== "activity"
      ? SECTION_COPY[navKey as keyof typeof SECTION_COPY]
      : null;

  if (area === "inbox") {
    if (usage === "manual") {
      return (
        <WorkspaceAreaShell
          title="Рабочее пространство"
          description="Вставьте текст отзыва — KARTO сгенерирует персональный ответ с учётом всех ваших настроек."
        >
          {inboxChildren}
        </WorkspaceAreaShell>
      );
    }

    return <InboxCompactShell>{inboxChildren}</InboxCompactShell>;
  }

  if (area === "analytics") {
    return (
      <AnalyticsCompactShell>
        {analyticsChildren}
      </AnalyticsCompactShell>
    );
  }

  if (area === "integration") {
    return (
      <WorkspaceAreaShell
        title="Кабинет и API"
        description="API-ключ маркетплейса — основа подключения отзывов из личного кабинета."
      >
        {integrationChildren}
      </WorkspaceAreaShell>
    );
  }

  const toneDot =
    connectionTone === "ok"
      ? panel.green
      : connectionTone === "warn"
        ? panel.warn
        : panel.textSubtle;

  return (
    <div className="flex min-h-full flex-col" style={{ ...wsSans, backgroundColor: panel.canvas }}>
      <div className="flex-1 px-6 pb-10 pt-8 sm:px-8 sm:pt-9 lg:px-10 lg:pb-12 lg:pt-10">
        <div className="mb-9 flex flex-col gap-4 sm:mb-10 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
          <nav aria-label="Разделы настроек" className="min-w-0 overflow-x-auto">
            <div
              className="inline-flex min-w-max rounded-[1.2rem] border p-1.5"
              style={{
                borderColor: panel.borderStrong,
                backgroundColor: panel.track,
              }}
            >
              <div className="flex gap-1">
                {WORKSPACE_TABS.map((tab) => (
                  <TabButton
                    key={tab.id}
                    tab={tab}
                    active={navKey === tab.id}
                    onClick={() => onNavChange(tab.id)}
                  />
                ))}
              </div>
            </div>
          </nav>

          {onOpenIntegration ? (
            <button
              type="button"
              onClick={onOpenIntegration}
              className="inline-flex shrink-0 items-center gap-2.5 self-start rounded-[0.95rem] border px-4 py-2.5 text-left transition hover:brightness-[1.02]"
              style={{
                borderColor: "rgba(46,90,67,0.16)",
                backgroundColor: "rgba(255,255,255,0.72)",
                boxShadow: "0 10px 28px -16px rgba(46,90,67,0.28), inset 0 1px 0 rgba(255,255,255,0.75)",
              }}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.75rem]"
                style={{ backgroundColor: "rgba(185,255,75,0.22)" }}
              >
                <Plug className="h-4 w-4" style={{ color: panel.green }} strokeWidth={2.2} />
              </span>
              <span className="min-w-0">
                <span
                  className="block text-[14px] font-semibold tracking-[-0.02em] sm:text-[15px]"
                  style={{ color: panel.text }}
                >
                  Настройки подключения
                </span>
                {connectionLabel ? (
                  <span className="mt-0.5 flex items-center gap-1.5 text-[12px]" style={{ color: panel.textMuted }}>
                    <span
                      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: toneDot }}
                      aria-hidden
                    />
                    {connectionLabel}
                  </span>
                ) : null}
              </span>
            </button>
          ) : null}
        </div>

        {section ? (
          <header
            className={`mb-8 sm:mb-9 ${navKey === "training" ? "max-w-none" : "max-w-[920px]"}`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <h2
                className="text-[1.625rem] font-bold tracking-[-0.035em] sm:text-[1.75rem]"
                style={{ color: panel.text }}
              >
                {section.title}
              </h2>
              {navKey === "training" ? (
                <span
                  className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
                  style={{ backgroundColor: panel.salad, color: panel.text }}
                >
                  AI
                </span>
              ) : null}
            </div>
            <p
              className={`mt-3 text-[15px] leading-[1.65] sm:text-[16px] ${navKey === "training" ? "max-w-[52rem]" : "max-w-[42rem]"}`}
              style={{ color: panel.textMuted }}
            >
              {section.description}
            </p>
          </header>
        ) : null}

        {children}
      </div>
    </div>
  );
}

function InboxCompactShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden" style={wsSans}>
      {children}
    </div>
  );
}

function AnalyticsCompactShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col" style={{ ...wsSans, backgroundColor: panel.canvas }}>
      <div className="flex-1 px-5 pb-10 pt-6 sm:px-7 sm:pt-7 lg:px-9 lg:pb-12">
        {children}
      </div>
    </div>
  );
}

function WorkspaceAreaShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col" style={{ ...wsSans, backgroundColor: panel.canvas }}>
      <div className="flex-1 px-6 pb-10 pt-8 sm:px-8 sm:pt-9 lg:px-10 lg:pb-12 lg:pt-10">
        <header className="mb-8 max-w-[920px] sm:mb-9">
          <h2
            className="text-[1.625rem] font-bold tracking-[-0.035em] sm:text-[1.75rem]"
            style={{ color: panel.text }}
          >
            {title}
          </h2>
          <p
            className="mt-3 max-w-[42rem] text-[15px] leading-[1.65] sm:text-[16px]"
            style={{ color: panel.textMuted }}
          >
            {description}
          </p>
        </header>
        {children}
      </div>
    </div>
  );
}

function TabButton({
  tab,
  active,
  onClick,
}: {
  tab: WorkspaceTab;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative shrink-0 rounded-[0.95rem] px-4 py-3 sm:px-5 sm:py-3.5"
    >
      {active ? (
        <motion.span
          layoutId="ws-settings-tab"
          className="absolute inset-0 rounded-[0.95rem]"
          style={{
            backgroundColor: "rgba(185,255,75,0.34)",
            boxShadow:
              "0 0 0 1px rgba(46,90,67,0.16), 0 8px 22px -12px rgba(46,90,67,0.35)",
          }}
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
        />
      ) : null}
      <span
        className="relative z-10 inline-flex items-center gap-2 text-[15px] font-semibold tracking-[-0.02em] sm:text-[16px]"
        style={{ color: active ? panel.text : panel.textMuted }}
      >
        {tab.label}
        {tab.badge ? (
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]"
            style={{
              backgroundColor: active ? panel.green : panel.greenSoft,
              color: active ? panel.saladSoft : panel.green,
            }}
          >
            {tab.badge}
          </span>
        ) : null}
      </span>
    </button>
  );
}
