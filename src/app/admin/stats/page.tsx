"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";
import { ArrowLeft, RefreshCw, Users, UserPlus, CalendarDays, TrendingUp } from "lucide-react";

type Summary = {
  total: number;
  today_utc: number;
  today_moscow: number;
  yesterday_utc: number;
  last_7_days: number;
  last_30_days: number;
};

type DailyRow = { day: string; new_users: number };

type ApiOk = {
  ok: true;
  generatedAt: string;
  summary: Summary;
  daily: DailyRow[];
};

export default function AdminStatsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [data, setData] = useState<ApiOk | null>(null);
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    setError(null);
    setForbidden(false);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Войдите в аккаунт KARTO, чтобы смотреть статистику.");
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/admin/user-stats?days=${days}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.status === 403) {
        setForbidden(true);
        setLoading(false);
        return;
      }

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || `Ошибка ${res.status}`);
        setLoading(false);
        return;
      }

      setData(json as ApiOk);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Сеть");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!forbidden && !loading) load();
    }, 120_000);
    return () => clearInterval(id);
  }, [forbidden, loading, load]);

  if (forbidden) {
    return (
      <div className="min-h-screen bg-[#f5f3ef] text-[#111827] flex flex-col items-center justify-center px-4">
        <p className="text-lg font-medium mb-2">Нет доступа к статистике</p>
        <p className="text-sm text-[#6b7280] text-center max-w-md mb-6">
          Ваш email должен быть в списке <code className="bg-white/80 px-1 rounded">ADMIN_STATS_EMAILS</code> на
          сервере, или страница доступна только владельцу проекта.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[#1F4E3D] font-medium hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          На главную
        </Link>
      </div>
    );
  }

  const s = data?.summary;

  return (
    <div className="min-h-screen bg-[#f5f3ef] text-[#111827]">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Пользователи KARTO</h1>
            <p className="text-sm text-[#6b7280] mt-1">
              Счётчики из Supabase Auth · обновление раз в 2 мин и по кнопке
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(e) => {
                setDays(Number(e.target.value));
                setLoading(true);
              }}
              className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm"
            >
              <option value={14}>14 дней</option>
              <option value={30}>30 дней</option>
              <option value={60}>60 дней</option>
              <option value={90}>90 дней</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                load();
              }}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1F4E3D] text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Обновить
            </button>
            <Link
              href="/admin/notifications"
              className="inline-flex items-center gap-1 text-sm text-[#1F4E3D] font-medium hover:underline"
            >
              Уведомления пользователям
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-[#6b7280] hover:text-[#111827]"
            >
              <ArrowLeft className="w-4 h-4" />
              Сайт
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p>{error}</p>
            {error.includes("Войдите") && (
              <Link
                href="/login"
                className="inline-block mt-3 text-[#1F4E3D] font-medium underline underline-offset-2"
              >
                Перейти к входу
              </Link>
            )}
          </div>
        )}

        {loading && !data ? (
          <p className="text-[#6b7280]">Загрузка…</p>
        ) : s ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
              <StatCard
                icon={<Users className="w-5 h-5" />}
                label="Всего аккаунтов"
                value={s.total}
                hint="Все пользователи в Authentication"
              />
              <StatCard
                icon={<UserPlus className="w-5 h-5" />}
                label="Сегодня (МСК)"
                value={s.today_moscow}
                hint="Новые регистрации по дате в Москве"
              />
              <StatCard
                icon={<CalendarDays className="w-5 h-5" />}
                label="Сегодня (UTC)"
                value={s.today_utc}
                hint="Та же метрика по UTC"
              />
              <StatCard
                icon={<TrendingUp className="w-5 h-5" />}
                label="За 7 дней"
                value={s.last_7_days}
              />
              <StatCard
                icon={<TrendingUp className="w-5 h-5" />}
                label="За 30 дней"
                value={s.last_30_days}
              />
              <StatCard
                icon={<UserPlus className="w-5 h-5" />}
                label="Вчера (UTC)"
                value={s.yesterday_utc}
              />
            </div>

            {data?.daily && data.daily.length > 0 && (
              <div className="rounded-2xl bg-white border border-[#e5e7eb] shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[#f3f4f6]">
                  <h2 className="font-semibold">Новые регистрации по дням (UTC)</h2>
                  <p className="text-xs text-[#6b7280] mt-1">
                    Данные на момент {new Date(data.generatedAt).toLocaleString("ru-RU")}
                  </p>
                </div>
                <div className="max-h-[420px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[#f9fafb] text-left text-[#6b7280]">
                      <tr>
                        <th className="px-5 py-2 font-medium">Дата</th>
                        <th className="px-5 py-2 font-medium text-right">Новых</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.daily].reverse().map((row) => (
                        <tr key={row.day} className="border-t border-[#f3f4f6]">
                          <td className="px-5 py-2.5 font-mono text-[13px]">{row.day}</td>
                          <td className="px-5 py-2.5 text-right tabular-nums">
                            {row.new_users > 0 ? (
                              <span className="font-semibold text-[#1F4E3D]">{row.new_users}</span>
                            ) : (
                              <span className="text-[#9ca3af]">0</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <p className="mt-8 text-xs text-[#9ca3af] leading-relaxed">
              Подсказка: добавьте на сервер переменную{" "}
              <code className="bg-white/80 px-1 rounded border border-[#e5e7eb]">ADMIN_STATS_EMAILS</code> со своими
              email через запятую. В Supabase Dashboard выполните SQL из файла{" "}
              <code className="bg-white/80 px-1 rounded">20260404_admin_user_stats.sql</code>, если таблица пустая или
              API отвечает ошибкой миграции.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl bg-white border border-[#e5e7eb] p-5 shadow-sm">
      <div className="flex items-center gap-2 text-[#6b7280] mb-2">{icon}</div>
      <p className="text-xs uppercase tracking-wide text-[#9ca3af] font-medium">{label}</p>
      <p className="text-3xl font-bold tabular-nums mt-1">{value.toLocaleString("ru-RU")}</p>
      {hint && <p className="text-xs text-[#9ca3af] mt-2 leading-snug">{hint}</p>}
    </div>
  );
}
