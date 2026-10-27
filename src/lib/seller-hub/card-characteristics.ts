/** Правка характеристик поверх прочитанной карточки: меняется только названное по идентификатору, остальное сохраняется как есть. */
export function mergeCharacteristics(current: unknown[], patch: Array<{ id: number; value: string | number; numeric?: boolean }> | undefined): unknown[] {
  if (!Array.isArray(patch) || patch.length === 0) return current;
  const next = [...current] as Array<{ id?: number; value?: unknown }>;
  for (const change of patch.slice(0, 10)) {
    if (!Number.isInteger(change.id) || change.id <= 0) continue;
    const value = change.numeric ? Number(change.value) : [String(change.value).trim().slice(0, 200)];
    if (change.numeric ? !Number.isFinite(value as number) : !(value as string[])[0]) continue;
    const index = next.findIndex((row) => row && row.id === change.id);
    if (index >= 0) next[index] = { ...next[index], value };
    else next.push({ id: change.id, value });
  }
  return next;
}
