export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startAutoReplyBackgroundScheduler } = await import("@/lib/auto-replies/inbox-scheduler");
  startAutoReplyBackgroundScheduler();
}
