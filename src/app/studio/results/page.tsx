"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Check, Download, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import type { PriceAnalysis } from "@/lib/services/price-analyzer";

// Конвертация markdown в HTML для копирования
function convertMarkdownToHtml(text: string): string {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return html;
}

interface VisualSlide {
  id: number;
  imageUrl: string | null;
  variants: string[];
  prompt: string;
  scenario: string | null;
  aspectRatio: "3:4" | "4:3" | "9:16" | "1:1";
}

export default function ResultsPage() {
  const router = useRouter();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [productName, setProductName] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [priceAnalysis, setPriceAnalysis] = useState<PriceAnalysis | null>(null);
  const [visualSlides, setVisualSlides] = useState<VisualSlide[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Скрываем navbar и footer на этой странице
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

  // Загрузка всех данных
  useEffect(() => {
    const loadAllData = async () => {
      try {
        const savedSessionId = localStorage.getItem("karto_session_id");
        if (!savedSessionId) {
          router.push("/studio/understanding");
          return;
        }

        // 1. Загружаем данные понимания (название, фото)
        const understandingResponse = await fetch("/api/supabase/get-understanding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: savedSessionId }),
        });
        const understandingData = await understandingResponse.json();
        if (understandingData.success && understandingData.data) {
          setProductName(understandingData.data.product_name || "");
          setPhotoUrl(understandingData.data.photo_url || null);
        }

        // 2. Загружаем описание
        const descriptionResponse = await fetch("/api/supabase/get-description", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: savedSessionId }),
        });
        const descriptionData = await descriptionResponse.json();
        if (descriptionData.success && descriptionData.data) {
          setDescription(descriptionData.data.final_description || "");
        }

        // 3. Загружаем результаты (визуал + цена) из Supabase
        let priceData: PriceAnalysis | null = null;
        let visualData: VisualSlide[] = [];
        
        try {
          const resultsResponse = await fetch("/api/supabase/get-results", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: savedSessionId }),
          });
          
          const resultsData = await resultsResponse.json();
          
          if (resultsData.success) {
            // Загружаем визуальные данные из Supabase
            if (resultsData.visual_slides && Array.isArray(resultsData.visual_slides)) {
              visualData = resultsData.visual_slides.filter(
                (slide: VisualSlide) => slide.imageUrl
              );
              setVisualSlides(visualData);
              if (visualData.length > 0) {
                setActiveImageIndex(0);
              }
              console.log("✅ Визуальные данные загружены из Supabase:", visualData.length, "слайдов");
            }
            
            // Загружаем данные цены из Supabase
            if (resultsData.price_analysis) {
              priceData = resultsData.price_analysis as PriceAnalysis;
              setPriceAnalysis(priceData);
              console.log("✅ Данные цены загружены из Supabase");
            }
          }
        } catch (error) {
          console.error("Ошибка загрузки результатов из Supabase:", error);
        }
        
        // Fallback: если в Supabase нет данных, пытаемся загрузить из localStorage
        if (visualData.length === 0) {
          const visualCacheKey = `karto_visual_slides_${savedSessionId}`;
          const visualCachedRaw = localStorage.getItem(visualCacheKey);
          if (visualCachedRaw) {
            try {
              const visualCached = JSON.parse(visualCachedRaw);
              if (Array.isArray(visualCached)) {
                visualData = visualCached.filter(
                  (slide: VisualSlide) => slide.imageUrl
                );
                setVisualSlides(visualData);
                if (visualData.length > 0) {
                  setActiveImageIndex(0);
                }
                console.log("✅ Визуальные данные загружены из localStorage (fallback):", visualData.length, "слайдов");
              }
            } catch (e) {
              console.error("Ошибка парсинга кэша визуала:", e);
            }
          }
        }
        
        if (!priceData) {
          const cacheKey = `karto_price_analysis_${savedSessionId}`;
          const cachedRaw = localStorage.getItem(cacheKey);
          if (cachedRaw) {
            try {
              const cached = JSON.parse(cachedRaw);
              if (cached?.analysis) {
                priceData = cached.analysis as PriceAnalysis;
                setPriceAnalysis(priceData);
                console.log("✅ Данные цены загружены из localStorage (fallback)");
              }
            } catch (e) {
              console.error("Ошибка парсинга кэша цены:", e);
            }
          }
        }

        // 5. Сохраняем результаты в БД сразу после загрузки
        if (visualData.length > 0 || priceData) {
          try {
            const saveResponse = await fetch("/api/supabase/save-results", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                session_id: savedSessionId,
                visual_slides: visualData.length > 0 ? visualData : null,
                price_analysis: priceData || null,
              }),
            });

            const saveData = await saveResponse.json();
            if (saveData.success) {
              console.log("✅ Результаты потока сохранены в БД");
            } else {
              console.error("❌ Ошибка сохранения результатов:", saveData.error);
            }
          } catch (error) {
            console.error("Ошибка сохранения результатов в БД:", error);
          }
        }

        setIsLoading(false);
      } catch (error) {
        console.error("Ошибка загрузки данных:", error);
        setIsLoading(false);
      }
    };

    loadAllData();
  }, [router]);

  // Получаем все изображения из визуальных слайдов
  const allImages = visualSlides
    .map((slide) => slide.imageUrl)
    .filter((url): url is string => url !== null);

  const activeImage = allImages[activeImageIndex] || null;

  // Скачивание изображения
  const handleDownloadImage = async (imageUrl: string, index: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `karto-visual-${index + 1}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Ошибка скачивания:", error);
      alert("Ошибка при скачивании изображения");
    }
  };

  // Копирование описания
  const handleCopyDescription = async () => {
    if (!description) return;
    try {
      // Используем простой текст для надежности
      const textToCopy = description;
      
      // Пробуем современный Clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        // Fallback для старых браузеров
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
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
      notification.textContent = "Описание скопировано!";
      notification.style.cssText = "position: fixed; top: 20px; right: 20px; background: #1F4E3D; color: white; padding: 12px 20px; border-radius: 8px; z-index: 10000; font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.15);";
      document.body.appendChild(notification);
      setTimeout(() => {
        notification.remove();
      }, 2000);
    } catch (error) {
      console.error("Ошибка копирования:", error);
      alert("Ошибка при копировании описания. Попробуйте выделить текст вручную.");
    }
  };

  // Копирование анализа цены
  const handleCopyPriceAnalysis = async () => {
    if (!priceAnalysis) return;
    try {
      let text = `РЕКОМЕНДОВАННАЯ ЦЕНА: ${priceAnalysis.recommendedPrice} ₽\n\n`;
      text += `Маржинальность: ${priceAnalysis.marginLevel}\n\n`;
      
      if (priceAnalysis.nicheSummary) {
        text += `АНАЛИЗ НИШИ:\n${priceAnalysis.nicheSummary}\n\n`;
      }
      
      text += `СРАВНЕНИЕ С МАРКЕТПЛЕЙСАМИ:\n`;
      priceAnalysis.competitors.forEach((comp) => {
        text += `${comp.platform}: ~${comp.averagePrice} ₽\n`;
      });
      
      text += `\n${priceAnalysis.verdict}`;
      
      if (priceAnalysis.priceExplanation) {
        text += `\n\n${priceAnalysis.priceExplanation}`;
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
      notification.textContent = "Анализ цены скопирован!";
      notification.style.cssText = "position: fixed; top: 20px; right: 20px; background: #1F4E3D; color: white; padding: 12px 20px; border-radius: 8px; z-index: 10000; font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.15);";
      document.body.appendChild(notification);
      setTimeout(() => {
        notification.remove();
      }, 2000);
    } catch (error) {
      console.error("Ошибка копирования:", error);
      alert("Ошибка при копировании анализа. Попробуйте выделить текст вручную.");
    }
  };


  // Завершение потока - переход на главный экран
  const handleCompleteFlow = () => {
    router.push("/");
  };

  // Адаптивный размер миниатюр в зависимости от количества
  const getThumbnailSize = () => {
    const count = allImages.length;
    if (count <= 4) return "w-32";
    if (count <= 6) return "w-28";
    if (count <= 8) return "w-24";
    return "w-20";
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F2F2F2]">
        <div className="text-gray-600">Загрузка результатов...</div>
      </div>
    );
  }

  return (
    <div
      className="h-screen font-sans overflow-hidden relative"
      style={{
        backgroundColor: "#F2F2F2",
        backgroundImage: "radial-gradient(#d1d5db 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      {/* Кнопка Завершить поток - в правом верхнем углу */}
      <motion.button
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        onClick={handleCompleteFlow}
        className="absolute top-4 right-4 z-50 bg-black text-white rounded-full px-6 py-3 font-bold hover:scale-105 transition-transform flex items-center justify-center gap-2 text-sm shadow-xl"
      >
        <Check className="w-4 h-4" />
        <span>Завершить поток</span>
      </motion.button>

      {/* Контейнер страницы - на всю ширину */}
      <div className="w-full h-full px-6 py-4 flex flex-col">
        {/* Хедер - Массивный заголовок */}
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-[5vw] md:text-[4rem] leading-none font-black text-gray-900 uppercase mb-3 text-left"
          style={{ letterSpacing: "-0.02em" }}
        >
          ИТОГИ ПОТОКА
        </motion.h1>

        {/* Основной контент - Grid с визуалом слева */}
        <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
          {/* ЛЕВАЯ ЧАСТЬ: ВИЗУАЛ (45% экрана) */}
          <div className="col-span-12 md:col-span-5 flex flex-col">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="w-full h-full p-4 flex flex-col"
            >
              {allImages.length > 0 ? (
                <div className="flex gap-4 flex-1 min-h-0">
                  {/* Слева: Главное изображение с атмосферным размытым фоном */}
                  <div className="flex-1 relative group rounded-lg overflow-hidden">
                    {/* Слой 1: Фоновое Размытие (Ambient Layer) - плавное затухание до карточек справа */}
                    <div className="absolute inset-0 overflow-visible">
                      <img
                        src={activeImage ?? ""}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover blur-3xl"
                        style={{
                          transform: "scale(2.2)",
                          transformOrigin: "center",
                          opacity: 0.6,
                        }}
                        aria-hidden="true"
                        suppressHydrationWarning
                      />
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background:
                            "radial-gradient(ellipse 200% 150% at 25% center, transparent 35%, rgba(242, 242, 242, 0.1) 50%, rgba(242, 242, 242, 0.3) 65%, rgba(242, 242, 242, 0.6) 80%, rgba(242, 242, 242, 0.85) 92%, rgba(242, 242, 242, 1) 100%)",
                        }}
                      />
                    </div>

                    {/* Слой 2: Четкое Изображение (Foreground Layer) */}
                    <div className="relative z-10 h-full w-full flex items-center justify-center p-4">
                      <img
                        src={activeImage ?? ""}
                        alt={productName}
                        className="max-h-[90%] max-w-[90%] w-auto h-auto object-contain drop-shadow-2xl"
                        suppressHydrationWarning
                      />
                    </div>

                    {/* Кнопка скачать в углу */}
                    <div
                      onClick={(e) => { if (activeImage != null) handleDownloadImage(activeImage, activeImageIndex, e); }}
                      className="absolute top-3 right-3 w-10 h-10 bg-white/95 hover:bg-white rounded-full flex items-center justify-center shadow-lg transition-all opacity-0 group-hover:opacity-100 z-20 cursor-pointer"
                    >
                      <Download className="w-5 h-5 text-gray-900" />
                    </div>
                  </div>

                  {/* Справа: Вертикальная колонка миниатюр - адаптивный размер */}
                  <div className={`flex flex-col gap-1.5 ${getThumbnailSize()} flex-shrink-0 overflow-y-auto custom-scrollbar`}>
                    {allImages.map((img, index) => (
                      <div
                        key={`thumb-${index}`}
                        onClick={() => setActiveImageIndex(index)}
                        className={`relative w-full aspect-square overflow-hidden border-2 transition-all cursor-pointer group bg-white flex-shrink-0 ${
                          index === activeImageIndex
                            ? "border-[#1F4E3D] ring-2 ring-[#1F4E3D]/20 shadow-md"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                        suppressHydrationWarning
                      >
                        <img
                          src={img}
                          alt={`${productName} ${index + 1}`}
                          className="w-full h-full object-cover"
                          suppressHydrationWarning
                        />
                        {/* Кнопка скачать в углу */}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadImage(img, index, e);
                          }}
                          className="absolute top-1.5 right-1.5 w-7 h-7 bg-white/95 hover:bg-white rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
                        >
                          <Download className="w-3.5 h-3.5 text-gray-900" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                  Нет сгенерированных изображений
                </div>
              )}
            </motion.div>
          </div>

          {/* ПРАВАЯ ЧАСТЬ: ДАННЫЕ (55% экрана) */}
          <div className="col-span-12 md:col-span-7 flex flex-col gap-3 flex-1 min-h-0">
            {/* А. Финансовая Карта (Сверху) */}
            {priceAnalysis && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="bg-[#1F4E3D] rounded-2xl p-5 shadow-xl text-white relative overflow-hidden flex flex-col flex-shrink-0"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                }}
              >
                {/* Кнопка копировать в углу */}
                <button
                  onClick={handleCopyPriceAnalysis}
                  className="absolute top-3 right-3 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-all z-20"
                  title="Скопировать отчёт"
                >
                  <Copy className="w-4 h-4 text-white" />
                </button>

                <div className="relative z-10 flex flex-col">
                  <p className="opacity-80 text-xs uppercase tracking-wide mb-2">
                    Рекомендованная цена
                  </p>
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-4xl font-black tracking-tight leading-none">
                      {priceAnalysis.recommendedPrice.toLocaleString("ru-RU")}
                    </span>
                    <span className="text-xl font-bold opacity-90">₽</span>
                  </div>

                  {/* Сравнение с конкурентами - Таблица */}
                  <div className="space-y-2 mb-4">
                    <p className="text-xs opacity-80 mb-2 uppercase tracking-wide">
                      Сравнение с маркетплейсами
                    </p>
                    <div className="space-y-1.5">
                      {priceAnalysis.competitors.map((comp, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between pb-1.5 border-b border-white/10"
                        >
                          <span className="text-sm font-semibold">{comp.platform}</span>
                          <span className="text-base font-bold">
                            ~{comp.averagePrice.toLocaleString("ru-RU")} ₽
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Бейдж маржи */}
                  <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-emerald-500/20 backdrop-blur-sm text-xs font-bold uppercase border border-emerald-400/30 w-fit">
                    {priceAnalysis.marginLevel} Маржа
                  </span>
                </div>
              </motion.div>
            )}

            {/* Б. Описание (Снизу) - Премиальный Спецификационный Лист */}
            {description && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="bg-[#FFFEFA] border-l-[6px] border-[#D1F85A] rounded-[32px] p-8 shadow-xl flex flex-col overflow-hidden flex-1 min-h-0 relative"
              >
                {/* Кнопка копировать в углу */}
                <button
                  onClick={handleCopyDescription}
                  className="absolute top-6 right-6 w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-all z-20"
                  title="Скопировать описание"
                >
                  <Copy className="w-4 h-4 text-gray-700" />
                </button>

                {/* Основное Описание */}
                <div className="flex flex-col flex-1 min-h-0">
                  <h2 className="text-lg font-bold mb-4 text-gray-900 font-sans">
                    Продающее описание
                  </h2>

                  {/* Текст с скроллом - Serif шрифт */}
                  <div
                    className="text-gray-700 leading-relaxed text-[15px] flex-1 overflow-y-auto pr-2 custom-scrollbar"
                    style={{
                      scrollbarWidth: "thin",
                      scrollbarColor: "#d1d5db transparent",
                      fontFamily: 'Georgia, "Times New Roman", serif',
                    }}
                  >
                    {description.split("\n\n").map((paragraph, index) => {
                      const html = convertMarkdownToHtml(paragraph);
                      return (
                        <p
                          key={index}
                          className="mb-4 last:mb-0"
                          dangerouslySetInnerHTML={{ __html: html }}
                        />
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
