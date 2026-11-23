"use client";

import { useEffect, useState } from "react";
import { loadStoredSellerHubTasks } from "@/lib/seller-hub/task-engine/client";
import type { SellerTask, TaskCategory } from "@/lib/seller-hub/task-engine/types";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { TASK_CACHE } from "./task-cache";
import { registerHubCache } from "./hub-cache-registry";

const CACHE = registerHubCache(new Map<string, { at: number; tasks: SellerTask[] }>());
const FRESH_MS = 5 * 60 * 1000;
const RANK: Record<string, number> = { critical: 0, important: 1, opportunity: 2 };

/**
 * Настоящие задачи платформы для нужных категорий: их видно в любом разделе, где человек оказался,
 * а «В задачи» ведёт в раздел «Задачи» уже с этой категорией. Кэшируется, чтобы при переходах между вкладками не грузить заново.
 */
export function useSectionTasks(snapshot: SellerCatalogSnapshot | undefined, connected: boolean | undefined, categories: TaskCategory[], typePrefixes: string[] = []) {
  const key = connected && snapshot ? `${snapshot.marketplaceId}:${snapshot.syncedAt}` : "";
  const [state, setState] = useState<{ key: string; tasks: SellerTask[] } | null>(null);

  useEffect(() => {
    if (!key || !snapshot) return;
    let cancelled = false;
    const cached = CACHE.get(key);
    if (cached) {
      void Promise.resolve().then(() => {
        if (!cancelled) setState({ key, tasks: cached.tasks });
      });
      if (Date.now() - cached.at < FRESH_MS) {
        return () => {
          cancelled = true;
        };
      }
    }
    // Сервер иногда не отвечает вовремя: пробуем ещё дважды, а пустой список из-за сбоя не запоминаем.
    const attempt = (left: number): void => {
      void loadStoredSellerHubTasks(snapshot)
        .then((rows) => {
          CACHE.set(key, { at: Date.now(), tasks: rows });
          if (!TASK_CACHE.has(snapshot.marketplaceId)) TASK_CACHE.set(snapshot.marketplaceId, rows);
          if (!cancelled) setState({ key, tasks: rows });
        })
        .catch(() => {
          if (cancelled) return;
          if (left > 0) retryTimer = setTimeout(() => attempt(left - 1), 2500);
          else setState((prev) => prev ?? { key, tasks: [] });
        });
    };
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    attempt(2);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
    // snapshot целиком определяется key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const ready = state != null && state.key === key;
  const wanted = new Set<string>(categories);
  const tasks = ready
    ? state.tasks
        .filter((t) => (wanted.has(t.category) || typePrefixes.some((p) => t.type.startsWith(p))) && (t.status === "active" || t.status === "in_progress"))
        .sort((a, b) => (RANK[a.severity] ?? 3) - (RANK[b.severity] ?? 3) || b.score - a.score)
    : [];
  return { tasks, loading: Boolean(key) && !ready };
}
