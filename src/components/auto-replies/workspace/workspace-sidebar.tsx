"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  BarChart3,
  ChevronDown,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import type { ComponentType } from "react";
import { KartoLogoMark, Logo } from "@/components/ui/logo";
import { ContactQuestionModal } from "@/components/ui/contact-question-modal";
import type { AutoRepliesMarketplaceId } from "@/lib/auto-replies/types";
import { AUTO_REPLIES_MARKETPLACE_UI } from "@/lib/auto-replies/workspace-prefs";
import type { WorkspaceArea } from "./workspace-shell";
import { WorkspaceConfirmDialog } from "./workspace-confirm-dialog";

const sans = {
  fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
} as const;

const serif = {
  fontFamily: "var(--font-auto-replies-serif), var(--font-playfair), Georgia, serif",
} as const;

/** Развёрнутая панель — компактная, как в макете настроек. */
export const SIDEBAR_W_EXPANDED = 328;
/** Свёрнутая панель (Ответы) — чуть шире, крупные иконки. */
export const SIDEBAR_W_COLLAPSED = 108;

const MARKETPLACE_COMPACT_ICON_SRC: Record<AutoRepliesMarketplaceId, string> = {
  wildberries: "/logos/marketplace-wildberries-app.png",
  ozon: "/logos/marketplace-ozon-app.png",
  yandex: "/logos/marketplace-yandex-market-app.png",
};

const easeOut = [0.32, 0.72, 0, 1] as const;

function SidebarAreaButton({
  active,
  onClick,
  Icon,
  title,
  badge,
  collapsed = false,
}: {
  active: boolean;
  onClick: () => void;
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  badge?: number;
  collapsed?: boolean;
}) {
  if (collapsed) {
    return (
      <button
        type="button"
        title={title}
        onClick={onClick}
        className={`relative flex w-full items-center justify-center rounded-xl px-2 py-3 transition-colors ${
          active
            ? "bg-[#B9FF4B]/32 text-[#0a0a0a] ring-1 ring-[#2E5A43]/20"
            : "text-[#5f5a52] hover:bg-[#0a0a0a]/[0.05] hover:text-[#0a0a0a]"
        }`}
        style={sans}
      >
        <Icon className="h-[1.4rem] w-[1.4rem]" strokeWidth={2.1} />
        {badge != null && badge > 0 ? (
          <span
            aria-label={`${badge} неотвеченных отзывов`}
            className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2E5A43] px-1 text-[10px] font-bold leading-none text-[#F4FFE0] shadow-[0_0_0_2px_#E8E4DC]"
          >
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
        active
          ? "bg-[#B9FF4B]/28 text-[#0a0a0a] ring-1 ring-[#2E5A43]/18 shadow-[0_6px_20px_-10px_rgba(46,90,67,0.35)]"
          : "text-[#0a0a0a] hover:bg-[#0a0a0a]/[0.04]"
      }`}
      style={sans}
    >
      <Icon
        className="h-[1.3rem] w-[1.3rem] shrink-0 text-[#0a0a0a]"
        strokeWidth={2.15}
      />
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="text-[16px] font-semibold tracking-[-0.02em] text-[#0a0a0a]">{title}</span>
        {badge != null && badge > 0 ? (
          <span
            aria-label={`${badge} неотвеченных отзывов`}
            className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#2E5A43] px-1.5 text-[10px] font-bold leading-none text-[#F4FFE0]"
          >
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function MarketplaceIconButton({
  mp,
  connected,
  active,
  collapsed,
  onSelect,
  onConnect,
}: {
  mp: (typeof AUTO_REPLIES_MARKETPLACE_UI)[number];
  connected: boolean;
  active: boolean;
  collapsed: boolean;
  onSelect: () => void;
  onConnect: () => void;
}) {
  const logoSrc = MARKETPLACE_COMPACT_ICON_SRC[mp.id];
  const sizePx = collapsed ? 48 : 56;
  const iconSize = collapsed ? "h-12 w-12" : "h-14 w-14";

  return (
    <button
      type="button"
      aria-label={
        connected
          ? active
            ? `${mp.title} — активная площадка`
            : `Переключиться на ${mp.title}`
          : `Добавить ${mp.title}`
      }
      aria-current={active ? "true" : undefined}
      onClick={() => (connected ? onSelect() : onConnect())}
      className={`relative flex shrink-0 items-center justify-center outline-none transition duration-200 hover:opacity-95 focus-visible:ring-2 focus-visible:ring-[#0a0a0a]/25 ${
        collapsed ? "h-12 w-12" : "min-h-[3.5rem] min-w-0 flex-1"
      } ${connected && !active ? "opacity-[0.9] hover:opacity-100" : ""}`}
    >
      <span className="relative inline-flex items-center justify-center">
        {connected && active ? (
          <motion.span
            layoutId="marketplace-active-indicator"
            className="pointer-events-none absolute -inset-[3px] rounded-[24%] shadow-[0_0_0_1.5px_rgba(10,10,10,0.34),0_6px_18px_-12px_rgba(46,90,67,0.22)]"
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            aria-hidden
          />
        ) : null}
        <Image
          src={logoSrc}
          alt={mp.title}
          width={144}
          height={144}
          className={`relative z-[1] shrink-0 rounded-[22%] object-cover ${iconSize} ${
            connected
              ? active
                ? "opacity-100"
                : "shadow-[0_0_0_1px_rgba(46,90,67,0.14)]"
              : "opacity-50 saturate-[0.55] grayscale-[25%]"
          }`}
          sizes={`${sizePx}px`}
        />
        {!connected ? (
          <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 z-[2] flex h-[1.125rem] w-[1.125rem] items-center justify-center rounded-full bg-white text-[#141414] shadow ring-1 ring-white/90">
            <Plus className="h-3 w-3" strokeWidth={2.8} />
          </span>
        ) : null}
      </span>
    </button>
  );
}

export type WorkspaceSidebarProps = {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  workspaceArea: WorkspaceArea;
  onSelectArea: (area: WorkspaceArea) => void;
  inboxBadge: number;
  usage: string;
  repliesRemaining: number | null;
  welcomeRemaining?: number | null;
  paidRemaining?: number | null;
  repliesPeriodEnd?: string | null;
  user?: { id: string; email?: string; user_metadata?: { name?: string; full_name?: string } } | null;
  currentShopName: string;
  shops: { id: string; name: string }[];
  selectedShopId: string;
  onSelectShop: (id: string) => void;
  onAddShop: (name: string) => void;
  onDeleteShop: (id: string) => void | Promise<void>;
  deletingShopId?: string | null;
  connectedMarketplaces: AutoRepliesMarketplaceId[];
  activeMarketplace: AutoRepliesMarketplaceId;
  onSelectMarketplace: (id: AutoRepliesMarketplaceId) => void;
  onConnectMarketplace: (id: AutoRepliesMarketplaceId) => void;
};

export function WorkspaceSidebar({
  collapsed,
  onCollapsedChange,
  workspaceArea,
  onSelectArea,
  inboxBadge,
  usage,
  repliesRemaining,
  welcomeRemaining,
  paidRemaining,
  repliesPeriodEnd,
  user,
  currentShopName,
  shops,
  selectedShopId,
  onSelectShop,
  connectedMarketplaces,
  activeMarketplace,
  onSelectMarketplace,
  onConnectMarketplace,
  onAddShop,
  onDeleteShop,
  deletingShopId = null,
}: WorkspaceSidebarProps) {
  const width = collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_EXPANDED;
  const [contactOpen, setContactOpen] = useState(false);
  const welcome = welcomeRemaining ?? 0;
  const paid = paidRemaining ?? 0;

  return (
    <motion.aside
      initial={false}
      animate={{ width }}
      transition={{ duration: 0.42, ease: easeOut }}
      className={`relative z-10 flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-[#c9c1b6]/65 max-lg:border-b max-lg:border-[#c4bdb2]/55 lg:border-e ${
        workspaceArea === "inbox" ? "bg-[#EBE7DF]" : "bg-[#E8E4DC]"
      }`}
      style={sans}
    >
      <div
        className={`flex shrink-0 justify-center ${
          collapsed ? "px-3.5 pt-7 lg:pt-8" : "w-full px-4 pt-5 lg:px-5 lg:pt-6"
        }`}
      >
        <Link
          href="/"
          className={`outline-none ${collapsed ? "" : "block w-full"}`}
          aria-label="На главную KARTO"
        >
          <motion.div
            layout
            transition={{ layout: { duration: 0.42, ease: easeOut } }}
            className={collapsed ? undefined : "w-full"}
          >
            {collapsed ? (
              <KartoLogoMark size={64} />
            ) : (
              <Logo
                maxWidth={304}
                maxHeight={124}
                className="w-full justify-center"
              />
            )}
          </motion.div>
        </Link>
      </div>

      <div className="relative z-30 shrink-0 overflow-visible">
        <AnimatePresence initial={false}>
          {!collapsed ? (
            <motion.div
              key="shops-expanded"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: easeOut }}
              className="px-3.5 lg:px-5"
            >
              <div className="mt-5">
                <p className="text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7f786d]">
                  Магазины
                </p>
                <ShopPicker
                  currentShopName={currentShopName}
                  shops={shops}
                  selectedShopId={selectedShopId}
                  onSelectShop={onSelectShop}
                  onAddShop={onAddShop}
                  onDeleteShop={onDeleteShop}
                  deletingShopId={deletingShopId}
                />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <motion.div
          layout
          role="group"
          aria-label="Площадки"
          transition={{ layout: { duration: 0.42, ease: easeOut } }}
          className={
            collapsed
              ? "flex flex-col items-center gap-3.5 px-2.5 pb-1 pt-10"
              : "mt-4 flex items-center justify-between gap-1.5 px-3.5 pb-1 lg:px-5"
          }
        >
          <LayoutGroup id="marketplace-switcher">
            {AUTO_REPLIES_MARKETPLACE_UI.map((mp) => (
              <motion.div key={mp.id} layout transition={{ duration: 0.42, ease: easeOut }}>
                <MarketplaceIconButton
                  mp={mp}
                  collapsed={collapsed}
                  connected={connectedMarketplaces.includes(mp.id)}
                  active={activeMarketplace === mp.id}
                  onSelect={() => onSelectMarketplace(mp.id)}
                  onConnect={() => onConnectMarketplace(mp.id)}
                />
              </motion.div>
            ))}
          </LayoutGroup>
        </motion.div>
      </div>

      <nav className="relative z-10 mt-3 flex min-h-0 flex-1 flex-col border-t border-[#b5aca0]/75 px-2.5 pt-5 lg:px-3.5 lg:pt-6">
        <AnimatePresence initial={false}>
          {!collapsed ? (
            <motion.p
              key="sections-label"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: easeOut }}
              className="mb-3 px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7a746c]"
            >
              Разделы
            </motion.p>
          ) : null}
        </AnimatePresence>

        <div className={`flex flex-col ${collapsed ? "gap-2" : "gap-1.5"}`}>
          <SidebarAreaButton
            collapsed={collapsed}
            active={workspaceArea === "settings"}
            onClick={() => onSelectArea("settings")}
            Icon={Settings2}
            title="Основное"
          />
          <SidebarAreaButton
            collapsed={collapsed}
            active={workspaceArea === "inbox"}
            onClick={() => onSelectArea("inbox")}
            Icon={MessageSquareText}
            title="Ответы"
            badge={inboxBadge}
          />
          <SidebarAreaButton
            collapsed={collapsed}
            active={workspaceArea === "analytics"}
            onClick={() => onSelectArea("analytics")}
            Icon={BarChart3}
            title="Анализ"
          />
          <SidebarAreaButton
            collapsed={collapsed}
            active={workspaceArea === "integration"}
            onClick={() => onSelectArea("integration")}
            Icon={Plug}
            title="Кабинет и API"
          />
        </div>

        <div className="mt-auto border-t border-[#b5aca0]/55 py-3">
          {collapsed ? (
            <button
              type="button"
              title="Раскрыть меню"
              onClick={() => onCollapsedChange(false)}
              className="flex w-full flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-[#4a4740] transition-colors hover:bg-[#0a0a0a]/[0.05]"
            >
              <PanelLeftOpen className="h-5 w-5" strokeWidth={2.1} />
              <span className="text-[10px] font-semibold">Меню</span>
            </button>
          ) : workspaceArea === "inbox" ? (
            <button
              type="button"
              title="Свернуть меню"
              onClick={() => onCollapsedChange(true)}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#c9c1b6]/80 bg-[#F7F4ED]/80 px-3 py-2.5 text-[12px] font-semibold text-[#4a4740] transition-colors hover:bg-white"
            >
              <PanelLeftClose className="h-4 w-4" strokeWidth={2.1} />
              Свернуть меню
            </button>
          ) : null}

          {!collapsed ? (
            <>
              {workspaceArea === "inbox" ? (
                <div className="mb-3 border-t border-[#b5aca0]/40 pt-3" />
              ) : null}
              <p className="mb-2 text-[11px] font-medium text-[#7a746c]">Остаток по тарифу</p>
              <p className="text-[1.35rem] font-bold tabular-nums leading-none text-[#0a0a0a]">
                {repliesRemaining == null ? "…" : repliesRemaining.toLocaleString("ru-RU")}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-[#7a746c]">
                {welcome > 0 && paid > 0
                  ? `из них ${welcome.toLocaleString("ru-RU")} бесплатных · ${paid.toLocaleString("ru-RU")} по пакету`
                  : welcome > 0
                    ? "бесплатные ответы · без срока"
                    : "осталось по пакету"}
                {paid > 0 && repliesPeriodEnd
                  ? ` · до ${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(repliesPeriodEnd))}`
                  : ""}
              </p>
              {repliesRemaining === 0 && usage !== "manual" ? (
                <p className="mt-2 rounded-lg bg-[#fff4e6] px-2.5 py-2 text-[11px] leading-snug text-[#8a5a12]">
                  Автономный режим остановлен — пополните пакет, чтобы снова генерировать и отправлять ответы.
                </p>
              ) : null}
              <div className="mt-2.5 flex flex-col gap-1.5">
                <Link
                  href="/#pricing"
                  className="inline-block text-[11px] font-semibold text-[#2E5A43] underline underline-offset-2"
                >
                  Пополнить пакет
                </Link>
                <button
                  type="button"
                  onClick={() => setContactOpen(true)}
                  className="text-left text-[11px] font-medium text-[#5f5a52] underline decoration-[#c9c1b6] underline-offset-2 transition hover:text-[#2E5A43] hover:decoration-[#2E5A43]/40"
                >
                  Остались вопросы? Напишите
                </button>
              </div>
            </>
          ) : null}
        </div>
      </nav>
      <ContactQuestionModal isOpen={contactOpen} onClose={() => setContactOpen(false)} user={user} />
    </motion.aside>
  );
}

function ShopPicker({
  currentShopName,
  shops,
  selectedShopId,
  onSelectShop,
  onAddShop,
  onDeleteShop,
  deletingShopId = null,
}: {
  currentShopName: string;
  shops: { id: string; name: string }[];
  selectedShopId: string;
  onSelectShop: (id: string) => void;
  onAddShop: (name: string) => void;
  onDeleteShop: (id: string) => void | Promise<void>;
  deletingShopId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [shopToDelete, setShopToDelete] = useState<{ id: string; name: string } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const canDeleteShop = shops.length > 1;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
        setDraftName("");
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const submitNewShop = () => {
    const name = draftName.trim();
    if (name.length < 2) return;
    onAddShop(name);
    setDraftName("");
    setAdding(false);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative mt-2 w-full">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center justify-center gap-2 rounded-lg px-1 py-1 outline-none transition hover:opacity-90"
      >
        <span
          className="min-w-0 truncate text-[1.2rem] font-bold leading-tight tracking-[-0.03em] lg:text-[1.3rem]"
          style={serif}
        >
          {currentShopName}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#5f5a52] transition ${open ? "rotate-180" : ""}`}
          strokeWidth={2.4}
        />
      </button>
      {open ? (
        <ul
          className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-[80] overflow-hidden rounded-xl border border-[#c9c1b6]/90 bg-[#F7F4ED] py-1 shadow-[0_12px_40px_-12px_rgba(10,10,10,0.28)] ring-1 ring-white/60"
          role="listbox"
        >
          {shops.map((s) => {
            const selected = s.id === selectedShopId;
            return (
              <li key={s.id} role="option" aria-selected={selected}>
                <div
                  className={`flex items-center gap-1 px-1.5 py-0.5 ${
                    selected ? "bg-[#B9FF4B]/20" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded-lg px-2 py-2 text-center transition hover:bg-black/[0.04]"
                    onClick={() => {
                      onSelectShop(s.id);
                      setOpen(false);
                      setAdding(false);
                      setDraftName("");
                    }}
                  >
                    <span className="truncate text-[15px] font-semibold text-[#0a0a0a]" style={serif}>
                      {s.name}
                    </span>
                  </button>
                  {canDeleteShop ? (
                    <button
                      type="button"
                      aria-label={`Удалить магазин ${s.name}`}
                      disabled={Boolean(deletingShopId)}
                      onClick={() => setShopToDelete(s)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#8a5a5a] transition hover:bg-[#991B1B]/10 hover:text-[#991B1B] disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
          <li className="border-t border-[#c9c1b6]/55">
            {adding ? (
              <div className="px-3 py-2.5">
                <input
                  ref={inputRef}
                  type="text"
                  value={draftName}
                  maxLength={80}
                  placeholder="Название магазина"
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitNewShop();
                    }
                    if (e.key === "Escape") {
                      setAdding(false);
                      setDraftName("");
                    }
                  }}
                  className="w-full rounded-lg border border-[#c9c1b6]/80 bg-white/70 px-3 py-2 text-[14px] text-[#0a0a0a] outline-none ring-0 placeholder:text-[#8a847c] focus:border-[#2E5A43]/35"
                  style={sans}
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAdding(false);
                      setDraftName("");
                    }}
                    className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-[#5f5a52] transition hover:bg-black/[0.04]"
                    style={sans}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    disabled={draftName.trim().length < 2}
                    onClick={submitNewShop}
                    className="rounded-lg bg-[#0a0a0a] px-3 py-1.5 text-[13px] font-semibold text-white transition enabled:hover:bg-[#161816] disabled:opacity-40"
                    style={sans}
                  >
                    Добавить
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex w-full items-center justify-center gap-2 px-3 py-2.5 text-[14px] font-semibold text-[#2E5A43] transition hover:bg-[#B9FF4B]/15"
                style={sans}
              >
                <Plus className="h-4 w-4" strokeWidth={2.4} />
                Добавить магазин
              </button>
            )}
          </li>
        </ul>
      ) : null}

      <WorkspaceConfirmDialog
        open={shopToDelete != null}
        title={`Удалить магазин «${shopToDelete?.name ?? ""}»?`}
        description="Будут удалены все настройки, подключённые площадки, кэш отзывов и история ответов по этому магазину. Действие нельзя отменить."
        confirmLabel="Удалить магазин"
        confirming={Boolean(deletingShopId && shopToDelete?.id === deletingShopId)}
        onClose={() => {
          if (!deletingShopId) setShopToDelete(null);
        }}
        onConfirm={async () => {
          if (!shopToDelete) return;
          await onDeleteShop(shopToDelete.id);
          setShopToDelete(null);
          setOpen(false);
          setAdding(false);
          setDraftName("");
        }}
      />
    </div>
  );
}
