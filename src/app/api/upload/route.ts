import { NextRequest, NextResponse } from "next/server";
import { saveBase64Image, getPublicUrl } from "@/lib/services/image-processing";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs/promises";

// Директория для загруженных файлов
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export async function POST(request: NextRequest) {
  try {
    // Убеждаемся что директория существует
    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Файл не предоставлен" },
        { status: 400 }
      );
    }

    // Проверяем тип файла
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Разрешены только изображения" },
        { status: 400 }
      );
    }

    // Проверяем размер (макс 10MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Файл слишком большой (макс 10MB)" },
        { status: 400 }
      );
    }

    // Сохраняем файл
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const ext = file.name.split(".").pop() || "png";
    const filename = `${uuidv4()}.${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);
    
    await fs.writeFile(filepath, buffer);

    const publicUrl = `/uploads/${filename}`;

    // Также создаем base64 версию для API (некоторые API требуют data URL)
    const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

    return NextResponse.json({
      success: true,
      filename: filename,
      url: publicUrl,
      base64Url: base64,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    console.error("Ошибка загрузки:", error);
    return NextResponse.json(
      { error: "Ошибка при загрузке файла", details: String(error) },
      { status: 500 }
    );
  }
}
