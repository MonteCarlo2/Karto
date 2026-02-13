"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StageMenu } from "@/components/ui/stage-menu";
import { 
  Upload, 
  Download, 
  Loader2,
  Sparkles,
  Eye,
  Image as ImageIcon,
  Loader,
  Maximize2,
  Diamond,
  Leaf,
  Zap,
  Sparkles as SparklesIcon,
  ArrowRight,
  Palette,
  CheckCircle2,
  X,
  SlidersHorizontal,
  Type,
  List,
  Edit2,
  Settings,
  ChevronDown,
  Plus,
  AlertCircle,
  RotateCcw,
  Box,
  Home,
  ZoomIn,
  Hand,
  Lock,
  Wrench
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { BugReportModal } from "@/components/ui/bug-report-modal";

// Стили карточек (wireframe макеты)
const CARD_STYLES = [
  {
    id: "ai-choice",
    name: "ВЫБОР ИИ",
    layout: "ai-choice",
    icon: SparklesIcon,
    bgColor: "bg-gradient-to-br from-purple-50 to-blue-50",
    description: "ИИ выберет 4 лучших стиля",
  },
  {
    id: "minimal",
    name: "Минимализм",
    layout: "minimal",
    icon: Maximize2,
    bgColor: "bg-gray-50",
    description: "Чистый и простой",
  },
  {
    id: "premium",
    name: "Премиум",
    layout: "premium",
    icon: Diamond,
    bgColor: "bg-gray-50",
    description: "Роскошный стиль",
  },
  {
    id: "lifestyle",
    name: "Лайфстайл",
    layout: "lifestyle",
    icon: ImageIcon,
    bgColor: "bg-amber-50",
    description: "Жизненный стиль",
  },
  {
    id: "vibrant",
    name: "Яркий",
    layout: "vibrant",
    icon: Zap,
    bgColor: "bg-blue-50",
    description: "Энергичный дизайн",
  },
  {
    id: "eco",
    name: "Эко",
    layout: "eco",
    icon: Leaf,
    bgColor: "bg-green-50",
    description: "Экологичный стиль",
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
function CardSlot({ index, aspectRatio }: { index: number; aspectRatio: "3:4" | "1:1" }) {
  return (
    <div className="bg-white/50 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-2 h-full w-full" style={{ aspectRatio: aspectRatio === "3:4" ? "3 / 4" : "1 / 1" }}>
      <Loader className="w-8 h-8 text-gray-300" />
      <span className="text-xs text-gray-400 font-medium">Вариант {index + 1}</span>
    </div>
  );
}

// Анимация загрузки с мигающими точками (оптимизированная версия)
function LoadingDotsCard({ aspectRatio, cardIndex = 0 }: { aspectRatio: "3:4" | "1:1"; cardIndex?: number }) {
  // Уменьшено количество точек для производительности: 12x12 вместо 24x24
  const gridCols = 12;
  const gridRows = aspectRatio === "3:4" ? 16 : 12;
  const totalDots = gridCols * gridRows; // 144 или 192 точки вместо 576-768

  // Каждая карточка имеет свой цвет: зеленый, синий, красный, черный
  const cardColors = ["#1F4E3D", "#3B82F6", "#EF4444", "#000000"]; // Зеленый, синий, красный, черный
  const cardColor = cardColors[cardIndex % cardColors.length];

  return (
    <div
      className="relative rounded-lg overflow-hidden bg-white w-full flex items-center justify-center border-2 border-gray-200"
      style={{ 
        aspectRatio: aspectRatio === "3:4" ? "3 / 4" : "1 / 1",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
      }}
    >
      {/* Сетка из мигающих точек - используем CSS анимации для производительности */}
      <div 
        className="absolute inset-0 grid p-4"
        style={{
          gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
          gridTemplateRows: `repeat(${gridRows}, 1fr)`,
          gap: "4px",
        }}
      >
        {Array.from({ length: totalDots }).map((_, index) => {
          // Генерируем случайную задержку и длительность для каждой точки
          const delay = (index * 0.05) % 2; // Распределяем задержки равномерно
          const duration = 1 + (index % 3) * 0.3; // 1, 1.3, 1.6 секунд
          
          return (
            <div
              key={index}
              className="rounded-full"
              style={{
                backgroundColor: cardColor, // Все точки одного цвета для карточки
                width: "4px",
                height: "4px",
                justifySelf: "center",
                alignSelf: "center",
                animation: `pulse-dot ${duration}s ease-in-out ${delay}s infinite`,
                willChange: "opacity, transform", // Оптимизация для браузера
              }}
            />
          );
        })}
      </div>
      
      
      {/* CSS анимация для точек */}
      <style jsx>{`
        @keyframes pulse-dot {
          0%, 100% {
            opacity: 0.2;
            transform: scale(0.7);
          }
          50% {
            opacity: 1;
            transform: scale(1.3);
          }
        }
      `}</style>
    </div>
  );
}

// Анимация загрузки для слайдов (только черные точки)
function LoadingDotsCardSlide({ aspectRatio }: { aspectRatio: "3:4" | "4:3" | "9:16" | "1:1" }) {
  const gridCols = 12;
  const gridRows = aspectRatio === "3:4" ? 16 
    : aspectRatio === "4:3" ? 12
    : aspectRatio === "9:16" ? 20
    : 12;
  const totalDots = gridCols * gridRows;
  const cardColor = "#000000"; // Всегда черные точки

  const aspectRatioValue = aspectRatio === "3:4" ? "3 / 4" 
    : aspectRatio === "4:3" ? "4 / 3"
    : aspectRatio === "9:16" ? "9 / 16" 
    : "1 / 1";
  
  return (
    <div
      className="relative rounded-lg overflow-hidden bg-white flex items-center justify-center border-2 border-gray-200 w-full h-full"
      style={{ 
        aspectRatio: aspectRatioValue,
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
      }}
    >
      {/* Сетка из мигающих точек */}
      <div 
        className="absolute inset-0 grid p-4"
        style={{
          gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
          gridTemplateRows: `repeat(${gridRows}, 1fr)`,
          gap: "4px",
        }}
      >
        {Array.from({ length: totalDots }).map((_, index) => {
          const delay = (index * 0.05) % 2;
          const duration = 1 + (index % 3) * 0.3;
          
          return (
            <div
              key={index}
              className="rounded-full"
              style={{
                backgroundColor: cardColor,
                width: "4px",
                height: "4px",
                justifySelf: "center",
                alignSelf: "center",
                animation: `pulse-dot ${duration}s ease-in-out ${delay}s infinite`,
                willChange: "opacity, transform",
              }}
            />
          );
        })}
      </div>
      
      {/* CSS анимация для точек */}
      <style jsx>{`
        @keyframes pulse-dot {
          0%, 100% {
            opacity: 0.2;
            transform: scale(0.7);
          }
          50% {
            opacity: 1;
            transform: scale(1.3);
          }
        }
      `}</style>
    </div>
  );
}

// Модальное окно для просмотра карточки
function CardModal({ 
  imageUrl, 
  isOpen, 
  onClose 
}: { 
  imageUrl: string; 
  isOpen: boolean; 
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Затемнение фона */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          >
            {/* Карточка в модальном окне */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-5xl max-h-[85vh] w-full flex items-center justify-center"
            >
              <div className="relative w-full h-full flex items-center justify-center">
                <div className="relative max-w-full max-h-[85vh]">
                  <Image
                    src={imageUrl}
                    alt="Сгенерированная карточка"
                    width={1200}
                    height={1600}
                    className="max-w-full max-h-[85vh] w-auto h-auto rounded-lg shadow-2xl object-contain"
                    unoptimized
                  />
                  
                  {/* Кнопка закрытия - внутри контейнера изображения */}
                  <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 bg-white/90 hover:bg-white rounded-full shadow-lg transition-colors z-10"
                  >
                    <X className="w-5 h-5 text-gray-900" />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Карточка результата
function ResultCard({ 
  imageUrl, 
  aspectRatio,
  onOpenModal,
  isSelectionMode = false,
  isSelected = false,
  onSelect,
}: { 
  imageUrl: string; 
  aspectRatio: "3:4" | "1:1";
  onOpenModal: () => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Предотвращаем открытие модального окна
    
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `karto-card-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Ошибка скачивания:", error);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
                className={`relative rounded-lg group w-full bg-gray-100 cursor-pointer transition-all ${
        isSelectionMode && isSelected 
          ? "ring-8 ring-[#4ADE80] ring-offset-8 shadow-[0_0_0_16px_rgba(74,222,128,0.7),0_0_50px_rgba(74,222,128,1),inset_0_0_0_4px_rgba(74,222,128,0.3)] scale-[1.05] z-10 overflow-visible border-4 border-[#4ADE80]" 
          : "overflow-hidden"
      }`}
      style={{
        aspectRatio: aspectRatio === "3:4" ? "3 / 4" : "1 / 1",
        boxShadow: isHovered 
          ? "0 20px 40px rgba(0, 0, 0, 0.15)" 
          : "0 2px 8px rgba(0, 0, 0, 0.08)",
        transition: "box-shadow 0.2s ease",
      }}
    >
      {/* Реальное изображение - object-contain для правильного отображения без обрезки */}
      <div 
        className="absolute inset-0 cursor-pointer"
        onClick={isSelectionMode && onSelect ? onSelect : onOpenModal}
      >
        <Image
          src={imageUrl}
          alt="Сгенерированная карточка"
          fill
          className="object-contain"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          unoptimized
        />
      </div>

      {/* Затемнение при наведении - клик открывает модальное окно */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={isSelectionMode && onSelect ? onSelect : onOpenModal}
            className="absolute inset-0 bg-black/20 cursor-pointer"
          />
        )}
      </AnimatePresence>
      
      {/* Кнопка скачивания - маленькая иконка в углу */}
      <AnimatePresence>
        {isHovered && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={handleDownload}
            className="absolute top-3 right-3 p-2 bg-white/90 hover:bg-white rounded-lg shadow-lg transition-colors z-10"
            title="Скачать изображение"
          >
            <Download className="w-4 h-4 text-gray-900" />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function VisualPage() {
  const router = useRouter();
  
  // Пользователь для баг-репортов
  const [user, setUser] = useState<any>(null);
  const [isBugReportOpen, setIsBugReportOpen] = useState(false);
  
  // Данные из предыдущих этапов
  const [productName, setProductName] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [productDescription, setProductDescription] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  // Состояние интерфейса
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCards, setGeneratedCards] = useState<string[]>([]);
  const [selectedCardForModal, setSelectedCardForModal] = useState<string | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editRequest, setEditRequest] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [originalCardImage, setOriginalCardImage] = useState<string | null>(null); // Оригинальное изображение до редактирования
  const [lastEditedImage, setLastEditedImage] = useState<string | null>(null); // Последнее отредактированное изображение
  
  // Третий экран: Серия карточек
  const [isSeriesMode, setIsSeriesMode] = useState(false); // Режим создания серии
  const [slides, setSlides] = useState<Array<{ 
    id: number; 
    imageUrl: string | null; // Выбранное изображение для слайда
    variants: string[]; // Массив всех сгенерированных вариантов
    prompt: string; 
    scenario: string | null; 
    aspectRatio: "3:4" | "4:3" | "9:16" | "1:1" 
  }>>([]);
  const [activeSlideId, setActiveSlideId] = useState<number | null>(null);
  const [slidePrompt, setSlidePrompt] = useState("");
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [slideAspectRatio, setSlideAspectRatio] = useState<"3:4" | "4:3" | "9:16" | "1:1">("3:4");
  const [isGeneratingSlide, setIsGeneratingSlide] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null); // Изображение для просмотра
  const [useEnvironment, setUseEnvironment] = useState(true); // Использовать обстановку предыдущей карточки
  const [productMismatchError, setProductMismatchError] = useState<{
    show: boolean;
    recognizedProduct?: string;
    currentProduct?: string;
  }>({ show: false });
  const [isCheckingProduct, setIsCheckingProduct] = useState(false);
  const [generationError, setGenerationError] = useState<{
    show: boolean;
    message?: string;
  }>({ show: false });
  const [visualQuota, setVisualQuota] = useState<{ used: number; remaining: number; limit: number }>({
    used: 0,
    remaining: 12,
    limit: 12,
  });
  const [isHelpOpen, setIsHelpOpen] = useState(false); // Открыта ли подсказка справа
  
  // Настройки панели
  const [aspectRatio, setAspectRatio] = useState<"3:4" | "1:1">("3:4");
  const [addText, setAddText] = useState(false);
  const [title, setTitle] = useState("");
  const [bullets, setBullets] = useState<string[]>([""]);
  const [selectedStyle, setSelectedStyle] = useState("ai-choice");
  const [isFormatExpanded, setIsFormatExpanded] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  
  // Сжатие референса на клиенте (max 1200px, JPEG) для надёжной доставки в KIE, как в «Свободное творчество»
  const compressReferenceFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = document.createElement("img");
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxW = 1200;
        let w = img.width;
        let h = img.height;
        if (w > maxW) {
          h = Math.round((h * maxW) / w);
          w = maxW;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not available"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image"));
      };
      img.src = url;
    });
  };

  // Получение пользователя для баг-репортов
  useEffect(() => {
    const checkUser = async () => {
      try {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user || null);
      } catch (error: any) {
        // Игнорируем ошибки
      }
    };
    checkUser();

    try {
      const supabase = createBrowserClient();
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user || null);
      });
      return () => subscription.unsubscribe();
    } catch (error) {
      // Игнорируем ошибки
    }
  }, []);

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

  // Настройка скролла на уровне body
  useEffect(() => {
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
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

        // Загружаем состояние визуала (промежуточное состояние)
        const visualStateResponse = await fetch("/api/supabase/get-results", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: savedSessionId }),
        });
        
        const visualStateData = await visualStateResponse.json();
        
        // Приоритет 1: Если есть сохраненное состояние
        if (visualStateData.success && visualStateData.visual_state) {
          const state = visualStateData.visual_state;
          if (typeof state.generation_used === "number" || typeof state.generation_limit === "number") {
            const limit = Math.max(1, Number(state.generation_limit || 12));
            const used = Math.max(0, Number(state.generation_used || 0));
            setVisualQuota({
              used,
              limit,
              remaining: Math.max(0, limit - used),
            });
          }
          
          // Восстанавливаем generatedCards
          if (state.generatedCards && Array.isArray(state.generatedCards) && state.generatedCards.length > 0) {
            setGeneratedCards(state.generatedCards);
          }
          
          // Восстанавливаем selectedCardIndex
          if (state.selectedCardIndex !== null && state.selectedCardIndex !== undefined) {
            setSelectedCardIndex(state.selectedCardIndex);
          }
          
          // Восстанавливаем режим серии
          if (state.isSeriesMode === true) {
            setIsSeriesMode(true);
            // Если есть слайды, восстанавливаем их
            if (visualStateData.visual_slides && Array.isArray(visualStateData.visual_slides) && visualStateData.visual_slides.length > 0) {
              setSlides(visualStateData.visual_slides);
              if (visualStateData.visual_slides[0]?.id) {
                setActiveSlideId(visualStateData.visual_slides[0].id);
              }
            }
          }
        } 
        // Приоритет 2: Если нет состояния, но есть слайды - значит пользователь уже создал слайды (режим серии)
        else if (visualStateData.success && visualStateData.visual_slides && Array.isArray(visualStateData.visual_slides) && visualStateData.visual_slides.length > 0) {
          setSlides(visualStateData.visual_slides);
          if (visualStateData.visual_slides[0]?.id) {
            setActiveSlideId(visualStateData.visual_slides[0].id);
          }
          setIsSeriesMode(true);
        }
      } catch (error) {
        console.error("Ошибка загрузки данных:", error);
      }
    };
    
    loadData();
  }, [router, productName]);

  // Сохраняем slides в localStorage и Supabase при изменении
  useEffect(() => {
    if (slides.length > 0 && sessionId) {
      const cacheKey = `karto_visual_slides_${sessionId}`;
      localStorage.setItem(cacheKey, JSON.stringify(slides));
      
      // Сохраняем в Supabase сразу
      fetch("/api/supabase/save-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          visual_slides: slides.filter((slide) => slide.imageUrl), // Только слайды с изображениями
          price_analysis: null,
        }),
      }).catch((error) => {
        console.warn("Не удалось сохранить визуальные данные в Supabase:", error);
      });
    }
  }, [slides, sessionId]);

  // Сохраняем промежуточное состояние визуала (generatedCards, selectedCardIndex, isSeriesMode)
  useEffect(() => {
    if (sessionId && (generatedCards.length > 0 || isSeriesMode || selectedCardIndex !== null)) {
      const visualState = {
        generatedCards: generatedCards,
        selectedCardIndex: selectedCardIndex,
        isSeriesMode: isSeriesMode,
        generation_used: visualQuota.used,
        generation_limit: visualQuota.limit,
      };
      
      // Сохраняем в Supabase
      fetch("/api/supabase/save-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          visual_state: visualState,
        }),
      }).catch((error) => {
        console.warn("Не удалось сохранить состояние визуала в Supabase:", error);
      });
    }
  }, [generatedCards, selectedCardIndex, isSeriesMode, sessionId, visualQuota.used, visualQuota.limit]);

  // Генерация карточки
  const handleGenerate = async () => {
    // Не генерируем, если уже в режиме серии
    if (isSeriesMode) {
      return;
    }
    
    console.log("🔴 [FRONTEND] ========== КНОПКА НАЖАТА ==========");
    console.log("🔴 [FRONTEND] handleGenerate вызвана!");
    
    if (!productName) {
      console.warn("⚠️ [FRONTEND] Нет названия товара!");
      alert("Пожалуйста, укажите название товара");
      return;
    }
    if (!sessionId) {
      setGenerationError({
        show: true,
        message: "Не найдена сессия Потока. Вернитесь на этап «Понимание» и начните заново.",
      });
      return;
    }

    console.log("🔴 [FRONTEND] Название товара:", productName);
    console.log("🔴 [FRONTEND] isGenerating:", isGenerating);

    setIsGenerating(true);
    setGeneratedCards([]);
    
    try {
      // Подготовка данных для генерации
      const requestData = {
        productName: productName,
        photoUrl: photoUrl,
        customPrompt: customPrompt || "",
        addText: addText,
        title: addText ? (title || productName) : "",
        bullets: addText ? bullets.filter((b: string) => b && b.trim()) : [],
        aspectRatio: aspectRatio,
        count: 4, // Генерируем все 4 карточки одновременно
        sessionId: sessionId,
      };

      console.log("🚀 [FRONTEND] Запуск генерации 4 карточек с умными концепциями");
      console.log("🚀 [FRONTEND] Данные:", requestData);
      console.log("🚀 [FRONTEND] Вызываю endpoint: /api/generate-cards-batch");

      // Используем batch endpoint для генерации 4 карточек с разными концепциями от OpenRouter
      const response = await fetch("/api/generate-cards-batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });

      console.log("📡 [FRONTEND] Ответ получен, статус:", response.status);

      const data = await response.json();
      console.log("📡 [FRONTEND] Данные ответа:", data);

      if (!response.ok || !data.success) {
        console.error("❌ [FRONTEND] Ошибка в ответе:", data);
        
        // Если это ошибка несоответствия товара - показываем красивое сообщение
        if (data.error && data.error.includes("не соответствует")) {
          setGenerationError({
            show: true,
            message: `Генерация заблокирована: фотография не соответствует указанному названию товара. Это запрещено. Пожалуйста, загрузите фотографию соответствующего товара или измените название товара.`,
          });
          setIsGenerating(false);
          return;
        }
        if (typeof data.generationUsed === "number" || typeof data.generationRemaining === "number") {
          const limit = Math.max(1, Number(data.generationLimit || 12));
          const used = Math.max(0, Number(data.generationUsed || 0));
          setVisualQuota({
            used,
            limit,
            remaining: Math.max(0, Number(data.generationRemaining ?? limit - used)),
          });
        }
        
        throw new Error(data.error || data.details || "Ошибка генерации");
      }

      // Сохраняем все сгенерированные карточки (до 4)
      if (data.imageUrls && data.imageUrls.length > 0) {
        setGeneratedCards(data.imageUrls);
        if (typeof data.generationUsed === "number" || typeof data.generationRemaining === "number") {
          const limit = Math.max(1, Number(data.generationLimit || 12));
          const used = Math.max(0, Number(data.generationUsed || 0));
          setVisualQuota({
            used,
            limit,
            remaining: Math.max(0, Number(data.generationRemaining ?? limit - used)),
          });
        }
        console.log(`✅ [FRONTEND] Сгенерировано ${data.imageUrls.length} карточек с уникальными концепциями`);
        
        if (data.concepts && data.concepts.length > 0) {
          console.log("📋 [FRONTEND] Использованные концепции:");
          data.concepts.forEach((concept: any, index: number) => {
            console.log(`  Концепция ${index + 1}:`, {
              style: concept.style?.substring(0, 80) + "...",
              mood: concept.mood,
              colors: concept.colors?.substring(0, 60) + "...",
            });
          });
        } else {
          console.warn("⚠️ [FRONTEND] Концепции не получены в ответе!");
        }
      } else {
        throw new Error("Не получены URL карточек");
      }

    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") return;
      console.error("❌ Ошибка генерации:", error);
      setGenerationError({
        show: true,
        message: error instanceof Error ? error.message : "Неизвестная ошибка при генерации карточки. Попробуйте еще раз.",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Автозаполнение заголовка из названия товара
  useEffect(() => {
    if (productName && !title) {
      setTitle(productName);
    }
  }, [productName]);

  // Автозаполнение текста
  const handleAutoFill = () => {
    if (productDescription) {
      setTitle(productName || "Товар");
      const lines = productDescription.split('\n').filter(l => l.trim());
      const advantagesText = lines.slice(0, 3).map(l => l.substring(0, 60)).join(", ");
      setAdvantages(advantagesText);
    }
  };

  // Добавление нового буллита
  const addBullet = () => {
    setBullets([...bullets, ""]);
  };

  // Обновление буллита
  const updateBullet = (index: number, value: string) => {
    const newBullets = [...bullets];
    newBullets[index] = value;
    setBullets(newBullets);
  };

  // Удаление буллита
  const removeBullet = (index: number) => {
    if (bullets.length > 1) {
      setBullets(bullets.filter((_, i) => i !== index));
    }
  };


  return (
    <div
      className="min-h-screen bg-transparent relative" 
      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
      suppressHydrationWarning
    >
      {/* Основной контент - скрываем в режиме серии */}
      {!isSeriesMode && (
        <>
      {/* Фон с сеткой - неподвижный */}
      <div 
        className="fixed inset-0 pointer-events-none z-0 bg-gray-50"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 0, 0, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 0, 0, 0.02) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
        suppressHydrationWarning
      />
      
      <StageMenu currentStage="visual" position="left" visualQuota={visualQuota} />
      
      {/* Сообщение о несоответствии товара */}
      <AnimatePresence suppressHydrationWarning>
        {productMismatchError.show && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-24 right-8 z-50 max-w-md"
          >
            <div className="bg-white rounded-xl shadow-2xl border-2 border-red-200 p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <AlertCircle className="w-6 h-6 text-red-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    Несоответствие товара
                  </h3>
                  <p className="text-sm text-gray-600 mb-3">
                    Вы загрузили изображение товара, который не соответствует указанному названию.
                  </p>
                  <div className="space-y-2 mb-4">
                    <div>
                      <span className="text-xs font-semibold text-gray-500">На фото:</span>
                      <p className="text-sm font-medium text-gray-900">
                        {productMismatchError.recognizedProduct || "Неизвестно"}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-gray-500">Указано:</span>
                      <p className="text-sm font-medium text-gray-900">
                        {productMismatchError.currentProduct}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setProductMismatchError({ show: false })}
                      className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors"
                    >
                      Понятно
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => setProductMismatchError({ show: false })}
                  className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Сообщение об ошибке генерации */}
      <AnimatePresence suppressHydrationWarning>
        {generationError.show && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-24 right-8 z-50 max-w-md"
          >
            <div className="bg-white rounded-xl shadow-2xl border-2 border-orange-200 p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <AlertCircle className="w-6 h-6 text-orange-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    Ошибка генерации
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    {generationError.message || "Не удалось сгенерировать карточку. Попробуйте еще раз."}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setGenerationError({ show: false })}
                      className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors"
                    >
                      Понятно
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => setGenerationError({ show: false })}
                  className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Левая панель - висящая в воздухе, создает скролл */}
      <motion.div
        initial={{ x: -400, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="relative top-24 left-8 w-[400px] flex flex-col gap-[60px] pb-32 z-10"
      >
      
        {/* Блок: Ваш товар */}
        <div className="bg-white rounded-2xl p-6 shadow-xl shadow-black/5 relative">
          {/* Светящаяся линия слева */}
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#4ADE80] rounded-l-2xl shadow-[0_0_8px_rgba(74,222,128,0.6)]"></div>
          <h2 className="text-xl font-extrabold text-gray-900 mb-4" style={{ fontFamily: "Inter, sans-serif" }}>Ваш товар</h2>
            
            {/* Фото товара с кнопкой изменения */}
            <div className="mb-4">
              <div className="flex items-start gap-3">
                {/* Фото товара с hover эффектом - увеличивается в 2 раза */}
                <div className="relative rounded-xl bg-gray-100 group overflow-visible" style={{ width: "72px", height: "72px", zIndex: 10 }}>
                  {photoUrl ? (
                    <>
                      <Image
                        src={photoUrl}
                        alt={productName}
                        fill
                        className="object-cover rounded-xl transition-transform duration-300 group-hover:scale-[2]"
                        style={{ zIndex: 20 }}
                        unoptimized
                      />
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center rounded-xl">
                      <ImageIcon className="w-6 h-6 text-gray-400" />
                    </div>
                  )}
                </div>
                
                {/* Кнопка "Изменить" */}
                <button
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = async (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (!file) return;
                      try {
                        const result = await compressReferenceFile(file);
                        setPhotoUrl(result);
                        setProductMismatchError({ show: false });
                        if (productName && productName.trim()) {
                          setIsCheckingProduct(true);
                          try {
                            const checkResponse = await fetch("/api/check-product-match", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ productName: productName.trim(), photoUrl: result }),
                            });
                            const checkData = await checkResponse.json();
                            if (!checkData.success && checkData.mismatch) {
                              setProductMismatchError({
                                show: true,
                                recognizedProduct: checkData.recognizedProduct,
                                currentProduct: productName.trim(),
                              });
                            } else {
                              setProductMismatchError({ show: false });
                            }
                          } catch {
                            // не блокируем пользователя
                          } finally {
                            setIsCheckingProduct(false);
                          }
                        }
                        if (sessionId) {
                          fetch("/api/supabase/save-understanding", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ session_id: sessionId, photo_url: result }),
                          }).catch(console.error);
                        }
                      } catch (err) {
                        console.warn("Не удалось обработать изображение:", err);
                      }
                    };
                    input.click();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Изменить</span>
                </button>
              </div>
            </div>
            
            {/* Название товара */}
            <div>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Название товара"
                className="w-full px-4 py-3 bg-gray-50 border-0 rounded-xl text-sm font-bold text-black placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-all"
              />
            </div>
        </div>

        {/* Блок: Настройки генерации */}
        <div className="bg-white rounded-2xl p-6 flex flex-col shadow-xl shadow-black/5 relative">
          {/* Светящаяся линия слева */}
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#4ADE80] rounded-l-2xl shadow-[0_0_8px_rgba(74,222,128,0.6)]"></div>
          <h2 className="text-lg font-extrabold text-gray-900 mb-6" style={{ fontFamily: "Inter, sans-serif" }}>Настройки генерации</h2>
            
            {/* Пожелания к стилю */}
            <div className="mb-6">
              <p className="text-xs text-gray-500 mb-2">Опишите желаемый стиль и атмосферу для карточки</p>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Например: минималистичный стиль, светлый фон, акцент на товаре..."
                rows={4}
                className="w-full px-4 py-4 bg-gray-50 border border-gray-300 rounded-xl text-sm text-black placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-gray-300 transition-all"
              />
            </div>

            {/* Текст на карточке */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Какой текст хотите видеть на карточке</p>
                  <label className="text-sm font-black text-black">Текст на карточке</label>
                </div>
                <button
                  type="button"
                  onClick={() => setAddText(!addText)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                    addText ? "bg-[#4ADE80]" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      addText ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>

              <AnimatePresence>
                {addText && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden space-y-4"
                  >
                    {/* Заголовок */}
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Заголовок будет автоматически заполнен, но вы можете его отредактировать</p>
                      <input
                        type="text"
                        value={title || productName}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Заголовок"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-sm font-bold text-black placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-all"
                      />
                    </div>

                    {/* Буллиты */}
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Добавьте ключевые преимущества или характеристики товара</p>
                      <div className="space-y-2">
                        {bullets.map((bullet, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={bullet}
                              onChange={(e) => updateBullet(index, e.target.value)}
                              placeholder={`Буллит ${index + 1}`}
                              className="flex-1 px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-sm text-black placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-all"
                            />
                            {bullets.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeBullet(index)}
                                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={addBullet}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-[#4ADE80] hover:text-[#4ADE80] transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Добавить буллит</span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          
            {/* Формат (нераскрытый) */}
            <div>
              <button
                onClick={() => setIsFormatExpanded(!isFormatExpanded)}
                className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <span className="text-sm font-black text-black">Формат</span>
                <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${isFormatExpanded ? 'rotate-180' : ''}`} />
              </button>
              
              <AnimatePresence>
                {isFormatExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3 flex gap-2">
                      <button
                        onClick={() => {
                          setAspectRatio("3:4");
                          setIsFormatExpanded(false);
                        }}
                        className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${
                          aspectRatio === "3:4"
                            ? "bg-black text-white"
                            : "bg-gray-100 text-black hover:bg-gray-200"
                        }`}
                      >
                        3:4
                      </button>
                      <button
                        onClick={() => {
                          setAspectRatio("1:1");
                          setIsFormatExpanded(false);
                        }}
                        className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${
                          aspectRatio === "1:1"
                            ? "bg-black text-white"
                            : "bg-gray-100 text-black hover:bg-gray-200"
                        }`}
                      >
                        1:1
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
        </div>
        
        {/* Кнопка Сгенерировать - отдельно */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleGenerate}
          disabled={isGenerating || visualQuota.remaining <= 0}
          className="w-full py-4 px-6 bg-[#4ADE80] text-black rounded-xl font-bold text-base flex items-center justify-center gap-2 shadow-xl shadow-green-400/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all overflow-hidden"
          style={{ willChange: 'transform' }}
        >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Генерация...</span>
              </>
            ) : (
              <>
                <SparklesIcon className="w-5 h-5" />
                <span>{generatedCards.length > 0 ? "Перегенерировать" : "Сгенерировать"}</span>
              </>
            )}
          </motion.button>
          {visualQuota.remaining <= 0 && (
            <p className="mt-2 text-xs text-red-500 text-center">
              Лимит генераций в Потоке исчерпан (0/{visualQuota.limit}).
            </p>
          )}
      </motion.div>
      
      {/* Правая часть: Результаты - неподвижная, прозрачная */}
      <div className="fixed top-0 right-0 bottom-0 left-[420px] flex flex-col bg-transparent z-0 overflow-y-auto" suppressHydrationWarning>
        <div className="flex-1 flex items-start justify-center p-6 min-h-full" suppressHydrationWarning>
          <AnimatePresence mode="wait" suppressHydrationWarning>
            {!isGenerating && generatedCards.length === 0 ? (
              // Состояние 1: Пустое
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full max-w-2xl text-center"
                suppressHydrationWarning
              >
                <p className="text-gray-400 text-base font-medium">
                  Здесь появятся результаты после генерации.
                </p>
              </motion.div>
            ) : isGenerating ? (
              // Состояние 2: Загрузка - сетка 2x2 с анимацией точек
              // ВАЖНО: Размеры сетки должны быть ОДИНАКОВЫМИ для форматов 3:4 и 1:1!
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`w-full grid grid-cols-2 gap-4 ${aspectRatio === "1:1" ? "max-w-3xl" : "max-w-2xl"}`}
                suppressHydrationWarning
              >
                {[0, 1, 2, 3].map((index) => (
                  <LoadingDotsCard key={index} aspectRatio={aspectRatio} cardIndex={index} />
                ))}
              </motion.div>
            ) : (
              // Состояние 3: Результат (всегда сетка 2x2, заполняем карточками + заглушками)
              // ВАЖНО: Размеры сетки должны быть ОДИНАКОВЫМИ для форматов 3:4 и 1:1!
              <motion.div
                key="result"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`w-full grid grid-cols-2 gap-4 ${aspectRatio === "1:1" ? "max-w-3xl" : "max-w-2xl"}`}
                suppressHydrationWarning
              >
                {/* Показываем сгенерированные карточки */}
                {generatedCards.map((imageUrl, index) => (
                  <ResultCard 
                    key={index} 
                    imageUrl={imageUrl} 
                    aspectRatio={aspectRatio}
                    onOpenModal={() => setSelectedCardForModal(imageUrl)}
                    isSelectionMode={isSelectionMode}
                    isSelected={selectedCardIndex === index}
                    onSelect={() => {
                      if (isSelectionMode) {
                        console.log("Выбрана карточка с индексом:", index);
                        setSelectedCardIndex(index);
                      }
                    }}
                  />
                ))}
                {/* Показываем заглушки для оставшихся слотов (до 4 всего) */}
                {Array.from({ length: Math.max(0, 4 - generatedCards.length) }).map((_, index) => (
                  <CardSlot 
                    key={`slot-${index}`} 
                    index={generatedCards.length + index} 
                    aspectRatio={aspectRatio} 
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        {/* Кнопка "Сообщить о проблеме" - над кнопкой "Выбрать" */}
        {!isGenerating && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
            onClick={() => setIsBugReportOpen(true)}
            className="fixed bottom-24 right-8 z-50 p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center group border border-gray-300"
            title="Сообщить о проблеме"
          >
            <Wrench className="w-4 h-4 group-hover:rotate-12 transition-transform" />
          </motion.button>
        )}

        {/* Кнопка "Выбрать" - внизу справа, всегда видна на этапе ВИЗУАЛ */}
        {!isGenerating && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed bottom-8 right-8 z-50"
          >
            {!isSelectionMode ? (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  if (generatedCards.length > 0) {
                    setIsSelectionMode(true);
                  }
                }}
                disabled={generatedCards.length === 0}
                className="px-6 py-3 bg-[#1F4E3D] text-white rounded-xl font-bold text-base flex items-center gap-2 shadow-xl shadow-black/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>Выбрать</span>
              </motion.button>
            ) : (
              <div className="flex items-center gap-3">
                {/* Крестик для выхода из режима выбора */}
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    setIsSelectionMode(false);
                    setSelectedCardIndex(null);
                  }}
                  className="w-10 h-10 bg-gray-500 hover:bg-gray-600 text-white rounded-full flex items-center justify-center shadow-xl shadow-black/20"
                  title="Выйти из режима выбора"
                >
                  <X className="w-5 h-5" />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    if (selectedCardIndex !== null) {
                      console.log("Выбрана карточка:", selectedCardIndex);
                      // Сохраняем оригинальное изображение перед редактированием
                      setOriginalCardImage(generatedCards[selectedCardIndex]);
                      setIsSelectionMode(false);
                      setIsEditMode(true);
                    }
                  }}
                  disabled={selectedCardIndex === null}
                  className="px-6 py-3 bg-[#1F4E3D] text-white rounded-xl font-bold text-base flex items-center gap-2 shadow-xl shadow-black/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>Подтвердить</span>
                </motion.button>
              </div>
            )}
          </motion.div>
        )}
      </div>
      
      {/* Режим редактирования - затемненный фон и крупная карточка */}
      <AnimatePresence>
        {isEditMode && selectedCardIndex !== null && (
          <>
            {/* Затемненный фон */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsEditMode(false);
                setEditRequest("");
                setOriginalCardImage(null); // Сбрасываем оригинал при выходе
                setLastEditedImage(null); // Сбрасываем последнее отредактированное при выходе
                // НЕ сбрасываем selectedCardIndex, чтобы можно было вернуться
              }}
              className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100]"
            />
            
            {/* Кнопка "Вернуть как было" - показывается если есть изменения */}
            {originalCardImage && selectedCardIndex !== null && generatedCards[selectedCardIndex] !== originalCardImage && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="fixed top-8 right-24 z-[102] group"
              >
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    if (originalCardImage && selectedCardIndex !== null) {
                      // Сохраняем текущее изображение как последнее отредактированное перед возвратом
                      setLastEditedImage(generatedCards[selectedCardIndex]);
                      // Восстанавливаем оригинальное изображение
                      const newCards = [...generatedCards];
                      newCards[selectedCardIndex] = originalCardImage;
                      setGeneratedCards(newCards);
                    }
                  }}
                  className="w-12 h-12 bg-gray-500 hover:bg-gray-600 text-white rounded-full flex items-center justify-center shadow-xl shadow-black/20 transition-all"
                >
                  <RotateCcw className="w-6 h-6" />
                </motion.button>
                {/* Tooltip при наведении */}
                <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <div className="bg-gray-900 text-white text-sm px-3 py-2 rounded-lg whitespace-nowrap shadow-lg">
                    Вернуть как было
                    <div className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-gray-900"></div>
                  </div>
                </div>
              </motion.div>
            )}
            
            {/* Кнопка "Шаг вперед" - показывается если вернулись к оригиналу и есть отредактированная версия */}
            {originalCardImage && lastEditedImage && selectedCardIndex !== null && generatedCards[selectedCardIndex] === originalCardImage && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="fixed top-8 right-24 z-[102] group"
              >
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    if (lastEditedImage && selectedCardIndex !== null) {
                      // Возвращаемся к последнему отредактированному варианту
                      const newCards = [...generatedCards];
                      newCards[selectedCardIndex] = lastEditedImage;
                      setGeneratedCards(newCards);
                    }
                  }}
                  className="w-12 h-12 bg-gray-500 hover:bg-gray-600 text-white rounded-full flex items-center justify-center shadow-xl shadow-black/20 transition-all"
                >
                  <ArrowRight className="w-6 h-6" />
                </motion.button>
                {/* Tooltip при наведении */}
                <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <div className="bg-gray-900 text-white text-sm px-3 py-2 rounded-lg whitespace-nowrap shadow-lg">
                    Вернуться к отредактированному
                    <div className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-gray-900"></div>
                  </div>
                </div>
              </motion.div>
            )}
            
            {/* Крестик для выхода из режима редактирования - в правом верхнем углу */}
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                setIsEditMode(false);
                setEditRequest("");
                setOriginalCardImage(null); // Сбрасываем оригинал при выходе
                setLastEditedImage(null); // Сбрасываем последнее отредактированное при выходе
              }}
              className="fixed top-8 right-8 w-12 h-12 bg-gray-500 hover:bg-gray-600 text-white rounded-full flex items-center justify-center shadow-xl shadow-black/20 z-[102]"
              title="Выйти из режима редактирования"
            >
              <X className="w-6 h-6" />
            </motion.button>
            
            {/* Контент редактирования */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed inset-0 z-[101] flex flex-col items-center justify-center p-4 sm:p-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-full max-w-5xl flex flex-col items-center gap-6">
                {/* Крупная карточка - уменьшенная для лучшей видимости */}
                {selectedCardIndex !== null && generatedCards.length > 0 && generatedCards[selectedCardIndex] ? (
                  <div className="flex justify-center w-full">
                    <div className="relative w-full max-w-xl bg-gray-100 rounded-lg overflow-hidden" style={{ aspectRatio: aspectRatio === "3:4" ? "3 / 4" : "1 / 1" }}>
                      <img
                        src={generatedCards[selectedCardIndex]}
                        alt="Выбранная карточка"
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          console.error("Ошибка загрузки изображения:", generatedCards[selectedCardIndex], "Индекс:", selectedCardIndex);
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-center items-center w-full max-w-xl bg-gray-100 rounded-lg" style={{ aspectRatio: aspectRatio === "3:4" ? "3 / 4" : "1 / 1" }}>
                    <p className="text-gray-400">Изображение не найдено (индекс: {selectedCardIndex}, всего карточек: {generatedCards.length})</p>
                  </div>
                )}
                
                {/* Поле ввода - светлое, с салатовой стрелкой */}
                <div className="w-full max-w-2xl">
                  <div className="flex-1 relative">
                    <div className="bg-white rounded-2xl px-5 py-3 shadow-lg border border-gray-200">
                      <textarea
                        value={editRequest}
                        onChange={(e) => {
                          setEditRequest(e.target.value);
                          // Автоматическое изменение высоты
                          e.target.style.height = 'auto';
                          e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;
                        }}
                        placeholder="Опишите, что вы хотите изменить..."
                        className="w-full bg-transparent text-gray-900 placeholder:text-gray-400 text-base font-semibold px-2 py-1 border-none outline-none resize-none focus:ring-0 overflow-hidden pr-16"
                        rows={1}
                        style={{ minHeight: '28px', maxHeight: '100px' }}
                      />
                      
                      {/* Стрелка вперёд - салатовая, всегда видимая, внутри поля справа */}
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={async () => {
                          if (editRequest.trim() && !isEditing && selectedCardIndex !== null) {
                            setIsEditing(true);
                            try {
                              const response = await fetch("/api/edit-card", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  imageUrl: generatedCards[selectedCardIndex],
                                  editRequest: editRequest.trim(),
                                  productName,
                                  aspectRatio,
                                  sessionId: sessionId ?? undefined,
                                }),
                              });
                              
                              const data = await response.json();
                              if (data.success && data.imageUrl) {
                                if (typeof data.generationUsed === "number" || typeof data.generationRemaining === "number") {
                                  const limit = Math.max(1, Number(data.generationLimit || 12));
                                  const used = Math.max(0, Number(data.generationUsed || 0));
                                  setVisualQuota({
                                    used,
                                    limit,
                                    remaining: Math.max(0, Number(data.generationRemaining ?? limit - used)),
                                  });
                                }
                                if (!originalCardImage && selectedCardIndex !== null) {
                                  setOriginalCardImage(generatedCards[selectedCardIndex]);
                                }
                                if (selectedCardIndex !== null) {
                                  setLastEditedImage(generatedCards[selectedCardIndex]);
                                }
                                const newCards = [...generatedCards];
                                newCards[selectedCardIndex] = data.imageUrl;
                                setGeneratedCards(newCards);
                                setEditRequest("");
                              } else {
                                if (response.status === 403 && (data.generationUsed != null || data.generationRemaining != null)) {
                                  const limit = Math.max(1, Number(data.generationLimit || 12));
                                  const used = Math.max(0, Number(data.generationUsed ?? 0));
                                  setVisualQuota({ used, limit, remaining: Math.max(0, Number(data.generationRemaining ?? limit - used)) });
                                }
                                throw new Error(data.error || "Ошибка редактирования");
                              }
                            } catch (error: any) {
                              console.error("Ошибка редактирования:", error);
                              alert(`Ошибка редактирования: ${error.message}`);
                            } finally {
                              setIsEditing(false);
                            }
                          }
                        }}
                        disabled={isEditing || !editRequest.trim()}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 bg-[#4ADE80] rounded-full flex items-center justify-center shadow-lg disabled:opacity-30 disabled:cursor-not-allowed z-10"
                      >
                        {isEditing ? (
                          <Loader2 className="w-6 h-6 animate-spin text-white" />
                        ) : (
                          <ArrowRight className="w-6 h-6 text-white" />
                        )}
                      </motion.button>
                    </div>
                  </div>
                </div>
                
                {/* Кнопка "Дальше без изменений" - в правом нижнем углу */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    // Переходим в режим серии карточек
                    if (selectedCardIndex !== null && generatedCards[selectedCardIndex]) {
                      // Создаем первый слайд с выбранной карточкой
                      const firstSlide = {
                        id: 1,
                        imageUrl: generatedCards[selectedCardIndex],
                        prompt: "",
                        scenario: null,
                        aspectRatio: aspectRatio === "3:4" ? "3:4" : "1:1" as "3:4" | "1:1",
                      };
                      setSlides([firstSlide]);
                      setActiveSlideId(1);
                      setIsEditMode(false);
                      setIsSeriesMode(true);
                      setEditRequest("");
                      setOriginalCardImage(null);
                      setLastEditedImage(null);
                    }
                  }}
                  className="fixed bottom-8 right-8 px-8 py-4 bg-[#1F4E3D] text-white rounded-xl font-bold text-base shadow-xl shadow-black/20 z-[102]"
                >
                  Дальше без изменений
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      
      {/* Модальное окно для просмотра карточки */}
      <CardModal
        imageUrl={selectedCardForModal || ""}
        isOpen={!!selectedCardForModal}
        onClose={() => setSelectedCardForModal(null)}
      />
        </>
      )}
      
      {/* Третий экран: Режим создания серии карточек */}
      <AnimatePresence>
        {isSeriesMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-white z-50 flex"
            suppressHydrationWarning
          >
            {/* Сообщение об ошибке генерации в режиме серии */}
            <AnimatePresence suppressHydrationWarning>
              {generationError.show && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="fixed top-24 right-8 z-[120] max-w-md"
                >
                  <div className="bg-white rounded-xl shadow-2xl border-2 border-orange-200 p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        <AlertCircle className="w-6 h-6 text-orange-500" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">
                          Ошибка генерации
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">
                          {generationError.message || "Не удалось сгенерировать карточку. Попробуйте еще раз."}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setGenerationError({ show: false })}
                            className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors"
                          >
                            Понятно
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={() => setGenerationError({ show: false })}
                        className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Левая колонка: Лента слайдов */}
            <div className="w-[250px] bg-transparent border-r border-gray-200 p-4 overflow-y-auto z-10 ml-4">
              <div className="flex flex-col gap-4">
                {slides.map((slide) => (
                  <motion.div
                    key={slide.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={() => setActiveSlideId(slide.id)}
                    className={`relative rounded-xl overflow-hidden mb-4 cursor-pointer transition-all ${
                      activeSlideId === slide.id
                        ? "ring-4 ring-[#1F4E3D] ring-offset-2"
                        : "ring-2 ring-gray-200"
                    }`}
                    style={{ 
                      aspectRatio: slide.aspectRatio === "3:4" ? "3 / 4" 
                        : slide.aspectRatio === "4:3" ? "4 / 3"
                        : slide.aspectRatio === "9:16" ? "9 / 16" 
                        : "1 / 1" 
                    }}
                  >
                    {slide.imageUrl ? (
                      <img
                        src={slide.imageUrl}
                        alt={`Слайд ${slide.id}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-white flex items-center justify-center border border-gray-200">
                        <span className="text-gray-400 text-xs">Пустой</span>
                      </div>
                    )}
                    {slide.id === 1 && (
                      <div className="absolute top-1 right-1 bg-[#1F4E3D] text-white rounded-full p-1">
                        <Lock className="w-3 h-3" />
                      </div>
                    )}
                    <div className="absolute bottom-1 left-1 bg-black/50 text-white text-xs px-2 py-1 rounded">
                      {slide.id}
                    </div>
                  </motion.div>
                ))}
                
                {/* Кнопка добавления слайда */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    const newSlideId = slides.length + 1;
                    const newSlide = {
                      id: newSlideId,
                      imageUrl: null,
                      variants: [], // Пустой массив вариантов для нового слайда
                      prompt: "",
                      scenario: null,
                      aspectRatio: slideAspectRatio,
                    };
                    setSlides([...slides, newSlide]);
                    setActiveSlideId(newSlideId);
                    setSlidePrompt("");
                    setSelectedScenario(null);
                  }}
                  className="w-full rounded-xl border-2 border-dashed border-gray-300 bg-white hover:border-[#1F4E3D] hover:bg-green-50 transition-all flex items-center justify-center mb-4"
                  style={{ 
                    aspectRatio: slideAspectRatio === "3:4" ? "3 / 4" 
                      : slideAspectRatio === "4:3" ? "4 / 3"
                      : slideAspectRatio === "9:16" ? "9 / 16" 
                      : "1 / 1" 
                  }}
                >
                  <Plus className="w-8 h-8 text-gray-400" />
                </motion.button>
              </div>
            </div>
            
            {/* Центральная область: Canvas с сетчатым фоном и вертикальным скроллингом */}
            <div 
              className="flex-1 flex items-start pt-8 px-10 pb-32 relative overflow-y-auto"
              style={{
                backgroundImage: `
                  linear-gradient(rgba(0, 0, 0, 0.02) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(0, 0, 0, 0.02) 1px, transparent 1px)
                `,
                backgroundSize: "40px 40px",
                backgroundPosition: "0 0",
                backgroundColor: "#F5F5F7"
              }}
            >
              {activeSlideId !== null && (() => {
                const activeSlide = slides.find(s => s.id === activeSlideId);
                if (!activeSlide) return null;
                
                const aspectRatioValue = activeSlide.aspectRatio === "3:4" ? "3 / 4" 
                  : activeSlide.aspectRatio === "4:3" ? "4 / 3"
                  : activeSlide.aspectRatio === "9:16" ? "9 / 16" 
                  : "1 / 1";
                
                // Собираем все варианты для отображения в ленте (включая выбранный)
                const allVariants = activeSlide.variants && activeSlide.variants.length > 0
                  ? Array.from(new Set(activeSlide.variants))
                  : activeSlide.imageUrl 
                    ? [activeSlide.imageUrl]
                    : [];
                
                // Если есть выбранный вариант, он должен быть первым
                const sortedVariants = activeSlide.imageUrl && allVariants.includes(activeSlide.imageUrl)
                  ? [activeSlide.imageUrl, ...allVariants.filter(v => v !== activeSlide.imageUrl)]
                  : allVariants;
                
                // Фиксированная ширина для всех фотографий (увеличено)
                const imageWidth = 450;
                
                return (
                  <div className="w-full py-8 pl-8">
                    {/* Сетка 2 колонки для заполнения пространства */}
                    <div className="grid grid-cols-2 gap-6" style={{ maxWidth: `${imageWidth * 2 + 24}px` }}>
                      {sortedVariants.map((variantUrl, index) => (
                        <motion.div
                          key={`${variantUrl}-${index}`}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="relative group w-full cursor-pointer"
                          style={{ 
                            aspectRatio: aspectRatioValue
                          }}
                          onClick={() => {
                            // Открываем увеличенное изображение
                            setViewingImage(variantUrl);
                          }}
                        >
                          <img
                            src={variantUrl}
                            alt={`Вариант ${index + 1}`}
                            className="w-full h-full object-contain rounded-lg transition-transform group-hover:scale-[1.02]"
                          />
                          
                          {/* Затемнение при наведении */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all rounded-lg" />
                          
                          {/* Кружок с галочкой для выбора */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Выбираем вариант
                              setSlides(slides.map(s => 
                                s.id === activeSlideId 
                                  ? { ...s, imageUrl: variantUrl }
                                  : s
                              ));
                            }}
                            className={`absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-all z-20 ${
                              activeSlide.imageUrl === variantUrl
                                ? "bg-[#4ADE80] text-white shadow-lg"
                                : "bg-white/90 hover:bg-white text-gray-600 shadow-md"
                            }`}
                          >
                            {activeSlide.imageUrl === variantUrl ? (
                              <CheckCircle2 className="w-5 h-5" />
                            ) : (
                              <div className="w-4 h-4 border-2 border-gray-400 rounded-full" />
                            )}
                          </button>

                          {/* Кнопка скачивания как на экране 1 */}
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const response = await fetch(variantUrl);
                                const blob = await response.blob();
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = `karto-slide-${Date.now()}.png`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                window.URL.revokeObjectURL(url);
                              } catch (error) {
                                console.error("Ошибка скачивания слайда:", error);
                              }
                            }}
                            className="absolute top-3 left-3 p-2 bg-white/90 hover:bg-white rounded-lg shadow-lg transition-colors z-20"
                            title="Скачать изображение"
                          >
                            <Download className="w-4 h-4 text-gray-900" />
                          </button>
                        </motion.div>
                      ))}
                        
                        {/* Анимация генерации, если идет генерация */}
                        {isGeneratingSlide && (
                          <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="relative w-full"
                            style={{ 
                              aspectRatio: aspectRatioValue
                            }}
                          >
                            <LoadingDotsCardSlide aspectRatio={activeSlide.aspectRatio} />
                          </motion.div>
                        )}
                    </div>
                    
                    {/* Плейсхолдер, если нет вариантов и не идет генерация */}
                    {sortedVariants.length === 0 && !isGeneratingSlide && (
                      <div
                        className="relative bg-gray-100 flex items-center justify-center rounded-lg"
                        style={{ 
                          width: `${imageWidth}px`,
                          aspectRatio: aspectRatioValue
                        }}
                      >
                        <div className="text-center p-8">
                          <Sparkles className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                          <p className="text-gray-400 text-lg font-semibold">Готов к генерации</p>
                          <p className="text-gray-300 text-sm mt-2">Опишите слайд ниже и выберите сценарий</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            
            {/* Линия этапов справа + инструкция */}
            <div className="absolute top-24 right-12 flex flex-col items-end gap-4 z-30">
              <StageMenu currentStage="visual" position="right" visualQuota={visualQuota} />
              
              {/* Вопрос-виджет с инструкцией */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-[320px]"
              >
                <div className="bg-gradient-to-b from-white to-gray-50/90 backdrop-blur-sm rounded-2xl shadow-[0_18px_40px_rgba(15,23,42,0.12)] border border-gray-100 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setIsHelpOpen((prev) => !prev)}
                    className="flex w-full items-center gap-2 text-left"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#050509] text-white text-sm font-semibold shadow-[0_10px_25px_rgba(15,23,42,0.45)]">
                      ?
                    </div>
                    <div className="flex-1 flex items-center justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold tracking-[0.02em] text-gray-900">
                          Что здесь делать?
                        </span>
                        <span className="text-[11px] text-gray-500">
                          Краткая инструкция по визуалу
                        </span>
                      </div>
                      <motion.span
                        animate={{ rotate: isHelpOpen ? 180 : 0 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[10px]"
                      >
                        ˅
                      </motion.span>
                    </div>
                  </button>
                  
                  <AnimatePresence>
                    {isHelpOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -6, height: 0 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 space-y-2 text-[11px] leading-relaxed text-gray-600">
                          <p>
                            На этом шаге вы добавляете к первой карточке дополнительные кадры
                            с тем же товаром.
                          </p>
                          <p>
                            Внизу опишите, какой кадр нужен: обстановку, ракурс, детали. При
                            необходимости добавьте текст, который должен появиться на изображении.
                          </p>
                          <p>
                            Сценарии
                            <span className="font-semibold">
                              {" "}«Жилое пространство», «Студийный подиум», «Макро-деталь», «С человеком»
                            </span>{" "}
                            помогают задать контекст, где будет находиться товар.
                          </p>
                          <p>
                            Галочка <span className="font-semibold">«Использовать обстановку»</span>
                            сохраняет фон и атмосферу первой карточки и добавляет новые ракурсы
                            в той же среде.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            </div>
            
            {/* Нижняя панель: Unified Command Capsule */}
            <div className="absolute bottom-8 left-[250px] right-0 px-8 flex items-center justify-center z-20">
              <div className="w-full max-w-5xl bg-white rounded-[24px] shadow-2xl border border-gray-200 py-3 px-4 flex items-center gap-4 relative">
                {/* Чекбокс использования обстановки - над настройками, вне панели */}
                <div className="absolute -top-10 right-0 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="useEnvironment"
                    checked={useEnvironment}
                    onChange={(e) => setUseEnvironment(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-[#4ADE80] focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="useEnvironment" className="text-xs text-gray-400 cursor-pointer whitespace-nowrap">
                    Использовать обстановку
                  </label>
                </div>
                {/* Зона 1: Input Area (50%) */}
                <div className="flex items-center bg-gray-100 rounded-2xl p-3" style={{ width: "50%" }}>
                  <textarea
                    value={slidePrompt}
                    onChange={(e) => {
                      setSlidePrompt(e.target.value);
                      const textarea = e.target;
                      // Сбрасываем высоту для правильного расчета
                      textarea.style.height = 'auto';
                      const scrollHeight = textarea.scrollHeight;
                      const maxHeight = 120; // Примерно 5 строк
                      
                      // Устанавливаем высоту и скроллинг
                      if (scrollHeight <= maxHeight) {
                        textarea.style.height = `${scrollHeight}px`;
                        textarea.style.overflowY = 'hidden';
                      } else {
                        textarea.style.height = `${maxHeight}px`;
                        textarea.style.overflowY = 'auto';
                      }
                    }}
                    placeholder="Опишите, что должно быть на этом слайде (например: товар на кухонном столе)..."
                    className="w-full bg-transparent text-gray-900 placeholder:text-gray-400 text-base border-none outline-none resize-none"
                    rows={1}
                    style={{ 
                      minHeight: "24px", 
                      maxHeight: "120px"
                    }}
                  />
                </div>
                
                {/* Разделитель */}
                <div className="w-[1px] bg-gray-200 h-10" />
                
                {/* Зона 2: Settings Grid (50%) */}
                <div className="flex items-center gap-3 flex-1" style={{ width: "50%" }}>
                  <div className="grid grid-cols-2 gap-2 flex-1">
                    {/* Сценарии - чистый черный при выборе */}
                    {[
                      { id: "studio", name: "Студийный подиум", icon: Box },
                      { id: "lifestyle", name: "Жилое пространство", icon: Home },
                      { id: "macro", name: "Макро-деталь", icon: ZoomIn },
                      { id: "with-person", name: "С человеком", icon: Hand },
                    ].map((scenario) => {
                      const Icon = scenario.icon;
                      const isSelected = selectedScenario === scenario.id;
                      return (
                        <motion.button
                          key={scenario.id}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            // Переключаем: если уже выбран - отменяем, иначе выбираем
                            setSelectedScenario(selectedScenario === scenario.id ? null : scenario.id);
                          }}
                          className={`p-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-all ${
                            isSelected
                              ? "bg-black text-white shadow-md"
                              : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                          }`}
                          title={scenario.name}
                        >
                          <Icon className="w-4 h-4" />
                          <span className="text-xs font-semibold text-center leading-tight">
                            {scenario.name}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                  
                  {/* Переключатель формата - сетка 2x2 с визуальными прямоугольниками */}
                  <div className="grid grid-cols-2 gap-2 flex-shrink-0 place-items-center" style={{ width: "120px" }}>
                    {[
                      { value: "9:16", label: "9:16", width: 32, height: 56 }, // Узкий высокий вертикальный прямоугольник
                      { value: "3:4", label: "3:4", width: 42, height: 56 }, // Вертикальный прямоугольник (3:4 = вертикальный)
                      { value: "1:1", label: "1:1", width: 56, height: 56 }, // Квадрат
                      { value: "4:3", label: "4:3", width: 56, height: 42 }, // Горизонтальный прямоугольник (4:3 = горизонтальный)
                    ].map((format) => (
                      <div key={format.value} className="flex items-center justify-center w-full h-full" style={{ minHeight: "60px" }}>
                        <button
                          onClick={() => setSlideAspectRatio(format.value as "3:4" | "4:3" | "9:16" | "1:1")}
                          className="rounded-lg text-xs font-bold transition-all flex items-center justify-center flex-shrink-0 border-2"
                          style={{
                            width: `${format.width}px`,
                            height: `${format.height}px`,
                            minWidth: `${format.width}px`,
                            minHeight: `${format.height}px`,
                            maxWidth: `${format.width}px`,
                            maxHeight: `${format.height}px`,
                            backgroundColor: slideAspectRatio === format.value ? "#000000" : "#F3F4F6",
                            color: slideAspectRatio === format.value ? "#FFFFFF" : "#4B5563",
                            borderColor: slideAspectRatio === format.value ? "#000000" : "#D1D5DB",
                          }}
                          onMouseEnter={(e) => {
                            if (slideAspectRatio !== format.value) {
                              e.currentTarget.style.backgroundColor = "#E5E7EB";
                              e.currentTarget.style.borderColor = "#9CA3AF";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (slideAspectRatio !== format.value) {
                              e.currentTarget.style.backgroundColor = "#F3F4F6";
                              e.currentTarget.style.borderColor = "#D1D5DB";
                            }
                          }}
                        >
                          {format.label}
                        </button>
                      </div>
                    ))}
                  </div>
                  
                  {/* Кнопка запуска генерации - салатовая */}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={async () => {
                      if (activeSlideId === null) {
                        alert("Выберите слайд для генерации");
                        return;
                      }
                      
                      // Находим первый слайд для получения референсного изображения
                      const firstSlide = slides.find(s => s.id === 1);
                      if (!firstSlide || !firstSlide.imageUrl) {
                        alert("Первый слайд не найден или не имеет изображения");
                        return;
                      }
                      if (!sessionId) {
                        alert("Не найдена сессия Потока. Вернитесь на этап «Понимание» и начните заново.");
                        return;
                      }
                      
                      setIsGeneratingSlide(true);
                      try {
                        // Вызываем API для генерации слайда
                        const response = await fetch("/api/generate-slide", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            sessionId,
                            productName: productName,
                            referenceImageUrl: firstSlide.imageUrl, // Референс товара из первого слайда
                            environmentImageUrl: useEnvironment ? firstSlide.imageUrl : null, // Референс обстановки только если включен чекбокс
                            userPrompt: slidePrompt.trim() || "", // Описание от пользователя (может быть пустым)
                            scenario: selectedScenario || null, // Сценарий (может быть null)
                            aspectRatio: slideAspectRatio,
                          }),
                        });
                        
                        const data = await response.json();
                        
                        if (!data.success) {
                          if (typeof data.generationUsed === "number" || typeof data.generationRemaining === "number") {
                            const limit = Math.max(1, Number(data.generationLimit || 12));
                            const used = Math.max(0, Number(data.generationUsed || 0));
                            setVisualQuota({
                              used,
                              limit,
                              remaining: Math.max(0, Number(data.generationRemaining ?? limit - used)),
                            });
                          }
                          setGenerationError({
                            show: true,
                            message:
                              data.error ||
                              "Ошибка произошла на нашей стороне. Извиняемся, пожалуйста, попробуйте еще раз чуть позже.",
                          });
                          return;
                        }
                        if (typeof data.generationUsed === "number" || typeof data.generationRemaining === "number") {
                          const limit = Math.max(1, Number(data.generationLimit || 12));
                          const used = Math.max(0, Number(data.generationUsed || 0));
                          setVisualQuota({
                            used,
                            limit,
                            remaining: Math.max(0, Number(data.generationRemaining ?? limit - used)),
                          });
                        }
                        
                        // Добавляем новый вариант в массив variants (проверяем на дубликаты)
                        setSlides(slides.map(s => {
                          if (s.id === activeSlideId) {
                            // Проверяем, нет ли уже такого варианта
                            const existingVariants = s.variants || [];
                            const isDuplicate = existingVariants.includes(data.imageUrl);
                            
                            // Добавляем только если это не дубликат
                            const newVariants = isDuplicate 
                              ? existingVariants 
                              : [...existingVariants, data.imageUrl];
                            
                            return { 
                              ...s, 
                              variants: newVariants,
                              // Если это первый вариант или нет выбранного, делаем его выбранным
                              imageUrl: s.imageUrl || data.imageUrl,
                              prompt: slidePrompt.trim(), 
                              scenario: selectedScenario, 
                              aspectRatio: slideAspectRatio 
                            };
                          }
                          return s;
                        }));
                        
                        setSlidePrompt("");
                        setSelectedScenario(null);
                      } catch (_error: unknown) {
                        setGenerationError({
                          show: true,
                          message:
                            "Ошибка произошла на нашей стороне. Извиняемся, пожалуйста, попробуйте еще раз чуть позже.",
                        });
                      } finally {
                        setIsGeneratingSlide(false);
                      }
                    }}
                    disabled={isGeneratingSlide || activeSlideId === null || visualQuota.remaining <= 0}
                    className="aspect-square h-full rounded-xl bg-[#4ADE80] flex items-center justify-center shadow-lg hover:shadow-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ minHeight: "48px", minWidth: "48px" }}
                  >
                    {isGeneratingSlide ? (
                      <Loader2 className="w-5 h-5 animate-spin text-white" />
                    ) : (
                      <ArrowRight className="w-5 h-5 text-white" />
                    )}
                  </motion.button>
                </div>
              </div>
            </div>
            
            {/* Кнопка "Продолжить" - переход на этап "Цена" */}
            {isSeriesMode && slides.length > 0 && (
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  router.push("/studio/price");
                }}
                className="fixed bottom-8 right-8 px-8 py-4 bg-[#2E5A43] text-white rounded-xl font-bold text-base shadow-xl shadow-black/20 z-[102] flex items-center gap-2"
              >
                <span>Продолжить</span>
                <ArrowRight className="w-5 h-5" />
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>


      {/* Модальное окно для просмотра увеличенного изображения */}
      <AnimatePresence>
        {viewingImage && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setViewingImage(null)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-8"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                onClick={(e) => e.stopPropagation()}
                className="relative max-w-3xl max-h-[85vh] bg-white rounded-2xl overflow-hidden shadow-2xl"
              >
                <img
                  src={viewingImage}
                  alt="Просмотр изображения"
                  className="w-full h-full object-contain"
                  style={{ maxHeight: "85vh" }}
                />
                <button
                  onClick={() => setViewingImage(null)}
                  className="absolute top-4 right-4 w-10 h-10 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center transition-all backdrop-blur-sm"
                >
                  <X className="w-5 h-5" />
                </button>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Модальное окно отчета о неполадке */}
      <BugReportModal
        isOpen={isBugReportOpen}
        onClose={() => setIsBugReportOpen(false)}
        user={user}
      />
    </div>
  );
}
