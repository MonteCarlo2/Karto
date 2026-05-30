"use client";

import { createBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ComponentProps, MouseEvent, ReactNode } from "react";

type AutoRepliesEntryLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href?: string;
  children: ReactNode;
};

/** CTA в автоответы: без сессии — на регистрацию/вход. */
export function AutoRepliesEntryLink({
  href = "/studio/auto-replies",
  children,
  onClick,
  ...rest
}: AutoRepliesEntryLinkProps) {
  const router = useRouter();

  const handleClick = async (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;

    const supabase = createBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      e.preventDefault();
      router.push(`/login?redirect=${encodeURIComponent(href)}`);
    }
  };

  return (
    <Link href={href} onClick={handleClick} {...rest}>
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
