import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { TRAINING_KNOWLEDGE_LIMITS } from "@/lib/auto-replies/training-knowledge";

export const runtime = "nodejs";

const MAX_BYTES = TRAINING_KNOWLEDGE_LIMITS.maxDocBytes;
const MAX_CHARS = TRAINING_KNOWLEDGE_LIMITS.maxExtractedChars;

async function extractFromPdf(buffer: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n\n") : String(text ?? "");
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Файл больше ${Math.round(MAX_BYTES / (1024 * 1024))} МБ` },
        { status: 400 }
      );
    }

    const lower = file.name.toLowerCase();
    let kind: "pdf" | "txt" | "md";
    let extracted = "";

    if (lower.endsWith(".pdf") || file.type === "application/pdf") {
      kind = "pdf";
      extracted = await extractFromPdf(await file.arrayBuffer());
    } else if (lower.endsWith(".md") || file.type === "text/markdown") {
      kind = "md";
      extracted = await file.text();
    } else if (lower.endsWith(".txt") || file.type === "text/plain") {
      kind = "txt";
      extracted = await file.text();
    } else {
      return NextResponse.json(
        { error: "Поддерживаются PDF, TXT и MD" },
        { status: 400 }
      );
    }

    extracted = extracted.replace(/\u0000/g, "").trim().slice(0, MAX_CHARS);

    if (!extracted) {
      return NextResponse.json(
        { error: "Не удалось извлечь текст — попробуйте TXT или MD" },
        { status: 422 }
      );
    }

    return NextResponse.json({
      kind,
      extractedText: extracted,
      charCount: extracted.length,
      name: file.name,
      sizeBytes: file.size,
    });
  } catch (error) {
    console.error("[ingest-training-doc]", error);
    return NextResponse.json({ error: "Ошибка обработки файла" }, { status: 500 });
  }
}
