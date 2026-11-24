"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { HUB_RAIL_COLLAPSED, HUB_RAIL_EXPANDED, HubSidebar } from "@/components/seller-hub/hub-sidebar";
import { hub, hubSans } from "@/components/seller-hub/hub-ui";
import { ContactWidget } from "@/components/agent/contact-widget";
import { createBrowserClient } from "@/lib/supabase/client";
import { setSellerHubActiveArea } from "@/lib/seller-hub/store";
import { KartoLogoMark } from "@/components/ui/logo";
import Link from "next/link";

const RAIL_KEY = "karto.hub.rail";

/**
 * Оболочка агента для страниц «Аккаунт» и «Мастерская»: та же левая панель, что и в агенте.
 * Логотип в панели ведёт на главную, разделы агента открываются одним нажатием.
 */
export function AgentShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(RAIL_KEY) === "open") setCollapsed(false);
    } catch {
      /* без localStorage панель остаётся свёрнутой */
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    createBrowserClient()
      .auth.getSession()
      .then(({ data: { session } }) => {
        if (mounted) setUserId(session?.user?.id ?? null);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const toggleCollapsed = () =>
    setCollapsed((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(RAIL_KEY, next ? "closed" : "open");
      } catch {
        /* не критично */
      }
      return next;
    });

  const openArea = (id: Parameters<typeof setSellerHubActiveArea>[1]) => {
    if (userId) setSellerHubActiveArea(userId, id);
    setMobileNavOpen(false);
    router.push("/studio/seller-hub");
  };

  const railWidth = collapsed ? HUB_RAIL_COLLAPSED : HUB_RAIL_EXPANDED;

  return (
    <div
      data-hub-root
      className="flex h-[100dvh] overflow-hidden [&_a]:text-inherit"
      style={{ backgroundColor: hub.canvas, color: hub.text, accentColor: "var(--hub-forest)", ...hubSans }}
    >
      <div className="hidden h-full shrink-0 transition-[width] duration-300 lg:block" style={{ width: railWidth }}>
        <HubSidebar
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          onContact={() => setContactOpen(true)}
          area={null}
          onAreaChange={openArea}
        />
      </div>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button
            type="button"
            aria-label="Закрыть меню"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
          />
          <div className="relative h-full" style={{ width: HUB_RAIL_EXPANDED }}>
            <HubSidebar
              collapsed={false}
              onToggleCollapsed={() => setMobileNavOpen(false)}
              onContact={() => {
                setMobileNavOpen(false);
                setContactOpen(true);
              }}
              area={null}
              onAreaChange={openArea}
            />
          </div>
        </div>
      ) : null}

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-14 shrink-0 items-center gap-3 px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Открыть меню"
            className="flex h-10 w-10 items-center justify-center rounded-[10px] text-[var(--hub-text-muted)] hover:bg-[var(--hub-text)]/[0.05]"
          >
            <Menu className="h-5 w-5" strokeWidth={1.5} />
          </button>
          <Link href="/" title="На главную KARTO" className="outline-none">
            <KartoLogoMark size={40} />
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </main>

      <ContactWidget open={contactOpen} onClose={() => setContactOpen(false)} railWidth={railWidth} />
    </div>
  );
}
