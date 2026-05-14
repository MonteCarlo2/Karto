import { NextRequest, NextResponse } from "next/server";
import { formatBrandDescription } from "@/lib/services/brand-description-formatter";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, niche, description } = body;

    if (!description || description.trim().length < 10) {
      return NextResponse.json(
        { error: "Описание слишком короткое для форматирования" },
        { status: 400 }
      );
    }

    const formattedDescription = await formatBrandDescription(
      name || "",
      niche || "",
      description
    );

    return NextResponse.json({
      success: true,
      formattedDescription,
    });
  } catch (error: any) {
    console.error("[brand/format-description]", error);
    return NextResponse.json(
      { error: error.message || "Не удалось отформатировать описание" },
      { status: 500 }
    );
  }
}
