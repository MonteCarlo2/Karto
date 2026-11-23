/**
 * Уведомления браузера и звук. Работают, пока страница платформы открыта, но человек смотрит на другую вкладку или окно.
 * Когда страница закрыта, уведомления приходят в Telegram (их шлёт сервер).
 */

export type BrowserPermission = "granted" | "denied" | "default" | "unsupported";

export function browserPermission(): BrowserPermission {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export async function requestBrowserPermission(): Promise<BrowserPermission> {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

let audio: AudioContext | null = null;

/** Короткий мягкий двойной звук. Файл не нужен: звук собирается в браузере. Если браузер не разрешил звук, молча ничего не делаем. */
export function playChime(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    if (audio.state === "suspended") void audio.resume();
    const t0 = audio.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = t0 + i * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      osc.connect(gain).connect(audio!.destination);
      osc.start(start);
      osc.stop(start + 0.5);
    });
  } catch {
    /* звук не критичен */
  }
}

export function showBrowserNotification(input: { title: string; body: string; tag: string; onClick?: () => void }): boolean {
  if (browserPermission() !== "granted") return false;
  try {
    const n = new Notification(input.title.slice(0, 120), { body: input.body.slice(0, 200), tag: input.tag, silent: true });
    n.onclick = () => {
      window.focus();
      n.close();
      input.onClick?.();
    };
    return true;
  } catch {
    return false;
  }
}

/** Какие события считать «новыми для уведомления»: не служебные и не «info». Чистая функция для теста. */
export function pickNewForBrowser<T extends { id: string; severity: string; kind: string; createdAt: string }>(events: T[], seen: Set<string>, nowMs: number, retired: ReadonlySet<string>): T[] {
  return events.filter((e) => !seen.has(e.id) && e.severity !== "info" && !retired.has(e.kind) && e.kind !== "sync_completed" && nowMs - Date.parse(e.createdAt) < 24 * 3_600_000);
}
