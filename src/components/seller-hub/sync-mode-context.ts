"use client";

import { createContext, useContext } from "react";

/**
 * Режим данных раздела: при "background" сервер сам читает WB (каталог, новости, историю) и кладёт в нашу базу,
 * а вкладки только показывают готовое и не обращаются к WB через свои маршруты.
 */
export type SellerHubSyncMode = "unknown" | "browser" | "background";

export const SellerHubSyncModeContext = createContext<SellerHubSyncMode>("browser");

export function useSellerHubSyncMode(): SellerHubSyncMode {
  return useContext(SellerHubSyncModeContext);
}
