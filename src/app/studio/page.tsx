"use client";

import { useState, useCallback, useEffect } from "react";
import { Upload, Loader2, CheckCircle, XCircle, Image as ImageIcon, Sparkles, Download, Type, Palette, FileText, Wand2, Zap, Eye, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { IntroAnimation } from "@/components/ui/intro-animation";

interface ProcessingStep {
  step: string;
  status: "pending" | "processing" | "completed" | "error";
  result?: string;
  error?: string;
  time?: number;
}

interface ProcessingResult {
  originalImage?: string;
  finalImage?: string;
  generatedImage?: string;
}

const STEP_LABELS: Record<string, string> = {
  upload: "Загрузка изображения",
  generate: "Генерация карточки (~30-60 сек)",
};

const CARD_STYLES = [
  { 
    id: "minimal", 
    name: "Минималистичный", 
    description: "Чистый фон, акцент на товар", 
    gradient: "from-gray-50 to-gray-100",
    icon: "✨"
  },
  { 
    id: "premium", 
    name: "Премиум", 
    description: "Элегантный тёмный стиль", 
    gradient: "from-gray-800 to-gray-900",
    icon: "💎"
  },
  { 
    id: "lifestyle", 
    name: "Лайфстайл", 
    description: "Натуральная обстановка", 
    gradient: "from-amber-50 to-amber-100",
    icon: "🌿"
  },
  { 
    id: "vibrant", 
    name: "Яркий", 
    description: "Насыщенные цвета", 
    gradient: "from-[#2E5A43] to-[#3d7a5a]",
    icon: "🎨"
  },
  { 
    id: "eco", 
    name: "Эко", 
    description: "Природные мотивы", 
    gradient: "from-green-100 to-green-200",
    icon: "🌱"
  },
];

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 }
};

const staggerContainer = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

export default function StudioPage() {
  const [showIntro, setShowIntro] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [steps, setSteps] = useState<ProcessingStep[]>([]);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Проверяем, нужно ли показать интро при первом заходе
  useEffect(() => {
    const hasSeenIntro = sessionStorage.getItem("karto-intro-seen");
    const urlParams = new URLSearchParams(window.location.search);
    const showIntroParam = urlParams.get("intro");
    
    if (showIntroParam === "true" || (!hasSeenIntro && showIntroParam !== "false")) {
      setShowIntro(true);
      sessionStorage.setItem("karto-intro-seen", "true");
    }
  }, []);
  
  // Поля ввода
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("minimal");
  const [customPrompt, setCustomPrompt] = useState("");
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResult(null);
      setError(null);
      setSteps([]);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResult(null);
      setError(null);
      setSteps([]);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleProcess = async () => {
    if (!selectedFile) return;
    if (!title.trim()) {
      setError("Введите заголовок для карточки");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSteps([]);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("image", selectedFile);
      formData.append("title", title.trim());
      formData.append("style", selectedStyle);
      
      if (subtitle.trim()) {
        formData.append("subtitle", subtitle.trim());
      }
      if (description.trim()) {
        formData.append("description", description.trim());
      }
      if (useCustomPrompt && customPrompt.trim()) {
        formData.append("customPrompt", customPrompt.trim());
      }

      const response = await fetch("/api/process", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setSteps(data.steps);
        setResult(data.result);
      } else {
        setError(data.error || "Произошла ошибка");
        setSteps(data.steps || []);
        
        if (data.hint) {
          setError(data.error + "\n\n💡 " + data.hint);
        }
      }
    } catch (err) {
      setError("Ошибка соединения с сервером");
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (result?.finalImage) {
      const link = document.createElement("a");
      link.href = result.finalImage;
      link.download = `karto-${title.replace(/\s+/g, "-")}.png`;
      link.click();
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    setSteps([]);
    setTitle("");
    setSubtitle("");
    setDescription("");
    setCustomPrompt("");
    setUseCustomPrompt(false);
  };

  return (
    <>
      <AnimatePresence>
        {showIntro && (
          <IntroAnimation onComplete={() => setShowIntro(false)} />
        )}
      </AnimatePresence>
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* Header */}
      <div className="border-b border-border/50 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between"
          >
            <div>
              <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: 'var(--font-serif)' }}>
                KARTO Studio
              </h1>
              <p className="text-muted-foreground text-sm">
                Создайте профессиональную карточку товара с помощью AI
              </p>
            </div>
            {result && (
              <Button
                variant="outline"
                onClick={handleReset}
                className="flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Новый проект
              </Button>
            )}
          </motion.div>
        </div>
      </div>

      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Левая колонка - Форма */}
          <div className="lg:col-span-2 space-y-6">
            {/* Загрузка файла */}
            <motion.div
              variants={fadeIn}
              initial="initial"
              animate="animate"
              className="bg-white rounded-2xl p-6 shadow-lg border border-border/50"
            >
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Upload className="w-5 h-5 text-primary" />
                </div>
                Фото товара
              </h2>

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`
                  relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300
                  ${isDragging
                    ? "border-primary bg-primary/5 scale-[1.02]"
                    : previewUrl 
                    ? "border-success/30 bg-success/5" 
                    : "border-border hover:border-primary/50 hover:bg-primary/5"
                  }
                `}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-input"
                />
                <label htmlFor="file-input" className="cursor-pointer block">
                  <AnimatePresence mode="wait">
                    {previewUrl ? (
                      <motion.div
                        key="preview"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="space-y-4"
                      >
                        <div className="relative mx-auto max-w-md">
                          <img
                            src={previewUrl}
                            alt="Preview"
                            className="w-full h-auto rounded-xl shadow-lg border-2 border-white"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-xl pointer-events-none" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {selectedFile?.name}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Нажмите для замены
                          </p>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="space-y-4"
                      >
                        <div className="w-20 h-20 bg-gradient-to-br from-primary/20 to-primary/10 rounded-2xl flex items-center justify-center mx-auto">
                          <ImageIcon className="w-10 h-10 text-primary" />
                        </div>
                        <div>
                          <p className="text-foreground font-medium mb-1">
                            Перетащите фото сюда
                          </p>
                          <p className="text-sm text-muted-foreground">
                            или нажмите для выбора файла
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            PNG, JPG, WEBP до 10MB
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </label>
              </div>
            </motion.div>

            {/* Текст */}
            <motion.div
              variants={fadeIn}
              initial="initial"
              animate="animate"
              transition={{ delay: 0.1 }}
              className="bg-white rounded-2xl p-6 shadow-lg border border-border/50"
            >
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Type className="w-5 h-5 text-primary" />
                </div>
                Текст на карточке
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Заголовок <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="ВЕДРО СТРОИТЕЛЬНОЕ 12Л"
                    className="w-full px-4 py-3 rounded-lg border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Подзаголовок
                  </label>
                  <input
                    type="text"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    placeholder="СДЕЛАНО В РОССИИ"
                    className="w-full px-4 py-3 rounded-lg border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Описание товара (для AI)
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Чёрное пластиковое ведро объёмом 12 литров для строительных работ"
                    rows={3}
                    className="w-full px-4 py-3 rounded-lg border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-none transition-all"
                  />
                </div>
              </div>
            </motion.div>

            {/* Стиль */}
            <motion.div
              variants={fadeIn}
              initial="initial"
              animate="animate"
              transition={{ delay: 0.2 }}
              className="bg-white rounded-2xl p-6 shadow-lg border border-border/50"
            >
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Palette className="w-5 h-5 text-primary" />
                </div>
                Стиль оформления
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {CARD_STYLES.map((style) => (
                  <motion.button
                    key={style.id}
                    onClick={() => setSelectedStyle(style.id)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={`
                      relative p-4 rounded-xl border-2 text-left transition-all overflow-hidden
                      ${selectedStyle === style.id
                        ? "border-primary bg-primary/5 shadow-md"
                        : "border-border hover:border-primary/50 bg-white"
                      }
                    `}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${style.gradient} opacity-20`} />
                    <div className="relative">
                      <div className="text-2xl mb-2">{style.icon}</div>
                      <p className="font-semibold text-sm mb-1">{style.name}</p>
                      <p className="text-xs text-muted-foreground">{style.description}</p>
                    </div>
                    {selectedStyle === style.id && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center"
                      >
                        <CheckCircle className="w-3 h-3 text-white" />
                      </motion.div>
                    )}
                  </motion.button>
                ))}
              </div>
            </motion.div>

            {/* Кастомный промпт */}
            <motion.div
              variants={fadeIn}
              initial="initial"
              animate="animate"
              transition={{ delay: 0.3 }}
              className="bg-white rounded-2xl p-6 shadow-lg border border-border/50"
            >
              <label className="flex items-center gap-3 cursor-pointer mb-4">
                <input
                  type="checkbox"
                  checked={useCustomPrompt}
                  onChange={(e) => setUseCustomPrompt(e.target.checked)}
                  className="w-5 h-5 rounded border-border text-primary focus:ring-2 focus:ring-primary/20"
                />
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium">Свой промпт (для экспертов)</span>
                </div>
              </label>
              
              <AnimatePresence>
                {useCustomPrompt && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="Создай карточку товара с зелёным градиентным фоном, текст 'ВЕДРО 12Л' сверху крупным шрифтом..."
                      rows={4}
                      className="w-full px-4 py-3 rounded-lg border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-none text-sm mt-4"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Кнопка генерации */}
            <motion.div
              variants={fadeIn}
              initial="initial"
              animate="animate"
              transition={{ delay: 0.4 }}
            >
              <Button
                onClick={handleProcess}
                disabled={!selectedFile || !title.trim() || isProcessing}
                size="lg"
                className="w-full h-14 text-base font-semibold shadow-lg hover:shadow-xl transition-all"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Генерация...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-5 h-5 mr-2" />
                    Создать карточку
                  </>
                )}
              </Button>
              
              <p className="text-center text-sm text-muted-foreground mt-3">
                💰 Стоимость: ~$0.15 за генерацию • Powered by Nanobanana 2 Pro
              </p>
            </motion.div>
          </div>

          {/* Правая колонка - Результаты */}
          <div className="space-y-6">
            {/* Прогресс */}
            <AnimatePresence>
              {steps.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="bg-white rounded-2xl p-6 shadow-lg border border-border/50"
                >
                  <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-primary" />
                    Прогресс
                  </h2>
                  <div className="space-y-3">
                    {steps.map((step, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className={`
                          flex items-center justify-between p-4 rounded-lg
                          ${step.status === "completed" ? "bg-success/10 border border-success/20" : ""}
                          ${step.status === "processing" ? "bg-primary/10 border border-primary/20" : ""}
                          ${step.status === "error" ? "bg-red-50 border border-red-200" : ""}
                          ${step.status === "pending" ? "bg-muted border border-border" : ""}
                        `}
                      >
                        <div className="flex items-center gap-3">
                          {step.status === "completed" && (
                            <CheckCircle className="w-5 h-5 text-success" />
                          )}
                          {step.status === "processing" && (
                            <Loader2 className="w-5 h-5 text-primary animate-spin" />
                          )}
                          {step.status === "error" && (
                            <XCircle className="w-5 h-5 text-red-500" />
                          )}
                          {step.status === "pending" && (
                            <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
                          )}
                          <span className="font-medium text-sm">
                            {STEP_LABELS[step.step] || step.step}
                          </span>
                        </div>
                        {step.time && (
                          <span className="text-xs text-muted-foreground">
                            {(step.time / 1000).toFixed(1)}s
                          </span>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Ошибка */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="bg-red-50 border border-red-200 rounded-2xl p-6"
                >
                  <div className="flex items-start gap-3">
                    <XCircle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-red-700 mb-1">Ошибка</p>
                      <p className="text-red-600 whitespace-pre-line text-sm">{error}</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Результат */}
            <AnimatePresence>
              {result?.finalImage && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white rounded-2xl p-6 shadow-lg border border-border/50"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-success" />
                      Готовая карточка
                    </h2>
                    <Button
                      onClick={handleDownload}
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Скачать
                    </Button>
                  </div>
                  
                  <div className="rounded-xl overflow-hidden border-2 border-border shadow-inner bg-muted/50">
                    <img
                      src={result.finalImage}
                      alt="Готовая карточка"
                      className="w-full h-auto"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Оригинал */}
            <AnimatePresence>
              {result?.originalImage && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="bg-white rounded-2xl p-6 shadow-lg border border-border/50"
                >
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Eye className="w-5 h-5 text-muted-foreground" />
                    Оригинальное фото
                  </h2>
                  <div className="rounded-lg overflow-hidden border border-border">
                    <img
                      src={result.originalImage}
                      alt="Оригинал"
                      className="w-full h-auto"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Инструкция */}
            {!result && !isProcessing && steps.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl p-8 text-center border border-primary/20"
              >
                <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <p className="text-foreground font-medium mb-2">
                  Загрузите фото товара
                </p>
                <p className="text-sm text-muted-foreground">
                  Укажите текст и стиль → AI создаст карточку
                </p>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
