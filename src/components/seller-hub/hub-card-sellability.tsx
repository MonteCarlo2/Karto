"use client";

import { useState } from "react";
import { readSellerHubCardSellability } from "@/lib/seller-hub/client-api";
import { hub, hubSans } from "./hub-ui";

export function CardSellability({
  title,
  description,
  brand,
  category,
  photos,
  hasVideo,
  dimensions,
}: {
  title: string;
  description: string;
  brand?: string;
  category?: string;
  photos: number;
  hasVideo: boolean;
  dimensions: string | null;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="mt-4">
      <button
        type="button"
        disabled={loading}
        onClick={() => {
          setLoading(true);
          setError(null);
          void readSellerHubCardSellability({
            title,
            description,
            brand,
            category,
            photos,
            hasVideo,
            dimensions,
          }).then((result) => {
            setLoading(false);
            if (!result.ok || !result.text) {
              setText(null);
              setError(result.error ?? "Разбор не собрался");
              return;
            }
            setText(result.text);
          });
        }}
        className="inline-flex h-10 items-center rounded-[11px] border-2 bg-white px-3.5 text-[13.5px] font-semibold outline-none hover:bg-[#F4F6F8] disabled:opacity-45"
        style={{ ...hubSans, borderColor: hub.ink, color: hub.ink }}
      >
        {loading ? "Читаю карточку" : "Разобрать продажность"}
      </button>
      <p className="mt-2 text-[12px] leading-[1.45]" style={{ ...hubSans, color: hub.textMuted }}>
        Два прохода модели: первый читает название и описание, второй не выпускает текст, если в нём появились чужие цифры. Это не оценка из таблицы и не данные Wildberries.
      </p>
      {error ? (
        <p className="mt-2 text-[13px] leading-5" style={{ ...hubSans, color: hub.danger }}>{error}</p>
      ) : null}
      {text ? (
        <p className="mt-3 whitespace-pre-wrap text-[15px] leading-6" style={{ ...hubSans, color: hub.text }}>{text}</p>
      ) : null}
    </div>
  );
}
