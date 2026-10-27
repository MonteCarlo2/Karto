/**
 * Проверочный прогон ИИ-наблюдателя на реальных данных кабинета из нашей базы: показывает, что сейчас пишут алгоритмы (открытые задачи
 * и события за двое суток) и что скажет ИИ. В WB ничего не пишет, находки в базу не пишет (dryRun). Тратит несколько центов.
 *
 *   npx tsx --env-file=.env.local scripts/seller-hub-observer-dryrun.ts <userId>
 */
import { runObserver } from "@/lib/seller-hub/agent/ai-observer-run";
import { algorithmView, FINDING_KIND_LABEL } from "@/lib/seller-hub/agent/ai-observer";
import { loadScenarioProducts } from "@/lib/seller-hub/agent/scenario-inputs";
import { composeSnapshot } from "@/lib/seller-hub/sync/derive";
import { SyncStore } from "@/lib/seller-hub/sync/store";
import { listSellerHubTasks } from "@/lib/seller-hub/task-engine/repository";
import { createServerClient } from "@/lib/supabase/server";

async function main() {
  const userId = process.argv[2];
  if (!userId) throw new Error("Укажите userId первым аргументом");
  const db = createServerClient();
  const built = await composeSnapshot(new SyncStore(db), db, { userId, marketplaceId: "wildberries" });
  if (!built) throw new Error("Нет снимка кабинета");
  const nowMs = Date.now();
  const products = await loadScenarioProducts(db, userId, built.snapshot, nowMs);
  const allTasks = await listSellerHubTasks(userId, "wildberries");
  const tasks = allTasks.filter((t) => t.status === "active" || t.status === "in_progress").map((t) => ({ type: t.type, title: t.title, nmId: t.nmId, severity: t.severity }));
  const since = new Date(nowMs - 48 * 3_600_000).toISOString();
  const { data: ev } = await db.from("seller_hub_product_events").select("kind, title, detail, nm_id, created_at").eq("user_id", userId).eq("marketplace_id", "wildberries").gte("created_at", since).order("created_at", { ascending: false }).limit(60);
  const events = (ev ?? []).map((e) => ({ kind: String(e.kind), title: String(e.title), detail: String(e.detail ?? ""), nmId: (e.nm_id as string | null) ?? null, at: String(e.created_at) }));

  console.log(`Товаров ${products.length}, открытых задач алгоритмов ${tasks.length}, событий за 48 ч ${events.length}\n`);
  console.log("=== АЛГОРИТМЫ: открытые задачи ===");
  for (const t of tasks.slice(0, 40)) console.log(`- [${t.severity}] ${t.title}${t.nmId ? ` (nm ${t.nmId})` : ""}`);
  console.log("\n=== АЛГОРИТМЫ: события за 48 ч ===");
  for (const e of events.slice(0, 25)) console.log(`- ${e.at.slice(0, 16)} ${e.title}${e.nmId ? ` (nm ${e.nmId})` : ""}`);

  const run = await runObserver({ db, userId, products, tasks, events, nowMs, force: true, dryRun: !process.argv.includes("--save") });
  console.log(`\n=== ИИ-НАБЛЮДАТЕЛЬ: ${run.verdict === "findings" ? `находок ${run.findings.length}` : "тихо"} · отброшено проверкой цифр ${run.dropped} · вызовов ${run.calls} · $${run.costUsd.toFixed(4)} ===`);
  if (run.summary) console.log(`Резюме: ${run.summary}`);
  for (const f of run.findings) {
    const view = algorithmView(f, tasks);
    console.log(`\n[${f.severity}] ${FINDING_KIND_LABEL[f.kind]}: ${f.title}${f.nmId ? ` (nm ${f.nmId})` : ""}`);
    console.log(`  Что: ${f.what}`);
    console.log(`  Почему сейчас: ${f.whyNow}`);
    console.log(`  Цифры: ${f.evidence.map((e) => `${e.key}=${e.value}`).join(", ")}`);
    console.log(`  Совет: ${f.humanAdvice}`);
    console.log(`  Действие: ${f.action ? `цену ${f.action.direction === "raise" ? "поднять" : "снизить"} на ступень ${f.action.stepPercent}% (${f.action.reason})` : "нет, только наблюдение и совет"}`);
    console.log(`  Второй ИИ: ${f.second}${f.secondReason ? ` — ${f.secondReason}` : ""}`);
    console.log(`  Алгоритм это видит: ${view.covered ? `да (${view.tasks.join("; ")})` : `НЕТ по этому вопросу (других задач у товара: ${view.otherTasks})`}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
