import { NextResponse, type NextRequest } from "next/server";
import { ATTR_COOKIE_NAME, pickAttributionFromRequest } from "@/lib/attribution";

export function middleware(request: NextRequest) {
  const payload = pickAttributionFromRequest(request);
  if (!payload) return NextResponse.next();

  const response = NextResponse.next();
  response.cookies.set({
    name: ATTR_COOKIE_NAME,
    value: JSON.stringify(payload),
    expires: new Date(payload.expiresAt),
    maxAge: 60 * 24 * 60 * 60,
    path: "/",
    sameSite: "lax",
    secure: true,
    httpOnly: false,
  });
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
