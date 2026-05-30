export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { startAutoReplyBackgroundScheduler } = await import(
      "@/lib/auto-replies/inbox-scheduler"
    );
    startAutoReplyBackgroundScheduler();
  } catch (e) {
    console.error("[instrumentation] auto-reply scheduler failed to start:", e);
  }
}
