"use client";

import { useState } from "react";

/**
 * Сколько строк списка показывать: сначала первые, дальше по кнопке «Показать ещё». При смене фильтра или поиска (resetKey) счёт начинается заново.
 * Нужен, чтобы список из 5 и из 5000 строк выглядел и работал одинаково, а ничего не обрезалось молча.
 */
export function usePagedLimit(resetKey: string, first = 100, step = 100) {
  const [state, setState] = useState({ key: resetKey, n: first });
  const n = state.key === resetKey ? state.n : first;
  return { limit: n, more: () => setState({ key: resetKey, n: n + step }), step };
}
