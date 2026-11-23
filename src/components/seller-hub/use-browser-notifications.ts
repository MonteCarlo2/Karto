"use client";

import { useEffect, useRef } from "react";
import { pickNewForBrowser, playChime, showBrowserNotification } from "@/lib/seller-hub/browser-notify";
import { RETIRED_EVENT_KINDS, type SellerProductEvent } from "@/lib/seller-hub/event-engine/types";
import { useUserSetting } from "./use-user-setting";

const SEEN_LIMIT = 400;

/**
 * Показывает уведомление браузера со звуком, когда появилось новое важное событие, а вы смотрите на другую вкладку.
 * Первая загрузка только запоминает уже имеющиеся события, чтобы старая лента не сыпалась уведомлениями. Нужно разрешение браузера (просится в «Уведомлениях»).
 */
export function useBrowserNotifications(input: { userId: string | null; events: SellerProductEvent[]; ready: boolean; onOpen: () => void }) {
  const { userId, events, ready, onOpen } = input;
  const [enabled] = useUserSetting<boolean>("notify.browser", true);
  const [sound] = useUserSetting<boolean>("notify.sound", true);
  const seen = useRef<Set<string> | null>(null);
  const open = useRef(onOpen);
  open.current = onOpen;

  useEffect(() => {
    if (!userId || !ready) return;
    const key = `karto.notify.seen.${userId}`;
    if (!seen.current) {
      let stored: string[] = [];
      try {
        stored = JSON.parse(window.localStorage.getItem(key) ?? "[]") as string[];
      } catch {
        stored = [];
      }
      // Первый запуск на этом устройстве: всё, что уже есть, считаем виденным.
      seen.current = new Set(stored.length > 0 ? stored : events.map((e) => e.id));
    }
    const fresh = pickNewForBrowser(events, seen.current, Date.now(), RETIRED_EVENT_KINDS);
    const away = typeof document !== "undefined" && (document.visibilityState === "hidden" || !document.hasFocus());
    if (enabled && away && fresh.length > 0) {
      const first = fresh[0]!;
      const shown = showBrowserNotification({
        title: fresh.length > 1 ? `KARTO: новых событий ${fresh.length}` : first.title,
        body: fresh.length > 1 ? fresh.slice(0, 3).map((e) => e.title).join("; ") : first.detail || first.productTitle || "",
        tag: "karto-events",
        onClick: () => open.current(),
      });
      if (shown && sound) playChime();
    }
    for (const e of events) seen.current.add(e.id);
    try {
      window.localStorage.setItem(key, JSON.stringify(Array.from(seen.current).slice(-SEEN_LIMIT)));
    } catch {
      /* память браузера недоступна: не критично */
    }
  }, [userId, ready, events, enabled, sound]);
}
