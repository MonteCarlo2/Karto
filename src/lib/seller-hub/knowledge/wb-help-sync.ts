import type { SupabaseClient } from "@supabase/supabase-js";
import { WB_HELP_BASE, diffWbHelp, isWbHelpReadable, parseWbHelpArticle, parseWbHelpTree, renameCandidates } from "./wb-help-parse";

/**
 * Ежедневная сверка базы знаний с официальной справкой Wildberries.
 * Первый проход только запоминает статьи (без событий). Дальше: новая статья или изменившийся текст попадают в ленту изменений
 * с фактами «было → стало». Сами наши статьи здесь не меняются.
 */

const MIN_GAP_MS = 20 * 3_600_000;
const STALE_RUN_MS = 40 * 60_000;
const PAUSE_MS = 350;
const HEADERS = { RSC: "1", "User-Agent": "Mozilla/5.0 (compatible; KartoKnowledgeBase/1.0)" };

export type WbHelpPassResult = { skipped?: string; checked: number; changed: number; added: number; failed: number; seeded: boolean };

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`справка WB ответила ${res.status}`);
  return res.text();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runWbHelpPass(db: SupabaseClient, opts: { force?: boolean; limit?: number } = {}): Promise<WbHelpPassResult> {
  const empty = { checked: 0, changed: 0, added: 0, failed: 0, seeded: false };
  const { data: last } = await db.from("seller_hub_kb_wb_runs").select("started_at, finished_at").order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (last) {
    const age = Date.now() - new Date(last.started_at as string).getTime();
    if (!last.finished_at && age < STALE_RUN_MS) return { ...empty, skipped: "проход уже идёт" };
    if (!opts.force && age < MIN_GAP_MS) return { ...empty, skipped: "сверка была недавно" };
  }
  const { data: run, error: runError } = await db.from("seller_hub_kb_wb_runs").insert({}).select("id").single();
  if (runError || !run) throw new Error(`не удалось начать проход: ${runError?.message ?? "нет строки"}`);

  const result: WbHelpPassResult = { ...empty };
  let failure: string | null = null;
  try {
    const tree = parseWbHelpTree(await fetchText(`${WB_HELP_BASE}/categories`));
    if (tree.length < 50) throw new Error(`в дереве справки только ${tree.length} статей: похоже, страница изменилась`);
    const { data: rows, error } = await db.from("seller_hub_kb_wb_articles").select("help_id, content_hash");
    if (error) throw new Error(error.message);
    const known = new Map((rows ?? []).map((r) => [r.help_id as string, r.content_hash as string]));
    result.seeded = known.size === 0;

    for (const entry of opts.limit ? tree.slice(0, opts.limit) : tree) {
      await sleep(PAUSE_MS);
      let article;
      try {
        article = parseWbHelpArticle(await fetchText(`${WB_HELP_BASE}/material/${entry.slug}`), entry.title);
      } catch {
        result.failed += 1;
        continue;
      }
      if (!isWbHelpReadable(article.text)) continue;
      result.checked += 1;
      const before = known.get(entry.id);
      const now = new Date().toISOString();
      if (before == null) {
        const { error: insertError } = await db.from("seller_hub_kb_wb_articles").insert({ help_id: entry.id, slug: entry.slug, title: entry.title, category: entry.category, wb_updated: article.updated, content_hash: article.hash, source_text: article.text });
        if (insertError) {
          result.failed += 1;
          continue;
        }
        if (!result.seeded) {
          result.added += 1;
          await db.from("seller_hub_kb_wb_changes").insert({ help_id: entry.id, kind: "new", title: entry.title, wb_updated: article.updated });
        }
        continue;
      }
      if (before === article.hash) continue;
      const { data: old } = await db.from("seller_hub_kb_wb_articles").select("source_text").eq("help_id", entry.id).maybeSingle();
      const oldText = (old?.source_text as string | undefined) ?? "";
      const facts = diffWbHelp(oldText, article.text);
      const renames = renameCandidates(oldText, article.text).map((r) => ({ articleId: "*", find: r.from, replace: r.to }));
      const { error: updateError } = await db.from("seller_hub_kb_wb_articles").update({ slug: entry.slug, title: entry.title, category: entry.category, wb_updated: article.updated, content_hash: article.hash, source_text: article.text, changed_at: now, checked_at: now }).eq("help_id", entry.id);
      if (updateError) {
        result.failed += 1;
        continue;
      }
      result.changed += 1;
      // Правки без чисел (опечатки, перестановка слов) в ленту не попадают: продавцу они ничего не меняют.
      if (facts.length > 0 || renames.length > 0) await db.from("seller_hub_kb_wb_changes").insert({ help_id: entry.id, kind: "updated", title: entry.title, wb_updated: article.updated, facts, patches: renames, summary: facts.length === 0 ? "Изменилось название." : null });
    }
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }
  await db.from("seller_hub_kb_wb_runs").update({ finished_at: new Date().toISOString(), checked: result.checked, changed: result.changed, added: result.added, error: failure }).eq("id", run.id);
  if (failure) throw new Error(failure);
  return result;
}

declare global {
  var __kartoKbWbHelpSchedulerStarted: boolean | undefined;
}

/** Запускается вместе с сервером. Раз в час проверяет, пора ли сверяться (не чаще раза в 20 часов). Отключить: KB_WB_HELP_SYNC=0. */
export function startWbHelpScheduler(): void {
  if (globalThis.__kartoKbWbHelpSchedulerStarted) return;
  globalThis.__kartoKbWbHelpSchedulerStarted = true;
  const off = process.env.KB_WB_HELP_SYNC === "0" || process.env.KB_WB_HELP_SYNC === "false";
  if (off || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return;
  const tick = async () => {
    try {
      const { createServerClient } = await import("@/lib/supabase/server");
      const db = createServerClient();
      const r = await runWbHelpPass(db);
      if (!r.skipped) console.info(`[kb-wb-help] сверка: проверено ${r.checked}, изменилось ${r.changed}, новых ${r.added}, не прочитано ${r.failed}`);
      // Доделываем ленту и после пропущенного прохода: вчерашний сбой нейросети не должен оставлять записи без описания.
      const { processWbHelpPending } = await import("./wb-help-ai");
      const done = await processWbHelpPending(db);
      if (done.published + done.rejected + done.described > 0) console.info(`[kb-wb-help] лента: статей опубликовано ${done.published}, отклонено ${done.rejected}, изменений описано ${done.described}`);
    } catch (e) {
      console.error("[kb-wb-help] сверка не удалась:", e instanceof Error ? e.message : String(e));
    }
  };
  setTimeout(() => void tick(), 3 * 60_000).unref?.();
  setInterval(() => void tick(), 3_600_000).unref?.();
}
