"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Bell, Calculator, CreditCard, ExternalLink, PlugZap, UserRound, type LucideIcon } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { autoRepliesAuthorizedFetch } from "@/lib/auto-replies/auto-replies-fetch";
import type { SellerHubConnection } from "@/lib/seller-hub/types";
import { hub, HubButton, hubSans } from "./hub-ui";
import { HubAccountConnect } from "./hub-account-connect";
import { HubAccountBilling } from "./hub-account-billing";
import { HubAccountNotify } from "./hub-account-notify";
import { HubAccountData } from "./hub-account-data";

/**
 * Настройки Seller Hub: простое меню слева и короткие списки настроек справа, как у лучших сервисов.
 * Подключения, тариф и оплата, уведомления, расчёты, аккаунт. Профиль и пароль живут в едином профиле KARTO, здесь только ссылка на него.
 */

export type AccountUser = { id: string; email: string; name: string };

/** Что отдаёт /api/subscription про автоответы (только нужные поля). */
export type AccountSub = {
  autoReplyBalance?: number;
  autoReplyWelcomeRemaining?: number;
  autoReplyPaidRemaining?: number;
  autoReplyPeriodEnd?: string;
  autoReplyPackExpired?: boolean;
  autoReplyAutoRenew?: boolean;
  autoReplyHasSavedCard?: boolean;
  autoReplyCardLast4?: string;
  autoReplyCardBrand?: string;
  autoReplyNextRenewAt?: string;
  autoReplyTariffIndex?: number;
  autoReplyMonthlyPriceRub?: number;
};

export type AccountCtx = {
  user: AccountUser | null;
  sub: AccountSub | null;
  credits: number | null;
  subReady: boolean;
  reloadSub: () => Promise<void>;
};

export type AccountProps = {
  connection: SellerHubConnection;
  wbTokenDraft: string;
  onWbTokenDraftChange: (value: string) => void;
  onPatch: (patch: Partial<SellerHubConnection>) => void;
  onVerify: (mode?: "connect" | "replace" | "recheck") => void;
  onSync: () => void;
  onDisconnect: () => void;
  verifying: boolean;
  syncing: boolean;
  error: string | null;
  notice: string | null;
  /** Этап подключения: проверка токена, загрузка каталога, готово, сбой. */
  phase: "idle" | "checking" | "loading" | "done" | "verified" | "error";
  /** Открыть товары после загрузки каталога. */
  onOpenCatalog: () => void;
};

type SectionId = "connect" | "billing" | "notify" | "data" | "account";

const SECTIONS: Array<{ id: SectionId; label: string; hint: string; icon: LucideIcon }> = [
  { id: "connect", label: "Подключения", hint: "Wildberries, токен, доступы", icon: PlugZap },
  { id: "billing", label: "Тариф и оплата", hint: "Баланс, пакеты, автопродление", icon: CreditCard },
  { id: "notify", label: "Уведомления", hint: "Telegram и события", icon: Bell },
  { id: "data", label: "Расчёты", hint: "Маржа, налог, данные", icon: Calculator },
  { id: "account", label: "Аккаунт", hint: "Профиль и выход", icon: UserRound },
];

export function HubAccount(props: AccountProps) {
  const [section, setSection] = useState<SectionId>("connect");
  const [user, setUser] = useState<AccountUser | null>(null);
  const [sub, setSub] = useState<AccountSub | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [subReady, setSubReady] = useState(false);

  const reloadSub = useCallback(async () => {
    try {
      const res = await autoRepliesAuthorizedFetch("/api/subscription", { method: "GET", timeoutMs: 20_000 });
      const data = (await res.json().catch(() => ({}))) as { subscription?: AccountSub | null; creditBalance?: number };
      if (res.ok) {
        setSub(data.subscription ?? null);
        setCredits(typeof data.creditBalance === "number" ? data.creditBalance : null);
      }
    } catch {
      /* остаются прошлые значения */
    } finally {
      setSubReady(true);
    }
  }, []);

  useEffect(() => {
    let off = false;
    void (async () => {
      try {
        const { data } = await createBrowserClient().auth.getUser();
        const u = data.user;
        if (!off && u) {
          const meta = (u.user_metadata ?? {}) as { name?: string; full_name?: string };
          setUser({ id: u.id, email: u.email ?? "", name: meta.name ?? meta.full_name ?? "" });
        }
      } catch {
        /* профиль не открылся: аккаунт покажет прочерки */
      }
    })();
    void reloadSub();
    return () => {
      off = true;
    };
  }, [reloadSub]);

  const ctx: AccountCtx = { user, sub, credits, subReady, reloadSub };

  return (
    <div className="grid gap-8 pb-8 lg:grid-cols-[280px_minmax(0,1fr)]">
      <nav aria-label="Разделы настроек" className="lg:sticky lg:top-2 lg:self-start">
        <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SECTIONS.map((s) => {
            const on = s.id === section;
            const Icon = s.icon;
            return (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setSection(s.id)}
                  aria-current={on ? "page" : undefined}
                  className="group flex w-full items-center gap-3.5 rounded-[16px] px-4 py-3.5 text-left outline-none transition-[background-color,box-shadow] duration-200 hover:bg-[rgba(1,20,8,0.045)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]"
                  style={{ ...hubSans, backgroundColor: on ? "#FFFFFF" : undefined, boxShadow: on ? "0 0 0 1px rgba(1,20,8,0.14), 0 6px 18px -12px rgba(1,20,8,0.35)" : undefined }}
                >
                  <Icon className="h-[22px] w-[22px] shrink-0 transition-colors" style={{ color: on ? hub.text : hub.textMuted }} strokeWidth={1.7} aria-hidden />
                  <span className="min-w-0">
                    <span className="block whitespace-nowrap text-[16.5px] leading-tight" style={{ color: hub.text, fontWeight: on ? 650 : 550 }}>
                      {s.label}
                    </span>
                    <span className="mt-1 hidden truncate text-[13px] lg:block" style={{ color: hub.textSubtle }}>
                      {s.hint}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div key={section} className={`hub-fade-in min-w-0 space-y-8 ${section === "connect" ? "max-w-[1180px]" : "max-w-[920px]"}`}>
        {section === "connect" ? <HubAccountConnect {...props} /> : null}
        {section === "billing" ? <HubAccountBilling ctx={ctx} /> : null}
        {section === "notify" ? <HubAccountNotify /> : null}
        {section === "data" ? <HubAccountData connection={props.connection} /> : null}
        {section === "account" ? <AccountSection ctx={ctx} connection={props.connection} /> : null}
      </div>
    </div>
  );
}

function AccountSection({ ctx, connection }: { ctx: AccountCtx; connection: SellerHubConnection }) {
  const { user } = ctx;
  const signOut = async () => {
    try {
      await createBrowserClient().auth.signOut();
    } finally {
      window.location.href = "/";
    }
  };
  return (
    <>
      <section className="flex flex-wrap items-center gap-5 rounded-[22px] border bg-white/60 p-5 sm:p-6" style={{ borderColor: "rgba(1,20,8,0.16)" }}>
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-[26px] font-semibold" style={{ ...hubSans, backgroundColor: hub.ink, color: "#fff" }} aria-hidden>
          {(user?.name || user?.email || "?").trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[22px] font-semibold leading-tight tracking-[-0.02em]" style={{ ...hubSans, color: hub.text }}>
            {user?.name || "Без имени"}
          </p>
          <p className="mt-0.5 truncate text-[15px]" style={{ ...hubSans, color: hub.textMuted }}>
            {user?.email || "—"}
          </p>
          <p className="mt-0.5 truncate text-[13.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
            {connection.sellerName?.trim() ? `Магазин: ${connection.sellerName.trim()}` : "Магазин появится после подключения Wildberries"}
          </p>
        </div>
        <a href="/profile" className="inline-flex h-11 items-center gap-2 rounded-full border bg-white px-5 text-[14.5px] font-semibold transition-colors hover:bg-[rgba(1,20,8,0.04)]" style={{ ...hubSans, borderColor: "rgba(1,20,8,0.2)", color: hub.text }}>
          Открыть профиль
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </section>
      <Group title="Аккаунт" hint="Имя, пароль и удаление аккаунта общие для всей платформы KARTO и меняются в едином профиле.">
        <Row title="Выйти из аккаунта" hint="Вы выйдете на этом устройстве. Данные кабинета и настройки сохранятся.">
          <HubButton variant="secondary" size="sm" onClick={() => void signOut()}>
            Выйти
          </HubButton>
        </Row>
      </Group>
    </>
  );
}

/** Группа настроек: заголовок, короткое пояснение и рамка со строками. */
export function Group({ title, hint, children, action }: { title: string; hint?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 className="text-[20px] font-semibold leading-7 tracking-[-0.02em]" style={{ ...hubSans, color: hub.text }}>
            {title}
          </h2>
          {hint ? (
            <p className="mt-0.5 max-w-[68ch] text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
              {hint}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="divide-y rounded-[20px] border bg-white/60" style={{ borderColor: "rgba(1,20,8,0.16)" }}>
        {children}
      </div>
    </section>
  );
}

/** Строка настройки: название и пояснение слева, управление справа. */
export function Row({ title, hint, children, className = "" }: { title: string; hint?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4 ${className}`} style={{ borderColor: "rgba(1,20,8,0.1)" }}>
      <div className="min-w-0 flex-1 basis-[240px]">
        <p className="text-[15.5px] font-semibold leading-tight" style={{ ...hubSans, color: hub.text }}>
          {title}
        </p>
        {hint ? (
          <div className="mt-1 max-w-[62ch] text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
            {hint}
          </div>
        ) : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}
