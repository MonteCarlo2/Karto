import { downloadImage, getPublicUrl } from "@/lib/services/image-processing";

/**
 * Сохраняет результат KIE локально и возвращает URL через /api/serve-file или /temp/*
 * (тот же контур, что у карточек). Так превью стабильно отображается в браузере без прав на публичный bucket.
 */
export async function persistBrandLogoForPreview(remoteUrl: string): Promise<string> {
  const filepath = await downloadImage(remoteUrl);
  return getPublicUrl(filepath);
}
