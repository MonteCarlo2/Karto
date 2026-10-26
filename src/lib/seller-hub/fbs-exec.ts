import { manageSellerHubSupply } from "@/lib/seller-hub/client-api";

/** Сколько заданий отправляем в поставку за один запрос: небольшими пачками, чтобы WB не отклонил запрос целиком. */
export const SUPPLY_CHUNK = 100;

export type BuildSupplyResult = { ok: boolean; supplyId?: string; added: number; error?: string };

/**
 * Создаёт новую поставку FBS и добавляет в неё задания. Запись в WB: вызывать только после подтверждения человеком.
 * Если часть пачек не добавилась, результат честно говорит, сколько заданий всё же в поставке.
 */
export async function buildSupplyFromOrders(orderIds: number[], name?: string): Promise<BuildSupplyResult> {
  if (orderIds.length === 0) return { ok: false, added: 0, error: "Нет заказов для поставки" };
  let created: Awaited<ReturnType<typeof manageSellerHubSupply>>;
  try {
    created = await manageSellerHubSupply({ action: "create", supplyName: name ?? `Поставка ${new Date().toLocaleDateString("ru-RU")}` });
  } catch (e) {
    return { ok: false, added: 0, error: e instanceof Error ? e.message : "Не удалось создать поставку" };
  }
  if (!created.ok || !created.supplyId) return { ok: false, added: 0, error: created.error ?? "Не удалось создать поставку" };
  const supplyId = created.supplyId;
  let added = 0;
  for (let i = 0; i < orderIds.length; i += SUPPLY_CHUNK) {
    const chunk = orderIds.slice(i, i + SUPPLY_CHUNK);
    let failure: string | null = null;
    try {
      const res = await manageSellerHubSupply({ action: "add_orders", supplyId, orderIds: chunk });
      if (!res.ok) failure = res.error ?? "ошибка WB";
    } catch (e) {
      failure = e instanceof Error ? e.message : "ошибка сети";
    }
    // Номер поставки отдаём всегда: она уже создана в WB, и человеку нужно знать, где остались заказы.
    if (failure) return { ok: false, supplyId, added, error: `Поставка ${supplyId} создана, в неё добавлено ${added} из ${orderIds.length} заказов: ${failure}` };
    added += chunk.length;
  }
  return { ok: true, supplyId, added };
}
