"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StageMenu } from "@/components/ui/stage-menu";
import { 
  FileText, 
  Check, 
  ChevronDown, 
  Loader2, 
  Sparkles, 
  Info,
  Star,
  List,
  Package,
  Users,
  Heart,
  Zap,
  X,
  Copy,
  Briefcase,
  Flame,
  FileText as FileTextIcon,
  Scale
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { checkStopWords, highlightStopWords, getStopWordMessage, formatForCopy } from "@/lib/utils/marketplace-formatter";

// Статичный эффект рельефной бумаги (копируем из understanding)
function CanvasTexture({ patternAlpha = 12 }: { patternAlpha?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const canvasSize = 512;

    const resize = () => {
      if (!canvas) return;
      canvas.width = canvasSize;
      canvas.height = canvasSize;
      canvas.style.width = "100vw";
      canvas.style.height = "100vh";
    };

    const drawTexture = () => {
      const imageData = ctx.createImageData(canvasSize, canvasSize);
      const data = imageData.data;
      
      for (let y = 0; y < canvasSize; y++) {
        for (let x = 0; x < canvasSize; x++) {
          const index = (y * canvasSize + x) * 4;
          const noise = Math.random() * 0.4 + 0.6;
          const value = Math.floor(noise * 255);
          
          data[index] = value;
          data[index + 1] = value;
          data[index + 2] = value;
          data[index + 3] = patternAlpha;
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
    };

    resize();
    drawTexture();

    const handleResize = () => {
      resize();
      drawTexture();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [patternAlpha]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0"
      style={{ 
        imageRendering: "crisp-edges",
        mixBlendMode: "multiply",
        opacity: 0.4,
        zIndex: 0,
      }}
    />
  );
}

interface DescriptionVariant {
  id: number;
  style: string;
  description: string;
  preview: string;
}

// Иконки и названия для стилей
const STYLE_CONFIG = {
  1: { icon: Briefcase, label: "Официальный", emoji: "👔" },
  2: { icon: Flame, label: "Продающий", emoji: "🔥" },
  3: { icon: FileTextIcon, label: "Структурированный", emoji: "📋" },
  4: { icon: Scale, label: "Сбалансированный", emoji: "⚖️" },
};

const AVAILABLE_BLOCKS = [
  { name: "Преимущества", icon: Star },
  { name: "Характеристики", icon: List },
  { name: "Комплектация", icon: Package },
  { name: "Для кого / сценарии использования", icon: Users },
  { name: "Уход / рекомендации", icon: Heart },
  { name: "Дополнительные акценты", icon: Zap },
];

// Подсказки-чипсы для поля ввода
const PREFERENCE_CHIPS = [
  "С юмором",
  "Строго",
  "Для мам",
  "Стикеры/эмодзи",
  "Более официально",
  "С акцентами и списками",
  "Кратко, но с характеристиками",
  "Сделай упор на подарок",
  "Для подарка",
  "Универсально",
];

export default function DescriptionPage() {
  const router = useRouter();
  
  // Данные из предыдущего этапа
  const [productName, setProductName] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  // Состояние страницы
  const [isRestoring, setIsRestoring] = useState(true); // чтобы не мигал первый экран при восстановлении
  const [isStarted, setIsStarted] = useState(false);
  const [userPreferences, setUserPreferences] = useState("");
  const [selectedBlocks, setSelectedBlocks] = useState<string[]>([]);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  
  // Генерация описаний
  const [isGenerating, setIsGenerating] = useState(false);
  const [variants, setVariants] = useState<DescriptionVariant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [expandedVariantId, setExpandedVariantId] = useState<number | null>(null);
  
  // Редактирование
  const [isEditing, setIsEditing] = useState(false);
  const [editInstructions, setEditInstructions] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [finalDescription, setFinalDescription] = useState<string | null>(null);
  const [copiedVariantId, setCopiedVariantId] = useState<number | null>(null);
  const [stopWordIssues, setStopWordIssues] = useState<Array<{ word: string; category: string; index: number }>>([]);
  
  // Скрываем navbar и footer на этой странице
  useEffect(() => {
    const navbar = document.querySelector('header');
    const footer = document.querySelector('footer');
    if (navbar) {
      navbar.style.display = 'none';
    }
    if (footer) {
      footer.style.display = 'none';
    }
    return () => {
      if (navbar) {
        navbar.style.display = '';
      }
      if (footer) {
        footer.style.display = '';
      }
    };
  }, []);

  // Загрузка данных из Supabase при монтировании
  useEffect(() => {
    const loadData = async () => {
      const savedSessionId = localStorage.getItem("karto_session_id");
      if (!savedSessionId) {
        // Если нет сессии, возвращаем на предыдущий этап
        router.push("/studio/understanding");
        setIsRestoring(false);
        return;
      }
      
      setSessionId(savedSessionId);
      
      try {
        // 1. Подтягиваем данные этапа "Понимание" (название, фото)
        const understandingResponse = await fetch("/api/supabase/get-understanding", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ session_id: savedSessionId }),
        });
        
        const understandingData = await understandingResponse.json();
        
        if (understandingData.success && understandingData.data) {
          setProductName(understandingData.data.product_name || "");
          setPhotoUrl(understandingData.data.photo_url || null);
        } else {
          // Если данных нет, возвращаем на предыдущий этап
          router.push("/studio/understanding");
          return;
        }

        // 2. Пробуем восстановить этап "Описание"
        // ВАЖНО: Загружаем только если название товара совпадает
        const descriptionResponse = await fetch("/api/supabase/get-description", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ session_id: savedSessionId }),
        });

        const descriptionData = await descriptionResponse.json();

        // Загружаем данные описания только если они есть И если название товара совпадает
        // (проверка на соответствие товара уже сделана в API)
        if (descriptionData.success && descriptionData.data) {
          const desc = descriptionData.data;
          
          // Дополнительная проверка: если название товара из "Понимание" не совпадает,
          // не загружаем старые данные (это защита на случай, если API не сработал)
          const currentProductName = understandingData.data?.product_name || "";
          
          // Загружаем данные только если они действительно относятся к текущему товару
          if (desc.user_preferences) {
            setUserPreferences(
              typeof desc.user_preferences === "string"
                ? desc.user_preferences
                : ""
            );
          }

          if (Array.isArray(desc.selected_blocks)) {
            setSelectedBlocks(desc.selected_blocks);
          }

          if (Array.isArray(desc.generated_descriptions) && desc.generated_descriptions.length > 0) {
            setVariants(desc.generated_descriptions);
            setIsStarted(true); // сразу показываем второй экран, если уже есть варианты
          }

          if (desc.final_description) {
            setFinalDescription(desc.final_description);
          }
        } else {
          // Если данных описания нет, сбрасываем состояние
          setVariants([]);
          setIsStarted(false);
          setFinalDescription(null);
        }
      } catch (error) {
        console.error("Ошибка загрузки данных:", error);
        // Fallback: пытаемся загрузить из localStorage
        const savedState = localStorage.getItem("understandingPageState");
        if (savedState) {
          try {
            const state = JSON.parse(savedState);
            setProductName(state.productName || "");
            setPhotoUrl(state.photoDataUrl || null);
          } catch (e) {
            router.push("/studio/understanding");
          }
        } else {
          router.push("/studio/understanding");
        }
      }
      setIsRestoring(false);
    };
    
    loadData();
  }, [router]);
  
  // Переключение блока
  const toggleBlock = (blockName: string) => {
    setSelectedBlocks((prev) =>
      prev.includes(blockName)
        ? prev.filter((b) => b !== blockName)
        : [...prev, blockName]
    );
  };

  // Добавление подсказки в поле ввода
  const addPreferenceChip = (chip: string) => {
    const current = userPreferences.trim();
    if (current && !current.endsWith(".") && !current.endsWith(",")) {
      setUserPreferences(current + ", " + chip.toLowerCase());
    } else {
      setUserPreferences(current + (current ? " " : "") + chip.toLowerCase());
    }
  };
  
  // Генерация описаний
  const handleGenerate = async () => {
    if (!productName.trim()) {
      alert("Название товара обязательно");
      return;
    }
    
    setIsGenerating(true);
    setVariants([]);
    setSelectedVariantId(null);
    setExpandedVariantId(null);
    setFinalDescription(null);
    setIsEditing(false);
    
    try {
      // Проверяем, выбрал ли пользователь чип "Стикеры/эмодзи"
      const wantsStickers = userPreferences.toLowerCase().includes('стикеры/эмодзи') || 
                            userPreferences.toLowerCase().includes('стикеры') ||
                            userPreferences.toLowerCase().includes('эмодзи');
      
      const response = await fetch("/api/generate-description", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product_name: productName.trim(),
          photo_url: photoUrl,
          user_preferences: userPreferences.trim(),
          selected_blocks: selectedBlocks,
          wants_stickers: wantsStickers,
        }),
      });
      
      const data = await response.json();
      
      if (data.success && data.variants) {
        setVariants(data.variants);
        setIsStarted(true);
        
        // Сохраняем в Supabase
        if (sessionId) {
          await fetch("/api/supabase/save-description", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              session_id: sessionId,
              user_preferences: userPreferences.trim(),
              selected_blocks: selectedBlocks,
              generated_descriptions: data.variants,
            }),
          });
        }
      } else {
        alert("Ошибка генерации описаний. Попробуйте еще раз.");
      }
    } catch (error) {
      console.error("Ошибка генерации:", error);
      alert("Ошибка соединения. Попробуйте еще раз.");
    } finally {
      setIsGenerating(false);
    }
  };
  
  // Выбор варианта
  const handleSelectVariant = (variantId: number) => {
    // Если кликаем на уже выбранный вариант - снимаем выбор
    if (selectedVariantId === variantId) {
      setSelectedVariantId(null);
      setExpandedVariantId(null);
      setIsEditing(false);
      setEditInstructions("");
    } else {
      // Иначе выбираем новый вариант
      setSelectedVariantId(variantId);
      setExpandedVariantId(variantId);
      setIsEditing(false);
      setEditInstructions("");
    }
  };
  
  // Перегенерация с правками
  const handleRegenerate = async () => {
    if (!editInstructions.trim() || !selectedVariantId) {
      alert("Укажите, что нужно изменить");
      return;
    }
    
    const selectedVariant = variants.find((v) => v.id === selectedVariantId);
    if (!selectedVariant) return;
    
    setIsRegenerating(true);
    
    try {
      // Проверяем, выбрал ли пользователь чип "Стикеры/эмодзи" (сохраняем настройку)
      const wantsStickers = userPreferences.toLowerCase().includes('стикеры/эмодзи') || 
                            userPreferences.toLowerCase().includes('стикеры') ||
                            userPreferences.toLowerCase().includes('эмодзи');
      
      const response = await fetch("/api/generate-description", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product_name: productName.trim(),
          photo_url: photoUrl,
          user_preferences: userPreferences.trim(),
          selected_blocks: selectedBlocks,
          current_description: selectedVariant.description,
          edit_instructions: editInstructions.trim(),
          wants_stickers: wantsStickers,
          selected_style: selectedVariant.id, // Передаем стиль выбранного варианта
        }),
      });
      
      const data = await response.json();
      
      if (data.success && data.description) {
        setFinalDescription(data.description);
        setIsEditing(false);
        setEditInstructions("");
        
        // Сохраняем финальное описание в Supabase
        if (sessionId) {
          await fetch("/api/supabase/save-description", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              session_id: sessionId,
              user_preferences: userPreferences.trim(),
              selected_blocks: selectedBlocks,
              generated_descriptions: variants,
              final_description: data.description,
            }),
          });
        }
      } else {
        alert("Ошибка перегенерации. Попробуйте еще раз.");
      }
    } catch (error) {
      console.error("Ошибка перегенерации:", error);
      alert("Ошибка соединения. Попробуйте еще раз.");
    } finally {
      setIsRegenerating(false);
    }
  };
  
  // Подтверждение и переход
  const handleConfirm = async () => {
    const descriptionToSave = finalDescription || 
      (selectedVariantId ? variants.find((v) => v.id === selectedVariantId)?.description : null);
    
    if (!descriptionToSave) {
      alert("Выберите или сгенерируйте описание");
      return;
    }
    
    // Сохраняем финальное описание
    if (sessionId) {
      try {
        await fetch("/api/supabase/save-description", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            session_id: sessionId,
            user_preferences: userPreferences.trim(),
            selected_blocks: selectedBlocks,
            generated_descriptions: variants,
            final_description: descriptionToSave,
          }),
        });
      } catch (error) {
        console.error("Ошибка сохранения:", error);
      }
    }
    
    // Автоматический переход на следующий этап
    router.push("/studio/visual");
  };

  // Извлечение ключевых слов из названия товара
  const extractKeywords = (name: string): string[] => {
    if (!name) return [];
    
    // Пытаемся найти ключевые слова после запятых, тире, скобок
    const parts = name.split(/[,\-–—()]/).map(p => p.trim()).filter(p => p && p.length > 2);
    
    if (parts.length > 1) {
      // Возвращаем части после первого элемента (обычно это название)
      const keywords = parts.slice(1).slice(0, 3); // Максимум 3 ключевых слова
      return keywords.map(k => k.length > 20 ? k.substring(0, 20) + "..." : k);
    }
    
    // Если нет разделителей, но название длинное - берем последние слова
    if (name.length > 40) {
      const words = name.split(/\s+/);
      if (words.length > 4) {
        // Берем последние 2-3 слова как ключевые
        return words.slice(-3).filter(w => w.length > 2).slice(0, 3);
      }
    }
    
    return [];
  };

  const keywords = extractKeywords(productName);

  return (
    <div className="relative min-h-screen flex flex-col">
      <CanvasTexture />
      <StageMenu currentStage="description" />

      {/* Карточка с информацией о товаре - справа под этапами (только на первом экране) */}
      {!isStarted && productName && (
        <div 
          className="fixed z-40"
          style={{
            top: "120px",
            right: "32px",
            width: "280px",
          }}
        >
          <div 
            className="rounded-xl p-4"
            style={{
              background: "rgba(255, 255, 255, 0.95)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(0, 0, 0, 0.08)",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.1)",
            }}
          >
            <h3 
              className="text-xs font-semibold mb-2 uppercase tracking-wide"
              style={{ 
                color: "#666666",
                fontFamily: "var(--font-sans), Inter, sans-serif",
              }}
            >
              Товар
            </h3>
            
            {/* Фото и название */}
            <div className="flex gap-3 mb-3">
              {photoUrl && (
                <div 
                  className="flex-shrink-0 relative group"
                  style={{
                    width: "60px",
                    height: "60px",
                  }}
                >
                  <div
                    className="absolute z-50 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-300"
                    style={{
                      left: "50%",
                      top: "50%",
                      transform: "translate(-50%, -50%)",
                      width: "180px",
                      height: "180px",
                      transformOrigin: "center center",
                    }}
                  >
                    <div
                      className="rounded-xl overflow-hidden shadow-2xl border-2"
                      style={{
                        width: "100%",
                        height: "100%",
                        borderColor: "#2E5A43",
                        background: "#ffffff",
                      }}
                    >
                      <Image
                        src={photoUrl}
                        alt={productName}
                        width={180}
                        height={180}
                        className="object-cover"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                        unoptimized
                      />
                    </div>
                  </div>
                  <Image
                    src={photoUrl}
                    alt={productName}
                    width={60}
                    height={60}
                    className="rounded-lg object-cover transition-transform duration-300 group-hover:scale-105"
                    style={{
                      width: "60px",
                      height: "60px",
                      objectFit: "cover",
                      cursor: "zoom-in",
                    }}
                    unoptimized
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p 
                  className="text-sm font-medium leading-tight"
                  style={{ 
                    color: "#1a1a1a",
                    fontFamily: "var(--font-sans), Inter, sans-serif",
                    wordBreak: "break-word",
                  }}
                >
                  {productName}
                </p>
              </div>
            </div>

            {/* Ключевые слова */}
            {keywords.length > 0 && (
              <div className="pt-2 border-t border-gray-200">
                <p 
                  className="text-xs mb-1.5"
                  style={{ 
                    color: "#999999",
                    fontFamily: "var(--font-sans), Inter, sans-serif",
                  }}
                >
                  Ключевые слова:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {keywords.map((keyword, index) => (
                    <span
                      key={index}
                      className="px-2 py-0.5 rounded text-xs"
                      style={{
                        background: "#f0f7f3",
                        color: "#2E5A43",
                        fontFamily: "var(--font-sans), Inter, sans-serif",
                      }}
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Контент */}
      <div className="relative" style={{ zIndex: 1, minHeight: "100vh", padding: "24px" }}>
        {/* Заголовок */}
        <div className="mb-8" style={{ paddingLeft: "0", marginLeft: "0" }}>
          <div className="flex items-start gap-5 mb-2">
            <button
              onClick={() => router.push("/")}
              className="flex items-center transition-opacity hover:opacity-80 flex-shrink-0"
              style={{ cursor: "pointer", paddingTop: "0" }}
            >
              <Image
                src="/logo-flow.png"
                alt="KARTO"
                width={64}
                height={64}
                className="object-contain"
                priority
                unoptimized
                style={{ 
                  width: 'auto', 
                  height: '4rem',
                  maxHeight: '64px'
                }}
              />
            </button>
            <div className="flex flex-col" style={{ paddingTop: "0", marginTop: "-2px" }}>
              <h1
                className="text-3xl md:text-4xl font-bold"
                style={{
                  fontFamily: "var(--font-serif), Georgia, serif",
                  color: "#2E5A43",
                  marginLeft: "0",
                  paddingLeft: "0",
                  lineHeight: "1.2",
                  marginBottom: "0",
                  marginTop: "0",
                }}
              >
                Описание
              </h1>
              <p
                className="text-base md:text-lg"
                style={{
                  fontFamily: "var(--font-sans), Inter, sans-serif",
                  color: "#666666",
                  marginLeft: "0",
                  marginTop: "0px",
                }}
              >
                Соберём описание с учётом ваших пожеланий — так, чтобы оно подошло маркетплейсу и выглядело профессионально.
              </p>
            </div>
          </div>
        </div>

        {!isStarted && !isRestoring ? (
          /* Стартовая страница */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto"
          >
            {/* Кнопка "Как это работает?" - справа вверху */}
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setShowHowItWorks(!showHowItWorks)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all"
                style={{
                  background: showHowItWorks ? "#f0f7f3" : "transparent",
                  border: "1px solid rgba(0, 0, 0, 0.1)",
                  color: "#666666",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#faf8f5";
                  e.currentTarget.style.borderColor = "#2E5A43";
                }}
                onMouseLeave={(e) => {
                  if (!showHowItWorks) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.borderColor = "rgba(0, 0, 0, 0.1)";
                  }
                }}
              >
                <Info className="w-4 h-4" />
                <span className="text-sm font-medium">Как это работает?</span>
              </button>
            </div>

            {/* Выпадающий блок "Как это работает?" */}
            <AnimatePresence>
              {showHowItWorks && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="mb-6 overflow-hidden"
                >
                  <div className="p-6 rounded-xl" style={{ background: "#faf8f5", border: "1px solid rgba(0, 0, 0, 0.05)" }}>
                    <div className="flex items-start justify-between mb-3">
                      <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-serif), Georgia, serif", color: "#000000" }}>
                        Как это работает?
                      </h2>
                      <button
                        onClick={() => setShowHowItWorks(false)}
                        className="p-1 rounded transition-colors hover:bg-white"
                        style={{ color: "#666666" }}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-2 text-sm" style={{ color: "#666666", fontFamily: "var(--font-sans), Inter, sans-serif" }}>
                      <p>• Укажите пожелания к описанию (стиль, акценты, особенности)</p>
                      <p>• Выберите, какие блоки включить в описание</p>
                      <p>• ИИ сгенерирует 4 варианта описания с разными стилями</p>
                      <p>• Выберите лучший вариант и при необходимости уточните детали</p>
                      <p>• Получите финальное описание, готовое для маркетплейса</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Панель управления - центрированная */}
            <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-200">
              {/* Пожелания - увеличенное поле с чипсами */}
              <div className="mb-8">
                <label className="block text-base font-semibold mb-3" style={{ color: "#1a1a1a", fontFamily: "var(--font-sans), Inter, sans-serif" }}>
                  Что важно учесть в описании?
                </label>
                <textarea
                  value={userPreferences}
                  onChange={(e) => setUserPreferences(e.target.value)}
                  placeholder="Опишите, каким должно быть описание..."
                  rows={5}
                  className="w-full px-5 py-4 rounded-xl border outline-none transition-all resize-none text-base"
                  style={{
                    background: "#faf8f5",
                    border: "1px solid rgba(0, 0, 0, 0.08)",
                    color: "#000000",
                    fontFamily: "var(--font-sans), Inter, sans-serif",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#2E5A43";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(46, 90, 67, 0.1)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(0, 0, 0, 0.08)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
                {/* Чипсы-подсказки */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {PREFERENCE_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => addPreferenceChip(chip)}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                      style={{
                        background: "#ffffff",
                        border: "1px solid rgba(0, 0, 0, 0.1)",
                        color: "#666666",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#f0f7f3";
                        e.currentTarget.style.borderColor = "#2E5A43";
                        e.currentTarget.style.color = "#2E5A43";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#ffffff";
                        e.currentTarget.style.borderColor = "rgba(0, 0, 0, 0.1)";
                        e.currentTarget.style.color = "#666666";
                      }}
                    >
                      + {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Выбор блоков - карточки с иконками */}
              <div className="mb-8">
                <label className="block text-base font-semibold mb-4" style={{ color: "#1a1a1a", fontFamily: "var(--font-sans), Inter, sans-serif" }}>
                  Что включить в описание?
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {AVAILABLE_BLOCKS.map((block) => {
                    const Icon = block.icon;
                    const isSelected = selectedBlocks.includes(block.name);
                    return (
                      <button
                        key={block.name}
                        onClick={() => toggleBlock(block.name)}
                        className="px-5 py-4 rounded-xl text-sm font-medium transition-all text-left flex flex-col items-start gap-3"
                        style={{
                          background: isSelected ? "#f0f7f3" : "#ffffff",
                          border: isSelected ? "2px solid #2E5A43" : "1px solid rgba(0, 0, 0, 0.08)",
                          color: "#1a1a1a",
                          boxShadow: isSelected 
                            ? "0 2px 8px rgba(46, 90, 67, 0.15)" 
                            : "0 1px 3px rgba(0, 0, 0, 0.05)",
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = "#2E5A43";
                            e.currentTarget.style.background = "#faf8f5";
                            e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = "rgba(0, 0, 0, 0.08)";
                            e.currentTarget.style.background = "#ffffff";
                            e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)";
                          }
                        }}
                      >
                        <div className="flex items-center gap-3 w-full">
                          <div
                            className="p-2 rounded-lg flex-shrink-0"
                            style={{
                              background: isSelected ? "#2E5A43" : "rgba(46, 90, 67, 0.1)",
                              color: isSelected ? "#ffffff" : "#2E5A43",
                            }}
                          >
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            {isSelected && (
                              <Check className="w-4 h-4 inline-block mr-1 mb-0.5" style={{ color: "#2E5A43" }} />
                            )}
                            <span>{block.name}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Кнопка генерации */}
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !productName.trim()}
                className="w-full py-4 px-6 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: productName.trim() && !isGenerating ? "#2E5A43" : "rgba(46, 90, 67, 0.3)",
                  color: "#ffffff",
                  border: "none",
                }}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Генерируем описания...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Собрать описание
                  </>
                )}
              </button>
            </div>
          </motion.div>
        ) : (
          /* Разделение экрана 50/50 */
          <div className="flex gap-6" style={{ minHeight: "calc(100vh - 200px)" }}>
            {/* Левая панель - управление */}
            <div className="w-1/2 flex flex-col">
              <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200 flex-1 flex flex-col">
                <h3 className="text-lg font-semibold mb-4" style={{ fontFamily: "var(--font-serif), Georgia, serif", color: "#000000" }}>
                  Настройки
                </h3>
                
                {/* Панель проверки требований */}
                {(() => {
                  // Проверяем либо активный вариант, либо финальное описание
                  let descriptionToCheck = "";
                  if (finalDescription) {
                    descriptionToCheck = finalDescription;
                  } else if (variants.length > 0) {
                    const activeVariant = variants.find(v => 
                      expandedVariantId === v.id || (expandedVariantId === null && v.id === 1)
                    );
                    if (activeVariant) {
                      descriptionToCheck = activeVariant.description;
                    }
                  }
                  
                  if (!descriptionToCheck) return null;
                  
                  const issues = checkStopWords(descriptionToCheck);
                  const charCount = descriptionToCheck.length;
                  const hasLengthIssue = charCount > 6000;
                  const hasLengthWarning = charCount > 5000 && charCount <= 6000;
                  const baseScore = 100;
                  const lengthPenalty = hasLengthIssue ? 30 : hasLengthWarning ? 10 : 0;
                  const stopWordsPenalty = Math.min(issues.length * 5, 30);
                  const qualityScore = Math.max(0, baseScore - lengthPenalty - stopWordsPenalty);
                  
                  return (
                    <div className="mb-6 p-6 rounded-2xl" style={{ background: "#f8faf7", border: "1px solid rgba(0, 0, 0, 0.08)", boxShadow: "0 4px 12px rgba(0,0,0,0.04)" }}>
                      <div className="flex items-start gap-6 mb-5">
                        <div className="flex-1">
                          <p className="text-xs font-semibold uppercase mb-1" style={{ color: "#6b7280", letterSpacing: "0.04em" }}>Качество текста</p>
                          <p className="text-sm font-medium" style={{ color: "#1a1a1a" }}>Идеально для Ozon и WB</p>
                        </div>
                        <div className="relative flex-shrink-0">
                          <svg width="80" height="80" viewBox="0 0 80 80">
                            <circle cx="40" cy="40" r="34" stroke="#e5e7eb" strokeWidth="8" fill="none" />
                            <circle cx="40" cy="40" r="34" stroke="#2E5A43" strokeWidth="8" fill="none" strokeDasharray={`${qualityScore * 2.14} 999`} strokeLinecap="round" transform="rotate(-90 40 40)" />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xl font-bold" style={{ color: "#2E5A43" }}>{qualityScore}%</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span style={{ color: "#374151", fontWeight: 500 }}>Длина текста:</span>
                          <div className="flex items-center gap-2">
                            <span style={{ 
                              color: hasLengthIssue ? "#dc2626" : hasLengthWarning ? "#f59e0b" : "#2E5A43",
                              fontWeight: 600
                            }}>
                              {hasLengthIssue ? "⚠️ Превышен лимит" : hasLengthWarning ? "⚠️ Близко к лимиту" : "В норме"}
                            </span>
                            {!hasLengthIssue && !hasLengthWarning && (
                              <Check className="w-5 h-5" style={{ color: "#2E5A43" }} />
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span style={{ color: "#374151", fontWeight: 500 }}>Запрещённые слова:</span>
                          <div className="flex items-center gap-2">
                            <span style={{ 
                              color: issues.length > 0 ? "#dc2626" : "#2E5A43",
                              fontWeight: 600
                            }}>
                              {issues.length > 0 ? `⚠️ Найдено ${issues.length}` : "Не найдено"}
                            </span>
                            {issues.length === 0 && (
                              <Check className="w-5 h-5" style={{ color: "#2E5A43" }} />
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span style={{ color: "#374151", fontWeight: 500 }}>Формат:</span>
                          <div className="flex items-center gap-2">
                            <span style={{ color: "#2E5A43", fontWeight: 600 }}>
                              Plain Text
                            </span>
                            <Check className="w-5 h-5" style={{ color: "#2E5A43" }} />
                          </div>
                        </div>
                      </div>
                      
                      {issues.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <div className="text-xs space-y-1" style={{ color: "#856404" }}>
                            {issues.slice(0, 2).map((issue, idx) => (
                              <div key={idx}>
                                <strong>"{issue.word}"</strong> — {getStopWordMessage(issue.category)}
                              </div>
                            ))}
                            {issues.length > 2 && (
                              <div>...и еще {issues.length - 2}</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
                
                {/* Пожелания (редактируемые) */}
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2" style={{ color: "#666666" }}>
                    Пожелания
                  </label>
                  <textarea
                    value={userPreferences}
                    onChange={(e) => setUserPreferences(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border outline-none transition-all resize-none text-sm"
                    style={{
                      background: "#faf8f5",
                      border: "1px solid rgba(0, 0, 0, 0.08)",
                      color: "#000000",
                    }}
                  />
                </div>

                {/* Выбранные блоки (редактируемые) */}
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2" style={{ color: "#666666" }}>
                    Выбранные блоки
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {selectedBlocks.map((block) => (
                      <span
                        key={block}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{
                          background: "#f0f7f3",
                          color: "#2E5A43",
                          border: "1px solid rgba(46, 90, 67, 0.2)",
                        }}
                      >
                        {block}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Кнопка перегенерации (outline) */}
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="w-full py-3 px-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50 mb-6"
                  style={{
                    background: "transparent",
                    color: "#2E5A43",
                    border: "1.5px solid #2E5A43",
                  }}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Генерируем...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Перегенерировать
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Правая панель - результаты */}
            <div className="w-1/2 flex flex-col">
              <div className="flex-1 flex flex-col">
                {isGenerating ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: "#2E5A43" }} />
                      <p style={{ color: "#666666" }}>Генерируем описания...</p>
                    </div>
                  </div>
                ) : finalDescription ? (
                  /* Финальное описание после редактирования */
                  <div className="flex-1 flex flex-col">
                    <div className="mb-4 p-6 rounded-xl border relative" style={{ 
                      background: "#ffffff",
                      border: "1px solid rgba(0, 0, 0, 0.08)",
                      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
                    }}>
                      <div className="flex items-center gap-2 mb-4">
                        <Check className="w-5 h-5" style={{ color: "#2E5A43" }} />
                        <span className="font-semibold text-lg" style={{ color: "#2E5A43" }}>Финальное описание</span>
                      </div>
                      
                      {/* Кнопка копирования */}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const textToCopy = formatForCopy(finalDescription);
                          try {
                            await navigator.clipboard.writeText(textToCopy);
                            setCopiedVariantId(-1); // Используем -1 для финального описания
                            setTimeout(() => setCopiedVariantId(null), 2000);
                          } catch (err) {
                            const textArea = document.createElement("textarea");
                            textArea.value = textToCopy;
                            textArea.style.position = "fixed";
                            textArea.style.opacity = "0";
                            document.body.appendChild(textArea);
                            textArea.select();
                            document.execCommand("copy");
                            document.body.removeChild(textArea);
                            setCopiedVariantId(-1);
                            setTimeout(() => setCopiedVariantId(null), 2000);
                          }
                        }}
                        className="absolute top-4 right-4 px-3 py-2 rounded-lg transition-all text-xs font-medium flex items-center gap-1.5"
                        style={{
                          background: copiedVariantId === -1 ? "#2E5A43" : "#faf8f5",
                          color: copiedVariantId === -1 ? "#ffffff" : "#666666",
                          border: "1px solid rgba(0, 0, 0, 0.08)",
                        }}
                        title="Скопировать описание"
                      >
                        {copiedVariantId === -1 ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                        Копировать
                      </button>
                      
                      {/* Форматированное описание */}
                      <div 
                        className="text-sm pr-8"
                        style={{ 
                          fontFamily: "var(--font-sans), Inter, sans-serif",
                          color: "#1a1a1a",
                        }}
                      >
                        {(() => {
                          const formatDescription = (text: string) => {
                            const lines = text.split('\n');
                            return lines.map((line, index) => {
                              const trimmed = line.trim();
                              const headingMatch = trimmed.match(/^#+\s*(.+)$/);
                              
                              // Заголовки (строки, заканчивающиеся на ":")
                              if (trimmed.endsWith(':') && trimmed.length < 50 && trimmed.length > 3) {
                                return (
                                  <div key={index} className="mt-6 mb-3 first:mt-0">
                                    <h4 
                                      className="font-semibold text-lg"
                                      style={{ 
                                        color: "#2E5A43",
                                        fontFamily: "var(--font-sans), Inter, sans-serif",
                                      }}
                                    >
                                      {trimmed}
                                    </h4>
                                  </div>
                                );
                              }
                              
                              // Заголовки в стиле markdown (начинаются с #)
                              if (headingMatch && headingMatch[1]) {
                                return (
                                  <div key={index} className="mt-6 mb-3 first:mt-0">
                                    <h4
                                      className="font-semibold text-lg"
                                      style={{
                                        color: "#2E5A43",
                                        fontFamily: "var(--font-sans), Inter, sans-serif",
                                      }}
                                    >
                                      {headingMatch[1].trim()}
                                    </h4>
                                  </div>
                                );
                              }

                              // Списки (строки, начинающиеся с "-", "•", "→", цифры)
                              if (/^[-•→\d]/.test(trimmed)) {
                                const listContent = trimmed.replace(/^[-•→\d.\s]+/, '').trim();
                                let listSymbol = "•";
                                if (trimmed.startsWith('•')) listSymbol = "•";
                                else if (trimmed.startsWith('-')) listSymbol = "—";
                                else if (/^\d/.test(trimmed)) listSymbol = "•";
                                
                                return (
                                  <div key={index} className="ml-2 mb-2.5 flex items-start gap-3">
                                    <span 
                                      className="text-lg flex-shrink-0 mt-0.5" 
                                      style={{ color: "#2E5A43", fontWeight: "bold" }}
                                    >
                                      {listSymbol}
                                    </span>
                                    <span 
                                      className="flex-1" 
                                      style={{ 
                                        color: "#1a1a1a", 
                                        lineHeight: "1.8",
                                        fontFamily: "var(--font-sans), Inter, sans-serif",
                                      }}
                                    >
                                      {listContent}
                                    </span>
                                  </div>
                                );
                              }
                              
                              // Обычный текст (абзацы)
                              if (trimmed) {
                                return (
                                  <p 
                                    key={index} 
                                    className="mb-4" 
                                    style={{ 
                                      color: "#1a1a1a", 
                                      fontSize: "16px",
                                      lineHeight: "1.5",
                                      fontFamily: "var(--font-sans), Inter, sans-serif",
                                    }}
                                  >
                                    {trimmed}
                                  </p>
                                );
                              }
                              
                              // Пустая строка - добавляем отступ
                              return <div key={index} className="mb-2" />;
                            });
                          };
                          
                          return formatDescription(finalDescription);
                        })()}
                      </div>
                    </div>
                    <div className="mt-auto pt-6 border-t border-gray-200">
                      <button
                        onClick={handleConfirm}
                        className="w-full py-4 px-6 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
                        style={{
                          background: "#2E5A43",
                          color: "#ffffff",
                          border: "none",
                        }}
                      >
                        <Check className="w-5 h-5" />
                        Принять и продолжить →
                      </button>
                    </div>
                  </div>
                ) : variants.length > 0 ? (
                  /* Варианты описания - табы с форматированием */
                  <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
                    {/* Sticky Header: Табы + Кнопка Копировать */}
                    <div 
                      className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between gap-4"
                      style={{ backdropFilter: "blur(10px)" }}
                    >
                      {/* Табы стилей */}
                      <div className="flex gap-2 overflow-x-auto flex-1">
                        {variants.map((variant) => {
                          const config = STYLE_CONFIG[variant.id as keyof typeof STYLE_CONFIG];
                          const isSelected = selectedVariantId === variant.id;
                          const isActive = expandedVariantId === variant.id || (expandedVariantId === null && variant.id === 1);
                          
                          return (
                            <button
                              key={variant.id}
                              onClick={() => {
                                if (isSelected && isActive) {
                                  setExpandedVariantId(null);
                                  setSelectedVariantId(null);
                                  setIsEditing(false);
                                  setEditInstructions("");
                                } else {
                                  setExpandedVariantId(variant.id);
                                  handleSelectVariant(variant.id);
                                }
                              }}
                              className="px-4 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0"
                              style={{
                                background: isActive ? "#f0f7f3" : "transparent",
                                color: isActive ? "#2E5A43" : "#666666",
                                border: isActive ? "1px solid #2E5A43" : "1px solid transparent",
                              }}
                              onMouseEnter={(e) => {
                                if (!isActive) {
                                  e.currentTarget.style.background = "#faf8f5";
                                  e.currentTarget.style.color = "#2E5A43";
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!isActive) {
                                  e.currentTarget.style.background = "transparent";
                                  e.currentTarget.style.color = "#666666";
                                }
                              }}
                            >
                              <span className="text-base">{config?.emoji || "📄"}</span>
                              <span>{config?.label || variant.style}</span>
                              {isSelected && (
                                <Check className="w-4 h-4" style={{ color: "#2E5A43" }} />
                              )}
                            </button>
                          );
                        })}
                      </div>
                      
                      {/* Большая кнопка Копировать */}
                      {(() => {
                        const activeVariant = variants.find(v => 
                          expandedVariantId === v.id || (expandedVariantId === null && v.id === 1)
                        );
                        if (!activeVariant) return null;
                        
                        return (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              const textToCopy = formatForCopy(activeVariant.description);
                              try {
                                await navigator.clipboard.writeText(textToCopy);
                                setCopiedVariantId(activeVariant.id);
                                setTimeout(() => setCopiedVariantId(null), 2000);
                              } catch (err) {
                                const textArea = document.createElement("textarea");
                                textArea.value = textToCopy;
                                textArea.style.position = "fixed";
                                textArea.style.opacity = "0";
                                document.body.appendChild(textArea);
                                textArea.select();
                                document.execCommand("copy");
                                document.body.removeChild(textArea);
                                setCopiedVariantId(activeVariant.id);
                                setTimeout(() => setCopiedVariantId(null), 2000);
                              }
                            }}
                            className="px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-1.5 transition-all flex-shrink-0"
                            style={{
                              background: copiedVariantId === activeVariant.id ? "#2E5A43" : "#2E5A43",
                              color: "#ffffff",
                              border: "none",
                              boxShadow: copiedVariantId === activeVariant.id ? "0 2px 8px rgba(46, 90, 67, 0.3)" : "0 1px 4px rgba(46, 90, 67, 0.2)",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.boxShadow = "0 2px 8px rgba(46, 90, 67, 0.3)";
                            }}
                            onMouseLeave={(e) => {
                              if (copiedVariantId !== activeVariant.id) {
                                e.currentTarget.style.boxShadow = "0 1px 4px rgba(46, 90, 67, 0.2)";
                              }
                            }}
                          >
                            {copiedVariantId === activeVariant.id ? (
                              <>
                                <Check className="w-4 h-4" />
                                <span className="text-xs">Скопировано</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4" />
                                <span className="text-xs">Копировать</span>
                              </>
                            )}
                          </button>
                        );
                      })()}
                    </div>

                    {/* Область с текстом описания - единый белый лист */}
                    <div className="flex-1 overflow-y-auto px-6 py-6 bg-white rounded-2xl shadow-lg border border-gray-200">
                      {variants.map((variant) => {
                        const isActive = expandedVariantId === variant.id || (expandedVariantId === null && variant.id === 1);
                        if (!isActive) return null;

                        const description = variant.description;
                        const charCount = description.length;
                        const wordCount = description.split(/\s+/).filter(w => w.length > 0).length;
                        
                        // Проверяем стоп-слова для этого варианта
                        const variantIssues = checkStopWords(description);
                        
                        const formatDescription = (text: string) => {
                          const lines = text.split('\n');
                          return lines.map((line, index) => {
                            const trimmed = line.trim();
                            const headingMatch = trimmed.match(/^#+\s*(.+)$/);
                            
                            // Заголовки (строки, заканчивающиеся на ":")
                            if (trimmed.endsWith(':') && trimmed.length < 50 && trimmed.length > 3) {
                              return (
                                <div key={index} className="mt-6 mb-3 first:mt-0">
                                  <h4 
                                    className="font-semibold text-lg"
                                    style={{ 
                                      color: "#2E5A43",
                                      fontFamily: "var(--font-sans), Inter, sans-serif",
                                    }}
                                  >
                                    {trimmed}
                                  </h4>
                                </div>
                              );
                            }
                            
                            // Заголовки в стиле markdown (начинаются с #)
                            if (headingMatch && headingMatch[1]) {
                              return (
                                <div key={index} className="mt-6 mb-3 first:mt-0">
                                  <h4
                                    className="font-semibold text-lg"
                                    style={{
                                      color: "#2E5A43",
                                      fontFamily: "var(--font-sans), Inter, sans-serif",
                                    }}
                                  >
                                    {headingMatch[1].trim()}
                                  </h4>
                                </div>
                              );
                            }

                            // Списки (строки, начинающиеся с "-", "•", "→", цифры)
                            if (/^[-•→\d]/.test(trimmed)) {
                              const listContent = trimmed.replace(/^[-•→\d.\s]+/, '').trim();
                              // Определяем символ для списка - используем простые символы для Ozon
                              let listSymbol = "•";
                              if (trimmed.startsWith('•')) listSymbol = "•";
                              else if (trimmed.startsWith('-')) listSymbol = "—";
                              else if (/^\d/.test(trimmed)) listSymbol = "•";
                              // → заменяем на • для лучшей совместимости с Ozon
                              
                              return (
                                <div key={index} className="ml-2 mb-2.5 flex items-start gap-3">
                                  <span 
                                    className="text-lg flex-shrink-0 mt-0.5" 
                                    style={{ color: "#2E5A43", fontWeight: "bold" }}
                                  >
                                    {listSymbol}
                                  </span>
                                  <span 
                                    className="flex-1" 
                                    style={{ 
                                      color: "#1a1a1a", 
                                      fontSize: "16px",
                                      lineHeight: "1.5",
                                      fontFamily: "var(--font-sans), Inter, sans-serif",
                                    }}
                                  >
                                    {listContent}
                                  </span>
                                </div>
                              );
                            }
                            
                            // Обычный текст (абзацы)
                            if (trimmed) {
                              return (
                                <p 
                                  key={index} 
                                  className="mb-4" 
                                  style={{ 
                                    color: "#1a1a1a", 
                                    fontSize: "16px",
                                    lineHeight: "1.5",
                                    fontFamily: "var(--font-sans), Inter, sans-serif",
                                  }}
                                >
                                  {trimmed}
                                </p>
                              );
                            }
                            
                            // Пустая строка - добавляем отступ
                            return <div key={index} className="mb-2" />;
                          });
                        };

                        return (
                          <div key={variant.id} className="flex flex-col h-full">
                            {/* Предупреждения о стоп-словах */}
                            {variantIssues.length > 0 && (
                              <div className="mb-4 p-3 rounded-lg" style={{ background: "#FFF3CD", border: "1px solid #FFC107" }}>
                                <div className="flex items-start gap-2 mb-2">
                                  <span className="text-sm font-semibold" style={{ color: "#856404" }}>⚠️ Внимание!</span>
                                </div>
                                <div className="text-xs space-y-1" style={{ color: "#856404" }}>
                                  {variantIssues.slice(0, 3).map((issue, idx) => (
                                    <div key={idx}>
                                      <strong>"{issue.word}"</strong> — {getStopWordMessage(issue.category)}
                                    </div>
                                  ))}
                                  {variantIssues.length > 3 && (
                                    <div>...и еще {variantIssues.length - 3} проблемных слов</div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Форматированный текст с подсветкой стоп-слов */}
                            <div 
                              className="flex-1"
                              style={{ 
                                fontFamily: "var(--font-sans), Inter, sans-serif",
                                color: "#1a1a1a",
                                fontSize: "16px",
                                lineHeight: "1.5",
                              }}
                            >
                              {variantIssues.length > 0 ? (
                                <div dangerouslySetInnerHTML={{
                                  __html: highlightStopWords(description, variantIssues)
                                }} />
                              ) : (
                                formatDescription(description)
                              )}
                            </div>

                            {/* Footer: Поле ввода "Что изменить" приклеено к тексту */}
                            {selectedVariantId && !finalDescription && (
                              <div className="mt-6 pt-6 border-t border-gray-200">
                                <div className="flex items-start gap-3 mb-3">
                                  <Sparkles className="w-5 h-5 flex-shrink-0 mt-1" style={{ color: "#2E5A43" }} />
                                  <div className="flex-1">
                                    <label className="block text-sm font-medium mb-2" style={{ color: "#666666" }}>
                                      Что изменить в описании?
                                    </label>
                                    <textarea
                                      value={editInstructions}
                                      onChange={(e) => setEditInstructions(e.target.value)}
                                      placeholder="Например: 'сделай более официально', 'убери воду', 'добавь больше характеристик'"
                                      rows={3}
                                      className="w-full px-4 py-3 rounded-xl border outline-none transition-all resize-none text-sm"
                                      style={{
                                        background: "#faf8f5",
                                        border: "1px solid rgba(0, 0, 0, 0.08)",
                                        color: "#000000",
                                      }}
                                      onFocus={(e) => {
                                        e.currentTarget.style.borderColor = "#2E5A43";
                                        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(46, 90, 67, 0.1)";
                                      }}
                                      onBlur={(e) => {
                                        e.currentTarget.style.borderColor = "rgba(0, 0, 0, 0.08)";
                                        e.currentTarget.style.boxShadow = "none";
                                      }}
                                    />
                                  </div>
                                </div>
                                <div className="flex gap-3">
                                  <button
                                    onClick={handleRegenerate}
                                    disabled={!editInstructions.trim() || isRegenerating}
                                    className="flex-1 py-3 px-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                                    style={{
                                      background: editInstructions.trim() && !isRegenerating ? "#2E5A43" : "rgba(46, 90, 67, 0.3)",
                                      color: "#ffffff",
                                      border: "none",
                                    }}
                                  >
                                    {isRegenerating ? (
                                      <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Переделываем...
                                      </>
                                    ) : (
                                      <>
                                        <Sparkles className="w-4 h-4" />
                                        Переделать
                                      </>
                                    )}
                                  </button>
                                  <button
                                    onClick={handleConfirm}
                                    className="px-6 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
                                    style={{
                                      background: "#2E5A43",
                                      color: "#ffffff",
                                      border: "none",
                                    }}
                                  >
                                    <Check className="w-5 h-5" />
                                    Принять
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Статистика (если не выбран вариант) */}
                            {!selectedVariantId && (
                              <div className="mt-6 pt-4 border-t border-gray-200">
                                <div className="flex items-center justify-between text-xs mb-2">
                                  <div className="flex items-center gap-4" style={{ color: "#999999" }}>
                                    <span>~{charCount} знаков</span>
                                    <span>~{wordCount} слов</span>
                                  </div>
                                  <div style={{ 
                                    color: charCount > 6000 ? "#dc2626" : charCount > 5000 ? "#f59e0b" : "#2E5A43", 
                                    fontWeight: 500 
                                  }}>
                                    {charCount > 6000 
                                      ? "⚠️ Превышен лимит Ozon (6000)" 
                                      : charCount > 5000 
                                      ? "⚠️ Близко к лимиту" 
                                      : "Идеально для Ozon, Wildberries"}
                                  </div>
                                </div>
                                {variantIssues.length > 0 && (
                                  <div className="text-xs" style={{ color: "#dc2626" }}>
                                    ⚠️ Найдено {variantIssues.length} проблемных {variantIssues.length === 1 ? 'слово' : 'слов'}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <p style={{ color: "#666666" }}>Нажмите "Собрать описание" для генерации</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
