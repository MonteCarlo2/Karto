"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StageMenu } from "@/components/ui/stage-menu";
import { 
  Upload, 
  ZoomIn, 
  ZoomOut, 
  Download, 
  Loader2,
  Sparkles,
  Eye,
  Image as ImageIcon,
  Wand2,
  Type,
  Palette,
  FileText,
  Edit2,
  Loader,
  Pen,
  List,
  Heading,
  Circle,
  Square,
  RectangleVertical,
  Maximize2,
  Diamond,
  Leaf,
  Zap,
  Sparkles as SparklesIcon,
  X
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";

// Стили карточек (wireframe макеты)
const CARD_STYLES = [
  {
    id: "mix",
    name: "Микс",
    layout: "mixed",
    icon: SparklesIcon,
    bgColor: "bg-purple-50",
  },
  {
    id: "minimal",
    name: "Минимализм",
    layout: "minimal",
    icon: Maximize2,
    bgColor: "bg-gray-50",
  },
  {
    id: "premium",
    name: "Премиум",
    layout: "premium",
    icon: Diamond,
    bgColor: "bg-gray-50",
  },
  {
    id: "lifestyle",
    name: "Лайфстайл",
    layout: "lifestyle",
    icon: ImageIcon,
    bgColor: "bg-amber-50",
  },
  {
    id: "vibrant",
    name: "Яркий",
    layout: "vibrant",
    icon: Zap,
    bgColor: "bg-blue-50",
  },
  {
    id: "eco",
    name: "Эко",
    layout: "eco",
    icon: Leaf,
    bgColor: "bg-green-50",
  },
];

// Цветовая палитра
const COLOR_PALETTE = [
  { id: "auto", name: "На усмотрение ИИ", value: "gradient" },
  { id: "white", name: "Белый", value: "#FFFFFF" },
  { id: "black", name: "Черный", value: "#000000" },
  { id: "red", name: "Красный", value: "#EF4444" },
  { id: "blue", name: "Синий", value: "#3B82F6" },
  { id: "green", name: "Зеленый", value: "#10B981" },
  { id: "yellow", name: "Желтый", value: "#F59E0B" },
  { id: "purple", name: "Фиолетовый", value: "#A855F7" },
  { id: "pink", name: "Розовый", value: "#EC4899" },
];

// Компонент карточки стиля с иконкой
function StyleCard({ style, isSelected }: { style: typeof CARD_STYLES[0]; isSelected: boolean }) {
  const Icon = style.icon;
  return (
    <div className={`w-full h-full ${style.bgColor} flex items-center justify-center`}>
      <Icon className={`w-8 h-8 ${isSelected ? "text-gray-900 opacity-70" : "text-gray-400 opacity-50"}`} />
    </div>
  );
}

// Кастомный Toggle Switch (iOS-style, зеленый)
function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
        checked ? "bg-[#1F4E3D]" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

// Компонент визуального паттерна стиля (CSS Art)
function StylePattern({ layout, isSelected }: { layout: string; isSelected: boolean }) {
  return (
    <div className="w-full h-full relative overflow-hidden rounded-lg">
      {layout === "minimal" && (
        <div className="w-full h-full bg-white flex items-center justify-center">
          <div className="w-3/4 h-0.5 bg-gray-300" />
        </div>
      )}
      {layout === "premium" && (
        <div className="w-full h-full bg-gray-800 flex items-center justify-center">
          <div className="w-2/3 h-1 bg-white/20 rounded" />
        </div>
      )}
      {layout === "vibrant" && (
        <div className="w-full h-full bg-gradient-to-br from-emerald-100 to-blue-100 relative">
          <div className="absolute top-2 left-2 w-8 h-8 bg-emerald-400/40 rounded-full" />
          <div className="absolute bottom-2 right-2 w-6 h-6 bg-blue-400/40 rounded-full" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-1 bg-white/60 rounded-full" />
        </div>
      )}
      {layout === "lifestyle" && (
        <div className="w-full h-full bg-gradient-to-br from-amber-50 to-orange-50 relative">
          <div className="absolute top-3 left-3 w-10 h-0.5 bg-amber-300 rounded" />
          <div className="absolute bottom-3 right-3 w-8 h-0.5 bg-orange-300 rounded" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-amber-200/30 rounded-full" />
        </div>
      )}
      {layout === "eco" && (
        <div className="w-full h-full bg-gradient-to-br from-green-50 to-emerald-50 relative">
          <div className="absolute top-2 left-2 w-6 h-6 bg-green-300/40 rounded-full" />
          <div className="absolute bottom-2 right-2 w-4 h-4 bg-emerald-300/40 rounded-full" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-0.5 bg-green-400/60 rounded-full" />
        </div>
      )}
      {layout === "mixed" && (
        <div className="w-full h-full bg-gradient-to-br from-purple-50 to-pink-50 relative">
          <div className="absolute top-2 left-2 w-8 h-0.5 bg-purple-300 rounded" />
          <div className="absolute bottom-2 right-2 w-6 h-0.5 bg-pink-300 rounded" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-purple-300/30 rounded-full" />
        </div>
      )}
    </div>
  );
}


// Компонент фона с сеткой
function CanvasGrid() {
  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      {/* Едва заметная сетка (opacity 3%) */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />
    </div>
  );
}

// Компонент виджета-карточки (Парящий остров)
function WidgetCard({ children, number }: { children: React.ReactNode; number?: string }) {
  return (
    <div className="relative bg-white rounded-[24px] shadow-lg shadow-black/5 border border-transparent p-5">
      {number && (
        <div className="absolute top-4 right-4 text-[10px] font-medium text-gray-300">
          {number}
        </div>
      )}
      {children}
    </div>
  );
}

// Компонент карточки стиля (вертикальный стек - чистый стиль)
function StyleCardVertical({ style, isSelected, onClick }: { style: typeof CARD_STYLES[0]; isSelected: boolean; onClick: () => void }) {
  const Icon = style.icon;
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all duration-200 ${
        isSelected
          ? "bg-emerald-50"
          : "bg-white hover:bg-gray-50"
      }`}
    >
      {/* Иконка */}
      <div className="flex-shrink-0">
        <Icon className={`w-5 h-5 ${isSelected ? "text-[#1F4E3D]" : "text-gray-400"}`} />
      </div>
      {/* Текст */}
      <div className="flex-1 text-left">
        <div className={`text-sm font-semibold ${isSelected ? "text-[#1F4E3D]" : "text-gray-900"}`}>
          {style.name}
        </div>
      </div>
    </button>
  );
}

// Слот для карточки (пустое состояние)
function CardSlot({ index }: { index: number }) {
  return (
    <div className="bg-white/50 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-2" style={{ aspectRatio: "1 / 1" }}>
      <Loader className="w-8 h-8 text-gray-300" />
      <span className="text-xs text-gray-400 font-medium">Вариант {index + 1}</span>
    </div>
  );
}

// Скелетон для загрузки
function SkeletonCard() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative rounded-lg overflow-hidden bg-gray-100"
      style={{ aspectRatio: "1 / 1" }}
    >
      <motion.div
        animate={{
          backgroundPosition: ["0% 0%", "100% 100%"],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "linear",
        }}
        className="absolute inset-0"
        style={{
          background: "linear-gradient(90deg, #e5e7eb 0%, #f3f4f6 50%, #e5e7eb 100%)",
          backgroundSize: "200% 200%",
        }}
      />
    </motion.div>
  );
}

// Карточка результата
function ResultCard({ index }: { index: number }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.1 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative rounded-lg overflow-hidden cursor-pointer group"
      style={{
        aspectRatio: "1 / 1",
        boxShadow: isHovered 
          ? "0 20px 40px rgba(0, 0, 0, 0.15)" 
          : "0 2px 8px rgba(0, 0, 0, 0.08)",
        transition: "box-shadow 0.2s ease",
      }}
    >
      {/* Заглушка изображения */}
      <div
        className="w-full h-full"
        style={{
          background: `linear-gradient(135deg, ${
            ["#667eea", "#f093fb", "#4facfe", "#43e97b"][index]
          } 0%, ${
            ["#764ba2", "#f5576c", "#00f2fe", "#38f9d7"][index]
          } 100%)`,
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-white text-2xl font-semibold opacity-40">
            {index + 1}
          </div>
        </div>
      </div>

      {/* Кнопки при наведении */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 flex items-center justify-center gap-2"
          >
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-3 py-1.5 bg-white rounded-md flex items-center gap-1.5 text-xs font-medium text-gray-900 shadow-lg"
            >
              <Eye className="w-3.5 h-3.5" />
              Рассмотреть
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-3 py-1.5 bg-white rounded-md flex items-center gap-1.5 text-xs font-medium text-gray-900 shadow-lg"
            >
              <Download className="w-3.5 h-3.5" />
              Скачать
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function VisualPage() {
  const router = useRouter();
  
  // Данные из предыдущих этапов
  const [productName, setProductName] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [productDescription, setProductDescription] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  // Состояние интерфейса
  const [zoom, setZoom] = useState(100);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCards, setGeneratedCards] = useState<number[]>([]);
  
  // Настройки панели
  const [aspectRatio, setAspectRatio] = useState<"3:4" | "1:1">("1:1");
  const [addText, setAddText] = useState(false);
  const [title, setTitle] = useState("");
  const [advantages, setAdvantages] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("mix");
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  
  // Скрываем navbar и footer
  useEffect(() => {
    const navbar = document.querySelector('header');
    const footer = document.querySelector('footer');
    if (navbar) navbar.style.display = 'none';
    if (footer) footer.style.display = 'none';
    return () => {
      if (navbar) navbar.style.display = '';
      if (footer) footer.style.display = '';
    };
  }, []);

  // Загрузка данных из Supabase
  useEffect(() => {
    const loadData = async () => {
      const savedSessionId = localStorage.getItem("karto_session_id");
      if (!savedSessionId) {
        router.push("/studio/description");
        return;
      }
      
      setSessionId(savedSessionId);
      
      try {
        // Загружаем данные понимания (название, фото)
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
        
        // Загружаем описание
        const descriptionResponse = await fetch("/api/supabase/get-description", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: savedSessionId }),
        });
        
        const descriptionData = await descriptionResponse.json();
        if (descriptionData.success && descriptionData.data) {
          const finalDesc = descriptionData.data.final_description || "";
          setProductDescription(finalDesc);
          if (finalDesc) {
            setTitle(productName || "");
          }
        }
      } catch (error) {
        console.error("Ошибка загрузки данных:", error);
      }
    };
    
    loadData();
  }, [router, productName]);

  // Генерация (имитация)
  const handleGenerate = () => {
    setIsGenerating(true);
    setGeneratedCards([]);
    
    setTimeout(() => {
      setIsGenerating(false);
      setGeneratedCards([0, 1, 2, 3]);
    }, 3000);
  };

  // Автозаполнение текста
  const handleAutoFill = () => {
    if (productDescription) {
      setTitle(productName || "Товар");
      const lines = productDescription.split('\n').filter(l => l.trim());
      const advantagesText = lines.slice(0, 3).map(l => l.substring(0, 60)).join(", ");
      setAdvantages(advantagesText);
    }
  };

  // Зум
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50));
  const handleZoomFit = () => setZoom(100);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-50" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <CanvasGrid />
      <StageMenu currentStage="visual" />
      
      {/* Левая часть: Стек Виджетов */}
      <motion.div
        initial={{ x: -400 }}
        animate={{ x: 0 }}
        transition={{ type: "spring", damping: 25 }}
        className="fixed left-6 top-6 w-[360px] z-10 flex flex-col gap-4"
        style={{ scrollbarWidth: "thin" }}
      >
        {/* Виджет 1: Исходник */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-gray-100">
              {photoUrl ? (
                <Image
                  src={photoUrl}
                  alt={productName}
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="w-6 h-6 text-gray-400" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{productName || "Нет фото"}</p>
              <button className="text-xs font-medium text-gray-500 hover:text-gray-700 mt-0.5">
                Заменить
              </button>
            </div>
          </div>
          
          {/* Формат */}
          <div className="pt-4 border-t border-gray-100">
            <div className="bg-gray-100 rounded-lg p-1 flex gap-1">
              <button
                onClick={() => setAspectRatio("3:4")}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all duration-200 ${
                  aspectRatio === "3:4"
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                3:4
              </button>
              <button
                onClick={() => setAspectRatio("1:1")}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all duration-200 ${
                  aspectRatio === "1:1"
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                1:1
              </button>
            </div>
          </div>
        </div>

        {/* Виджет 2: Настройки */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Текст на карточке</h3>
            <ToggleSwitch checked={addText} onChange={setAddText} />
          </div>
          
          <AnimatePresence>
            {addText && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="space-y-3 overflow-hidden mb-4"
              >
                <div>
                  <label className="block text-xs text-gray-600 mb-1.5 font-medium">Заголовок</label>
                  <div className="relative">
                    <Type className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Главный оффер"
                      maxLength={50}
                      className="w-full h-10 pl-10 pr-3 bg-gray-100 border-0 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1F4E3D]/20 transition-all duration-200"
                      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs text-gray-600 mb-1.5 font-medium">Тезисы</label>
                  <div className="relative">
                    <List className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <textarea
                      value={advantages}
                      onChange={(e) => setAdvantages(e.target.value)}
                      placeholder="Ключевые преимущества через запятую..."
                      maxLength={200}
                      rows={3}
                      className="w-full pl-10 pr-3 pt-2.5 pb-2 bg-gray-100 border-0 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#1F4E3D]/20 transition-all duration-200"
                      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Стили */}
          <div className="pt-4 border-t border-gray-100">
            <h3 className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wider">Стиль</h3>
            <div className="space-y-1.5">
              {CARD_STYLES.slice(0, 4).map((style) => (
                <StyleCardVertical
                  key={style.id}
                  style={style}
                  isSelected={selectedStyle === style.id}
                  onClick={() => setSelectedStyle(style.id)}
                />
              ))}
            </div>
          </div>

          {/* Пожелания */}
          <div className="pt-4 border-t border-gray-100 mt-4">
            <h3 className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wider">Пожелания</h3>
            <div className="relative">
              <Sparkles className="absolute right-3 top-3 w-4 h-4 text-[#1F4E3D]" />
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Например: добавь молнии, сделай фон темнее..."
                rows={3}
                className="w-full px-3 py-2.5 pr-10 bg-gray-100 border-0 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#1F4E3D]/20 transition-all duration-200"
                style={{ fontFamily: "Inter, system-ui, sans-serif" }}
              />
            </div>
          </div>
        </div>

        {/* Виджет 3: Действие */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleGenerate}
          disabled={isGenerating}
          className="bg-[#1F4E3D] text-white rounded-xl font-bold text-base flex items-center justify-center gap-3 h-14 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-900/20 transition-all duration-200"
          style={{ fontFamily: "Inter, system-ui, sans-serif" }}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Генерация...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              <span>Сгенерировать</span>
            </>
          )}
        </motion.button>
      </motion.div>

      {/* Рабочая область */}
      <div className="absolute inset-0 flex items-center justify-center" style={{ paddingLeft: "452px" }}>
        <AnimatePresence mode="wait">
          {!isGenerating && generatedCards.length === 0 ? (
            // Состояние 1: Пустое - 4 слота
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-4xl px-8"
            >
              <div className="grid grid-cols-2 gap-6">
                {[0, 1, 2, 3].map((i) => (
                  <CardSlot key={i} index={i} />
                ))}
              </div>
            </motion.div>
          ) : isGenerating ? (
            // Состояние 2: Загрузка
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-4xl px-8"
            >
              <div className="grid grid-cols-2 gap-6">
                {[0, 1, 2, 3].map((i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            </motion.div>
          ) : (
            // Состояние 3: Результат
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-4xl px-8"
              style={{ transform: `scale(${zoom / 100})` }}
            >
              <div className="grid grid-cols-2 gap-6">
                {generatedCards.map((idx) => (
                  <ResultCard key={idx} index={idx} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Зум-контролы внизу по центру */}
      <motion.div
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-20"
      >
        <div className="bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg flex items-center gap-3 border border-gray-200">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= 50}
            className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            <ZoomOut className="w-4 h-4 text-gray-700" />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[60px] text-center">
            {zoom}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={zoom >= 200}
            className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            <ZoomIn className="w-4 h-4 text-gray-700" />
          </button>
          <div className="w-px h-6 bg-gray-300" />
          <button
            onClick={handleZoomFit}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-all duration-200"
          >
            Fit
          </button>
          {generatedCards.length > 0 && (
            <>
              <div className="w-px h-6 bg-gray-300" />
              <button
                className="px-3 py-1.5 text-sm font-medium text-[#2E5A43] hover:bg-gray-100 rounded-lg flex items-center gap-2 transition-all duration-200"
              >
                <Download className="w-4 h-4" />
                Скачать все
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
