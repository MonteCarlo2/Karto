import { NextRequest, NextResponse } from "next/server";
import { wbAuthorization, safeSellerHubMessage } from "@/lib/seller-hub/wb-token";
import { requireSellerHubWbToken } from "@/lib/seller-hub/wb-token-http";

export const maxDuration = 30;

type SubjectRow = {
  subjectID?: number;
  subjectName?: string;
  parentName?: string;
};

export async function POST(request: NextRequest) {
  const access = await requireSellerHubWbToken(request);
  if (!access.ok) return access.response;

  let body: { query?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }

  const token = access.token;
  const params = new URLSearchParams({ locale: "ru", limit: "80" });
  const query = body.query?.trim();
  if (query) params.set("name", query);

  const response = await fetch(`https://content-api.wildberries.ru/content/v2/object/all?${params}`, {
    headers: { Authorization: wbAuthorization(token), Accept: "application/json" },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: SubjectRow[];
    error?: boolean;
    errorText?: string;
  };

  if (!response.ok || payload.error) {
    return NextResponse.json(
      { ok: false, error: safeSellerHubMessage(payload.errorText || `WB ответил ${response.status}`, token) },
      { status: response.status >= 400 ? response.status : 502 },
    );
  }

  const subjects = (payload.data ?? [])
    .filter((row) => row.subjectName)
    .map((row) => ({
      id: row.subjectID ?? 0,
      name: row.subjectName ?? "",
      parent: row.parentName ?? "",
    }));

  return NextResponse.json({ ok: true, subjects });
}
