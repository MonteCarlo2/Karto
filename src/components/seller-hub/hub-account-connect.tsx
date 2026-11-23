"use client";

import Image from "next/image";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, ClipboardPaste, ExternalLink, Eye, EyeOff, X } from "lucide-react";
import { sellerHubApiGuide } from "@/lib/seller-hub/api-guide";
import { sellerHubMarketplaceMeta } from "@/lib/seller-hub/nav";
import type { SellerHubScope } from "@/lib/seller-hub/types";
import { jwtExpiresAt, tokenDaysLeft, tokenDaysText, tokenExpiryLevel } from "@/lib/seller-hub/token-expiry";
import { formatInt, hub, HubBadge, HubButton, hubSans } from "./hub-ui";
import { Group, Row, type AccountProps } from "./hub-account";

const SCOPE_KEY_BY_LABEL: Record<string, SellerHubScope> = {
  Контент: "content",
  "Цены и скидки": "prices",
  Статистика: "stocks",
  Маркетплейс: "marketplace",
  Аналитика: "analytics",
  Поставки: "supplies",
  Продвижение: "promotion",
  "Календарь акций": "promotion",
  Product: "content",
  Prices: "prices",
  Stocks: "stocks",
  Analytics: "analytics",
  "Просмотр товаров и карточек": "content",
  "Настройка магазинов": "content",
  "Просмотр информации о заказах": "analytics",
};

const LEVEL_COLOR = { ok: "#14874E", soon: "#B7791F", urgent: "#D33A3C", expired: "#D33A3C" } as const;
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

/** Раздел «Подключения»: срок токена, крупное поле токена с инструкцией рядом, ход загрузки каталога, доступы и отключение. */
export function HubAccountConnect({ connection, wbTokenDraft, onWbTokenDraftChange, onPatch, onVerify, onDisconnect, verifying, syncing, error, notice, phase, onOpenCatalog }: AccountProps) {
  const [showKey, setShowKey] = useState(true);
  const [confirmOff, setConfirmOff] = useState(false);
  const [pasteMsg, setPasteMsg] = useState<string | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);

  const marketplaceId = connection.marketplaceId;
  const meta = sellerHubMarketplaceMeta(marketplaceId);
  const guide = sellerHubApiGuide(marketplaceId);
  const isConnected = connection.status === "active" && Boolean(connection.verifiedAt);
  const isWb = marketplaceId === "wildberries";
  const draft = isWb ? wbTokenDraft : connection.apiKey;
  const draftKey = draft.trim();
  const busy = verifying || syncing || phase === "checking" || phase === "loading";

  const draftExp = useMemo(() => (draftKey ? jwtExpiresAt(draftKey) : null), [draftKey]);
  const looksLikeToken = draftKey.split(".").length === 3 && draftKey.length > 80;
  const nowMs = useMemo(() => Date.now(), []);
  const days = tokenDaysLeft(connection.tokenExpiresAt, nowMs);
  const level = tokenExpiryLevel(days);

  const states = guide.scopes.map((s) => ({ ...s, state: SCOPE_KEY_BY_LABEL[s.label] ? connection.scopes?.[SCOPE_KEY_BY_LABEL[s.label]!] : undefined }));
  const granted = states.filter((s) => s.state === true).length;
  const known = states.some((s) => s.state !== undefined);

  const setDraft = (value: string) => {
    if (isWb) {
      onWbTokenDraftChange(value);
      if (!isConnected) onPatch({ status: "idle", verifiedAt: undefined, lastError: undefined });
      return;
    }
    onPatch({ apiKey: value, status: "idle", verifiedAt: undefined, lastError: undefined });
  };

  const paste = async () => {
    setPasteMsg(null);
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        setPasteMsg("В буфере обмена пусто. Скопируйте токен в кабинете Wildberries.");
        return;
      }
      setDraft(text);
      fieldRef.current?.focus();
    } catch {
      setPasteMsg("Браузер не дал прочитать буфер. Вставьте токен в поле сочетанием Ctrl+V.");
      fieldRef.current?.focus();
    }
  };

  const submit = () => onVerify(isConnected ? "replace" : "connect");

  return (
    <>
      {isConnected ? <Expiry days={days} level={level} expiresAt={connection.tokenExpiresAt} onReplace={() => fieldRef.current?.focus()} /> : null}

      <section className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[14px] ring-1 ring-black/[0.08]">
              <Image src={meta.logo} alt="" fill className="object-cover" sizes="48px" unoptimized />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[22px] font-semibold leading-7 tracking-[-0.02em]" style={{ ...hubSans, color: hub.text }}>
                {connection.sellerName?.trim() || meta.name}
              </h2>
              <p className="text-[14px]" style={{ ...hubSans, color: hub.textMuted }}>
                {isConnected ? `Подключён${connection.catalogCount != null ? `, в каталоге ${formatInt(connection.catalogCount)} SKU` : ""}` : "Вставьте токен, и мы подключим кабинет и сразу загрузим каталог"}
              </p>
            </div>
          </div>
          {isConnected ? <HubBadge tone="ok">Подключён</HubBadge> : connection.status === "error" ? <HubBadge tone="danger">Ошибка</HubBadge> : <HubBadge tone="muted">Не подключён</HubBadge>}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          {/* Токен */}
          <div className="min-w-0 rounded-[22px] border bg-white/60 p-5 sm:p-6" style={{ borderColor: "rgba(1,20,8,0.16)" }}>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="wb-token" className="text-[17px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                {isConnected ? "Заменить токен" : "API-токен"}
              </label>
              <span className="text-[12.5px] tabular-nums" style={{ ...hubSans, color: hub.textSubtle }}>
                {draftKey ? `${formatInt(draftKey.length)} символов` : ""}
              </span>
            </div>
            <p className="mt-1 text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
              {isConnected ? "Токен хранится на сервере в зашифрованном виде, повторно вводить его не нужно. Поле нужно, только когда вы создали новый." : "Токен хранится на сервере в зашифрованном виде и в браузере не остаётся. Вводить его придётся только при замене."}
            </p>

            <div className="relative mt-4">
              <textarea
                id="wb-token"
                ref={fieldRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={6}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                placeholder="Вставьте токен целиком: eyJhbGciOi…"
                disabled={busy}
                className="block w-full resize-none rounded-[16px] border bg-white px-4 py-3.5 font-mono text-[13px] leading-[1.6] outline-none transition-[box-shadow,border-color] placeholder:text-[#9AA39C] focus:border-[#011408] focus:shadow-[0_0_0_3px_rgba(185,255,75,0.55)] disabled:opacity-60"
                style={{ borderColor: "rgba(1,20,8,0.25)", color: hub.text, wordBreak: "break-all", WebkitTextSecurity: showKey ? "none" : "disc" } as React.CSSProperties}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <QuickButton onClick={() => void paste()} disabled={busy} icon={<ClipboardPaste className="h-4 w-4" aria-hidden />}>
                Вставить из буфера
              </QuickButton>
              <QuickButton onClick={() => setShowKey((v) => !v)} icon={showKey ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}>
                {showKey ? "Скрыть" : "Показать"}
              </QuickButton>
              <QuickButton onClick={() => { setDraft(""); setPasteMsg(null); fieldRef.current?.focus(); }} disabled={busy || !draft} icon={<X className="h-4 w-4" aria-hidden />}>
                Очистить
              </QuickButton>
              <a href={guide.cabinetUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold transition-colors hover:bg-black/[0.05]" style={{ ...hubSans, color: hub.text }}>
                Открыть кабинет WB
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </div>

            <TokenHint draftKey={draftKey} looksLike={looksLikeToken} exp={draftExp} nowMs={nowMs} pasteMsg={pasteMsg} />

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <HubButton onClick={submit} disabled={!draftKey || busy} loading={verifying}>
                {isConnected ? "Заменить токен" : "Подключить и загрузить каталог"}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </HubButton>
              {isConnected ? (
                <HubButton variant="secondary" onClick={() => onVerify("recheck")} disabled={busy}>
                  Проверить доступы
                </HubButton>
              ) : null}
            </div>

            <Progress phase={phase} count={connection.catalogCount} error={error} notice={notice} onOpenCatalog={onOpenCatalog} />
          </div>

          {/* Инструкция рядом */}
          <aside className="min-w-0 rounded-[22px] border p-5 sm:p-6" style={{ borderColor: "rgba(1,20,8,0.16)", background: "linear-gradient(180deg, rgba(185,255,75,0.14) 0%, transparent 45%)" }}>
            <h3 className="text-[17px] font-semibold" style={{ ...hubSans, color: hub.text }}>
              Как получить токен
            </h3>
            <p className="mt-1 text-[14px]" style={{ ...hubSans, color: hub.textMuted }}>
              {guide.steps.length} шагов в кабинете Wildberries, около минуты
            </p>
            <ol className="mt-4">
              {guide.steps.map((step, i) => (
                <li key={step.title} className="relative flex gap-3.5 pb-4 last:pb-0">
                  {i < guide.steps.length - 1 ? <span className="absolute bottom-0 left-[13px] top-8 w-px" style={{ backgroundColor: "rgba(1,20,8,0.18)" }} aria-hidden /> : null}
                  <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold tabular-nums" style={{ ...hubSans, backgroundColor: hub.ink, color: "#fff" }}>
                    {i + 1}
                  </span>
                  <span className="min-w-0 pt-0.5">
                    <span className="block text-[15px] font-semibold leading-tight" style={{ ...hubSans, color: hub.text }}>
                      {step.title}
                    </span>
                    <span className="mt-1 block text-[13.5px] leading-[1.55]" style={{ ...hubSans, color: hub.textMuted }}>
                      {step.description}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1.5 border-t pt-4" style={{ borderColor: "rgba(1,20,8,0.12)" }}>
              {guide.officialDocs.map((doc) => (
                <a key={doc.url} href={doc.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold hover:underline" style={{ ...hubSans, color: hub.text }}>
                  {doc.label}
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="min-w-0">
        <div className="mb-3 px-1">
          <h2 className="text-[20px] font-semibold leading-7 tracking-[-0.02em]" style={{ ...hubSans, color: hub.text }}>
            Доступы токена
          </h2>
          <p className="mt-0.5 max-w-[68ch] text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
            {known ? `Открыто ${granted} из ${states.length} категорий. Недостающую добавьте в токене в кабинете Wildberries и замените токен.` : isConnected ? "Токен принят. Категории проверяются при каждой загрузке данных." : "Появятся после подключения токена."}
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {states.map((s) => {
            const ok = s.state === true;
            const bad = s.state === false;
            return (
              <li key={s.label} className="relative overflow-hidden rounded-[18px] border bg-white/60 p-4 pl-5" style={{ borderColor: "rgba(1,20,8,0.16)" }}>
                <span className="absolute inset-y-0 left-0 w-[4px]" style={{ backgroundColor: ok ? "#14874E" : bad ? "#D33A3C" : "rgba(1,20,8,0.14)" }} aria-hidden />
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[15.5px] font-semibold leading-tight" style={{ ...hubSans, color: hub.text }}>
                    {s.label}
                  </p>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-semibold" style={{ ...hubSans, color: ok ? "#14874E" : bad ? "#D33A3C" : hub.textSubtle }}>
                    {ok ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : null}
                    {ok ? "Доступно" : bad ? "Нет доступа" : isConnected ? "Принят" : "Не проверено"}
                  </span>
                </div>
                <p className="mt-1.5 text-[13.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
                  {s.purpose}
                </p>
                {s.required ? (
                  <p className="mt-2 text-[11.5px] font-bold uppercase tracking-[0.07em]" style={{ ...hubSans, color: "#9A5B05" }}>
                    Обязательно
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <Group title="Управление" hint="Эти действия не меняют ничего в кабинете Wildberries.">
        <Row title="Отключить Wildberries" hint="Серверный токен будет удалён. Каталог в платформе сохранится, повторное подключение займёт минуту.">
          {isConnected || connection.verifiedAt ? (
            confirmOff ? (
              <span className="flex items-center gap-2">
                <HubButton variant="danger" size="sm" onClick={() => { setConfirmOff(false); onDisconnect(); }}>
                  Да, отключить
                </HubButton>
                <HubButton variant="ghost" size="sm" onClick={() => setConfirmOff(false)}>
                  Отмена
                </HubButton>
              </span>
            ) : (
              <HubButton variant="secondary" size="sm" onClick={() => setConfirmOff(true)}>
                Отключить
              </HubButton>
            )
          ) : (
            <span className="text-[13.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
              Не подключён
            </span>
          )}
        </Row>
      </Group>

      <Group title="Другие площадки" hint="Подключим следующими: данные и агенты будут работать так же, как с Wildberries.">
        {(["ozon", "yandex"] as const).map((id) => {
          const m = sellerHubMarketplaceMeta(id);
          return (
            <Row key={id} title={m.name} hint="Подключение появится позже">
              <div className="flex items-center gap-3">
                <HubBadge tone="muted">Скоро</HubBadge>
                <span className="relative h-10 w-10 overflow-hidden rounded-[11px] opacity-70 ring-1 ring-black/[0.08]">
                  <Image src={m.logo} alt="" fill className="object-cover" sizes="40px" unoptimized />
                </span>
              </div>
            </Row>
          );
        })}
      </Group>
    </>
  );
}

function QuickButton({ children, icon, onClick, disabled }: { children: ReactNode; icon: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex h-10 items-center gap-2 rounded-full border bg-white px-4 text-[14px] font-semibold outline-none transition-[background-color,box-shadow] hover:bg-[rgba(1,20,8,0.04)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)] disabled:cursor-not-allowed disabled:opacity-45" style={{ ...hubSans, borderColor: "rgba(1,20,8,0.2)", color: hub.text }}>
      {icon}
      {children}
    </button>
  );
}

/** Подсказка под полем: похоже ли на токен и до какого числа он действует (читается из самого токена в браузере). */
function TokenHint({ draftKey, looksLike, exp, nowMs, pasteMsg }: { draftKey: string; looksLike: boolean; exp: string | null; nowMs: number; pasteMsg: string | null }) {
  let text: ReactNode = null;
  let color: string = hub.textSubtle;
  if (pasteMsg) {
    text = pasteMsg;
    color = hub.textMuted;
  } else if (!draftKey) {
    text = "Токен выглядит как длинная строка из трёх частей, разделённых точками.";
  } else if (!looksLike) {
    text = "Похоже, токен вставлен не целиком. Он должен состоять из трёх частей через точку.";
    color = "#B7791F";
  } else if (exp) {
    const d = tokenDaysLeft(exp, nowMs) ?? 0;
    text = d <= 0 ? "Срок этого токена уже истёк. Создайте новый в кабинете Wildberries." : `Токен выглядит верно. Действует до ${fmtDay(exp)} (${tokenDaysText(d)}).`;
    color = d <= 0 ? "#D33A3C" : "#14874E";
  } else {
    text = "Токен выглядит верно. Проверим его при подключении.";
    color = "#14874E";
  }
  return (
    <p className="mt-3 min-h-[20px] text-[13.5px] leading-[1.5] transition-colors" style={{ ...hubSans, color }} aria-live="polite">
      {text}
    </p>
  );
}

/** Ход подключения: проверка токена, чтение каталога, готово. Линия между шагами заполняется по мере работы. */
function Progress({ phase, count, error, notice, onOpenCatalog }: { phase: AccountProps["phase"]; count?: number; error: string | null; notice: string | null; onOpenCatalog: () => void }) {
  if (phase === "idle" && !error) return null;
  if (phase === "verified" && !error) {
    return (
      <p className="hub-rise mt-5 flex items-center gap-2 rounded-[14px] px-4 py-3 text-[14.5px] font-semibold" style={{ ...hubSans, backgroundColor: hub.greenSoft, color: hub.greenDark }} role="status">
        <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
        {notice ?? "Доступы проверены."}
      </p>
    );
  }
  const step = phase === "checking" ? 0 : phase === "loading" ? 1 : phase === "done" ? 3 : -1;
  const steps = ["Проверяем токен", "Читаем каталог", "Готово"];
  const failed = phase === "error" || Boolean(error);
  return (
    <div className="hub-rise mt-5 rounded-[18px] p-4 sm:p-5" style={{ backgroundColor: failed ? hub.dangerSoft : "rgba(1,20,8,0.045)" }} role="status" aria-live="polite">
      {failed ? (
        <p className="text-[14.5px] leading-[1.55]" style={{ ...hubSans, color: hub.danger }}>
          {error ?? "Не получилось. Попробуйте ещё раз."}
        </p>
      ) : (
        <>
          <div className="relative flex items-start justify-between">
            <span className="absolute left-[14px] right-[14px] top-[13px] h-[3px] rounded-full" style={{ backgroundColor: "rgba(1,20,8,0.12)" }} aria-hidden />
            <span className="absolute left-[14px] top-[13px] h-[3px] rounded-full transition-[width] duration-[900ms] ease-out" style={{ width: `calc((100% - 28px) * ${Math.min(step, 2) / 2})`, backgroundColor: "#14874E" }} aria-hidden />
            {steps.map((label, i) => {
              const done = step > i || (phase === "done" && i === 2);
              const active = step === i;
              return (
                <span key={label} className="relative z-10 flex w-24 flex-col items-center gap-2 text-center first:items-start first:text-left last:items-end last:text-right">
                  <span className="flex h-[28px] w-[28px] items-center justify-center rounded-full border-2 bg-white transition-colors duration-500" style={{ borderColor: done || active ? "#14874E" : "rgba(1,20,8,0.2)", backgroundColor: done ? "#14874E" : "#fff" }}>
                    {done ? <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} aria-hidden /> : active ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#14874E] border-t-transparent motion-reduce:animate-none" aria-hidden /> : null}
                  </span>
                  <span className="text-[12.5px] font-semibold leading-tight" style={{ ...hubSans, color: done || active ? hub.text : hub.textSubtle }}>
                    {label}
                  </span>
                </span>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[14.5px] leading-[1.5]" style={{ ...hubSans, color: hub.text }}>
              {phase === "done" ? (count != null ? `Каталог загружен: ${formatInt(count)} SKU. Товары, задачи и аналитика уже доступны.` : notice ?? "Готово.") : (notice ?? (phase === "checking" ? "Проверяем токен и доступы…" : "Читаем карточки из кабинета, это занимает до минуты."))}
            </p>
            {phase === "done" ? (
              <HubButton size="sm" onClick={onOpenCatalog}>
                Открыть товары
                <ArrowRight className="h-4 w-4" aria-hidden />
              </HubButton>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

/** Срок токена: сколько дней осталось и что делать, когда он близко к концу. */
function Expiry({ days, level, expiresAt, onReplace }: { days: number | null; level: ReturnType<typeof tokenExpiryLevel>; expiresAt?: string; onReplace: () => void }) {
  if (days == null || !expiresAt) return null;
  const color = LEVEL_COLOR[level];
  const pct = Math.max(0, Math.min(100, (days / 90) * 100));
  const warn = level !== "ok";
  return (
    <section className="rounded-[22px] border p-5 sm:p-6" style={{ borderColor: warn ? `${color}88` : "rgba(1,20,8,0.16)", backgroundColor: warn ? `${color}0F` : "rgba(255,255,255,0.6)" }}>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <p className="text-[12.5px] font-semibold uppercase tracking-[0.08em]" style={{ ...hubSans, color: hub.textSubtle }}>
            Срок действия токена
          </p>
          <p className="mt-2 text-[34px] font-semibold leading-none tracking-[-0.03em]" style={{ ...hubSans, color: warn ? color : hub.text }}>
            {days <= 0 ? "Токен истёк" : `Осталось ${tokenDaysText(days)}`}
          </p>
          <p className="mt-2 text-[14px]" style={{ ...hubSans, color: hub.textMuted }}>
            {days <= 0 ? `Истёк ${fmtDay(expiresAt)}. Данные кабинета больше не обновляются.` : `Действует до ${fmtDay(expiresAt)}. Токен Wildberries выдаётся на ограниченный срок, поэтому его нужно обновлять.`}
          </p>
        </div>
        {warn ? (
          <HubButton onClick={onReplace}>
            Заменить токен
            <ArrowRight className="h-4 w-4" aria-hidden />
          </HubButton>
        ) : null}
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full" style={{ backgroundColor: "rgba(1,20,8,0.08)" }} aria-hidden>
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <p className="mt-3 text-[13.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
        {warn ? "Создайте новый токен заранее в кабинете Wildberries и вставьте его ниже: каталог и данные продолжат обновляться без перерыва." : "Мы напомним в «Событиях» за 14, 7 и 3 дня до окончания и после него, чтобы токен не истёк неожиданно."}
      </p>
    </section>
  );
}
