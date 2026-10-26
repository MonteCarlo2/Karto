import { moscowDateKey } from "./complete-days";

/**
 * Суточный предохранитель платных вызовов нейросети по пользователю (в памяти процесса: защита от петли и ошибки в данных,
 * а не учёт денег). Считаем только вызовы, которые реально пошли в нейросеть, повторное использование из кэша не в счёт.
 */
const usage = new Map<string, number>();

export function takeAiBudget(userId: string, kind: string, dailyCap: number, nowMs = Date.now()): { ok: true } | { ok: false; error: string } {
  const key = `${moscowDateKey(nowMs)}|${userId}|${kind}`;
  const used = usage.get(key) ?? 0;
  if (used >= dailyCap) {
    return { ok: false, error: `Достигнут суточный лимит платных разборов (${dailyCap}). Он защищает от лишних трат: продолжите завтра.` };
  }
  usage.set(key, used + 1);
  // Чистим вчерашние записи.
  for (const k of usage.keys()) if (!k.startsWith(moscowDateKey(nowMs))) usage.delete(k);
  return { ok: true };
}