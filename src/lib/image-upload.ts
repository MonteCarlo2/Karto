/**
 * Подготовка фото к отправке на сервер (только в браузере).
 * Большие картинки (4K-результат генерации, экспорт из Figma, фото с камеры) в base64 легко превышают 10 МБ, и сервер обрезает запрос.
 * Поэтому крупный файл уменьшаем до разумной стороны и сохраняем как JPEG; маленький отдаём как есть, без потери качества.
 */

/** Сторона, больше которой референс не нужен: для модели хватает 2048 px. */
export const UPLOAD_MAX_SIDE = 2048;
/** Файлы меньше этого размера и не больше по стороне отдаём без перекодирования. */
const PASS_THROUGH_BYTES = 1_500_000;
/** Потолок готовой строки data URL: с запасом ниже лимита сервера в 10 МБ. */
const MAX_DATA_URL_CHARS = 6_500_000;

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Не удалось прочитать файл")));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(blob);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось открыть изображение. Попробуйте JPG или PNG."));
    };
    img.src = url;
  });
}

function encode(img: HTMLImageElement, maxSide: number, quality: number): string {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Не удалось подготовить изображение");
  // JPEG без прозрачности: прозрачный фон PNG заливаем белым, иначе он станет чёрным.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Файл → data URL, не тяжелее ~6,5 млн символов. Бросает понятную ошибку, если картинку не удалось уложить. */
export async function prepareImageDataUrl(file: File, opts: { maxSide?: number } = {}): Promise<string> {
  const maxSide = opts.maxSide ?? UPLOAD_MAX_SIDE;
  const img = await loadImage(file);
  const fits = Math.max(img.naturalWidth, img.naturalHeight) <= maxSide;
  if (fits && file.size <= PASS_THROUGH_BYTES && /^image\/(jpeg|png|webp)$/i.test(file.type)) {
    const raw = await readAsDataUrl(file);
    if (raw.length <= MAX_DATA_URL_CHARS) return raw;
  }
  // Ступенчато: сначала мягкое сжатие, затем меньше сторона, пока не уложимся.
  const steps: Array<[number, number]> = [
    [maxSide, 0.9],
    [maxSide, 0.8],
    [Math.round(maxSide * 0.75), 0.8],
    [Math.round(maxSide * 0.5), 0.75],
  ];
  for (const [side, quality] of steps) {
    const out = encode(img, side, quality);
    if (out.length <= MAX_DATA_URL_CHARS) return out;
  }
  throw new Error("Изображение слишком большое. Уменьшите его и загрузите снова.");
}
