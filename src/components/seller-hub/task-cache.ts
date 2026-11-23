import type { SellerTask } from "@/lib/seller-hub/task-engine/types";
import { registerHubCache } from "./hub-cache-registry";

/** Последние загруженные задачи по кабинету. Панели в других разделах кладут сюда список, раздел «Задачи» показывает его сразу и обновляет в фоне. */
export const TASK_CACHE = registerHubCache(new Map<string, SellerTask[]>());
