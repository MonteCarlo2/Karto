"use client";

import type { AutoRepliesUsageId } from "@/lib/auto-replies/types";
import type {
  AutoRepliesMarketplaceSettings,
  StarDeliveryMode,
  StarKey,
} from "@/lib/auto-replies/settings-types";
import { STAR_KEYS } from "@/lib/auto-replies/star-rules";
import { WorkspaceReviewScopePanel } from "./workspace-review-scope-panel";
import { WorkspaceTelegramPanel } from "./workspace-telegram-panel";
import {
  WsModeSourceSwitch,
  WsModeStarRow,
  WsOutlinePanel,
  panel,
  wsSans,
} from "./settings-ui";

type SourceMode = "cabinet" | "manual";

type WorkspaceModePanelProps = {
  usage: AutoRepliesUsageId;
  marketplaceLabel: string;
  connectionOk: boolean;
  mpSettings: AutoRepliesMarketplaceSettings;
  onPatchMp: (
    patch: Parameters<
      typeof import("@/lib/auto-replies/settings-store").patchMarketplaceSettings
    >[2]
  ) => void;
  onSetUsage: (usage: AutoRepliesUsageId) => void;
  onGoIntegration?: () => void;
};

function SourceHeader({
  source,
  marketplaceLabel,
  onChange,
}: {
  source: SourceMode;
  marketplaceLabel: string;
  onChange: (next: SourceMode) => void;
}) {
  return (
    <div
      className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between"
      style={{ borderColor: panel.borderLight }}
    >
      <div className="min-w-0">
        <p
          className="text-[12px] font-semibold uppercase tracking-[0.14em]"
          style={{ ...wsSans, color: panel.green }}
        >
          Источник
        </p>
        <p
          className="mt-1.5 text-[16px] font-semibold tracking-[-0.02em] sm:text-[17px]"
          style={{ ...wsSans, color: panel.text }}
        >
          {source === "cabinet" ? `Кабинет ${marketplaceLabel}` : "Только по тексту отзыва"}
        </p>
      </div>
      <WsModeSourceSwitch value={source} onChange={onChange} />
    </div>
  );
}

export function WorkspaceModePanel({
  usage,
  marketplaceLabel,
  connectionOk,
  mpSettings,
  onPatchMp,
  onSetUsage,
  onGoIntegration,
}: WorkspaceModePanelProps) {
  const byStar = mpSettings.starRules.byStar;
  const source: SourceMode = usage === "manual" ? "manual" : "cabinet";

  const patchStar = (star: number, mode: StarDeliveryMode) => {
    const key = String(star) as StarKey;
    onPatchMp({
      starRules: {
        byStar: {
          ...byStar,
          [key]: mode,
        },
      },
    });
  };

  const setSource = (next: SourceMode) => {
    if (next === "manual") {
      onSetUsage("manual");
      return;
    }
    onSetUsage("semi");
  };

  return (
    <div className="w-full max-w-none">
      <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:justify-between xl:gap-10">
        <div className="min-w-0 w-full max-w-[720px] flex-1 space-y-4">
          <SourceHeader source={source} marketplaceLabel={marketplaceLabel} onChange={setSource} />

          {source === "cabinet" ? (
            <>
              {!connectionOk ? (
                <div
                  className="rounded-2xl border px-4 py-3.5 text-[14px] leading-[1.6]"
                  style={{
                    ...wsSans,
                    borderColor: "rgba(10,10,10,0.14)",
                    color: panel.textMuted,
                  }}
                >
                  Подключите API в разделе{" "}
                  {onGoIntegration ? (
                    <button
                      type="button"
                      onClick={onGoIntegration}
                      className="font-semibold text-[#0A0A0A] underline decoration-[#0a0a0a]/25 underline-offset-[3px] transition hover:decoration-[#2E5A43]"
                    >
                      «Кабинет и API»
                    </button>
                  ) : (
                    "«Кабинет и API»"
                  )}
                  .
                </div>
              ) : null}

              <WsOutlinePanel accent>
                <div
                  className="hidden border-b px-6 py-4 sm:grid sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-8"
                  style={{ borderColor: "rgba(10,10,10,0.08)" }}
                >
                  <span />
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <span
                      className="text-[13px] font-medium"
                      style={{ ...wsSans, color: panel.textSubtle }}
                    >
                      Полуавтоматический
                    </span>
                    <span
                      className="text-[13px] font-medium"
                      style={{ ...wsSans, color: panel.textSubtle }}
                    >
                      Автоматический
                    </span>
                  </div>
                </div>

                <div>
                  {STAR_KEYS.map((key, index) => {
                    const stars = Number(key);
                    return (
                      <WsModeStarRow
                        key={key}
                        stars={stars}
                        value={byStar[key]}
                        onChange={(mode) => patchStar(stars, mode)}
                        last={index === STAR_KEYS.length - 1}
                      />
                    );
                  })}
                </div>
              </WsOutlinePanel>
            </>
          ) : (
            <WsOutlinePanel className="px-6 py-8">
              <p
                className="max-w-[36rem] text-[15px] leading-[1.7]"
                style={{ ...wsSans, color: panel.textMuted }}
              >
                Вы вставляете текст отзыва вручную — KARTO генерирует ответ. Настройка по звёздам не
                нужна.
              </p>
            </WsOutlinePanel>
          )}
        </div>

        {source === "cabinet" ? (
          <aside className="w-full shrink-0 space-y-3 xl:w-[372px] xl:sticky xl:top-8 xl:self-start">
            <WorkspaceReviewScopePanel
              reviewScope={mpSettings.reviewScope}
              onPatch={(patch) => onPatchMp({ reviewScope: patch })}
            />
            {source === "cabinet" ? <WorkspaceTelegramPanel usage={usage} /> : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
