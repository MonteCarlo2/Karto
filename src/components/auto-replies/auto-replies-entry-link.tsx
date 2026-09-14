"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type AutoRepliesEntryLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href?: string;
  children: ReactNode;
};

/** Ссылка в мастерскую автоответов — интерфейс доступен без входа, CTA на шаге 3. */
export function AutoRepliesEntryLink({
  href = "/studio/auto-replies",
  children,
  ...rest
}: AutoRepliesEntryLinkProps) {
  return (
    <Link href={href} {...rest}>
      {children}
    </Link>
  );
}

export async function autoRepliesAuthorizedFetch(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const { autoRepliesAuthorizedFetch: fetchImpl } = await import("@/lib/auto-replies/auto-replies-fetch");
  return fetchImpl(path, init);
}
