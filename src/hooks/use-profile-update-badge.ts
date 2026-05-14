"use client";

import * as React from "react";

const STORAGE_KEY = "karto_ack_profile_update";

/**
 * Увеличьте версию, когда нужно снова показать бейдж «Обновление» у личного кабинета.
 */
export const PROFILE_UPDATE_VERSION = "2026-05-11-profile-cabinet-v8-dismiss";

const EVENT = "karto-profile-update-dismissed";

export function acknowledgeProfileUpdate(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, PROFILE_UPDATE_VERSION);
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    // ignore quota / private mode
  }
}

export function useProfileUpdateBadge() {
  const [showBadge, setShowBadge] = React.useState(false);

  const syncFromStorage = React.useCallback(() => {
    try {
      setShowBadge(localStorage.getItem(STORAGE_KEY) !== PROFILE_UPDATE_VERSION);
    } catch {
      setShowBadge(false);
    }
  }, []);

  React.useEffect(() => {
    syncFromStorage();
    window.addEventListener(EVENT, syncFromStorage);
    return () => window.removeEventListener(EVENT, syncFromStorage);
  }, [syncFromStorage]);

  const dismissProfileUpdateBadge = React.useCallback(() => {
    acknowledgeProfileUpdate();
    setShowBadge(false);
  }, []);

  return { showBadge, dismissProfileUpdateBadge };
}
