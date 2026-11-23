"use client";

import { useEffect, useState } from "react";
import { autoRepliesAuthorizedFetch } from "@/lib/auto-replies/auto-replies-fetch";
import { browserPermission, playChime, requestBrowserPermission, showBrowserNotification, type BrowserPermission } from "@/lib/seller-hub/browser-notify";
import { AgentSwitch } from "./hub-agents-ui";
import { Segmented } from "./hub-analytics-ui";
import { WorkspaceTelegramPanel } from "./comms/workspace-telegram-panel";
import { hub, HubButton, hubSans } from "./hub-ui";
import { useUserSetting } from "./use-user-setting";
import { Group, Row } from "./hub-account";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

function HourSelect({ value, onChange, label }: { value: number; onChange: (h: number) => void; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-10 rounded-full border bg-white px-4 text-[14px] font-semibold outline-none focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, borderColor: "rgba(1,20,8,0.2)", color: hub.text }}>
      {HOURS.map((h) => (
        <option key={h} value={h}>
          {hourLabel(h)}
        </option>
      ))}
    </select>
  );
}

/** Раздел «Уведомления»: Telegram (подключение, что и когда присылать, проверка), браузер со звуком, правила ленты «События». Настройки хранятся на сервере. */
export function HubAccountNotify() {
  const [tg, setTg] = useUserSetting<boolean>("notify.tg", true);
  const [level, setLevel] = useUserSetting<string>("notify.tg.events", "important");
  const [tgTasks, setTgTasks] = useUserSetting<boolean>("notify.tg.tasks", true);
  const [tgAgent, setTgAgent] = useUserSetting<boolean>("notify.tg.agent", true);
  const [tgToken, setTgToken] = useUserSetting<boolean>("notify.tg.token", true);
  const [quiet, setQuiet] = useUserSetting<boolean>("notify.quiet", false);
  const [quietFrom, setQuietFrom] = useUserSetting<number>("notify.quietFrom", 23);
  const [quietTo, setQuietTo] = useUserSetting<number>("notify.quietTo", 8);
  const [browserOn, setBrowserOn] = useUserSetting<boolean>("notify.browser", true);
  const [sound, setSound] = useUserSetting<boolean>("notify.sound", true);

  const [sensitivity, setSensitivity] = useUserSetting<string>("events.sensitivity", "normal");
  const [newsGeneral, setNewsGeneral] = useUserSetting<boolean>("events.newsGeneral", false);
  const [newsPersonalOnly, setNewsPersonalOnly] = useUserSetting<boolean>("events.newsPersonalOnly", false);
  const [groupBursts, setGroupBursts] = useUserSetting<boolean>("events.groupBursts", true);
  const [autoRead, setAutoRead] = useUserSetting<boolean>("events.autoRead", true);

  const [perm, setPerm] = useState<BrowserPermission>("default");
  useEffect(() => setPerm(browserPermission()), []);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const sendTest = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await autoRepliesAuthorizedFetch("/api/seller-hub/notify/test", { method: "POST", timeoutMs: 75_000 });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      setTestMsg(data.ok ? { ok: true, text: "Отправлено. Проверьте чат с ботом в Telegram." } : { ok: false, text: data.error ?? "Не получилось отправить." });
    } catch {
      setTestMsg({ ok: false, text: "Нет связи с сервером. Попробуйте ещё раз." });
    } finally {
      setTesting(false);
    }
  };

  const [diag, setDiag] = useState<{ busy: boolean; steps?: Array<{ id: string; title: string; ok: boolean; detail: string }>; error?: string }>({ busy: false });
  const runDiag = async () => {
    setDiag({ busy: true });
    try {
      const res = await autoRepliesAuthorizedFetch("/api/seller-hub/notify/diagnose", { method: "GET", timeoutMs: 85_000 });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; steps?: Array<{ id: string; title: string; ok: boolean; detail: string }> };
      setDiag(data.ok ? { busy: false, steps: data.steps } : { busy: false, error: data.error ?? "Не получилось проверить." });
    } catch {
      setDiag({ busy: false, error: "Нет связи с сервером." });
    }
  };

  const enableBrowser = async (on: boolean) => {
    setBrowserOn(on);
    if (on && perm === "default") setPerm(await requestBrowserPermission());
  };

  const testBrowser = async () => {
    let p = perm;
    if (p === "default") {
      p = await requestBrowserPermission();
      setPerm(p);
    }
    if (p !== "granted") return;
    showBrowserNotification({ title: "KARTO: пробное уведомление", body: "Так будут выглядеть уведомления, когда вы на другой вкладке.", tag: "karto-test" });
    if (sound) playChime();
  };

  return (
    <>
      <Group title="Telegram" hint="Уведомления в мессенджер и помощник: можно спросить, как дела в магазине. Подключение общее для платформы KARTO.">
        <div className="p-4">
          <WorkspaceTelegramPanel shopId="main" marketplaceId="wildberries" />
        </div>
        <Row title="Диагностика Telegram" hint={diag.error ? <span style={{ color: hub.danger }}>{diag.error}</span> : "Проверит по шагам: токен бота, как бот получает сообщения, доходит ли сервер до Telegram, привязан ли чат."}>
          <HubButton variant="secondary" size="sm" onClick={() => void runDiag()} loading={diag.busy}>
            Проверить
          </HubButton>
        </Row>
        {diag.steps ? (
          <ul className="divide-y px-5" style={{ borderColor: "rgba(1,20,8,0.1)" }}>
            {diag.steps.map((st) => (
              <li key={st.id} className="py-3">
                <p className="text-[14.5px] font-semibold" style={{ ...hubSans, color: st.ok ? hub.greenDark : hub.danger }}>
                  {st.ok ? "✓" : "✕"} {st.title}
                </p>
                <p className="mt-0.5 text-[13.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
                  {st.detail}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
        <Row title="Проверить доставку" hint={testMsg ? <span style={{ color: testMsg.ok ? hub.greenDark : hub.danger }}>{testMsg.text}</span> : "Пришлём пробное уведомление в ваш чат с ботом."}>
          <HubButton variant="secondary" size="sm" onClick={() => void sendTest()} loading={testing}>
            Отправить пробное
          </HubButton>
        </Row>
      </Group>

      <Group title="Что присылать в Telegram" hint="Все уведомления в любом случае попадают в раздел «События». Здесь выбирается, что вдобавок приходит в мессенджер.">
        <Row title="Присылать в Telegram" hint="Общий выключатель. Помощник в чате отвечает на вопросы и при выключенных уведомлениях.">
          <AgentSwitch label="Присылать в Telegram" checked={tg} onChange={setTg} />
        </Row>
        <Row title="События магазина" hint="Какие события присылать: срочные, важные и срочные, или все.">
          <Segmented<string> size="sm" layoutId="notify-level" label="События в Telegram" value={level} onChange={setLevel} options={[{ id: "off", label: "Нет" }, { id: "critical", label: "Срочные" }, { id: "important", label: "Важные" }, { id: "all", label: "Все" }]} />
        </Row>
        <Row title="Срочные задачи" hint="Задачи, которые нельзя откладывать, например убыточная цена.">
          <AgentSwitch label="Срочные задачи" checked={tgTasks} onChange={setTgTasks} />
        </Row>
        <Row title="Работа агента" hint="Результаты поручений, напоминания и итоги планов.">
          <AgentSwitch label="Работа агента" checked={tgAgent} onChange={setTgAgent} />
        </Row>
        <Row title="Срок токена Wildberries" hint="За 14, 7 и 3 дня до окончания и после него. Рекомендуем не выключать.">
          <AgentSwitch label="Срок токена Wildberries" checked={tgToken} onChange={setTgToken} />
        </Row>
      </Group>

      <Group title="Тихие часы" hint="Время по Москве. В тихие часы приходит только срочное, остальное придёт сразу после их окончания.">
        <Row title="Не беспокоить ночью">
          <AgentSwitch label="Не беспокоить ночью" checked={quiet} onChange={setQuiet} />
        </Row>
        <Row title="Часы" hint={quiet ? (quietFrom === quietTo ? "Начало и конец совпадают: тихих часов нет." : `Тихо с ${hourLabel(quietFrom)} до ${hourLabel(quietTo)}.`) : "Выключено."}>
          <div className="flex items-center gap-2">
            <HourSelect value={quietFrom} onChange={setQuietFrom} label="Тихие часы с" />
            <span style={{ ...hubSans, color: hub.textMuted }}>до</span>
            <HourSelect value={quietTo} onChange={setQuietTo} label="Тихие часы до" />
          </div>
        </Row>
      </Group>

      <Group title="В браузере" hint="Когда платформа открыта, но вы на другой вкладке, придёт уведомление со звуком. Если вкладка закрыта, ждите Telegram.">
        <Row title="Уведомления браузера" hint={perm === "denied" ? "Браузер запретил уведомления для этого сайта. Разрешите их в настройках сайта (значок замка рядом с адресом)." : perm === "unsupported" ? "Этот браузер не поддерживает уведомления." : perm === "granted" ? "Разрешено." : "Браузер спросит разрешение при включении."}>
          <AgentSwitch label="Уведомления браузера" checked={browserOn && perm !== "denied" && perm !== "unsupported"} disabled={perm === "denied" || perm === "unsupported"} onChange={(v) => void enableBrowser(v)} />
        </Row>
        <Row title="Звук" hint="Короткий мягкий сигнал вместе с уведомлением.">
          <AgentSwitch label="Звук" checked={sound} onChange={setSound} />
        </Row>
        <Row title="Проверить" hint="Покажем пробное уведомление браузера.">
          <HubButton variant="secondary" size="sm" onClick={() => void testBrowser()} disabled={perm === "denied" || perm === "unsupported"}>
            Показать пробное
          </HubButton>
        </Row>
      </Group>

      <Group title="Лента «События»" hint="Что вообще считать событием. Те же настройки есть в самой ленте.">
        <Row title="Чувствительность" hint="Насколько заметное отклонение продаж считать событием. Выше значит больше уведомлений.">
          <Segmented<string> size="sm" layoutId="notify-sensitivity" label="Чувствительность" value={sensitivity} onChange={setSensitivity} options={[{ id: "low", label: "Низкая" }, { id: "normal", label: "Обычная" }, { id: "high", label: "Высокая" }]} />
        </Row>
        <Row title="Общие новости Wildberries" hint="По умолчанию в ленте только персональные и важные новости. Включите, чтобы видеть и общие.">
          <AgentSwitch label="Общие новости Wildberries" checked={newsGeneral} onChange={setNewsGeneral} />
        </Row>
        <Row title="Только адресованные вашему кабинету" hint="Показывать лишь те новости, которые Wildberries адресовал именно вам.">
          <AgentSwitch label="Только адресованные вашему кабинету" checked={newsPersonalOnly} onChange={setNewsPersonalOnly} />
        </Row>
        <Row title="Объединять серии" hint="Однотипные события по многим товарам собираются в одно уведомление со списком.">
          <AgentSwitch label="Объединять серии" checked={groupBursts} onChange={setGroupBursts} />
        </Row>
        <Row title="Отмечать прочитанным при открытии" hint="Уведомление считается прочитанным, как только вы его открыли.">
          <AgentSwitch label="Отмечать прочитанным при открытии" checked={autoRead} onChange={setAutoRead} />
        </Row>
      </Group>
    </>
  );
}
