/** Dev-only: пропуск батча из 4 карточек и переход сразу в режим серии. */
export function isFlowDevSkipBatchEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_FLOW_DEV_SKIP_BATCH === "1"
  );
}

/** Dev-only: разрешить видео и обход демо-ограничений при локальной разработке. */
export function isFlowDevBypassClientEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    (process.env.NEXT_PUBLIC_FLOW_DEV_BYPASS === "1" ||
      process.env.NEXT_PUBLIC_FLOW_DEV_SKIP_BATCH === "1")
  );
}

export function isFlowDevBypassServerEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" && process.env.FLOW_DEV_BYPASS === "1"
  );
}
