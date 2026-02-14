import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs/promises";

// В проде (Timeweb и др.) process.cwd() часто только для чтения — пишем в /tmp
const WRITABLE_BASE =
  process.env.NEXT_CACHE_DIR || process.env.TMPDIR || process.env.TEMP || "";
const USE_TMP =
  typeof WRITABLE_BASE === "string" &&
  WRITABLE_BASE.length > 0 &&
  (WRITABLE_BASE.startsWith("/tmp") || WRITABLE_BASE === "/tmp");

const TEMP_DIR = USE_TMP
  ? path.join(WRITABLE_BASE, "karto-temp")
  : path.join(process.cwd(), "public", "temp");
const OUTPUT_DIR = USE_TMP
  ? path.join(WRITABLE_BASE, "karto-output")
  : path.join(process.cwd(), "public", "output");

// Убеждаемся что директории существуют
async function ensureDirs() {
  await fs.mkdir(TEMP_DIR, { recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

/**
 * Скачивание изображения по URL и сохранение локально
 */
export async function downloadImage(url: string): Promise<string> {
  await ensureDirs();
  
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  
  const filename = `${uuidv4()}.png`;
  const filepath = path.join(TEMP_DIR, filename);
  
  await fs.writeFile(filepath, buffer);
  
  return filepath;
}

/**
 * Сохранение base64 изображения в файл
 */
export async function saveBase64Image(base64: string): Promise<string> {
  await ensureDirs();
  
  // Удаляем data:image/... префикс если есть
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");
  
  const filename = `${uuidv4()}.png`;
  const filepath = path.join(TEMP_DIR, filename);
  
  await fs.writeFile(filepath, buffer);
  
  return filepath;
}

/**
 * Композитинг: наложение товара на фон
 */
export async function compositeImages(
  productPath: string,
  backgroundPath: string,
  options: {
    productScale?: number; // Масштаб товара (0.5 = 50% размера)
    positionX?: number; // Позиция X (0-1, где 0.5 = центр)
    positionY?: number; // Позиция Y (0-1, где 0.5 = центр)
    addShadow?: boolean; // Добавить тень под товаром
  } = {}
): Promise<string> {
  await ensureDirs();
  
  const {
    productScale = 0.7,
    positionX = 0.5,
    positionY = 0.55, // Чуть ниже центра
    addShadow = true,
  } = options;

  // Загружаем фон
  const background = sharp(backgroundPath);
  const bgMetadata = await background.metadata();
  const bgWidth = bgMetadata.width || 1024;
  const bgHeight = bgMetadata.height || 1024;

  // Загружаем товар и масштабируем
  let product = sharp(productPath);
  const productMetadata = await product.metadata();
  const productWidth = productMetadata.width || 500;
  const productHeight = productMetadata.height || 500;

  // Вычисляем новый размер товара
  const maxProductWidth = Math.floor(bgWidth * productScale);
  const maxProductHeight = Math.floor(bgHeight * productScale);
  
  // Сохраняем пропорции
  const scale = Math.min(
    maxProductWidth / productWidth,
    maxProductHeight / productHeight
  );
  
  const newWidth = Math.floor(productWidth * scale);
  const newHeight = Math.floor(productHeight * scale);

  // Масштабируем товар
  const resizedProduct = await product
    .resize(newWidth, newHeight, { fit: "inside" })
    .toBuffer();

  // Вычисляем позицию
  const left = Math.floor((bgWidth - newWidth) * positionX);
  const top = Math.floor((bgHeight - newHeight) * positionY);

  // Создаем тень если нужно
  let layers: sharp.OverlayOptions[] = [];
  
  if (addShadow) {
    // Создаем размытую тень от товара
    const shadowBuffer = await sharp(resizedProduct)
      .ensureAlpha()
      .modulate({ brightness: 0 }) // Делаем черным
      .blur(20) // Размываем
      .composite([{
        input: Buffer.from([0, 0, 0, 100]), // Полупрозрачный черный
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: "dest-in"
      }])
      .toBuffer();
    
    // Добавляем тень (чуть ниже товара)
    layers.push({
      input: shadowBuffer,
      top: top + 30,
      left: left + 10,
      blend: "multiply" as const,
    });
  }

  // Добавляем товар поверх
  layers.push({
    input: resizedProduct,
    top: top,
    left: left,
  });

  // Композитинг
  const outputFilename = `${uuidv4()}.png`;
  const outputPath = path.join(OUTPUT_DIR, outputFilename);

  await background
    .composite(layers)
    .png()
    .toFile(outputPath);

  return `/output/${outputFilename}`;
}

/**
 * Создание инвертированной маски из изображения с прозрачным фоном
 * Продукт = черный (сохраняется), Фон = белый (заменяется)
 */
export async function createInvertedMask(
  segmentedImagePath: string,
  targetWidth: number = 1024,
  targetHeight: number = 1024
): Promise<string> {
  await ensureDirs();
  
  const image = sharp(segmentedImagePath);
  const metadata = await image.metadata();
  const origWidth = metadata.width || 500;
  const origHeight = metadata.height || 500;
  
  // Вычисляем масштаб чтобы продукт занимал ~60% высоты
  const scale = Math.min(
    (targetWidth * 0.7) / origWidth,
    (targetHeight * 0.6) / origHeight
  );
  
  const newWidth = Math.floor(origWidth * scale);
  const newHeight = Math.floor(origHeight * scale);
  
  // Позиционируем продукт внизу по центру
  const left = Math.floor((targetWidth - newWidth) / 2);
  const top = Math.floor(targetHeight - newHeight - targetHeight * 0.1); // 10% отступ снизу
  
  // Создаем белый фон (область для inpainting)
  const whiteBackground = await sharp({
    create: {
      width: targetWidth,
      height: targetHeight,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .png()
    .toBuffer();
  
  // Масштабируем продукт
  const resizedProduct = await image
    .resize(newWidth, newHeight, { fit: "inside" })
    .ensureAlpha()
    .toBuffer();
  
  // Извлекаем альфа-канал и инвертируем (продукт = черный)
  const alphaChannel = await sharp(resizedProduct)
    .extractChannel("alpha")
    .negate() // Инвертируем: прозрачное становится белым, непрозрачное - черным
    .toBuffer();
  
  // Расширяем альфа до размера канваса (используем 3 канала для совместимости)
  const expandedAlpha = await sharp({
    create: {
      width: targetWidth,
      height: targetHeight,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }, // Белый = область для замены
    },
  })
    .composite([
      {
        input: alphaChannel,
        left: left,
        top: top,
      },
    ])
    .png()
    .toBuffer();
  
  // Конвертируем в RGB маску
  const maskFilename = `mask_${uuidv4()}.png`;
  const maskPath = path.join(TEMP_DIR, maskFilename);
  
  await sharp(expandedAlpha)
    .toColourspace("srgb")
    .png()
    .toFile(maskPath);
  
  return maskPath;
}

/**
 * Подготовка оригинального изображения для inpainting
 * Ресайзим и центрируем продукт на белом фоне
 */
export async function prepareImageForInpainting(
  segmentedImagePath: string,
  targetWidth: number = 1024,
  targetHeight: number = 1024
): Promise<string> {
  await ensureDirs();
  
  const image = sharp(segmentedImagePath);
  const metadata = await image.metadata();
  const origWidth = metadata.width || 500;
  const origHeight = metadata.height || 500;
  
  // Вычисляем масштаб чтобы продукт занимал ~60% высоты
  const scale = Math.min(
    (targetWidth * 0.7) / origWidth,
    (targetHeight * 0.6) / origHeight
  );
  
  const newWidth = Math.floor(origWidth * scale);
  const newHeight = Math.floor(origHeight * scale);
  
  // Позиционируем продукт внизу по центру
  const left = Math.floor((targetWidth - newWidth) / 2);
  const top = Math.floor(targetHeight - newHeight - targetHeight * 0.1);
  
  // Масштабируем продукт
  const resizedProduct = await image
    .resize(newWidth, newHeight, { fit: "inside" })
    .toBuffer();
  
  // Создаем белый фон и накладываем продукт
  const outputFilename = `prepared_${uuidv4()}.png`;
  const outputPath = path.join(TEMP_DIR, outputFilename);
  
  await sharp({
    create: {
      width: targetWidth,
      height: targetHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([
      {
        input: resizedProduct,
        left: left,
        top: top,
      },
    ])
    .png()
    .toFile(outputPath);
  
  return outputPath;
}

/**
 * Умное наложение текста на изображение
 * Автоматически выбирает позицию и цвет
 */
export async function addSmartTextOverlay(
  imagePath: string,
  title: string,
  subtitle?: string
): Promise<string> {
  await ensureDirs();

  // Определяем является ли путь относительным (публичный URL) или абсолютным
  let absolutePath = imagePath;
  if (imagePath.startsWith("/")) {
    absolutePath = path.join(process.cwd(), "public", imagePath);
  }

  const image = sharp(absolutePath);
  const metadata = await image.metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1024;

  // Анализируем верхнюю часть изображения для выбора цвета текста
  const topSection = await sharp(absolutePath)
    .extract({ left: 0, top: 0, width: width, height: Math.floor(height * 0.3) })
    .stats();
  
  // Определяем светлый или темный фон сверху
  const avgBrightness = (topSection.channels[0].mean + topSection.channels[1].mean + topSection.channels[2].mean) / 3;
  const textColor = avgBrightness > 128 ? "#1a1a2e" : "#ffffff";
  const shadowColor = avgBrightness > 128 ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";

  // Размеры шрифта
  const titleFontSize = Math.floor(width * 0.06); // ~6% ширины
  const subtitleFontSize = Math.floor(width * 0.028); // ~2.8% ширины
  
  // Позиции
  const titleY = Math.floor(height * 0.12);
  const subtitleY = titleY + titleFontSize + Math.floor(height * 0.03);
  const centerX = Math.floor(width / 2);

  // Разбиваем заголовок на строки если слишком длинный
  const maxCharsPerLine = 20;
  const titleLines: string[] = [];
  const words = title.split(" ");
  let currentLine = "";
  
  for (const word of words) {
    if ((currentLine + " " + word).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + " " + word).trim();
    } else {
      if (currentLine) titleLines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) titleLines.push(currentLine);

  // Создаем SVG с текстом
  let svgContent = "";
  let currentY = titleY;
  
  // Тень для текста
  const shadowOffset = 2;
  
  for (const line of titleLines) {
    // Экранируем специальные символы для SVG
    const escapedLine = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    // Тень
    svgContent += `<text x="${centerX + shadowOffset}" y="${currentY + shadowOffset}" font-size="${titleFontSize}" font-weight="800" fill="${shadowColor}" font-family="Arial, Helvetica, sans-serif" text-anchor="middle">${escapedLine}</text>`;
    // Текст
    svgContent += `<text x="${centerX}" y="${currentY}" font-size="${titleFontSize}" font-weight="800" fill="${textColor}" font-family="Arial, Helvetica, sans-serif" text-anchor="middle">${escapedLine}</text>`;
    
    currentY += titleFontSize + 10;
  }

  // Подзаголовок
  if (subtitle) {
    const escapedSubtitle = subtitle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    currentY += 10;
    // Тень
    svgContent += `<text x="${centerX + 1}" y="${currentY + 1}" font-size="${subtitleFontSize}" font-weight="500" fill="${shadowColor}" font-family="Arial, Helvetica, sans-serif" text-anchor="middle">${escapedSubtitle}</text>`;
    // Текст
    svgContent += `<text x="${centerX}" y="${currentY}" font-size="${subtitleFontSize}" font-weight="500" fill="${textColor}" font-family="Arial, Helvetica, sans-serif" text-anchor="middle">${escapedSubtitle}</text>`;
  }

  const svgOverlay = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${svgContent}
    </svg>
  `);

  const outputFilename = `final_${uuidv4()}.png`;
  const outputPath = path.join(OUTPUT_DIR, outputFilename);

  await image
    .composite([{ input: svgOverlay, top: 0, left: 0 }])
    .png()
    .toFile(outputPath);

  return `/output/${outputFilename}`;
}

/**
 * Добавление текста/инфографики на изображение (старый метод)
 */
export async function addTextOverlay(
  imagePath: string,
  texts: Array<{
    text: string;
    x: number;
    y: number;
    fontSize?: number;
    color?: string;
    fontWeight?: string;
  }>
): Promise<string> {
  await ensureDirs();

  const image = sharp(imagePath);
  const metadata = await image.metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1024;

  // Создаем SVG с текстом
  const svgTexts = texts.map(({ text, x, y, fontSize = 48, color = "white", fontWeight = "bold" }) => {
    const actualX = Math.floor(width * x);
    const actualY = Math.floor(height * y);
    const escapedText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<text x="${actualX}" y="${actualY}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${color}" font-family="Arial, sans-serif" text-anchor="middle">${escapedText}</text>`;
  }).join("\n");

  const svgOverlay = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${svgTexts}
    </svg>
  `);

  const outputFilename = `${uuidv4()}.png`;
  const outputPath = path.join(OUTPUT_DIR, outputFilename);

  await image
    .composite([{ input: svgOverlay, top: 0, left: 0 }])
    .png()
    .toFile(outputPath);

  return `/output/${outputFilename}`;
}

/**
 * Конвертация изображения в base64
 */
export async function imageToBase64(filepath: string): Promise<string> {
  const buffer = await fs.readFile(filepath);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

/** Путь к файлу в writable dir по имени и поддиректории (для API serve-file) */
export function getWritableFilePath(
  filename: string,
  dir: "temp" | "output"
): string {
  const base = dir === "temp" ? TEMP_DIR : OUTPUT_DIR;
  return path.join(base, path.basename(filename));
}

/** Имя файла и поддиректория (temp | output) для serve-file */
export function getServeFileParams(filepath: string): { f: string; dir: "temp" | "output" } | null {
  if (!USE_TMP || !filepath) return null;
  const normalized = path.normalize(filepath);
  const base = path.basename(filepath);
  if (normalized.startsWith(path.normalize(TEMP_DIR)))
    return { f: base, dir: "temp" };
  if (normalized.startsWith(path.normalize(OUTPUT_DIR)))
    return { f: base, dir: "output" };
  return null;
}

/**
 * Получение URL для локального файла.
 * Если файл в /tmp (прод) — возвращаем URL API отдачи файла, иначе обычный путь из public.
 */
export function getPublicUrl(filepath: string): string {
  const params = getServeFileParams(filepath);
  if (params)
    return `/api/serve-file?f=${encodeURIComponent(params.f)}&dir=${params.dir}`;
  const relativePath = filepath.replace(path.join(process.cwd(), "public"), "");
  return relativePath.replace(/\\/g, "/");
}

/**
 * Очистка временных файлов старше N часов
 */
export async function cleanupTempFiles(maxAgeHours: number = 24): Promise<void> {
  try {
    const files = await fs.readdir(TEMP_DIR);
    const now = Date.now();
    const maxAge = maxAgeHours * 60 * 60 * 1000;

    for (const file of files) {
      const filepath = path.join(TEMP_DIR, file);
      const stats = await fs.stat(filepath);
      if (now - stats.mtimeMs > maxAge) {
        await fs.unlink(filepath);
      }
    }
  } catch (e) {
    // Игнорируем ошибки при очистке
  }
}
