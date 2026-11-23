"use client";

import type { ReactNode } from "react";
import type { AutoRepliesShopSettings, ToneKind } from "@/lib/auto-replies/settings-types";
import {
  EMPTY_REVIEW_MAX_LENGTH,
} from "@/lib/auto-replies/empty-review-settings";
import {
  WsGlassOptionTrack,
  WsGlassPanel,
  WsGlassRadioCard,
  WsGlassSectionTitle,
  WsGlassToggleRow,
  glass,
  panel,
  wsSans,
} from "./settings-ui";

type WorkspaceStylePanelProps = {
  style: AutoRepliesShopSettings["style"];
  onPatchStyle: (patch: Partial<AutoRepliesShopSettings["style"]>) => void;
};

const TONE_OPTIONS: { value: ToneKind; label: string }[] = [
  { value: "warm", label: "Тёплый" },
  { value: "neutral", label: "Нейтральный" },
  { value: "formal", label: "Официальный" },
];

const LENGTH_OPTIONS = [
  { value: "auto" as const, label: "Авто" },
  { value: "short" as const, label: "Краткий" },
  { value: "normal" as const, label: "Обычный" },
  { value: "long" as const, label: "Развёрнутый" },
];

function GlassSettingBlock({
  title,
  hint,
  children,
  compactTrack,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  compactTrack?: boolean;
}) {
  return (
    <div
      className="border-b px-5 py-4 last:border-b-0 sm:px-6"
      style={{ borderColor: glass.borderSoft }}
    >
      <p className="text-[14px] font-semibold tracking-[-0.01em]" style={{ ...wsSans, color: panel.text }}>
        {title}
      </p>
      {hint ? (
        <p className="mt-1 text-[12px] leading-[1.55]" style={{ ...wsSans, color: panel.textMuted }}>
          {hint}
        </p>
      ) : null}
      <div className={`mt-3 ${compactTrack ? "max-w-md" : "max-w-lg"}`}>{children}</div>
    </div>
  );
}

export function WorkspaceStylePanel({ style, onPatchStyle }: WorkspaceStylePanelProps) {
  const patch = (next: Partial<AutoRepliesShopSettings["style"]>) =>
    onPatchStyle({ ...next, preset: "custom" });

  return (
    <div className="w-full max-w-[880px] space-y-5 pb-4">
      <WsGlassPanel>
        <WsGlassSectionTitle
          title="Обращение и содержание"
          hint="Как обращаться к покупателю и что упоминать в тексте."
        />

        <GlassSettingBlock title="Формат обращения" hint="«Вы» — официально, «ты» — ближе.">
          <div className="max-w-lg space-y-2">
            <WsGlassRadioCard
              selected={style.addressForm === "vy"}
              title="На «вы»"
              description="Здравствуйте, спасибо за отзыв."
              onClick={() => patch({ addressForm: "vy" })}
            />
            <WsGlassRadioCard
              selected={style.addressForm === "ty"}
              title="На «ты»"
              description="Привет, спасибо — дружелюбнее."
              onClick={() => patch({ addressForm: "ty" })}
            />
          </div>
        </GlassSettingBlock>

        <WsGlassToggleRow
          label="Обращение по имени"
          hint="Имя из профиля покупателя, если доступно."
          checked={style.useBuyerName}
          onChange={(useBuyerName) => patch({ useBuyerName })}
        />

        <WsGlassToggleRow
          label="Упоминать товар"
          hint="Название из карточки товара."
          checked={style.mentionProduct}
          onChange={(mentionProduct) => patch({ mentionProduct })}
        />

        <GlassSettingBlock title="Длина ответа" hint="Объём текста в одном ответе." compactTrack>
          <WsGlassOptionTrack
            value={style.length}
            options={LENGTH_OPTIONS}
            onChange={(length) => patch({ length })}
          />
        </GlassSettingBlock>

        <WsGlassToggleRow
          label="Эмодзи"
          hint="Подставляются автоматически, если включено."
          checked={style.emojis}
          onChange={(emojis) => patch({ emojis })}
        />

        <WsGlassToggleRow
          label="Благодарность за фото"
          hint="Если покупатель приложил фото."
          checked={style.thankForPhotos}
          onChange={(thankForPhotos) => patch({ thankForPhotos })}
        />

        <div>
          <WsGlassToggleRow
            label="Отзыв без текста"
            hint="Только оценка — свой короткий шаблон вместо обычного ответа."
            checked={style.emptyReviewEnabled}
            onChange={(emptyReviewEnabled) => patch({ emptyReviewEnabled })}
          />
          {style.emptyReviewEnabled ? (
            <div className="px-5 pb-4 sm:px-6">
              <textarea
                value={style.emptyReviewCustomText}
                onChange={(e) =>
                  patch({
                    emptyReviewCustomText: e.target.value.slice(0, EMPTY_REVIEW_MAX_LENGTH),
                  })
                }
                rows={2}
                placeholder="Спасибо за оценку!"
                className="w-full resize-y rounded-[0.95rem] border px-3.5 py-2.5 text-[14px] leading-[1.6] transition focus:outline-none focus:ring-2"
                style={{
                  ...wsSans,
                  borderColor: glass.borderSoft,
                  backgroundColor: "rgba(255,255,255,0.35)",
                  color: panel.text,
                }}
              />
              <p className="mt-1.5 text-[11px]" style={{ ...wsSans, color: panel.textSubtle }}>
                {style.emptyReviewCustomText.length}/{EMPTY_REVIEW_MAX_LENGTH}
              </p>
            </div>
          ) : null}
        </div>

        <GlassSettingBlock
          title="Доставка в тексте"
          hint="Желательно для уточнения ИИ — кто доставлял заказ: маркетплейс или ваш магазин."
          compactTrack
        >
          <WsGlassOptionTrack
            value={style.deliveryContext}
            options={[
              { value: "ignore", label: "Не учитывать" },
              { value: "marketplace", label: "Маркетплейс" },
              { value: "seller", label: "Своя" },
            ]}
            onChange={(deliveryContext) => patch({ deliveryContext })}
          />
        </GlassSettingBlock>
      </WsGlassPanel>

      <WsGlassPanel>
        <WsGlassSectionTitle
          title="Тон по типу отзыва"
          hint="Отдельный тон для положительных, нейтральных и негативных."
        />

        {(
          [
            ["tonePositive", "Положительные", "4–5★"],
            ["toneNeutral", "Нейтральные", "3★"],
            ["toneNegative", "Отрицательные", "1–2★"],
          ] as const
        ).map(([key, title, hint]) => (
          <GlassSettingBlock key={key} title={title} hint={hint} compactTrack>
            <WsGlassOptionTrack
              value={style[key]}
              options={TONE_OPTIONS}
              onChange={(v) => patch({ [key]: v })}
            />
          </GlassSettingBlock>
        ))}
      </WsGlassPanel>
    </div>
  );
}
