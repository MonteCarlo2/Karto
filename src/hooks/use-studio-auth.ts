"use client";

import type { User } from "@supabase/supabase-js";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { buildStudioLoginHref } from "@/lib/auth/studio-login-href";
import { createBrowserClient } from "@/lib/supabase/client";

export function useStudioAuth(redirectPath?: string) {
  const pathname = usePathname();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const currentPath = redirectPath ?? pathname ?? "/studio";
  const loginHref = useMemo(() => buildStudioLoginHref(currentPath), [currentPath]);

  useEffect(() => {
    const supabase = createBrowserClient();
    let mounted = true;

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return {
    user,
    isLoggedIn: Boolean(user),
    loading,
    loginHref,
  };
}
