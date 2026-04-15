import type { NextRequest } from "next/server";

export const ATTR_COOKIE_NAME = "karto_attr";
export const ATTR_WINDOW_DAYS = 60;
const ATTR_WINDOW_MS = ATTR_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export type AttributionPayload = {
  code: string;
  source: string;
  capturedAt: number;
  expiresAt: number;
};

const CODE_RE = /^[a-z0-9_-]{2,64}$/i;

function sanitizeCode(input: string | null | undefined): string | null {
  const value = String(input ?? "").trim();
  if (!value) return null;
  if (!CODE_RE.test(value)) return null;
  return value.toLowerCase();
}

function sanitizeSource(input: string | null | undefined): string {
  const value = String(input ?? "").trim().toLowerCase();
  if (!value) return "unknown";
  return value.replace(/[^a-z0-9_-]/g, "").slice(0, 32) || "unknown";
}

export function readAttributionCookie(raw: string | null | undefined): AttributionPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AttributionPayload>;
    const code = sanitizeCode(parsed.code);
    if (!code) return null;
    const source = sanitizeSource(parsed.source);
    const capturedAt = Number(parsed.capturedAt) || Date.now();
    const expiresAt = Number(parsed.expiresAt) || capturedAt + ATTR_WINDOW_MS;
    return { code, source, capturedAt, expiresAt };
  } catch {
    return null;
  }
}

export function pickAttributionFromRequest(request: NextRequest): AttributionPayload | null {
  const url = request.nextUrl;
  const fromQueryCode =
    sanitizeCode(url.searchParams.get("p")) ??
    sanitizeCode(url.searchParams.get("r")) ??
    sanitizeCode(url.searchParams.get("ref")) ??
    sanitizeCode(url.searchParams.get("campaign")) ??
    null;
  const fromPathMatch = url.pathname.match(/^\/start\/([a-z0-9_-]{2,64})$/i);
  const fromPathCode = sanitizeCode(fromPathMatch?.[1] ?? null);
  const code = fromQueryCode ?? fromPathCode;
  if (!code) return null;

  const sourceRaw =
    url.searchParams.get("ch") ??
    url.searchParams.get("src") ??
    url.searchParams.get("s");
  const source = sanitizeSource(sourceRaw);
  const capturedAt = Date.now();
  return {
    code,
    source,
    capturedAt,
    expiresAt: capturedAt + ATTR_WINDOW_MS,
  };
}

export function isAttributionActive(payload: AttributionPayload | null, nowMs = Date.now()): boolean {
  if (!payload) return false;
  return payload.expiresAt > nowMs;
}
