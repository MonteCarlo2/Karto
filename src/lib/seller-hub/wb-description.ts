/** Текст описания, который и показываем, и отправляем в поле description WB. Рич-блоки API сюда не входят. */
export function descriptionForWb(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const WB_DESCRIPTION_LIMIT = 5000;
