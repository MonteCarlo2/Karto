"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, TrendingUp, Users, CircleDot, Link2, Copy, BadgeCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { StageMenu } from "@/components/ui/stage-menu";
import { useRouter } from "next/navigation";
import type { PriceAnalysis } from "@/lib/services/price-analyzer";
import Image from "next/image";

const LOGOS = {
  WB: "/logos/wildberries.png",
  Ozon: "/logos/ozon.png",
  Yandex: "/logos/yandex-market.png",
} as const;

// Конвертация простого markdown (**жирный**, *курсив*) в HTML-строку
function convertMarkdownToHtml(text: string): string {
  if (!text) return "";
  let html = text
    // Экранируем базовые HTML-символы
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Жирный
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Курсив
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  return html;
}

// Рендерер markdown-подобного текста с абзацами
function renderRichText(text: string) {
  if (!text) return null;
  const paragraphs = text.trim().split(/\n{2,}/);

  return paragraphs.map((raw, index) => {
    const html = convertMarkdownToHtml(raw);
    return (
      <p
        key={index}
        className={index > 0 ? "mt-3" : ""}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  });
}

export default function PriceStrategyPage() {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [productName, setProductName] = useState<string>("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<PriceAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Скрываем глобальный header/footer как на других этапах
  useEffect(() => {
    const navbar = document.querySelector("header");
    const footer = document.querySelector("footer");
    if (navbar) navbar.style.display = "none";
    if (footer) footer.style.display = "none";
    return () => {
      if (navbar) navbar.style.display = "";
      if (footer) footer.style.display = "";
    };
  }, []);

  // Загружаем данные товара и запускаем анализ цены
  useEffect(() => {
    const loadAndAnalyze = async () => {
      try {
        const savedSessionId = localStorage.getItem("karto_session_id");
        if (!savedSessionId) {
          router.push("/studio/understanding");
          return;
        }
        setSessionId(savedSessionId);

        // Данные этапа "Понимание"
        const understandingResponse = await fetch(
          "/api/supabase/get-understanding",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: savedSessionId }),
          }
        );
        const understandingData = await understandingResponse.json();

        if (!understandingData.success || !understandingData.data) {
          router.push("/studio/understanding");
          return;
        }

        const name: string = understandingData.data.product_name || "";
        const photo: string | null = understandingData.data.photo_url || null;

        setProductName(name);
        setPhotoUrl(photo);

        setIsLoading(true);
        setError(null);

        const cacheKey = `karto_price_analysis_${savedSessionId}`;
        const cachedRaw = localStorage.getItem(cacheKey);
        if (cachedRaw) {
          try {
            const cached = JSON.parse(cachedRaw);
            if (cached?.productName === name && cached?.analysis) {
              setAnalysis(cached.analysis as PriceAnalysis);
              setIsLoading(false);
              return;
            }
          } catch {
            // ignore parse error, пойдём в сеть
          }
        }

        const priceResponse = await fetch("/api/price-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productName: name, photoUrl: photo }),
        });

        const priceData = await priceResponse.json();
        if (!priceResponse.ok || !priceData.success) {
          throw new Error(priceData.error || "Не удалось получить анализ цены");
        }

        setAnalysis(priceData.data as PriceAnalysis);
        try {
          localStorage.setItem(
            cacheKey,
            JSON.stringify({ productName: name, analysis: priceData.data })
          );
          
          // Сохраняем в Supabase сразу
          fetch("/api/supabase/save-results", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session_id: savedSessionId,
              visual_slides: null,
              price_analysis: priceData.data,
            }),
          }).catch((error) => {
            console.warn("Не удалось сохранить данные цены в Supabase:", error);
          });
        } catch {
          // игнорируем, если localStorage переполнен
        }
      } catch (e: any) {
        console.error(e);
        setError(
          e?.message ||
            "Не удалось получить ценовой анализ. Попробуйте обновить страницу чуть позже."
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadAndAnalyze();
  }, [router]);

  const demandActiveDots = useMemo(() => {
    if (!analysis) return 0;
    return analysis.demandLevel === "Высокий"
      ? 3
      : analysis.demandLevel === "Средний"
      ? 2
      : 1;
  }, [analysis]);

  const formattedPrice = useMemo(() => {
    if (!analysis?.recommendedPrice) return "";
    return new Intl.NumberFormat("ru-RU").format(analysis.recommendedPrice) + " ₽";
  }, [analysis]);

  const handleCopyReport = async () => {
    if (!analysis) return;

    const competitorsHtml = analysis.competitors
      .map((c) => {
        const platformName =
          c.platform === "WB" ? "Wildberries" : c.platform === "Ozon" ? "Ozon" : "Яндекс.Маркет";
        const avg = new Intl.NumberFormat("ru-RU").format(c.averagePrice || 0);
        return `<li><strong>${platformName}</strong>: ср. цена ${avg} ₽</li>`;
      })
      .join("");

    const trendsHtml = analysis.trends
      .map((t) => `<li>${convertMarkdownToHtml(t)}</li>`)
      .join("");

    const sourcesHtml =
      analysis.sources && analysis.sources.length > 0
        ? analysis.sources
            .map((s) => {
              const label = s.platform ? `${s.platform}: ${s.title || s.url}` : s.title || s.url;
              return `<li><a href="${s.url}" target="_blank" rel="noreferrer">${convertMarkdownToHtml(
                label
              )}</a></li>`;
            })
            .join("")
        : "";

    const nicheHtml = convertMarkdownToHtml(analysis.nicheSummary || "");
    const audienceHtml = convertMarkdownToHtml(analysis.audience || "");
    const verdictHtml = convertMarkdownToHtml(
      analysis.priceExplanation || analysis.verdict || ""
    );

    const html = `
      <h1>Ценовая стратегия — ${productName || "товар"}</h1>
      <h2>Рекомендуемая цена</h2>
      <p><strong>${formattedPrice || "—"}</strong> (${analysis.marginLevel || "маржа не указана"})</p>
      
      <h2>Сравнение с конкурентами</h2>
      <ul>
        ${competitorsHtml}
      </ul>
      
      <h2>Анализ ниши</h2>
      <div>${nicheHtml}</div>
      
      <h3>Тренды</h3>
      <ul>
        ${trendsHtml}
      </ul>
      
      <h3>Аудитория</h3>
      <div>${audienceHtml}</div>
      
      <h2>Вердикт ИИ по цене</h2>
      <div>${verdictHtml}</div>
      
      ${
        sourcesHtml
          ? `<h3>Использованные источники</h3><ul>${sourcesHtml}</ul>`
          : ""
      }
    `;

    try {
      // Формируем текст с форматированием (отступы, структура)
      let text = `ЦЕНОВАЯ СТРАТЕГИЯ — ${productName || "товар"}\n\n`;
      
      text += `РЕКОМЕНДУЕМАЯ ЦЕНА\n`;
      text += `${formattedPrice || "—"} (${analysis.marginLevel || "маржа не указана"})\n\n`;
      
      text += `СРАВНЕНИЕ С КОНКУРЕНТАМИ\n`;
      analysis.competitors.forEach((c) => {
        const platformName =
          c.platform === "WB" ? "Wildberries" : c.platform === "Ozon" ? "Ozon" : "Яндекс.Маркет";
        const avg = new Intl.NumberFormat("ru-RU").format(c.averagePrice || 0);
        text += `• ${platformName}: ср. цена ${avg} ₽\n`;
      });
      text += `\n`;
      
      if (analysis.nicheSummary) {
        text += `АНАЛИЗ НИШИ\n`;
        // Убираем HTML теги из markdown
        const nicheText = analysis.nicheSummary
          .replace(/\*\*([^*]+)\*\*/g, "$1") // Убираем жирный
          .replace(/\*([^*]+)\*/g, "$1"); // Убираем курсив
        text += `${nicheText}\n\n`;
      }
      
      if (analysis.trends && analysis.trends.length > 0) {
        text += `ТРЕНДЫ\n`;
        analysis.trends.forEach((t) => {
          const trendText = t
            .replace(/\*\*([^*]+)\*\*/g, "$1")
            .replace(/\*([^*]+)\*/g, "$1");
          text += `• ${trendText}\n`;
        });
        text += `\n`;
      }
      
      if (analysis.audience) {
        text += `АУДИТОРИЯ\n`;
        const audienceText = analysis.audience
          .replace(/\*\*([^*]+)\*\*/g, "$1")
          .replace(/\*([^*]+)\*/g, "$1");
        text += `${audienceText}\n\n`;
      }
      
      if (analysis.priceExplanation || analysis.verdict) {
        text += `ВЕРДИКТ ИИ ПО ЦЕНЕ\n`;
        const verdictText = (analysis.priceExplanation || analysis.verdict || "")
          .replace(/\*\*([^*]+)\*\*/g, "$1")
          .replace(/\*([^*]+)\*/g, "$1");
        text += `${verdictText}\n\n`;
      }
      
      if (analysis.sources && analysis.sources.length > 0) {
        text += `ИСПОЛЬЗОВАННЫЕ ИСТОЧНИКИ\n`;
        analysis.sources.forEach((s) => {
          const label = s.platform ? `${s.platform}: ${s.title || s.url}` : s.title || s.url;
          text += `• ${label}\n`;
          if (s.url) text += `  ${s.url}\n`;
        });
      }

      // Пробуем современный Clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback для старых браузеров
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand("copy");
        document.body.removeChild(textArea);
        
        if (!successful) {
          throw new Error("Не удалось скопировать через execCommand");
        }
      }
      
      // Показываем уведомление без alert
      const notification = document.createElement("div");
      notification.textContent = "Отчёт скопирован!";
      notification.style.cssText = "position: fixed; top: 20px; right: 20px; background: #1F4E3D; color: white; padding: 12px 20px; border-radius: 8px; z-index: 10000; font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.15);";
      document.body.appendChild(notification);
      setTimeout(() => {
        notification.remove();
      }, 2000);
    } catch (e) {
      console.error("Ошибка копирования:", e);
      alert("Ошибка при копировании отчёта. Попробуйте выделить текст вручную.");
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] font-sans relative">
      {/* Фон + меню этапов */}
      <div
        className="fixed inset-0 pointer-events-none z-0 bg-gray-50"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 0, 0, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 0, 0, 0.02) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      <StageMenu currentStage="price" position="right" />

      {/* Основной контент */}
      <div className="relative z-10 max-w-[1500px] mx-auto px-6 pt-12 pb-6">
        {/* Шапка товара внутри студии */}
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            {photoUrl && (
              <div className="w-12 h-12 rounded-2xl overflow-hidden bg-gray-100 border border-gray-200 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl}
                  alt={productName || "Фото товара"}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-400 mb-1">
                Ценовая стратегия
              </p>
              <p className="text-lg font-semibold text-gray-900 leading-snug">
                {productName || "Товар не найден"}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Левая панель: Анализ ниши */}
          <div className="md:col-span-6">
            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div
                  key="skeleton-left"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-white rounded-[32px] border border-gray-100 p-8 animate-pulse"
                >
                  <div className="h-5 w-40 bg-gray-100 rounded-full mb-6" />
                  <div className="flex flex-wrap gap-3 mb-8">
                    <div className="h-7 w-24 bg-gray-100 rounded-full" />
                    <div className="h-7 w-32 bg-gray-100 rounded-full" />
                    <div className="h-7 w-28 bg-gray-100 rounded-full" />
                  </div>
                  <div className="space-y-5">
                    <div>
                      <div className="h-3 w-24 bg-gray-100 rounded-full mb-3" />
                      <div className="h-4 w-full bg-gray-100 rounded-full mb-2" />
                      <div className="h-4 w-3/4 bg-gray-100 rounded-full" />
                    </div>
                    <div>
                      <div className="h-3 w-32 bg-gray-100 rounded-full mb-3" />
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 bg-gray-100 rounded-full" />
                        <div className="h-2.5 w-2.5 bg-gray-100 rounded-full" />
                        <div className="h-2.5 w-2.5 bg-gray-100 rounded-full" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : analysis ? (
                <motion.div
                  key="content-left"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-[32px] border border-gray-100 p-8 shadow-[0_18px_45px_rgba(15,23,42,0.03)]"
                >
                  {/* Заголовок */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-2xl bg-emerald-50 flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-emerald-500" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900 leading-tight">
                          Анализ ниши
                        </h2>
                        <p className="text-xs text-gray-500">
                          Сводка по рынку и спросу
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Обзор ниши */}
                  {analysis.nicheSummary && (
                    <div className="mb-7">
                      <p className="text-xs font-semibold tracking-wide text-gray-400 uppercase mb-2">
                        Обзор ниши
                      </p>
                      <div className="text-[15px] md:text-[16px] text-gray-800 leading-relaxed">
                        {renderRichText(analysis.nicheSummary)}
                      </div>
                    </div>
                  )}

                  {/* Тренды */}
                  <div className="mb-8">
                    <p className="text-xs font-semibold tracking-wide text-gray-400 uppercase mb-3">
                      Тренды
                    </p>
                    <div className="flex flex-wrap gap-2.5">
                      {analysis.trends.map((trend) => (
                        <span
                          key={trend}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 text-sm font-medium text-gray-700"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                          {trend}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Аудитория */}
                  <div className="mb-6">
                    <p className="text-xs font-bold tracking-[0.18em] text-gray-400 uppercase mb-2 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-gray-400" />
                      Аудитория
                    </p>
                    <div className="text-[15px] md:text-[16px] text-gray-800 leading-relaxed">
                      {renderRichText(analysis.audience)}
                    </div>
                  </div>

                  {/* Уровень спроса */}
                  <div>
                    <p className="text-xs font-bold tracking-[0.18em] text-gray-400 uppercase mb-2">
                      Уровень спроса
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {[1, 2, 3].map((dot) => (
                          <CircleDot
                            key={dot}
                            className={`w-4 h-4 ${
                              dot <= demandActiveDots
                                ? "text-emerald-500"
                                : "text-gray-300"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-sm font-medium text-emerald-600">
                        {analysis.demandLevel}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {/* Правая панель: Ценовая стратегия */}
          <div className="md:col-span-6">
            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div
                  key="skeleton-right"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-white rounded-[32px] border-2 border-lime-200/70 p-8 shadow-xl shadow-black/5 animate-pulse"
                >
                  <div className="h-4 w-36 bg-gray-100 rounded-full mb-4" />
                  <div className="h-10 w-64 bg-gray-100 rounded-full mb-6" />
                  <div className="h-8 w-32 bg-gray-100 rounded-full mb-10" />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
                    <div className="h-24 bg-gray-100 rounded-2xl" />
                    <div className="h-24 bg-gray-100 rounded-2xl" />
                  </div>

                  <div className="h-4 w-28 bg-gray-100 rounded-full mb-3" />
                  <div className="h-16 w-full bg-gray-100 rounded-2xl" />
                </motion.div>
              ) : analysis ? (
                <motion.div
                  key="content-right"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative bg-white rounded-[32px] border-2 border-[#D1F85A] p-8 shadow-xl shadow-black/5"
                >
                  {/* Кнопка копирования отчёта — закреплена над правым верхним краем блока */}
                  {analysis && (
                    <button
                      type="button"
                      onClick={handleCopyReport}
                      className="hidden md:inline-flex items-center gap-1.5 absolute -top-4 right-10 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-400 transition-colors"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Скопировать отчёт</span>
                    </button>
                  )}

                  {/* Верхний ряд: цена и бейдж */}
                  <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
                    <div>
                      <p className="text-xs font-semibold tracking-[0.2em] text-gray-400 uppercase mb-2">
                        Рекомендуемая цена
                      </p>
                      <div className="flex items-baseline gap-3">
                        <span className="text-5xl md:text-6xl font-black tracking-tighter text-[#1F4E3D] leading-none">
                          {formattedPrice}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-emerald-500 text-white text-xs font-semibold uppercase tracking-wide shadow-sm">
                        {analysis.marginLevel || "Маржа"}
                      </span>
                      <p className="text-xs text-gray-400">
                        С учётом рынка и позиционирования
                      </p>
                    </div>
                  </div>

                  {/* Сравнение с конкурентами */}
                  <div className="mb-8">
                    <p className="text-xs font-semibold tracking-[0.2em] text-gray-400 uppercase mb-3">
                      Сравнение с конкурентами
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {analysis.competitors.map((competitor) => (
                        <div
                          key={`${competitor.platform}-${competitor.averagePrice}`}
                          className={`rounded-2xl ${
                            competitor.platform === "WB"
                              ? "bg-purple-50"
                              : competitor.platform === "Ozon"
                              ? "bg-blue-50"
                              : "bg-amber-50"
                          } border border-black/5 px-4 py-3 flex flex-col justify-between`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="relative w-8 h-8">
                                <Image
                                  src={
                                    competitor.platform === "WB"
                                      ? LOGOS.WB
                                      : competitor.platform === "Ozon"
                                      ? LOGOS.Ozon
                                      : LOGOS.Yandex
                                  }
                                  alt={
                                    competitor.platform === "WB"
                                      ? "Wildberries"
                                      : competitor.platform === "Ozon"
                                      ? "Ozon"
                                      : "Яндекс.Маркет"
                                  }
                                  fill
                                  className="object-contain"
                                />
                              </div>
                              <span className="text-xs font-semibold tracking-wide text-gray-700">
                                {competitor.platform === "WB"
                                  ? "Wildberries"
                                  : competitor.platform === "Ozon"
                                  ? "Ozon"
                                  : "Яндекс.Маркет"}
                              </span>
                            </div>
                          </div>
                          <p className="text-sm font-semibold text-gray-900">
                          Ср:{" "}
                          {new Intl.NumberFormat("ru-RU").format(
                            competitor.averagePrice || 0
                          )}{" "}
                          ₽
                        </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Вердикт ИИ */}
                  <div className="mt-6 rounded-2xl bg-[#D1F85A]/10 border border-[#D1F85A]/50 px-5 py-4 flex items-start gap-3">
                    <div className="mt-0.5 w-8 h-8 rounded-full bg-[#1F4E3D] flex items-center justify-center shadow-sm">
                      <BadgeCheck className="w-4 h-4 text-[#D1F85A]" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold tracking-[0.16em] text-[#1F4E3D] uppercase mb-1.5">
                        Вердикт ИИ
                      </p>
                      <div className="text-[15px] md:text-[16px] text-gray-800 leading-relaxed">
                        {renderRichText(
                          analysis.priceExplanation || analysis.verdict
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Источники / ссылки */}
                  {analysis.sources && analysis.sources.length > 0 && (
                    <div className="mt-6">
                      <p className="text-xs font-semibold tracking-[0.2em] text-gray-400 uppercase mb-2">
                        Использованные источники
                      </p>
                      <div className="space-y-1.5">
                        {analysis.sources.map((source, idx) => (
                          <a
                            key={`${source.url}-${idx}`}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 text-xs text-emerald-700 hover:text-emerald-900 underline underline-offset-2"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                            <span>
                              {source.platform
                                ? `${source.platform}: `
                                : ""}
                              {source.title || source.url}
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>

        {/* Ошибка под дэшбордом, если что-то пошло не так */}
        {error && (
          <div className="mt-6 max-w-3xl text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            {error}
          </div>
        )}

        {/* Кнопка завершения потока */}
        <div className="mt-10 flex justify-end">
          <button
            type="button"
            onClick={() => router.push("/studio/results")}
            className="inline-flex items-center gap-3 rounded-full bg-[#065F46] px-10 py-4 text-base font-semibold text-white shadow-lg hover:bg-[#064E3B] hover:shadow-xl transition-all"
          >
            <span>Завершить поток</span>
          </button>
        </div>
      </div>
    </div>
  );
}

