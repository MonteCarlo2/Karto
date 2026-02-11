import { NextResponse } from "next/server";
import { analyzePriceWithPerplexity } from "@/lib/services/price-analyzer";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const productName: string | undefined = body.productName;
    const photoUrl: string | undefined = body.photoUrl;

    const analysis = await analyzePriceWithPerplexity({
      productName,
      photoUrl,
    });

    return NextResponse.json({ success: true, data: analysis });
  } catch (error: any) {
    console.error("❌ Ошибка анализа цены:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Ошибка анализа цены",
      },
      { status: 500 }
    );
  }
}

