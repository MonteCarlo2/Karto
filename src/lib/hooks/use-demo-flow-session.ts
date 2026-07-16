"use client";

import { useCallback, useEffect, useState } from "react";

export type DemoSessionMeta = {
  isDemo: boolean;
  visualLimit: number | null;
  visualRemaining: number | null;
};

const EMPTY: DemoSessionMeta = {
  isDemo: false,
  visualLimit: null,
  visualRemaining: null,
};

/**
 * Читает флаг демо-сессии из localStorage и подтягивает метаданные с /api/supabase/session-meta.
 */
export function useDemoFlowSession(sessionId: string | null): DemoSessionMeta & {
  refresh: () => Promise<void>;
} {
  const [meta, setMeta] = useState<DemoSessionMeta>(() => {
    if (typeof window === "undefined") return EMPTY;
    return {
      ...EMPTY,
      isDemo: localStorage.getItem("karto_session_is_demo") === "1",
    };
  });

  const refresh = useCallback(async () => {
    if (!sessionId) {
      const cached =
        typeof window !== "undefined" && localStorage.getItem("karto_session_is_demo") === "1";
      setMeta({ ...EMPTY, isDemo: cached });
      return;
    }
    try {
      const res = await fetch(
        `/api/supabase/session-meta?session_id=${encodeURIComponent(sessionId)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      const isDemo = Boolean(data.is_demo);
      if (typeof window !== "undefined") {
        localStorage.setItem("karto_session_is_demo", isDemo ? "1" : "0");
      }
      setMeta({
        isDemo,
        visualLimit: data.visual_quota?.limit ?? null,
        visualRemaining: data.visual_quota?.remaining ?? null,
      });
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...meta, refresh };
}
