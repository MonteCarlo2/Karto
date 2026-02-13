"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StageMenu } from "@/components/ui/stage-menu";
import { Upload, Type, Check, Circle, Edit, PenTool } from "lucide-react";
import Image from "next/image";
import { Logo } from "@/components/ui/logo";
import { useRouter } from "next/navigation";
import { useNotification } from "@/components/ui/notification";
import { createBrowserClient } from "@/lib/supabase/client";

// Статичный эффект рельефной бумаги
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

type FlowStartMethod = "photo" | "name" | null;

export default function UnderstandingPage() {
  const router = useRouter();
  const { showNotification, NotificationComponent } = useNotification();
  const [selectedMethod, setSelectedMethod] = useState<FlowStartMethod>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{ names: string[] } | null>(null);
  const [selectedNameIndex, setSelectedNameIndex] = useState<number | null>(null);
  const [customName, setCustomName] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null);

  // Сохранение состояния в localStorage
  useEffect(() => {
    const state = {
      selectedMethod,
      photoDataUrl,
      productName,
      isExpanded,
      analysisResult,
      selectedNameIndex,
      customName,
      showCustomInput,
      showSuggestions,
      aiSuggestions,
      selectedSuggestion,
    };
    localStorage.setItem("understandingPageState", JSON.stringify(state));
  }, [
    selectedMethod,
    photoDataUrl,
    productName,
    isExpanded,
    analysisResult,
    selectedNameIndex,
    customName,
    showCustomInput,
    showSuggestions,
    aiSuggestions,
    selectedSuggestion,
  ]);

  // Восстановление состояния из Supabase или localStorage
  useEffect(() => {
    const loadState = async () => {
      const savedSessionId = localStorage.getItem("karto_session_id");
      
      // Сначала пытаемся загрузить из Supabase, если есть session_id
      if (savedSessionId) {
        try {
          const response = await fetch("/api/supabase/get-understanding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: savedSessionId }),
          });
          
          const result = await response.json();
          
          if (result.success && result.data) {
            const data = result.data;
            
            // Восстанавливаем состояние из Supabase
            if (data.product_name) {
              setProductName(data.product_name);
            }
            
            if (data.photo_url) {
              setPhotoDataUrl(data.photo_url);
              // Восстанавливаем File из URL
              fetch(data.photo_url)
                .then(res => res.blob())
                .then(blob => {
                  const file = new File([blob], "saved-photo.jpg", { type: blob.type });
                  setPhotoFile(file);
                })
                .catch(console.error);
            }
            
            if (data.selected_method) {
              setSelectedMethod(data.selected_method as FlowStartMethod);
              setIsExpanded(true);
            }
            
            // Не загружаем из localStorage, если данные есть в Supabase
            return;
          }
        } catch (error) {
          console.error("Ошибка загрузки из Supabase:", error);
          // Продолжаем с localStorage fallback
        }
      }
      
      // Fallback: восстановление из localStorage
      const savedState = localStorage.getItem("understandingPageState");
      if (savedState) {
        try {
          const state = JSON.parse(savedState);
          // КРИТИЧЕСКИ ВАЖНО: Восстанавливаем selectedMethod и isExpanded СИНХРОННО
          // Если есть selectedMethod, ОБЯЗАТЕЛЬНО устанавливаем isExpanded = true
          // Это предотвращает возврат на экран выбора метода
          if (state.selectedMethod) {
            // Устанавливаем оба состояния одновременно
            setSelectedMethod(state.selectedMethod);
            setIsExpanded(true);
          } else {
            // Если метода нет, восстанавливаем isExpanded из сохраненного состояния
            if (state.isExpanded !== undefined) {
              setIsExpanded(state.isExpanded);
            }
          }
          if (state.photoDataUrl) {
            setPhotoDataUrl(state.photoDataUrl);
            // Восстанавливаем File из data URL
            fetch(state.photoDataUrl)
              .then(res => res.blob())
              .then(blob => {
                const file = new File([blob], "saved-photo.jpg", { type: blob.type });
                setPhotoFile(file);
              })
              .catch(console.error);
          }
          if (state.productName) setProductName(state.productName);
          if (state.analysisResult) setAnalysisResult(state.analysisResult);
          if (state.selectedNameIndex !== null) setSelectedNameIndex(state.selectedNameIndex);
          if (state.customName) setCustomName(state.customName);
          if (state.showCustomInput !== undefined) setShowCustomInput(state.showCustomInput);
          if (state.showSuggestions !== undefined) setShowSuggestions(state.showSuggestions);
          if (state.aiSuggestions) setAiSuggestions(state.aiSuggestions);
          if (state.selectedSuggestion) setSelectedSuggestion(state.selectedSuggestion);
        } catch (error) {
          console.error("Ошибка восстановления состояния:", error);
        }
      }
    };
    
    loadState();
  }, []);
  
  // Функция для получения подсказок от ИИ
  const fetchAISuggestions = async (text: string) => {
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length < 1 || words.length > 4) {
      setAiSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsLoadingSuggestions(true);
    try {
      const response = await fetch("/api/suggest-names", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      if (data.suggestions && data.suggestions.length > 0) {
        setAiSuggestions(data.suggestions);
        setShowSuggestions(true);
      } else {
        // Очищаем только если нет подсказок и нет выбранного варианта
        if (!selectedSuggestion) {
          setAiSuggestions([]);
          setShowSuggestions(false);
        }
      }
    } catch (error) {
      console.error("Ошибка получения подсказок:", error);
      setAiSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  // Дебаунс для запросов к ИИ
  useEffect(() => {
    // Не запрашиваем новые подсказки если уже выбран вариант, но показываем существующие
    if (selectedSuggestion) {
      return;
    }
    
    const words = productName.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length >= 1 && words.length <= 4 && productName.trim().length > 0) {
      const timeoutId = setTimeout(() => {
        fetchAISuggestions(productName);
      }, 300);
      return () => clearTimeout(timeoutId);
    } else if (words.length === 0) {
      // Очищаем только если поле полностью пустое
      setAiSuggestions([]);
      setShowSuggestions(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productName]);

  const handleMethodSelect = (method: FlowStartMethod) => {
    if (selectedMethod && selectedMethod === method) return; // Предотвращаем повторный выбор того же метода
    setSelectedMethod(method);
    setIsExpanded(true); // Показываем функционал сразу
  };

  const handleBack = () => {
    setIsExpanded(false);
    setTimeout(() => {
      setSelectedMethod(null);
    }, 50);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      // Сохраняем фото как data URL для восстановления
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setPhotoDataUrl(dataUrl);
      };
      reader.readAsDataURL(file);
      setAnalysisResult(null); // Сбрасываем результат при новой загрузке
      setSelectedNameIndex(null);
      setCustomName("");
      setShowCustomInput(false);
    }
  };

  const handleAnalyzeProduct = async () => {
    let fileToUse = photoFile;
    
    // Если нет photoFile, но есть photoDataUrl, восстанавливаем файл
    if (!fileToUse && photoDataUrl) {
      try {
        const response = await fetch(photoDataUrl);
        const blob = await response.blob();
        fileToUse = new File([blob], "saved-photo.jpg", { type: blob.type });
        setPhotoFile(fileToUse);
      } catch (error) {
        console.error("Ошибка восстановления фото для анализа:", error);
        return;
      }
    }
    
    if (!fileToUse) return;
    
    setIsAnalyzing(true);
    setAnalysisResult(null);
    
    try {
      const formData = new FormData();
      formData.append("image", fileToUse);
      
      const response = await fetch("/api/recognize", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error("Ошибка при определении товара");
      }
      
      const data = await response.json();
      if (data.names && Array.isArray(data.names)) {
        setAnalysisResult({ names: data.names });
        // Сбрасываем выбор при новом анализе
        setSelectedNameIndex(null);
        setCustomName("");
        setShowCustomInput(false);
      } else {
        setAnalysisResult({ names: [data.result || data.description || "Товар"] });
        setSelectedNameIndex(null);
        setCustomName("");
        setShowCustomInput(false);
      }
    } catch (error) {
      console.error("Ошибка определения товара:", error);
      setAnalysisResult({ names: ["Ошибка. Попробуйте ещё раз."] });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setPhotoFile(file);
      // Сохраняем фото как data URL для восстановления
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setPhotoDataUrl(dataUrl);
      };
      reader.readAsDataURL(file);
      setAnalysisResult(null); // Сбрасываем результат при новой загрузке
      setSelectedNameIndex(null);
      setCustomName("");
      setShowCustomInput(false);
    }
  };

  useEffect(() => {
    // Скрываем navbar и footer на этой странице
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

  return (
    <>
      {NotificationComponent}
      <div className="min-h-screen relative" style={{ backgroundColor: "#f5f3ef" }}>
      {/* Эффект холста художника - многослойный */}
      <div className="absolute inset-0" style={{
        boxShadow: `
          inset 0 0 100px rgba(0,0,0,0.06),
          inset 0 2px 4px rgba(0,0,0,0.08),
          inset 0 -2px 4px rgba(0,0,0,0.08),
          0 1px 3px rgba(0,0,0,0.1)
        `,
        border: '1px solid rgba(0,0,0,0.04)',
        background: `
          linear-gradient(to bottom, rgba(255,255,255,0.03) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.02) 100%),
          linear-gradient(to right, rgba(0,0,0,0.01) 0%, transparent 50%, rgba(0,0,0,0.01) 100%)
        `,
      }}></div>
      
      {/* Дополнительная текстура холста */}
      <CanvasTexture patternAlpha={8} />
      
      {/* Меню стадий */}
      <StageMenu currentStage="understanding" />

      {/* Контент */}
      <div className="relative" style={{ zIndex: 1, minHeight: "100vh", padding: "24px" }}>
        {/* Заголовок и подзаголовок - в самом левом верхнем углу */}
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
            <div className="flex flex-col" style={{ paddingTop: "0", marginTop: "-2px" }} suppressHydrationWarning>
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
                Понимание
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
                Соберём основу: что это и как лучше назвать.
              </p>
            </div>
          </div>
        </div>

        {/* Заголовок "Как начнём Поток?" - всегда видим */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-8 text-center"
        >
          <h2
            className="text-3xl md:text-4xl font-bold mb-3"
            style={{
              fontFamily: "var(--font-serif), Georgia, serif",
              color: "#000000",
            }}
          >
            Как начнём Поток?
          </h2>
          <p
            className="text-base md:text-lg"
            style={{
              fontFamily: "var(--font-sans), Inter, sans-serif",
              color: "#666666",
            }}
          >
            Выберите удобный способ — результат будет одинаковый.
          </p>
        </motion.div>

        {/* Карточки выбора с анимацией расширения - всегда видимы */}
        <div className="flex gap-6 justify-center" style={{ height: "calc(100vh - 280px)" }}>
                {/* Карточка 1: С фото */}
                <motion.div
                  initial={false}
                  animate={{
                    width: selectedMethod === "photo" ? "80%" : selectedMethod === "name" ? "15%" : "30%",
                    opacity: selectedMethod === "name" ? 0.4 : 1,
                  }}
                  transition={{ duration: 0.6, ease: "easeInOut" }}
                  onClick={() => {
                    if (!selectedMethod) {
                      handleMethodSelect("photo");
                    } else if (selectedMethod === "name") {
                      // Если выбран другой метод, переключаемся на этот
                      handleBack();
                      setTimeout(() => handleMethodSelect("photo"), 100);
                    }
                  }}
                  className="relative rounded-3xl flex flex-col group overflow-hidden"
                  style={{
                    background: "#ffffff",
                    border: "2px solid rgba(46, 90, 67, 0.15)",
                    boxShadow: `
                      0 8px 24px rgba(0, 0, 0, 0.08),
                      0 2px 8px rgba(0, 0, 0, 0.04),
                      inset 0 1px 0 rgba(255, 255, 255, 0.8)
                    `,
                    height: "100%",
                    cursor: selectedMethod === "name" ? "pointer" : selectedMethod ? "default" : "pointer",
                  }}
                >
                  <div className="p-10 flex flex-col" style={{ height: "100%", padding: selectedMethod === "name" ? "20px" : "40px", overflowY: selectedMethod === "name" ? "auto" : "visible" }}>
                    {/* Бейдж "Рекомендуем" */}
                    {(!selectedMethod || selectedMethod === "photo") && !isExpanded && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute top-5 right-5 px-4 py-1.5 rounded-full text-xs font-semibold z-10"
                        style={{
                          background: "#2E5A43",
                          color: "#ffffff",
                          boxShadow: "0 2px 8px rgba(46, 90, 67, 0.3)",
                        }}
                      >
                        Рекомендуем
                      </motion.div>
                    )}

                    {selectedMethod === "name" ? (
                      // Компактная версия для сжатого блока
                      <div className="flex flex-col h-full items-center justify-center gap-6 px-4">
                        <div 
                          className="w-12 h-12 rounded-xl flex items-center justify-center"
                          style={{
                            background: "linear-gradient(135deg, rgba(46, 90, 67, 0.1) 0%, rgba(46, 90, 67, 0.05) 100%)",
                          }}
                        >
                          <Upload className="w-6 h-6" style={{ color: "#2E5A43" }} />
                        </div>
                        <button
                          className="w-full py-3 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all text-sm"
                          style={{
                            background: "#2E5A43",
                            color: "#ffffff",
                            border: "none",
                            boxShadow: "0 4px 12px rgba(46, 90, 67, 0.2)",
                          }}
                        >
                          <Check className="w-4 h-4" />
                          ВЫБРАТЬ
                        </button>
                      </div>
                    ) : selectedMethod !== "photo" || !isExpanded ? (
                      <>
                        <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column" }}>
                          {/* Иконка в красивом контейнере */}
                          <div 
                            className="w-16 h-16 rounded-2xl mb-6 flex items-center justify-center transition-all group-hover:scale-110"
                            style={{
                              background: "linear-gradient(135deg, rgba(46, 90, 67, 0.1) 0%, rgba(46, 90, 67, 0.05) 100%)",
                            }}
                          >
                            <Upload className="w-8 h-8" style={{ color: "#2E5A43" }} />
                          </div>
                          
                          <h3
                            className="text-3xl font-bold mb-3"
                            style={{
                              fontFamily: "var(--font-serif), Georgia, serif",
                              color: "#000000",
                            }}
                          >
                            С фото товара
                          </h3>
                          <p
                            className="text-base leading-relaxed mb-4"
                            style={{
                              fontFamily: "var(--font-sans), Inter, sans-serif",
                              color: "#666666",
                            }}
                          >
                            Быстрее и точнее — распознаем предмет по изображению.
                          </p>
                          
                          {/* Символ потока */}
                          <div className="flex justify-center my-4" style={{ minHeight: "240px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Image
                              src="/flow-symbol.png"
                              alt="Символ потока"
                              width={240}
                              height={240}
                              className="object-contain"
                              style={{ 
                                maxWidth: "240px",
                                height: "auto"
                              }}
                              unoptimized
                            />
                          </div>

                          {/* Преимущества */}
                          <div className="space-y-3 mt-4">
                            <div className="flex items-start gap-3">
                              <div 
                                className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0"
                                style={{ background: "#2E5A43" }}
                              />
                              <p
                                className="text-sm leading-relaxed"
                                style={{
                                  fontFamily: "var(--font-sans), Inter, sans-serif",
                                  color: "#666666",
                                }}
                              >
                                Фото сохранится для будущего визуала
                              </p>
                            </div>
                            <div className="flex items-start gap-3">
                              <div 
                                className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0"
                                style={{ background: "#2E5A43" }}
                              />
                              <p
                                className="text-sm leading-relaxed"
                                style={{
                                  fontFamily: "var(--font-sans), Inter, sans-serif",
                                  color: "#666666",
                                }}
                              >
                                Точнее определим категорию и свойства
                              </p>
                            </div>
                          </div>
                        </div>

                        <div style={{ marginTop: "auto", paddingTop: "20px" }}>
                          <button
                            className="w-full py-5 px-6 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all group-hover:shadow-lg"
                            style={{
                              background: "#2E5A43",
                              color: "#ffffff",
                              border: "none",
                              boxShadow: "0 4px 12px rgba(46, 90, 67, 0.2)",
                            }}
                          >
                            <Check className="w-5 h-5" />
                            ВЫБРАТЬ
                          </button>
                        </div>
                      </>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3 }}
                        className="flex flex-col h-full"
                        style={{ overflow: "visible" }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBack();
                          }}
                          className="text-sm mb-6 inline-flex items-center gap-2 self-start"
                          style={{ color: "#666666" }}
                        >
                          ← Назад к выбору
                        </button>
                        {/* Ряд: слева — заголовок, подзаголовок и результаты; справа — квадрат фото на уровне заголовка */}
                        <div className="flex gap-6 items-start flex-1 min-h-0" style={{ overflow: "visible" }}>
                          {/* Левая часть: заголовок, подзаголовок, результаты (расширено вправо) */}
                          <div className="flex flex-col shrink-0" style={{ width: "42%", minWidth: 320, overflow: "visible" }}>
                            <h2
                              className="text-4xl md:text-5xl font-bold mb-3 block"
                              style={{
                                fontFamily: "var(--font-serif), Georgia, serif",
                                color: "#000000",
                              }}
                            >
                              Загрузите фото
                            </h2>
                            <p
                              className="text-base md:text-lg mb-4 block"
                              style={{
                                fontFamily: "var(--font-sans), Inter, sans-serif",
                                color: "#666666",
                              }}
                            >
                              Мы распознаем товар и предложим точное название.
                            </p>
                            <div
                              className="rounded-2xl flex flex-col p-5 mt-1"
                              style={{
                                background: "#fafafa",
                                border: "1px solid rgba(0, 0, 0, 0.08)",
                                overflow: showCustomInput ? "auto" : "visible",
                                maxHeight: showCustomInput ? "400px" : "none",
                                height: showCustomInput ? "400px" : "auto",
                                transition: "max-height 0.3s ease, height 0.3s ease, overflow 0.1s ease",
                              }}
                            >
                              {isAnalyzing ? (
                                <div className="flex flex-col items-center justify-center h-full">
                                  <div className="w-16 h-16 mb-4 border-4 border-t-4 rounded-full animate-spin" style={{
                                    borderColor: "#2E5A43",
                                    borderTopColor: "transparent"
                                  }}></div>
                                  <p className="text-lg" style={{ color: "#666666" }}>
                                    Определяем товар...
                                  </p>
                                </div>
                              ) : analysisResult ? (
                                <div>
                                  <h3
                                    className="text-lg font-semibold mb-4"
                                    style={{
                                      fontFamily: "var(--font-sans), Inter, sans-serif",
                                      color: "#000000",
                                      letterSpacing: "-0.01em",
                                    }}
                                  >
                                    Подборка названий
                                  </h3>
                                  <div className="space-y-2" style={{ paddingBottom: showCustomInput ? "0" : "0" }}>
                                    <AnimatePresence>
                                      {analysisResult.names.slice(0, 5).map((name, index) => (
                                        <motion.div
                                          key={index}
                                          initial={{ opacity: 0, y: 8 }}
                                          animate={{ opacity: selectedNameIndex !== null && selectedNameIndex !== index ? 0.4 : 1, y: 0 }}
                                          exit={{ opacity: 0 }}
                                          transition={{ 
                                            delay: index * 0.08,
                                            duration: 0.3,
                                            ease: "easeOut"
                                          }}
                                          onClick={() => {
                                            setSelectedNameIndex(index);
                                            // Сохраняем выбранное название для "Свой вариант", но не открываем его
                                            setCustomName(name);
                                            // Закрываем "Свой вариант" если он был открыт
                                            setShowCustomInput(false);
                                          }}
                                          className="px-4 py-3 rounded-xl flex items-center gap-3 cursor-pointer transition-all"
                                          style={{
                                            background: selectedNameIndex === index ? "#2E5A43" : "#ffffff",
                                            border: selectedNameIndex === index ? "1px solid #2E5A43" : "1px solid rgba(0, 0, 0, 0.06)",
                                            boxShadow: selectedNameIndex === index 
                                              ? "0 4px 12px rgba(46, 90, 67, 0.2)" 
                                              : "0 1px 3px rgba(0, 0, 0, 0.05)",
                                            transform: selectedNameIndex === index ? "scale(1.02)" : "scale(1)",
                                          }}
                                          onMouseEnter={(e) => {
                                            if (selectedNameIndex !== index) {
                                              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1)";
                                              e.currentTarget.style.transform = "translateY(-1px)";
                                            }
                                          }}
                                          onMouseLeave={(e) => {
                                            if (selectedNameIndex !== index) {
                                              e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)";
                                              e.currentTarget.style.transform = "scale(1)";
                                            }
                                          }}
                                        >
                                          {/* Номер слева */}
                                          <div 
                                            className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                                            style={{
                                              background: selectedNameIndex === index ? "#ffffff" : "rgba(46, 90, 67, 0.1)",
                                              color: selectedNameIndex === index ? "#2E5A43" : "#666666",
                                            }}
                                          >
                                            {index + 1}
                                          </div>
                                          
                                          {/* Текст по центру */}
                                          <p
                                            className="flex-1 text-sm break-words leading-snug"
                                            style={{
                                              fontFamily: "var(--font-sans), Inter, sans-serif",
                                              color: selectedNameIndex === index ? "#ffffff" : "#1a1a1a",
                                              fontWeight: selectedNameIndex === index ? 600 : 500,
                                            }}
                                          >
                                            {name.length > 50 ? name.slice(0, 47) + "…" : name}
                                          </p>
                                          
                                          {/* Иконка справа */}
                                          <div className="flex-shrink-0">
                                            {selectedNameIndex === index ? (
                                              <Check className="w-5 h-5" style={{ color: "#ffffff" }} />
                                            ) : (
                                              <Circle className="w-5 h-5" style={{ color: "rgba(0, 0, 0, 0.2)" }} />
                                            )}
                                          </div>
                                        </motion.div>
                                      ))}
                                    </AnimatePresence>
                                    
                                    {/* Кнопка "Продолжить" если выбрано название */}
                                    {selectedNameIndex !== null && (
                                      <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.3 }}
                                        className="mt-4"
                                        style={{ marginBottom: showCustomInput ? "0" : "0" }}
                                      >
                                        <button
                                          onClick={async () => {
                                            if (selectedNameIndex === null || !analysisResult) return;
                                            
                                            const finalProductName = analysisResult.names[selectedNameIndex];
                                            if (!finalProductName) return;

                                            // Важно: session_id должен создаваться сервером.
                                            // Если локально его нет, отправляем null, чтобы сервер
                                            // корректно создал новую сессию и списал 1 поток.
                                            const currentSessionId = localStorage.getItem("karto_session_id");

                                            try {
                                              const { data: { session } } = await createBrowserClient().auth.getSession();
                                              const headers: Record<string, string> = { "Content-Type": "application/json" };
                                              if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
                                              const response = await fetch("/api/supabase/save-understanding", {
                                                method: "POST",
                                                headers,
                                                body: JSON.stringify({
                                                  session_id: currentSessionId,
                                                  product_name: finalProductName,
                                                  photo_url: photoDataUrl,
                                                  selected_method: selectedMethod,
                                                }),
                                              });

                                              // Для ожидаемых бизнес-ошибок не бросаем exception,
                                              // чтобы не провоцировать dev-overlay в браузере.
                                              if (!response.ok) {
                                                const errorData = await response.json().catch(() => ({ error: "Неизвестная ошибка сервера" }));
                                                showNotification(
                                                  errorData.error || `Ошибка сервера: ${response.status}`,
                                                  "error"
                                                );
                                                return;
                                              }

                                              const data = await response.json();
                                              if (data.success) {
                                                console.log("✅ Данные этапа 'Понимание' сохранены:", data);
                                                // Сохраняем session_id если он был создан
                                                if (data.session_id) {
                                                  localStorage.setItem("karto_session_id", data.session_id);
                                                }
                                                router.push("/studio/description");
                                              } else {
                                                showNotification(
                                                  data.error || "Ошибка сохранения данных. Попробуйте еще раз.",
                                                  "error"
                                                );
                                              }
                                            } catch (error: any) {
                                              let errorMessage = "Ошибка соединения. Проверьте подключение к интернету.";
                                              
                                              if (error.message) {
                                                errorMessage = error.message;
                                              } else if (error.name === "TypeError" && error.message?.includes("fetch")) {
                                                errorMessage = "Ошибка соединения с сервером. Проверьте подключение к интернету.";
                                              }
                                              
                                              showNotification(errorMessage, "error");
                                            }
                                          }}
                                          className="w-full py-3 px-5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
                                          style={{
                                            background: "#2E5A43",
                                            color: "#ffffff",
                                            border: "none",
                                            boxShadow: "0 4px 12px rgba(46, 90, 67, 0.3)",
                                          }}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = "translateY(-2px)";
                                            e.currentTarget.style.boxShadow = "0 6px 16px rgba(46, 90, 67, 0.4)";
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = "translateY(0)";
                                            e.currentTarget.style.boxShadow = "0 4px 12px rgba(46, 90, 67, 0.3)";
                                          }}
                                        >
                                          <Check className="w-5 h-5" />
                                          Продолжить с этим названием
                                        </button>
                                      </motion.div>
                                    )}
                                    
                                    {/* "Свой вариант" */}
                                    <motion.div
                                      initial={{ opacity: 0, y: 8 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      transition={{ 
                                        delay: Math.min(analysisResult.names.length, 5) * 0.08,
                                        duration: 0.3
                                      }}
                                      className="mt-4"
                                    >
                                      <div
                                        onClick={() => {
                                          setShowCustomInput(!showCustomInput);
                                          // При открытии заполняем последним выбранным названием
                                          if (!showCustomInput && selectedNameIndex !== null) {
                                            setCustomName(analysisResult.names[selectedNameIndex]);
                                          } else if (!showCustomInput && selectedNameIndex === null && analysisResult.names.length > 0) {
                                            // Если ничего не выбрано, берём первое название
                                            setCustomName(analysisResult.names[0]);
                                          }
                                        }}
                                        className="px-4 py-3 rounded-xl flex items-center gap-3 cursor-pointer transition-all"
                                        style={{
                                          background: showCustomInput ? "#f0f0f0" : "#ffffff",
                                          border: "1px solid rgba(0, 0, 0, 0.06)",
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.08)";
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.boxShadow = "none";
                                        }}
                                      >
                                        <Edit className="w-5 h-5" style={{ color: "#2E5A43" }} />
                                        <span className="text-sm font-medium" style={{ color: "#1a1a1a" }}>
                                          Свой вариант
                                        </span>
                                      </div>
                                      
                                      {showCustomInput && (
                                        <motion.div
                                          initial={{ opacity: 0 }}
                                          animate={{ opacity: 1 }}
                                          exit={{ opacity: 0 }}
                                          transition={{ duration: 0.2 }}
                                          className="mt-3"
                                          style={{ height: "auto" }}
                                        >
                                          <input
                                            type="text"
                                            value={customName}
                                            onChange={(e) => setCustomName(e.target.value)}
                                            placeholder="Введите своё название"
                                            className="w-full py-3 px-4 rounded-xl text-sm outline-none mb-3"
                                            style={{
                                              background: "#ffffff",
                                              border: "2px solid rgba(46, 90, 67, 0.2)",
                                              color: "#000000",
                                            }}
                                            autoFocus
                                          />
                                          <button
                                            onClick={() => {
                                              if (customName.trim()) {
                                                console.log("Использовано кастомное название:", customName);
                                                // Здесь можно добавить логику использования кастомного названия
                                              }
                                            }}
                                            disabled={!customName.trim()}
                                            className="w-full py-2.5 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                            style={{
                                              background: customName.trim() ? "#2E5A43" : "rgba(46, 90, 67, 0.3)",
                                              color: "#ffffff",
                                              border: "none",
                                            }}
                                          >
                                            <Check className="w-4 h-4" />
                                            Использовать
                                          </button>
                                        </motion.div>
                                      )}
                                    </motion.div>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center h-full text-center">
                                  <div>
                                    <p className="text-base mb-2" style={{ color: "#666666" }}>
                                      Здесь появится список предполагаемых названий
                                    </p>
                                    <p className="text-sm" style={{ color: "#999999" }}>
                                      Загрузите фото и нажмите "Определить товар"
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Правая часть: квадрат фото (максимально справа), под ним кнопка той же ширины */}
                          <div className="shrink-0 flex flex-col items-center ml-auto" style={{ width: 520 }}>
                            <div
                              onDrop={handleDrop}
                              onDragOver={(e) => e.preventDefault()}
                              className="rounded-2xl text-center border-2 border-dashed transition-all flex items-center justify-center"
                              style={{
                                background: "#fafafa",
                                borderColor: "rgba(0, 0, 0, 0.2)",
                                width: 520,
                                height: 520,
                                aspectRatio: "1 / 1",
                              }}
                            >
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handlePhotoUpload}
                                className="hidden"
                                id="photo-upload"
                              />
                              <label htmlFor="photo-upload" className="cursor-pointer block w-full h-full flex items-center justify-center p-4">
                                {photoFile || photoDataUrl ? (
                                  <div className="w-full h-full flex flex-col items-center justify-center">
                                    <img
                                      src={photoFile ? URL.createObjectURL(photoFile) : photoDataUrl || ""}
                                      alt="Preview"
                                      className="max-w-full max-h-full object-contain rounded-lg"
                                    />
                                    <p className="text-xs mt-1" style={{ color: "#666666" }}>
                                      Нажмите для замены
                                    </p>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center">
                                    <Upload className="w-12 h-12 mb-2" style={{ color: "#2E5A43" }} />
                                    <p className="text-sm" style={{ color: "#000000" }}>
                                      Перетащите или нажмите
                                    </p>
                                  </div>
                                )}
                              </label>
                            </div>
                            <button
                              onClick={handleAnalyzeProduct}
                              disabled={!photoFile || isAnalyzing}
                              className="w-full mt-4 py-3 px-5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              style={{
                                background: photoFile && !isAnalyzing ? "#2E5A43" : "rgba(46, 90, 67, 0.3)",
                                color: "#ffffff",
                                border: "none",
                              }}
                            >
                              {isAnalyzing ? (
                                <>
                                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                  Определяем...
                                </>
                              ) : (
                                <>
                                  <Check className="w-4 h-4" />
                                  Определить товар
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </motion.div>

                {/* Карточка 2: С названия */}
                <motion.div
                  initial={false}
                  animate={{
                    width: selectedMethod === "name" ? "80%" : selectedMethod === "photo" ? "15%" : "30%",
                    opacity: selectedMethod === "photo" ? 0.4 : 1,
                  }}
                  transition={{ duration: 0.6, ease: "easeInOut" }}
                  onClick={() => {
                    if (!selectedMethod) {
                      handleMethodSelect("name");
                    } else if (selectedMethod === "photo") {
                      // Если выбран другой метод, переключаемся на этот
                      handleBack();
                      setTimeout(() => handleMethodSelect("name"), 100);
                    }
                  }}
                  className="relative rounded-3xl flex flex-col group overflow-hidden"
                  style={{
                    background: "#ffffff",
                    border: "2px solid rgba(46, 90, 67, 0.15)",
                    boxShadow: `
                      0 8px 24px rgba(0, 0, 0, 0.08),
                      0 2px 8px rgba(0, 0, 0, 0.04),
                      inset 0 1px 0 rgba(255, 255, 255, 0.8)
                    `,
                    height: "100%",
                    cursor: selectedMethod === "photo" ? "pointer" : selectedMethod ? "default" : "pointer",
                  }}
                >
                  <div className="p-10 flex flex-col h-full" style={{ height: "100%", padding: selectedMethod === "photo" ? "20px" : "40px", overflowY: "visible" }}>
                    {selectedMethod === "photo" ? (
                      // Компактная версия для сжатого блока
                      <div className="flex flex-col h-full items-center justify-center gap-6 px-4">
                        <div 
                          className="w-12 h-12 rounded-xl flex items-center justify-center"
                          style={{
                            background: "linear-gradient(135deg, rgba(46, 90, 67, 0.1) 0%, rgba(46, 90, 67, 0.05) 100%)",
                          }}
                        >
                          <Type className="w-6 h-6" style={{ color: "#2E5A43" }} />
                        </div>
                        <button
                          className="w-full py-3 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all text-sm"
                          style={{
                            background: "#2E5A43",
                            color: "#ffffff",
                            border: "none",
                            boxShadow: "0 4px 12px rgba(46, 90, 67, 0.2)",
                          }}
                        >
                          <Check className="w-4 h-4" />
                          ВЫБРАТЬ
                        </button>
                      </div>
                    ) : selectedMethod !== "name" || !isExpanded ? (
                      <>
                        <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column" }}>
                          {/* Иконка в красивом контейнере */}
                          <div 
                            className="w-16 h-16 rounded-2xl mb-6 flex items-center justify-center transition-all group-hover:scale-110"
                            style={{
                              background: "linear-gradient(135deg, rgba(46, 90, 67, 0.1) 0%, rgba(46, 90, 67, 0.05) 100%)",
                            }}
                          >
                            <Type className="w-8 h-8" style={{ color: "#2E5A43" }} />
                          </div>
                          
                          <h3
                            className="text-3xl font-bold mb-3"
                            style={{
                              fontFamily: "var(--font-serif), Georgia, serif",
                              color: "#000000",
                            }}
                          >
                            С названия товара
                          </h3>
                          <p
                            className="text-base leading-relaxed mb-4"
                            style={{
                              fontFamily: "var(--font-sans), Inter, sans-serif",
                              color: "#666666",
                            }}
                          >
                            Если фото нет под рукой — начнём с текста и уточним детали.
                          </p>

                          {/* Символ потока */}
                          <div className="flex justify-center my-4" style={{ minHeight: "240px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Image
                              src="/flow-symbol-2.png"
                              alt="Символ потока"
                              width={240}
                              height={240}
                              className="object-contain"
                              style={{ 
                                maxWidth: "240px",
                                height: "auto"
                              }}
                              unoptimized
                            />
                          </div>

                          {/* Дополнительная информация */}
                          <div className="space-y-3 mt-4">
                            <div className="flex items-start gap-3">
                              <div 
                                className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0"
                                style={{ background: "#2E5A43" }}
                              />
                              <p
                                className="text-sm leading-relaxed"
                                style={{
                                  fontFamily: "var(--font-sans), Inter, sans-serif",
                                  color: "#666666",
                                }}
                              >
                                Можно начать без фото
                              </p>
                            </div>
                            <div className="flex items-start gap-3">
                              <div 
                                className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0"
                                style={{ background: "#2E5A43" }}
                              />
                              <p
                                className="text-sm leading-relaxed"
                                style={{
                                  fontFamily: "var(--font-sans), Inter, sans-serif",
                                  color: "#666666",
                                }}
                              >
                                Фото добавите на этапе «Визуал»
                              </p>
                            </div>
                          </div>
                        </div>

                        <div style={{ marginTop: "auto", paddingTop: "20px" }}>
                          <button
                            className="w-full py-5 px-6 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all group-hover:shadow-lg"
                            style={{
                              background: "#2E5A43",
                              color: "#ffffff",
                              border: "none",
                              boxShadow: "0 4px 12px rgba(46, 90, 67, 0.2)",
                            }}
                          >
                            <Check className="w-5 h-5" />
                            ВЫБРАТЬ
                          </button>
                        </div>
                      </>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="flex flex-col"
                        style={{ maxHeight: "100%", overflowY: "auto" }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBack();
                          }}
                          className="text-sm mb-6 inline-flex items-center gap-2 self-start"
                          style={{ color: "#666666" }}
                        >
                          ← Назад к выбору
                        </button>
                        
                        {/* Подзаголовок этапа */}
                        <p
                          className="text-sm mb-3"
                          style={{
                            fontFamily: "var(--font-sans), Inter, sans-serif",
                            color: "#666666",
                          }}
                        >
                          Дадим товару точное имя. Такое, которое любят маркетплейсы и покупатели.
                        </p>
                        
                        <h2
                          className="text-2xl md:text-3xl font-bold mb-6"
                          style={{
                            fontFamily: "var(--font-serif), Georgia, serif",
                            color: "#000000",
                          }}
                        >
                          Название товара
                        </h2>

                        <div className="mb-6">
                          <label
                            className="block text-sm font-medium mb-2"
                            style={{
                              fontFamily: "var(--font-sans), Inter, sans-serif",
                              color: "#666666",
                            }}
                          >
                            Как назвать товар?
                          </label>
                          <div className="relative">
                            {/* Иконка слева - крупнее и брендовее */}
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none z-10">
                              <PenTool className="w-5 h-5" style={{ color: "#2E5A43", strokeWidth: 2.5 }} />
                            </div>
                            
                            {/* Поле ввода - премиум строка (толще) */}
                            <input
                              type="text"
                              value={productName}
                              onChange={(e) => {
                                const newValue = e.target.value;
                                setProductName(newValue);
                                // Сбрасываем выбранный вариант если пользователь редактирует вручную
                                if (selectedSuggestion && newValue !== selectedSuggestion) {
                                  setSelectedSuggestion(null);
                                }
                              }}
                              placeholder="Что это за товар?"
                              className="w-full py-4 pl-14 pr-4 rounded-xl text-base outline-none transition-all"
                              style={{
                                background: "#faf8f5",
                                border: "1px solid rgba(0, 0, 0, 0.08)",
                                color: "#000000",
                                height: "56px",
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
                          </div>
                          
                          {/* Текст под инпутом */}
                          <p
                            className="text-xs mt-2"
                            style={{
                              color: "#999999",
                              fontFamily: "var(--font-sans), Inter, sans-serif",
                            }}
                          >
                            Под формат маркетплейса — выберите вариант или оставьте свой.
                          </p>
                        </div>

                        {/* Блок с подсказками - контейнер с заливкой */}
                        {aiSuggestions.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            transition={{ duration: 0.3 }}
                            className="mb-6 p-6 rounded-2xl"
                            style={{
                              background: "#faf8f5",
                              border: "1px solid rgba(0, 0, 0, 0.05)",
                            }}
                          >
                            <p className="text-sm font-medium mb-4" style={{ color: "#666666" }}>
                              Варианты
                            </p>
                            
                            {/* Блок "Лучший вариант" - первый вариант с отметкой РЕКОМЕНДУЕМ */}
                            {aiSuggestions.length > 0 && (
                              <div className="mb-4 p-5 rounded-xl"
                                style={{
                                  background: "#ffffff",
                                  border: selectedSuggestion === aiSuggestions[0] ? "2px solid #2E5A43" : "1px solid rgba(0, 0, 0, 0.08)",
                                }}
                              >
                                <div className="flex items-center gap-2 mb-3">
                                  <Check className="w-4 h-4" style={{ color: "#2E5A43" }} />
                                  <span className="text-sm font-semibold" style={{ color: "#2E5A43" }}>
                                    РЕКОМЕНДУЕМ
                                  </span>
                                </div>
                                <p className="text-base font-medium mb-4" style={{ color: "#1a1a1a" }}>
                                  {aiSuggestions[0]}
                                </p>
                                <button
                                  onClick={() => {
                                    setProductName(aiSuggestions[0]);
                                    setSelectedSuggestion(aiSuggestions[0]);
                                  }}
                                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                                  style={{
                                    background: "#2E5A43",
                                    color: "#ffffff",
                                  }}
                                >
                                  Применить
                                </button>
                              </div>
                            )}
                            
                            {/* Остальные варианты - сетка */}
                            {aiSuggestions.length > 1 && (
                              <div className="grid grid-cols-2 gap-3">
                                {aiSuggestions.slice(1).map((suggestion, index) => (
                                  <button
                                    key={index + 1}
                                    onClick={() => {
                                      setProductName(suggestion);
                                      setSelectedSuggestion(suggestion);
                                    }}
                                    className="p-4 rounded-xl text-left transition-all relative"
                                    style={{
                                      background: selectedSuggestion === suggestion ? "#f0f7f3" : "#ffffff",
                                      border: selectedSuggestion === suggestion ? "2px solid #2E5A43" : "1px solid rgba(0, 0, 0, 0.08)",
                                    }}
                                    onMouseEnter={(e) => {
                                      if (selectedSuggestion !== suggestion) {
                                        e.currentTarget.style.borderColor = "#2E5A43";
                                        e.currentTarget.style.background = "#faf8f5";
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (selectedSuggestion !== suggestion) {
                                        e.currentTarget.style.borderColor = "rgba(0, 0, 0, 0.08)";
                                        e.currentTarget.style.background = "#ffffff";
                                      }
                                    }}
                                  >
                                    {selectedSuggestion === suggestion && (
                                      <Check className="w-4 h-4 absolute top-3 left-3" style={{ color: "#2E5A43" }} />
                                    )}
                                    <p className="text-sm font-medium mb-1" style={{ 
                                      color: "#1a1a1a",
                                      paddingLeft: selectedSuggestion === suggestion ? "24px" : "0"
                                    }}>
                                      {suggestion}
                                    </p>
                                    <p className="text-xs" style={{ color: "#999999" }}>
                                      Ключевые слова: {suggestion.split(" ").slice(1, 3).join(", ")}
                                    </p>
                                  </button>
                                ))}
                              </div>
                            )}
                          </motion.div>
                        )}

                        {/* Строка "Выбрано" после выбора варианта */}
                        {selectedSuggestion && (
                          <motion.div
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mb-4 p-4 rounded-xl flex items-center justify-between"
                            style={{
                              background: "#f0f7f3",
                              border: "1px solid rgba(46, 90, 67, 0.2)",
                            }}
                          >
                            <div>
                              <p className="text-xs mb-1" style={{ color: "#666666" }}>
                                Выбрано:
                              </p>
                              <p className="text-sm font-medium" style={{ color: "#1a1a1a" }}>
                                "{selectedSuggestion}"
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                setSelectedSuggestion(null);
                              }}
                              className="text-xs px-3 py-1.5 rounded-lg transition-all"
                              style={{
                                background: "transparent",
                                color: "#2E5A43",
                                border: "1px solid rgba(46, 90, 67, 0.3)",
                              }}
                            >
                              Редактировать
                            </button>
                          </motion.div>
                        )}

                        {/* Кнопка "Продолжить" - всегда видна внизу блока */}
                        <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end">
                          <button
                            disabled={!productName.trim()}
                            onClick={async () => {
                              if (!productName.trim()) return;
                              
                              try {
                                let sessionId = localStorage.getItem("karto_session_id");
                                const { data: { session } } = await createBrowserClient().auth.getSession();
                                const headers: Record<string, string> = { "Content-Type": "application/json" };
                                if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
                                const response = await fetch("/api/supabase/save-understanding", {
                                  method: "POST",
                                  headers,
                                  body: JSON.stringify({
                                    session_id: sessionId || null,
                                    product_name: productName.trim(),
                                    photo_url: photoDataUrl || null,
                                    selected_method: selectedMethod || "name",
                                  }),
                                });
                                
                                // Для ожидаемых бизнес-ошибок не бросаем exception,
                                // чтобы не провоцировать dev-overlay в браузере.
                                if (!response.ok) {
                                  const errorData = await response.json().catch(() => ({ error: "Неизвестная ошибка сервера" }));
                                  showNotification(
                                    errorData.error || `Ошибка сервера: ${response.status}`,
                                    "error"
                                  );
                                  return;
                                }
                                
                                const data = await response.json();
                                
                                if (data.success) {
                                  // Сохраняем session_id в localStorage
                                  localStorage.setItem("karto_session_id", data.session_id);
                                  
                                  showNotification("Данные успешно сохранены", "success");
                                  
                                  // Переходим на этап "Описание"
                                  setTimeout(() => {
                                    router.push("/studio/description");
                                  }, 500);
                                } else {
                                  showNotification(
                                    data.error || "Ошибка сохранения данных. Попробуйте еще раз.",
                                    "error"
                                  );
                                }
                              } catch (error: any) {
                                let errorMessage = "Ошибка соединения. Проверьте подключение к интернету.";
                                
                                if (error.message) {
                                  errorMessage = error.message;
                                } else if (error.name === "TypeError" && error.message?.includes("fetch")) {
                                  errorMessage = "Ошибка соединения с сервером. Проверьте подключение к интернету.";
                                }
                                
                                showNotification(errorMessage, "error");
                              }
                            }}
                            className="px-6 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{
                              background: productName.trim() ? "#2E5A43" : "rgba(46, 90, 67, 0.3)",
                              color: "#ffffff",
                              border: "none",
                            }}
                          >
                            <Check className="w-5 h-5" />
                            Принять и продолжить →
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
        </div>
      </div>
    </div>
    </>
  );
}
