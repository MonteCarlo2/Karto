"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Package } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { GalleryProxiedImg } from "@/components/media/gallery-proxied-img";
import { AgentShell } from "@/components/agent/agent-shell";
import { KARTO_FLOW_MODE, KARTO_CREATIVE_MODE } from "@/lib/karto-modes";

type TabId = "tools" | "flows";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "tools", label: "Инструменты" },
  { id: "flows", label: "Мои потоки" },
];

const TOOLS: Array<{ href: string; title: string; tagline: string }> = [
  { href: "/studio?intro=true", title: KARTO_FLOW_MODE.title, tagline: KARTO_FLOW_MODE.tagline },
  { href: "/studio/free", title: KARTO_CREATIVE_MODE.title, tagline: KARTO_CREATIVE_MODE.tagline },
  { href: "/studio/auto-replies", title: "Автоответы", tagline: "Ответы на отзывы с ИИ" },
  { href: "/studio/unit-economics", title: "Юнит-экономика", tagline: "Маржа, комиссии и прибыль" },
  { href: "/studio/descriptions", title: "SEO-описания", tagline: "Бесплатные тексты для карточки" },
  { href: "/brand", title: "Придумать бренд", tagline: "Название, логотип, палитра и описание бренда" },
];

type Project = {
  id: string;
  updatedAt: string;
  productName: string;
  photoUrl: string | null;
  isCompleted?: boolean;
  progress?: {
    hasUnderstanding: boolean;
    hasDescription: boolean;
    hasVisual: boolean;
    hasPrice: boolean;
    nextStage: "understanding" | "description" | "visual" | "price" | "results" | null;
  };
};

const STAGE_ROUTE: Record<string, string> = {
  understanding: "/studio/understanding",
  description: "/studio/description",
  visual: "/studio/visual",
  price: "/studio/price",
  results: "/studio/results",
};

function statusText(p: Project): string {
  if (p.isCompleted) return "Завершён";
  const g = p.progress;
  if (!g || !g.hasUnderstanding) return "Начать";
  if (!g.hasDescription) return "Продолжить: описание";
  if (!g.hasVisual) return "Продолжить: визуал";
  if (!g.hasPrice) return "Продолжить: цена";
  return "Продолжить";
}

function FlowsTab() {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "guest" | "error" | "ready">("loading");
  const [projects, setProjects] = useState<Project[]>([]);

  const load = useCallback(async () => {
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setState("guest");
        return;
      }
      const res = await fetch("/api/profile/get-projects", {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      });
      if (res.status === 401) {
        setState("guest");
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setState("error");
        return;
      }
      setProjects((data.projects as Project[]) || []);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") return <p className="text-sm text-[#52584F]">Загружаю ваши потоки…</p>;
  if (state === "guest")
    return (
      <p className="text-sm text-[#52584F]">
        Потоки видны после входа.{" "}
        <Link href="/login?redirect=/studio/workshop" className="font-semibold text-[#1F4E3D] underline">
          Войти
        </Link>
      </p>
    );
  if (state === "error")
    return (
      <p className="text-sm text-[#52584F]">
        Не получилось загрузить потоки.{" "}
        <button type="button" onClick={() => void load()} className="font-semibold text-[#1F4E3D] underline">
          Повторить
        </button>
      </p>
    );
  if (projects.length === 0)
    return (
      <div className="text-sm text-[#52584F]">
        <p className="mb-3">Потоков пока нет.</p>
        <Link href="/studio?intro=true" className="font-semibold text-[#1F4E3D] underline">
          Запустить первый Поток
        </Link>
      </div>
    );

  const sorted = [...projects].sort((a, b) => {
    if (!a.isCompleted && b.isCompleted) return -1;
    if (a.isCompleted && !b.isCompleted) return 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const open = (p: Project) => {
    try {
      localStorage.setItem("karto_session_id", p.id);
    } catch {
      /* не критично */
    }
    router.push(p.isCompleted ? "/studio/results" : STAGE_ROUTE[p.progress?.nextStage || "understanding"] || "/studio/understanding");
  };

  return (
    <ul className="divide-y divide-[#1F4E3D]/10 border-y border-[#1F4E3D]/10">
      {sorted.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => open(p)}
            className="group flex w-full items-center gap-4 px-1 py-3 text-left outline-none transition-colors hover:bg-[#1F4E3D]/[0.04] focus-visible:bg-[#1F4E3D]/[0.06]"
          >
            <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#1F4E3D]/[0.07]">
              {p.photoUrl ? (
                <GalleryProxiedImg
                  remoteUrl={p.photoUrl}
                  alt={p.productName}
                  className="h-full w-full object-cover"
                  previewMaxWidth={112}
                />
              ) : (
                <Package className="h-5 w-5 text-[#1F4E3D]/60" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-[#0B1F14]">{p.productName || "Без названия"}</span>
              <span className="flex items-center gap-1.5 text-[13px] text-[#52584F]">
                {p.isCompleted ? <Check className="h-3.5 w-3.5 text-[#1F4E3D]" /> : null}
                {statusText(p)}
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-[#52584F] transition-transform group-hover:translate-x-0.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function WorkshopPage() {
  const [tab, setTab] = useState<TabId>("tools");

  return (
    <AgentShell>
      <div className="mx-auto max-w-4xl px-4 pb-20 pt-8 sm:px-6 lg:pt-12">
        <Link
          href="/studio/seller-hub"
          className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1F4E3D] outline-none hover:underline focus-visible:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Вернуться в Агент
        </Link>
        <h1 className="mb-1 text-3xl font-semibold text-[#0B1F14]">Мастерская</h1>
        <p className="mb-6 max-w-2xl text-[15px] text-[#52584F]">
          Дополнительные инструменты. Создают контент и считают, когда это нужно вашему магазину.
        </p>

        <div role="tablist" aria-label="Разделы Мастерской" className="mb-6 flex gap-1 border-b border-[#1F4E3D]/15">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`ws-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`ws-panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-3.5 py-2 text-[15px] outline-none transition-colors focus-visible:bg-[#1F4E3D]/[0.06] ${
                tab === t.id ? "border-[#1F4E3D] font-semibold text-[#0B1F14]" : "border-transparent text-[#52584F] hover:text-[#0B1F14]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "tools" ? (
          <section id="ws-panel-tools" role="tabpanel" aria-labelledby="ws-tab-tools">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TOOLS.map((tool) => (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className="group rounded-2xl border border-[#1F4E3D]/15 p-4 outline-none transition-colors hover:border-[#1F4E3D]/45 hover:bg-[#1F4E3D]/[0.04] focus-visible:border-[#1F4E3D]"
                >
                  <span className="mb-1 flex items-center justify-between text-[16px] font-semibold text-[#0B1F14]">
                    {tool.title}
                    <ArrowRight className="h-4 w-4 text-[#52584F] transition-transform group-hover:translate-x-0.5" />
                  </span>
                  <span className="text-[14px] text-[#52584F]">{tool.tagline}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {tab === "flows" ? (
          <section id="ws-panel-flows" role="tabpanel" aria-labelledby="ws-tab-flows">
            <FlowsTab />
          </section>
        ) : null}

      </div>
    </AgentShell>
  );
}
