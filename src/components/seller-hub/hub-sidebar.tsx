"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  Activity,
  BarChart3,
  Boxes,
  LayoutDashboard,
  ListTodo,
  Megaphone,
  Package,
  Truck,
  Plug,
  ShoppingCart,
  Tag,
  Ticket,
  Bot,
  BookOpen,
  MessageCircle,
  LayoutGrid,
  LifeBuoy,
  LogOut,
  UserRound,
  ChevronDown,
  ChevronRight,
  Info,
  Building2,
  ShieldCheck,
  Scale,
  History,
  Warehouse,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { WhatsNew } from "@/components/agent/whats-new";
import { KartoLogoMark, Logo } from "@/components/ui/logo";
import {
  SELLER_HUB_AREAS,
  SELLER_HUB_NAV_GROUPS,
  type SellerHubAreaId,
} from "@/lib/seller-hub/nav";
import { hub, hubSans } from "./hub-ui";

export const HUB_RAIL_EXPANDED = 268;
export const HUB_RAIL_COLLAPSED = 84;

const AREA_ICON: Record<SellerHubAreaId, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  overview: LayoutDashboard,
  tasks: ListTodo,
  events: Activity,
  catalog: Boxes,
  prices: Tag,
  stocks: Warehouse,
  promotions: Ticket,
  analytics: BarChart3,
  orders: ShoppingCart,
  deliveries: Package,
  logistics: Truck,
  ads: Megaphone,
  agents: Bot,
  knowledge: BookOpen,
  integration: Plug,
};

function RailAreaButton({
  area,
  active,
  collapsed,
  planned,
  onClick,
}: {
  area: { id: SellerHubAreaId; label: string };
  active: boolean;
  collapsed: boolean;
  planned?: boolean;
  onClick: () => void;
}) {
  const Icon = AREA_ICON[area.id];

  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? area.label : undefined}
      className={`flex w-full items-center rounded-[10px] outline-none transition-colors duration-150 focus-visible:shadow-[0_0_0_2px_var(--hub-rail),0_0_0_4px_var(--hub-lime-ring)] ${
        collapsed ? "h-10 justify-center px-2" : "h-10 gap-3 px-3 text-left"
      } ${
          active
          ? "bg-[var(--hub-lime)] text-[var(--hub-on-lime)] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]"
          : "text-[var(--hub-text-muted)] hover:bg-[var(--hub-text)]/[0.05] hover:text-[var(--hub-text)]"
      }`}
      style={hubSans}
    >
      <Icon className="h-5 w-5 shrink-0" strokeWidth={1.5} />

      {!collapsed ? (
        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span className={`truncate text-[14px] leading-6 tracking-[-0.005em] ${active ? "font-semibold" : "font-medium"}`}>
            {area.label}
          </span>
          {planned ? (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ backgroundColor: hub.surfaceMuted, color: hub.textSubtle }}
            >
              скоро
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

/** Строка меню пользователя: тонкая серая иконка и подпись, без цветных плиток. */
function MenuRow({
  icon: Icon,
  label,
  trailing,
  ...rest
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  trailing?: ReactNode;
} & (
  | { href: string; onClick?: () => void }
  | { href?: undefined; onClick: () => void }
)) {
  const cls =
    "flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[14px] text-[var(--hub-text)] outline-none transition-colors hover:bg-black/[0.05] focus-visible:bg-black/[0.05]";
  const body = (
    <>
      <Icon className="h-[16px] w-[16px] shrink-0 text-[var(--hub-text-muted)]" strokeWidth={1.5} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </>
  );
  if (rest.href) {
    return (
      <Link href={rest.href} role="menuitem" onClick={rest.onClick} className={cls}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" role="menuitem" onClick={rest.onClick} className={cls}>
      {body}
    </button>
  );
}

/** Спокойные насыщенные цвета для аватара: у каждого человека свой, всегда один и тот же (по почте). Белая буква читается на всех. */
const AVATAR_COLORS = ["#C2603E", "#4F7CAC", "#5B8C6A", "#8A5A9E", "#B07A2A", "#3F7F86", "#A5495B", "#6A6FB0"];
function avatarColorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

/** Меню пользователя внизу панели. Минималистичное, по образцу меню аккаунта в Claude. */
function UserMenu({
  collapsed,
  onContact,
  onHelp,
}: {
  collapsed: boolean;
  onContact?: () => void;
  onHelp: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const [info, setInfo] = useState<{ name: string; email: string } | null>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let mounted = true;
    createBrowserClient()
      .auth.getSession()
      .then(({ data: { session } }) => {
        const u = session?.user;
        if (!mounted || !u) return;
        const email = u.email ?? "";
        const name = (u.user_metadata?.name || u.user_metadata?.full_name || email.split("@")[0] || "Аккаунт") as string;
        setInfo({ name, email });
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const toggle = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left, bottom: window.innerHeight - r.top + 6 });
    setMoreOpen(false);
    setOpen((v) => !v);
  };

  const closeMenu = () => setOpen(false);

  const logout = async () => {
    setOpen(false);
    try {
      await createBrowserClient().auth.signOut();
    } catch {
      /* всё равно уходим на главную */
    }
    router.push("/");
  };

  const initial = (info?.name || "?").trim().charAt(0).toUpperCase();
  const avatarColor = avatarColorFor(info?.email || info?.name || "");
  const sep = <div className="mx-1 my-1 h-px bg-black/[0.08]" />;

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        title={collapsed ? info?.name || "Меню" : undefined}
        className={`flex w-full items-center gap-2.5 rounded-[10px] text-left outline-none transition-colors hover:bg-black/[0.05] focus-visible:shadow-[0_0_0_2px_var(--hub-rail),0_0_0_4px_var(--hub-lime-ring)] ${
          collapsed ? "h-11 justify-center" : "h-11 px-2"
        }`}
      >
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold leading-none text-white"
          style={{ backgroundColor: avatarColor }}
        >
          {initial}
        </span>
        {collapsed ? null : (
          <>
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium leading-none text-[var(--hub-text)]">{info?.name || "Аккаунт"}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--hub-text-subtle)]" strokeWidth={1.75} />
          </>
        )}
      </button>

      {open && pos && typeof document !== "undefined"
        ? createPortal(
            <>
              <div className="fixed inset-0 z-[70]" onClick={closeMenu} aria-hidden />
              <motion.div
                role="menu"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                style={{ left: pos.left, bottom: pos.bottom, width: 232, ...hubSans }}
                className="fixed z-[71] rounded-[12px] border border-black/[0.1] bg-white p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
              >
                <p className="truncate px-2.5 pb-1 pt-1 text-[12px] text-[var(--hub-text-subtle)]">{info?.email}</p>

                <MenuRow icon={UserRound} label="Аккаунт" href="/profile" onClick={closeMenu} />
                <MenuRow
                  icon={LifeBuoy}
                  label="Помощь"
                  onClick={() => {
                    closeMenu();
                    onHelp();
                  }}
                />
                {onContact ? (
                  <MenuRow
                    icon={MessageCircle}
                    label="Написать нам"
                    onClick={() => {
                      closeMenu();
                      onContact();
                    }}
                  />
                ) : null}

                <div className="relative" onMouseEnter={() => setMoreOpen(true)} onMouseLeave={() => setMoreOpen(false)}>
                  <MenuRow
                    icon={Info}
                    label="Подробнее"
                    onClick={() => setMoreOpen((v) => !v)}
                    trailing={<ChevronRight className="h-4 w-4 shrink-0 text-[var(--hub-text-subtle)]" strokeWidth={1.5} />}
                  />
                  <AnimatePresence>
                    {moreOpen ? (
                      <motion.div
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -4 }}
                        transition={{ duration: 0.14, ease: "easeOut" }}
                        className="absolute left-full top-[-7px] z-10 pl-1.5"
                      >
                        <div className="w-[240px] rounded-[12px] border border-black/[0.1] bg-white p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
                          <MenuRow icon={Building2} label="О KARTO" href="/#how-it-works" onClick={closeMenu} />
                          <MenuRow icon={ShieldCheck} label="Конфиденциальность" href="/policy-and-terms" onClick={closeMenu} />
                          <MenuRow icon={Scale} label="Правовая информация" href="/policy-and-terms" onClick={closeMenu} />
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>

                {sep}

                <MenuRow
                  icon={History}
                  label="Список изменений"
                  onClick={() => {
                    closeMenu();
                    setNewsOpen(true);
                  }}
                />
                <MenuRow icon={LogOut} label="Выйти" onClick={() => void logout()} />
              </motion.div>
            </>,
            document.body
          )
        : null}
      <WhatsNew open={newsOpen} onClose={() => setNewsOpen(false)} />
    </div>
  );
}

export function HubSidebar({
  collapsed,
  onToggleCollapsed,
  area,
  onAreaChange,
  onContact,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Раздел агента, подсвеченный в панели. На страницах «Аккаунт» и «Мастерская» разделов нет. */
  area?: SellerHubAreaId | null;
  onAreaChange: (id: SellerHubAreaId) => void;
  /** Тихая ссылка «Написать нам» внизу панели. Без неё ссылка не показывается. */
  onContact?: () => void;
}) {
  const pathname = usePathname();
  return (
    <aside
      onClick={(e) => {
        // Клик по пустому месту панели сворачивает и разворачивает её (как в ChatGPT).
        if (!(e.target as HTMLElement).closest("a,button,[role=menuitem]")) onToggleCollapsed();
      }}
      className={`flex h-full min-h-0 flex-col overflow-hidden border-e border-[var(--hub-border)] [&_a]:cursor-pointer [&_button]:cursor-pointer ${
        collapsed ? "cursor-e-resize" : "cursor-w-resize"
      }`}
      style={{ backgroundColor: hub.railBg, ...hubSans }}
    >
      <div className={`flex shrink-0 justify-center ${collapsed ? "px-3 pb-2 pt-2" : "px-5 pb-4 pt-2"}`}>
        <Link href="/" title="На главную KARTO" className="outline-none">
          {collapsed ? <KartoLogoMark size={72} /> : <Logo maxWidth={330} maxHeight={114} className="justify-center" />}
        </Link>
      </div>

      <nav
        aria-label="Разделы агента"
        className={`min-h-0 flex-1 overflow-y-auto py-2 ${collapsed ? "px-2.5" : "px-3"}`}
      >
        <div className="space-y-6">
          {SELLER_HUB_NAV_GROUPS.map((group) => (
            <div key={group.id}>
              {!collapsed && group.label ? (
                <p
                  className="mb-1.5 px-3 text-[12px] font-medium"
                  style={{ color: hub.railTextMuted }}
                >
                  {group.label}
                </p>
              ) : null}
              <div className="space-y-0.5">
                {group.areaIds.map((id) => {
                  const meta = SELLER_HUB_AREAS.find((item) => item.id === id);
                  if (!meta) return null;
                  return (
                    <RailAreaButton
                      key={meta.id}
                      area={meta}
                      planned={meta.planned}
                      active={area === meta.id}
                      collapsed={collapsed}
                      onClick={() => onAreaChange(meta.id)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
          <div>
            {!collapsed ? (
              <p className="mb-1.5 px-3 text-[12px] font-medium" style={{ color: hub.railTextMuted }}>
                Инструменты
              </p>
            ) : null}
            <Link
              href="/studio/workshop"
              title={collapsed ? "Мастерская" : undefined}
              aria-current={pathname.startsWith("/studio/workshop") ? "page" : undefined}
              className={`flex h-10 w-full items-center rounded-[10px] outline-none transition-colors duration-150 focus-visible:shadow-[0_0_0_2px_var(--hub-rail),0_0_0_4px_var(--hub-lime-ring)] ${
                collapsed ? "justify-center px-2" : "gap-3 px-3"
              } ${
                pathname.startsWith("/studio/workshop")
                  ? "bg-[var(--hub-lime)] text-[var(--hub-on-lime)] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]"
                  : "text-[var(--hub-text-muted)] hover:bg-[var(--hub-text)]/[0.05] hover:text-[var(--hub-text)]"
              }`}
              style={hubSans}
            >
              <LayoutGrid className="h-5 w-5 shrink-0" strokeWidth={1.5} />
              {collapsed ? null : (
                <span
                  className={`truncate text-[14px] leading-6 tracking-[-0.005em] ${
                    pathname.startsWith("/studio/workshop") ? "font-semibold" : "font-medium"
                  }`}
                >
                  Мастерская
                </span>
              )}
            </Link>
          </div>
        </div>
      </nav>

      <div className={`shrink-0 border-t py-2.5 ${collapsed ? "px-2" : "px-3"}`} style={{ borderColor: hub.railBorder }}>
        <UserMenu
          collapsed={collapsed}
          onContact={onContact}
          onHelp={() => onAreaChange("knowledge")}
        />
      </div>
    </aside>
  );
}
