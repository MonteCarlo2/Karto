"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Страховка раздела: если при отрисовке что-то пойдёт не так, человек не увидит ни красного экрана, ни текста ошибки.
 * Раздел тихо перерисуется сам (до трёх раз), а если и это не помогло, останется спокойная заглушка с кнопкой.
 * Подробности уходят только в консоль для разработчика.
 */
type Props = { children: ReactNode; resetKey: string };
type State = { failed: boolean; attempts: number };

export class HubSectionBoundary extends Component<Props, State> {
  state: State = { failed: false, attempts: 0 };
  private timer: ReturnType<typeof setTimeout> | undefined;

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[seller-hub] раздел перерисован после сбоя:", error, info.componentStack);
    if (this.state.attempts < 3) {
      this.timer = setTimeout(() => this.setState((s) => ({ failed: false, attempts: s.attempts + 1 })), 1200);
    }
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && (this.state.failed || this.state.attempts > 0)) {
      this.setState({ failed: false, attempts: 0 });
    }
  }

  componentWillUnmount() {
    if (this.timer) clearTimeout(this.timer);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 px-6 text-center" role="status">
        <p className="text-[19px] font-semibold" style={{ color: "var(--hub-text)" }}>
          Обновляем раздел
        </p>
        <p className="max-w-[44ch] text-[15px] leading-[1.55]" style={{ color: "var(--hub-text-muted)" }}>
          Данные подтянутся через несколько секунд.
        </p>
        {this.state.attempts >= 3 ? (
          <button type="button" onClick={() => this.setState({ failed: false, attempts: 0 })} className="rounded-full border px-5 py-2 text-[14px] font-semibold" style={{ borderColor: "#7DB36A", color: "var(--hub-text)", backgroundColor: "#fff" }}>
            Обновить раздел
          </button>
        ) : null}
      </div>
    );
  }
}
