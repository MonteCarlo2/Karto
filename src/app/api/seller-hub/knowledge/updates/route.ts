import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { KB_ARTICLES } from "@/lib/seller-hub/knowledge";
import type { KbUpdates } from "@/lib/seller-hub/knowledge/updates";
import { WB_HELP_MAP, type KbAutoArticle } from "@/lib/seller-hub/knowledge/wb-help-ai";
import { WB_HELP_BASE, applyKbPatches, type KbPatch, type WbFact } from "@/lib/seller-hub/knowledge/wb-help-parse";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TTL_MS = 10 * 60_000;
let cache: { at: number; data: KbUpdates } | null = null;

const autoId = (helpId: string) => `w-auto-${helpId.toLowerCase()}`;

async function load(): Promise<KbUpdates> {
  const db = createServerClient();
  const [autos, changes, lastRun] = await Promise.all([
    db.from("seller_hub_kb_wb_articles").select("help_id, slug, wb_updated, auto_article").eq("auto_status", "published").is("removed_at", null).limit(300),
    db.from("seller_hub_kb_wb_changes").select("id, help_id, kind, title, summary, facts, patches, detected_at").order("detected_at", { ascending: true }).limit(500),
    db.from("seller_hub_kb_wb_runs").select("finished_at").is("error", null).not("finished_at", "is", null).order("finished_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (autos.error || changes.error) throw new Error(autos.error?.message ?? changes.error?.message);

  const slugs = new Map<string, string>();
  const autoArticles: KbUpdates["autoArticles"] = [];
  for (const row of autos.data ?? []) {
    const a = row.auto_article as KbAutoArticle | null;
    if (!a) continue;
    slugs.set(row.help_id as string, row.slug as string);
    const note = `Эта статья автоматически пересказана по официальной справке Wildberries${row.wb_updated ? ` (версия от ${row.wb_updated})` : ""}. Правила меняются: перед решением сверяйтесь с первоисточником.`;
    autoArticles.push({
      id: autoId(row.help_id as string),
      branch: "wb",
      category: "w-auto",
      title: a.title,
      summary: a.summary,
      keywords: a.keywords,
      source: `${WB_HELP_BASE}/material/${row.slug}`,
      body: `${a.body}\n\n## Что уточнить у Wildberries\n${note}`,
    });
  }
  const published = new Set(autoArticles.map((a) => a.id));

  // Правки накладываем на текущий текст статей: если статью с тех пор переписали вручную, устаревшая правка просто не найдёт фрагмент.
  const bodies = new Map(KB_ARTICLES.map((a) => [a.id, a.body]));
  const patches: KbUpdates["patches"] = {};
  const feed: KbUpdates["feed"] = [];
  // Переименование принимаем, только если оно найдено минимум в двух разных статьях справки.
  const seen = new Map<string, Set<string>>();
  for (const c of changes.data ?? []) {
    for (const p of (c.patches ?? []) as KbPatch[]) {
      if (p.articleId !== "*") continue;
      const key = `${p.find}|${p.replace}`;
      const ids = seen.get(key) ?? new Set<string>();
      ids.add(c.help_id as string);
      seen.set(key, ids);
    }
  }
  const renames: KbUpdates["renames"] = [...seen.entries()].filter(([, ids]) => ids.size >= 2).map(([k]) => {
    const [from, to] = k.split("|");
    return { from: from!, to: to! };
  });
  for (const c of changes.data ?? []) {
    const applied: string[] = [];
    for (const p of ((c.patches ?? []) as KbPatch[]).filter((x) => x.articleId !== "*")) {
      const body = bodies.get(p.articleId);
      if (body == null || body.split(p.find).length !== 2) continue;
      bodies.set(p.articleId, applyKbPatches(body, [p]));
      (patches[p.articleId] ??= []).push({ find: p.find, replace: p.replace });
      if (!applied.includes(p.articleId)) applied.push(p.articleId);
    }
    if (c.kind === "updated" && c.summary == null) continue;
    const helpId = c.help_id as string;
    const auto = autoId(helpId);
    const known = new Set(KB_ARTICLES.map((a) => a.id));
    feed.push({
      id: c.id as string,
      kind: c.kind === "new" ? "new" : "updated",
      title: c.title as string,
      summary: (c.summary as string | null) ?? (c.kind === "new" ? (autoArticles.find((a) => a.id === auto)?.summary ?? null) : null),
      facts: ((c.facts ?? []) as WbFact[]).filter((f) => f.was && f.now).slice(0, 4),
      date: c.detected_at as string,
      articleIds: published.has(auto) ? [auto] : applied.length > 0 ? applied : (WB_HELP_MAP[helpId] ?? []).filter((id) => known.has(id)).slice(0, 2),
      helpUrl: `${WB_HELP_BASE}/material/${slugs.get(helpId) ?? helpId}`,
    });
  }
  return { autoArticles, patches, renames, checkedAt: (lastRun.data?.finished_at as string | null) ?? null, feed: feed.reverse().slice(0, 30) };
}

/** Автообновления базы знаний: пересказанные статьи справки WB, точечные правки цифр и лента изменений. Только чтение. */
export async function GET(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    if (!cache || Date.now() - cache.at > TTL_MS) cache = { at: Date.now(), data: await load() };
    return NextResponse.json({ ok: true, ...cache.data });
  } catch {
    // База знаний работает и без обновлений: отдаём пустой ответ, а не ошибку.
    return NextResponse.json({ ok: true, autoArticles: [], patches: {}, renames: [], checkedAt: null, feed: [] });
  }
}
