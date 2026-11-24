import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { takeAiBudget } from "@/lib/seller-hub/ai-budget";
import { askHubModel, extractJson } from "@/lib/seller-hub/llm";
import { KB_ARTICLES, searchArticles } from "@/lib/seller-hub/knowledge";

export const maxDuration = 60;

const SYSTEM = `Ты помощник по Wildberries и сервису KARTO Агент. Отвечай продавцу простым русским языком, коротко и по делу, как опытный коллега.
ПРАВИЛА
- Опирайся только на переданные статьи базы знаний. Если в них нет ответа, так и скажи одной фразой и предложи, где посмотреть (кабинет WB, поддержка WB), ничего не выдумывай.
- Конкретные тарифы, ставки, проценты комиссий и сроки WB меняет: не называй чисел, которых нет в статьях, и напомни свериться с кабинетом, если вопрос про деньги.
- Не советуй ничего, что выглядит как обход правил площадки.
- Ответ: 2–6 коротких предложений или короткий список шагов. Без вступлений и без повторения вопроса.
- Верни только JSON: {"answer": "текст ответа", "sources": ["id статьи", ...]}, где sources — только те статьи, на которые ты реально опирался (до трёх).`;

/** Вопрос по базе знаний своими словами: находим подходящие статьи и просим нейросеть ответить по ним. Только чтение. */
export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  let body: { question?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 400) : "";
  if (question.length < 3) return NextResponse.json({ ok: false, error: "Напишите вопрос чуть подробнее" }, { status: 400 });

  const hits = searchArticles(KB_ARTICLES, question, { limit: 5 });
  const fallback = hits.slice(0, 3).map((h) => h.article.id);
  if (hits.length === 0) {
    return NextResponse.json({ ok: true, answer: "В базе знаний нет статьи на эту тему. Попробуйте задать вопрос другими словами или посмотрите разделы слева.", sources: [] });
  }
  const budget = takeAiBudget(auth.user.id, "kb-ask", 60);
  if (!budget.ok) return NextResponse.json({ ok: true, answer: null, sources: fallback, notice: "Сегодня вопросы уже закончились, ниже подходящие статьи." });

  const context = hits.map((h) => ({ id: h.article.id, title: h.article.title, text: `${h.article.summary}\n${h.article.body}`.slice(0, 2200) }));
  try {
    const { text } = await askHubModel({ system: SYSTEM, user: JSON.stringify({ vopros: question, stati: context }), maxTokens: 700, timeoutMs: 40_000 });
    const parsed = extractJson(text) as { answer?: unknown; sources?: unknown } | null;
    const answer = parsed && typeof parsed.answer === "string" ? parsed.answer.trim().slice(0, 1500) : null;
    const known = new Set(KB_ARTICLES.map((a) => a.id));
    const sources = Array.isArray(parsed?.sources) ? (parsed!.sources as unknown[]).map(String).filter((id) => known.has(id)).slice(0, 3) : [];
    if (!answer) return NextResponse.json({ ok: true, answer: null, sources: fallback, notice: "Не получилось ответить сразу, ниже подходящие статьи." });
    return NextResponse.json({ ok: true, answer, sources: sources.length > 0 ? sources : fallback });
  } catch {
    return NextResponse.json({ ok: true, answer: null, sources: fallback, notice: "Помощник сейчас занят, ниже подходящие статьи." });
  }
}
