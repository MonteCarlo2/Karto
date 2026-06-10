export class NetworkTimeoutError extends Error {
  constructor(label: string, readonly timeoutMs: number) {
    super(`${label}: сервер не ответил за ${Math.round(timeoutMs / 1000)} с`);
    this.name = "NetworkTimeoutError";
  }
}

export async function withNetworkTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new NetworkTimeoutError(label, timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
