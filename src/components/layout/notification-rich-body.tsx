"use client";

import {
  decodeNotificationEntities,
  normalizeNotificationBodySource,
  notificationBodyLooksLikeHtml,
  sanitizeNotificationHtml,
} from "@/lib/sanitize-notification-html";

export function NotificationRichBody({
  body,
  className = "",
}: {
  body: string;
  className?: string;
}) {
  if (body == null || body === "") return null;

  const raw = typeof body === "string" ? body : String(body);
  const normalized = normalizeNotificationBodySource(decodeNotificationEntities(raw));

  if (!notificationBodyLooksLikeHtml(normalized)) {
    return (
      <p className={`whitespace-pre-wrap text-[15px] leading-[1.58] text-neutral-800 ${className}`}>
        {normalized}
      </p>
    );
  }

  const html = sanitizeNotificationHtml(normalized);
  return (
    <div
      className={[
        "notification-rich-body text-[15px] leading-[1.58] text-neutral-800",
        "[&_p]:mb-2 [&_p:last-child]:mb-0",
        "[&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-neutral-900",
        "[&_h2]:mb-2 [&_h2]:mt-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-neutral-900",
        "[&_h3]:mb-1.5 [&_h3]:mt-2 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-neutral-900",
        "[&_h4]:mb-1 [&_h4]:mt-2 [&_h4]:text-[15px] [&_h4]:font-semibold [&_h4]:text-neutral-900",
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_li]:my-0.5",
        "[&_blockquote]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-[#84CC16]/50 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-neutral-700",
        "[&_a]:font-medium [&_a]:text-[#1F4E3D] [&_a]:underline [&_a]:underline-offset-2",
        "[&_code]:rounded [&_code]:bg-neutral-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[13px]",
        "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-neutral-100 [&_pre]:p-3 [&_pre]:text-[13px]",
        "[&_hr]:my-4 [&_hr]:border-[#2E5A43]/15",
        "[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_table]:text-[14px]",
        "[&_th]:border [&_th]:border-neutral-200 [&_th]:bg-neutral-50 [&_th]:px-2 [&_th]:py-1.5 [&_th]:font-semibold",
        "[&_td]:border [&_td]:border-neutral-200 [&_td]:px-2 [&_td]:py-1.5",
        className,
      ].join(" ")}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
