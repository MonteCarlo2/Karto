"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { autoRepliesAuthorizedFetch } from "@/lib/auto-replies/auto-replies-fetch";
import { isValidUserSetting, type UserSettingKey } from "@/lib/seller-hub/user-settings";

/** Один запрос за все настройки на загрузку страницы; потом читаем из памяти. */
let settingsPromise: Promise<Partial<Record<UserSettingKey, unknown>>> | null = null;

function loadAllSettings(): Promise<Partial<Record<UserSettingKey, unknown>>> {
  if (!settingsPromise) {
    settingsPromise = (async () => {
      try {
        const res = await autoRepliesAuthorizedFetch("/api/seller-hub/user-settings", { method: "GET", timeoutMs: 15_000 });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; settings?: Partial<Record<UserSettingKey, unknown>> };
        return res.ok && data.ok && data.settings ? data.settings : {};
      } catch {
        return {};
      }
    })();
  }
  return settingsPromise;
}

/**
 * Настройка пользователя, сохраняемая в Supabase и общая для всех устройств.
 * Пока настройки не пришли, показывается значение по умолчанию; на сервер пишем только то, что человек изменил сам.
 */
export function useUserSetting<T extends string | number | boolean>(
  key: UserSettingKey,
  fallback: T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(fallback);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void loadAllSettings().then((settings) => {
      if (cancelled || touched.current) return;
      const stored = settings[key];
      if (stored !== undefined && typeof stored === typeof fallback) setValue(stored as T);
    });
    return () => {
      cancelled = true;
    };
    // fallback — константа по умолчанию, перезапуск при её смене не нужен
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T) => {
      touched.current = true;
      setValue(next);
      if (!isValidUserSetting(key, next)) return;
      // Общий кэш настроек живёт до перезагрузки страницы: обновляем его сразу, иначе при возврате на экран (повторном монтировании)
      // компонент прочитал бы устаревшее значение, пока запись на сервер ещё не прошла или вообще не перечитывалась.
      void settingsPromise?.then((cached) => {
        (cached as Record<string, unknown>)[key] = next;
      });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void autoRepliesAuthorizedFetch("/api/seller-hub/user-settings", {
          method: "PUT",
          body: JSON.stringify({ key, value: next }),
          timeoutMs: 15_000,
        }).catch(() => undefined);
      }, 600);
    },
    [key],
  );

  return [value, update];
}

/**
 * Как useUserSetting, но с признаком «настройки уже пришли». Нужен там, где действие нельзя начинать по значению по умолчанию:
 * например, автоматический платный анализ не должен стартовать, пока неизвестно, не выключил ли его человек.
 */
export function useUserSettingLoaded<T extends string | number | boolean>(key: UserSettingKey, fallback: T): [T, (next: T) => void, boolean] {
  const [value, setValue] = useUserSetting<T>(key, fallback);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void loadAllSettings().then(() => {
      if (!cancelled) setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return [value, setValue, loaded];
}