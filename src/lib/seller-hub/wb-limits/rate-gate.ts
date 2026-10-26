import type { WbLimit } from "./index";

/**
 * Шлюз лимитов WB: говорит, через сколько мс можно отправить следующий запрос, и запоминает, что запрос ушёл.
 * Состояние раздельное по ключу «кабинет + общая очередь метода»: лимит WB считается на токен, чужие кабинеты друг другу не мешают.
 * Считает время только по переданным `now`: так его можно проверять тестами без ожидания.
 *
 * Правила (как у WB): не чаще одного запроса за интервал, не больше `perPeriod` за период и не больше `burst` подряд без пауз.
 * Запас безопасности: интервал увеличен на SAFETY, чтобы расхождение часов и сетевые задержки не привели к 429.
 */

const SAFETY = 1.1;

type State = {
  /** Моменты отправки в пределах периода (скользящее окно). */
  sent: number[];
  /** Жетоны всплеска: восполняются по одному за интервал. */
  tokens: number;
  tokensAt: number;
  /** До этого момента WB попросил молчать (ответ 429 или Retry-After). */
  blockedUntil: number;
};

export class WbRateGate {
  private readonly states = new Map<string, State>();

  private stateOf(cabinetId: string, limit: WbLimit, now: number): State {
    const key = `${cabinetId}|${limit.key}`;
    let state = this.states.get(key);
    if (!state) {
      state = { sent: [], tokens: limit.burst, tokensAt: now, blockedUntil: 0 };
      this.states.set(key, state);
    }
    return state;
  }

  private refill(state: State, limit: WbLimit, now: number): void {
    const interval = limit.intervalMs * SAFETY;
    const gained = Math.floor((now - state.tokensAt) / interval);
    if (gained > 0) {
      state.tokens = Math.min(limit.burst, state.tokens + gained);
      state.tokensAt += gained * interval;
    }
    if (state.tokens >= limit.burst) state.tokensAt = now;
    state.sent = state.sent.filter((t) => now - t < limit.periodMs);
  }

  /** Сколько мс ждать до разрешённой отправки (0 — можно сейчас). Ничего не записывает. */
  waitMs(cabinetId: string, limit: WbLimit, now: number): number {
    const state = this.stateOf(cabinetId, limit, now);
    this.refill(state, limit, now);
    let wait = Math.max(0, state.blockedUntil - now);
    if (state.tokens < 1) {
      wait = Math.max(wait, state.tokensAt + limit.intervalMs * SAFETY - now);
    }
    if (state.sent.length >= limit.perPeriod) {
      const oldest = state.sent[state.sent.length - limit.perPeriod]!;
      wait = Math.max(wait, oldest + limit.periodMs - now);
    }
    return Math.ceil(wait);
  }

  /** Фиксирует отправку запроса в момент `now`. Вызывать после того, как `waitMs` вернул 0. */
  record(cabinetId: string, limit: WbLimit, now: number): void {
    const state = this.stateOf(cabinetId, limit, now);
    this.refill(state, limit, now);
    if (state.tokens >= limit.burst) state.tokensAt = now;
    state.tokens = Math.max(0, state.tokens - 1);
    state.sent.push(now);
  }

  /** WB ответил 429: молчим не меньше, чем он просил (Retry-After), а без подсказки в два периода интервала. */
  penalize(cabinetId: string, limit: WbLimit, now: number, retryAfterMs: number | null): void {
    const state = this.stateOf(cabinetId, limit, now);
    const pause = retryAfterMs != null && retryAfterMs > 0 ? retryAfterMs : Math.max(limit.intervalMs * 2, 5000);
    state.blockedUntil = Math.max(state.blockedUntil, now + pause);
    state.tokens = 0;
    state.tokensAt = now;
  }
}
