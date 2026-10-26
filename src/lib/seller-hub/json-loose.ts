/** Достаёт первый JSON-объект из ответа модели (с обрамляющим текстом и ограждением кода). Без серверных зависимостей. */
export function extractJsonLoose(text: string): unknown | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
