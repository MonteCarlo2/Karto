"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { 
  Download,
  Loader2,
  Sparkles,
  X,
  Box,
  Home,
  ZoomIn,
  Hand,
  ArrowRight,
  Image as ImageIcon,
  User,
  LogOut,
  Heart,
  Upload,
  ChevronDown,
  Plus,
  Wrench
} from "lucide-react";
import { BugReportModal } from "@/components/ui/bug-report-modal";

// Анимация загрузки для слайдов
function LoadingDotsCardSlide({ aspectRatio }: { aspectRatio: "3:4" | "4:3" | "9:16" | "1:1" }) {
  const gridCols = 12;
  const gridRows = aspectRatio === "3:4" ? 16 
    : aspectRatio === "4:3" ? 12
    : aspectRatio === "9:16" ? 20
    : 12;
  const totalDots = gridCols * gridRows;
  const cardColor = "#000000";

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

export default function FreeGeneration() {
  const router = useRouter();
  const { showToast } = useToast();
  
  // Состояние для слайдов
  // Варианты теперь хранят и URL, и aspectRatio, и исходный промпт для каждого изображения
  type Variant = { url: string; aspectRatio: "3:4" | "4:3" | "9:16" | "1:1"; prompt?: string | null };
  const [slides, setSlides] = useState<Array<{ 
    id: number; 
    imageUrl: string | null;
    variants: Variant[];
    prompt: string | null; 
    scenario: string | null; 
    aspectRatio: "3:4" | "4:3" | "9:16" | "1:1" 
  }>>([]);
  const [activeSlideId, setActiveSlideId] = useState<number | null>(null);
  const [slidePrompt, setSlidePrompt] = useState("");
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [slideAspectRatio, setSlideAspectRatio] = useState<"3:4" | "4:3" | "9:16" | "1:1">("3:4");
  const [isGeneratingSlide, setIsGeneratingSlide] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [viewingPrompt, setViewingPrompt] = useState<string | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  
  // Состояние для левой панели и режимов
  const [activeLibraryTab, setActiveLibraryTab] = useState<"my-creativity" | "favorites">("my-creativity");
  const [favoriteImages, setFavoriteImages] = useState<string[]>([]);
  const [generationMode, setGenerationMode] = useState<"free" | "for-product">("free");

  // Референсные изображения для режима "Свободная" (до 14 штук)
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  
  // Состояние для загрузки фото товара
  const [productPhoto, setProductPhoto] = useState<File | null>(null);
  const [productPhotoPreview, setProductPhotoPreview] = useState<string | null>(null);
  
  // Состояние для профиля
  const [user, setUser] = useState<any>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [hasLoadedFeed, setHasLoadedFeed] = useState(false);
  const [isBugReportOpen, setIsBugReportOpen] = useState(false);
  const feedStorageKey = user?.id ? `karto-feed-${user.id}` : "karto-feed-anon";
  const hasLoadedFeedRef = useRef(false);

  // Сохранение изображения в Supabase через API (service_role на сервере)
  const saveImageToSupabase = async (params: {
    imageUrl: string;
    prompt: string | null;
    aspectRatio: "3:4" | "4:3" | "9:16" | "1:1";
    generationMode: "free" | "for-product";
    scenario: string | null;
  }) => {
    try {
      if (!user?.id) {
        console.warn("⚠️ Пользователь не авторизован, пропускаем сохранение в Supabase");
        return;
      }

      const response = await fetch("/api/free-feed/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          imageUrl: params.imageUrl,
          prompt: params.prompt,
          aspectRatio: params.aspectRatio,
          generationMode: params.generationMode,
          scenario: params.scenario,
          isFavorite: false,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        // Тихая обработка ошибок - не логируем в консоль
      }
    } catch (error: any) {
      // Тихая обработка ошибок - не логируем в консоль
    }
  };

  // Проверка авторизации
  useEffect(() => {
    const checkUser = async () => {
      try {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user || null);
      } catch (error: any) {
        console.warn("Ошибка проверки сессии:", error);
      }
    };
    checkUser();

    // Подписка на изменения авторизации
    try {
      const supabase = createBrowserClient();
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user || null);
      });
      return () => subscription.unsubscribe();
    } catch (error) {
      return () => {};
    }
  }, []);

  // Закрытие меню профиля при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showProfileMenu && !(event.target as Element).closest('.profile-menu-container')) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileMenu]);

  // Выход из аккаунта
  const handleLogout = async () => {
    try {
      const supabase = createBrowserClient();
      await supabase.auth.signOut();
      setShowProfileMenu(false);
      router.push("/");
    } catch (error: any) {
      console.error("Ошибка выхода:", error);
    }
  };

  // Обработчик загрузки фото товара
  const handleProductPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProductPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProductPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Обработчик загрузки референсных изображений (для режима "Свободная")
  const handleReferenceImagesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remainingSlots = 4 - referenceImages.length;
    if (remainingSlots <= 0) {
      showToast({
        type: "info",
        message: "Можно добавить не более 4 референсных изображений.",
      });
      return;
    }

    const filesToProcess = files.slice(0, remainingSlots);

    filesToProcess.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setReferenceImages((prev) => {
          if (prev.length >= 4) return prev;
          return [...prev, result];
        });
      };
      reader.readAsDataURL(file);
    });

    // сбрасываем value, чтобы можно было загрузить те же файлы ещё раз при желании
    e.target.value = "";
  };

  // Скрываем Footer на этой странице
  useEffect(() => {
    const footer = document.querySelector('footer');
    if (footer) {
      footer.style.display = 'none';
    }
    return () => {
      if (footer) {
        footer.style.display = '';
      }
    };
  }, []);

  // Загружаем ленту из Supabase (основной источник) и localStorage (fallback)
  useEffect(() => {
    if (typeof window === "undefined") return;
    setHasLoadedFeed(false);
    hasLoadedFeedRef.current = false;
    
    const loadFeed = async () => {
      try {
        // Пытаемся загрузить из Supabase, если пользователь авторизован
        // Сначала проверяем, что сессия действительно валидна
        if (user?.id) {
          try {
            // Дополнительная проверка сессии перед запросом
            const supabase = createBrowserClient();
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            
            // Если сессия недействительна или отсутствует, НЕ ДЕЛАЕМ ЗАПРОС - используем localStorage
            if (sessionError || !session?.user || !session.user.id || session.user.id !== user.id) {
              // Сессия невалидна - просто переходим к localStorage без запроса
              } else {
              // Делаем запрос только если сессия валидна
              const response = await fetch(`/api/free-feed/list?userId=${user.id}`);
              
              if (response.ok) {
                const result = await response.json();
                // Проверяем, что данные есть и не пустые
                if (result.success && Array.isArray(result.data) && result.data.length > 0) {
                  // Преобразуем данные из Supabase в формат slides
                  const feedItems = result.data;
                  const favoriteUrls: string[] = [];
                  
                  // Группируем по слайдам (можно создать один слайд или несколько)
                  // Для простоты создаем один слайд со всеми вариантами
                  const variants: Variant[] = feedItems.map((item: any) => {
                    if (item.is_favorite) {
                      favoriteUrls.push(item.image_url);
                    }
                    return {
                      url: item.image_url,
                      aspectRatio: item.aspect_ratio,
                      prompt: item.prompt || null,
                    };
                  });
                  
                  if (variants.length > 0) {
                    const slide = {
                      id: 1,
                      imageUrl: variants[0].url,
                      variants, // Все варианты из Supabase
                      prompt: variants[0].prompt || null,
                      scenario: feedItems[0]?.scenario || null,
                      aspectRatio: variants[0].aspectRatio,
                    };
                    // Устанавливаем данные синхронно
                    setSlides([slide]);
                    setActiveSlideId(1);
                    setFavoriteImages(favoriteUrls);
                    // Устанавливаем hasLoadedFeed после установки всех данных
                    setHasLoadedFeed(true);
                    hasLoadedFeedRef.current = true;
                    return; // Успешно загрузили из Supabase
                  }
                }
              }
            }
          } catch (supabaseError: any) {
            // Тихая обработка ошибок - не логируем в консоль, просто используем localStorage
            // Игнорируем все ошибки при загрузке из Supabase
          }
        }
        
        // Fallback: загружаем из localStorage
        const raw = localStorage.getItem(feedStorageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.slides) && parsed.slides.length > 0) {
            setSlides(parsed.slides);
            if (parsed.activeSlideId !== undefined && parsed.activeSlideId !== null) {
              setActiveSlideId(parsed.activeSlideId);
            } else if (parsed.slides[0]?.id) {
              setActiveSlideId(parsed.slides[0].id);
            }
            if (Array.isArray(parsed.favoriteImages)) {
              setFavoriteImages(parsed.favoriteImages);
            }
            setHasLoadedFeed(true);
            hasLoadedFeedRef.current = true;
            return; // Успешно загрузили из localStorage
          }
        }
      } catch (error) {
        console.warn("Не удалось загрузить ленту:", error);
        // Fallback на localStorage при ошибке
        try {
          const raw = localStorage.getItem(feedStorageKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed.slides)) {
              setSlides(parsed.slides);
              if (parsed.activeSlideId !== undefined && parsed.activeSlideId !== null) {
                setActiveSlideId(parsed.activeSlideId);
              } else if (parsed.slides[0]?.id) {
                setActiveSlideId(parsed.slides[0].id);
              }
            }
            if (Array.isArray(parsed.favoriteImages)) {
              setFavoriteImages(parsed.favoriteImages);
            }
          }
        } catch (localError) {
          console.warn("Не удалось загрузить из localStorage:", localError);
        }
      } finally {
        setHasLoadedFeed(true);
        hasLoadedFeedRef.current = true;
      }
    };
    
    loadFeed();
  }, [feedStorageKey, user?.id]);

  // Сохраняем ленту и избранное в localStorage
  useEffect(() => {
    if (!hasLoadedFeedRef.current || typeof window === "undefined") return;
    try {
      const payload = {
        slides,
        favoriteImages,
        activeSlideId,
      };
      localStorage.setItem(feedStorageKey, JSON.stringify(payload));
    } catch (error) {
      console.warn("Не удалось сохранить ленту в localStorage:", error);
    }
  }, [slides, favoriteImages, activeSlideId, feedStorageKey]);

  // Создаем первый слайд после загрузки, если лента пустая
  useEffect(() => {
    if (!hasLoadedFeed) return;
    if (slides.length === 0) {
      const firstSlide = {
        id: 1,
        imageUrl: null,
        variants: [],
        prompt: "",
        scenario: null,
        aspectRatio: slideAspectRatio,
      };
      setSlides([firstSlide]);
      setActiveSlideId(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLoadedFeed]);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundImage: `
          linear-gradient(rgba(0, 0, 0, 0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0, 0, 0, 0.02) 1px, transparent 1px)
        `,
        backgroundSize: "40px 40px",
        backgroundPosition: "0 0",
        backgroundColor: "#F5F5F7",
      }}
      suppressHydrationWarning
    >
      {/* Левая панель */}
      <div className="fixed left-0 top-0 bottom-0 w-72 bg-[#f5f3ef] z-40 flex flex-col border-r border-gray-200">
        {/* Логотип вверху */}
        <Link
          href="/"
          className="px-6 py-6 border-b border-gray-200/50 flex items-center justify-center"
          aria-label="На главную"
        >
          <Image
            src="/logo-flow.png"
            alt="KARTO"
            width={200}
            height={130}
            priority
            unoptimized
            className="h-24 w-auto object-contain"
          />
        </Link>

        {/* Кнопки библиотеки - подняты выше */}
        <div className="px-6 py-6 space-y-2">
          <button
            onClick={() => setActiveLibraryTab("my-creativity")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              activeLibraryTab === "my-creativity"
                ? "bg-[#1F4E3D] text-white shadow-md"
                : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-200"
            }`}
          >
            <ImageIcon className={`w-5 h-5 ${activeLibraryTab === "my-creativity" ? "text-white" : "text-[#1F4E3D]"}`} />
            <span className="font-medium">Моё творчество</span>
          </button>
          
          <button
            onClick={() => setActiveLibraryTab("favorites")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              activeLibraryTab === "favorites"
                ? "bg-[#1F4E3D] text-white shadow-md"
                : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-200"
            }`}
          >
            <Heart className={`w-5 h-5 ${activeLibraryTab === "favorites" ? "text-white" : "text-[#1F4E3D]"}`} />
            <span className="font-medium">Избранные</span>
          </button>
        </div>

        {/* Заметный разделитель */}
        <div className="px-6 py-4">
          <div className="h-[2px] bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
        </div>

        {/* Режим генерации */}
        <div className="px-6 py-4 flex-1 flex flex-col">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-4 font-semibold">
            Режим генерации
          </div>
          
          {/* Полноценный переключатель с вертикальным toggle */}
          <div className="space-y-3 mb-4">
            <button
              onClick={() => setGenerationMode("free")}
              className={`w-full flex items-center justify-center px-4 py-3 rounded-xl transition-all border-2 ${
                generationMode === "free"
                  ? "bg-[#1F4E3D] text-white border-[#1F4E3D] shadow-md"
                  : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="font-medium">Свободная</span>
            </button>
            
            {/* Вертикальный переключатель */}
            <div className="flex items-center justify-center py-2">
              <button
                onClick={() => setGenerationMode(generationMode === "free" ? "for-product" : "free")}
                className={`relative w-6 h-18 rounded-full transition-colors duration-300 shadow-inner overflow-hidden border-0 focus:outline-none focus:ring-0 ${
                  generationMode === "free"
                    ? "bg-[#1F4E3D]"
                    : "bg-[#D1F85A]"
                }`}
                style={{ height: '4.5rem' }}
                role="switch"
                aria-checked={generationMode === "for-product"}
                onMouseDown={(e) => e.preventDefault()}
                suppressHydrationWarning
              >
                <motion.div
                  className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow-lg"
                  animate={{
                    y: generationMode === "free" ? 0 : 48
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 25
                  }}
                  suppressHydrationWarning
                />
              </button>
            </div>
            
            <button
              onClick={() => setGenerationMode("for-product")}
              className={`w-full flex items-center justify-center px-4 py-3 rounded-xl transition-all border-2 ${
                generationMode === "for-product"
                  ? "bg-[#D1F85A] text-gray-900 border-[#D1F85A] shadow-md"
                  : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="font-medium">Для товара</span>
            </button>
          </div>

          {/* Загрузка фото товара - всегда видна, но disabled когда не выбрано */}
          <div className={`bg-white rounded-xl border-2 p-4 transition-all ${
            generationMode === "for-product"
              ? "border-gray-200"
              : "border-gray-200 opacity-50 pointer-events-none"
          }`}>
            {productPhotoPreview ? (
              <div className="space-y-3">
                <div className="relative rounded-lg overflow-hidden bg-gray-50">
                  <img
                    src={productPhotoPreview}
                    alt="Фото товара"
                    className="w-full h-40 object-contain"
                  />
                  <button
                    onClick={() => {
                      setProductPhoto(null);
                      setProductPhotoPreview(null);
                    }}
                    disabled={generationMode !== "for-product"}
                    className="absolute top-2 right-2 p-1.5 bg-white/90 hover:bg-white rounded-lg shadow-md transition-colors disabled:opacity-50"
                  >
                    <X className="w-4 h-4 text-gray-900" />
                  </button>
                </div>
                <p className="text-xs text-gray-500 text-center">Фото товара загружено</p>
              </div>
            ) : (
              <div className="space-y-3">
                <label
                  htmlFor="product-photo-upload-sidebar"
                  className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg transition-colors ${
                    generationMode === "for-product"
                      ? "border-gray-300 cursor-pointer hover:border-[#1F4E3D] bg-gray-50"
                      : "border-gray-200 bg-gray-50 cursor-not-allowed"
                  }`}
                >
                  <Upload className={`w-8 h-8 mb-2 ${generationMode === "for-product" ? "text-gray-400" : "text-gray-300"}`} />
                  <span className={`text-sm font-medium ${generationMode === "for-product" ? "text-gray-600" : "text-gray-400"}`}>
                    Загрузить фото
                  </span>
                  <span className={`text-xs mt-1 ${generationMode === "for-product" ? "text-gray-400" : "text-gray-300"}`}>
                    PNG, JPG до 10MB
                  </span>
                </label>
                <input
                  id="product-photo-upload-sidebar"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleProductPhotoUpload}
                  disabled={generationMode !== "for-product"}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {user ? (
        <div className="fixed top-6 right-6 z-50 profile-menu-container">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-[#2E5A43] hover:bg-gray-100 transition-colors"
            aria-label="Профиль"
          >
            <User className="w-5 h-5 text-foreground" />
          </button>
          <AnimatePresence>
            {showProfileMenu && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50"
              >
                  <Link
                    href="/profile"
                    className="w-full flex items-center gap-2 px-4 py-2 text-left text-gray-700 hover:bg-gray-100 transition-colors"
                    onClick={() => setShowProfileMenu(false)}
                  >
                    <User className="w-4 h-4" />
                    Профиль
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2 text-left text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Выйти
                  </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <Link
          href="/login"
          className="fixed top-6 right-6 z-50 flex items-center justify-center w-10 h-10 rounded-full border-2 border-[#2E5A43] hover:bg-gray-100 transition-colors"
          aria-label="Войти"
        >
          <User className="w-5 h-5 text-foreground" />
        </Link>
      )}

      {/* Центральная область: Canvas с сетчатым фоном */}
      <div
        className="flex-1 flex items-start pt-8 pl-80 pr-10 pb-40 relative overflow-y-auto"
        style={{ background: "transparent" }}
      >
        {activeSlideId !== null && hasLoadedFeed && (() => {
          const activeSlide = slides.find(s => s.id === activeSlideId);
          if (!activeSlide) return null;
          
          // Нормализуем варианты: каждый вариант должен иметь url и aspectRatio
          const allVariants: Variant[] = activeSlide.variants && activeSlide.variants.length > 0
            ? activeSlide.variants.map(v => {
                // Если это уже объект с url и aspectRatio, возвращаем как есть
                if (typeof v === 'object' && 'url' in v && 'aspectRatio' in v) {
                  return {
                    url: (v as Variant).url,
                    aspectRatio: (v as Variant).aspectRatio,
                    prompt: (v as Variant).prompt ?? activeSlide.prompt ?? "",
                  };
                }
                // Если это старая строка, преобразуем в новый формат
                if (typeof v === 'string') {
                  return { url: v, aspectRatio: activeSlide.aspectRatio, prompt: activeSlide.prompt ?? "" };
                }
                // Fallback (не должно произойти)
                return { url: String(v), aspectRatio: activeSlide.aspectRatio, prompt: activeSlide.prompt ?? "" };
              })
            : [];
          
          // Фильтруем по избранным, если выбран режим "Избранные"
          const sortedVariants = activeLibraryTab === "favorites"
            ? allVariants.filter(variant => favoriteImages.includes(variant.url))
            : allVariants;
          
          // Плейсхолдерная пропорция для пустого состояния (используем текущий выбор)
          const placeholderAspectRatioValue = slideAspectRatio === "3:4" ? "3 / 4" 
            : slideAspectRatio === "4:3" ? "4 / 3"
            : slideAspectRatio === "9:16" ? "9 / 16" 
            : "1 / 1";
          
          return (
            <div className="w-full py-8 pl-8">
              <div className="flex flex-wrap gap-4" style={{ maxWidth: '1400px' }}>
                {/* Анимация загрузки показывается ПЕРВОЙ (сверху), так как новое изображение будет первым */}
                {isGeneratingSlide && (() => {
                  // Используем текущий выбранный формат для нового генерируемого изображения
                  const loadingAspectRatioValue = slideAspectRatio === "3:4" ? "3 / 4" 
                    : slideAspectRatio === "4:3" ? "4 / 3"
                    : slideAspectRatio === "9:16" ? "9 / 16" 
                    : "1 / 1";
                  
                  // Адаптивные размеры в зависимости от соотношения сторон (как у обычных изображений)
                  let loadingWidth: number;
                  if (slideAspectRatio === "4:3") {
                    loadingWidth = 520; // Горизонтальные - шире
                  } else if (slideAspectRatio === "9:16") {
                    loadingWidth = 320; // Вертикальные - уже, но выше
                  } else if (slideAspectRatio === "3:4") {
                    loadingWidth = 400; // Вертикальные средние
                  } else {
                    loadingWidth = 400; // Квадратные
                  }
                  
                  return (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ 
                        duration: 0.4, 
                        ease: [0.25, 0.1, 0.25, 1],
                        opacity: { duration: 0.3 },
                        scale: { duration: 0.3 }
                      }}
                      className="relative"
                      style={{ 
                        width: `${loadingWidth}px`,
                        aspectRatio: loadingAspectRatioValue
                      }}
                    >
                      <LoadingDotsCardSlide aspectRatio={slideAspectRatio} />
                    </motion.div>
                  );
                })()}
                
                {sortedVariants.map((variant, index) => {
                  const variantAspectRatioValue = variant.aspectRatio === "3:4" ? "3 / 4" 
                    : variant.aspectRatio === "4:3" ? "4 / 3"
                    : variant.aspectRatio === "9:16" ? "9 / 16" 
                    : "1 / 1";
                  
                  // Адаптивные размеры в зависимости от соотношения сторон для компактной мозаики
                  let baseWidth: number;
                  if (variant.aspectRatio === "4:3") {
                    baseWidth = 520; // Горизонтальные - шире
                  } else if (variant.aspectRatio === "9:16") {
                    baseWidth = 320; // Вертикальные - уже, но выше
                  } else if (variant.aspectRatio === "3:4") {
                    baseWidth = 400; // Вертикальные средние
                  } else {
                    baseWidth = 400; // Квадратные
                  }
                  
                  const isFavorite = favoriteImages.includes(variant.url);
                  return (
                    <motion.div
                      key={`${variant.url}-${index}`}
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ 
                        duration: 0.4, 
                        ease: [0.25, 0.1, 0.25, 1],
                        opacity: { duration: 0.3 },
                        scale: { duration: 0.3 }
                      }}
                      layout
                      className="flex flex-col"
                      style={{ width: `${baseWidth}px` }}
                    >
                      <div
                        className="relative group cursor-pointer"
                        style={{ 
                          width: `${baseWidth}px`,
                          aspectRatio: variantAspectRatioValue
                        }}
                        onClick={() => {
                          setViewingImage(variant.url);
                          setViewingPrompt(variant.prompt ?? null);
                        }}
                      >
                      <img
                        src={variant.url}
                        alt={`Вариант ${index + 1}`}
                        className="w-full h-full object-cover rounded-lg"
                      />
                      
                      {/* Кнопки в правом верхнем углу */}
                      <div className="absolute top-3 right-3 flex items-center gap-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Кнопка "Добавить в запрос" - только для режима свободной генерации */}
                        {generationMode === "free" && referenceImages.length < 4 && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              // Проверяем, не добавлено ли уже это изображение
                              const isAlreadyAdded = referenceImages.some(img => 
                                img === variant.url || img.includes(variant.url.split('/').pop() || '')
                              );
                              
                              if (isAlreadyAdded) {
                                showToast({
                                  type: "info",
                                  message: "Изображение уже добавлено в запрос",
                                });
                                return;
                              }
                              
                              try {
                                // Конвертируем URL в base64 для совместимости с существующей логикой
                                const response = await fetch(variant.url);
                                const blob = await response.blob();
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  const base64 = reader.result as string;
                                  setReferenceImages(prev => {
                                    if (prev.length >= 4) return prev;
                                    return [...prev, base64];
                                  });
                                  showToast({
                                    type: "success",
                                    message: "Изображение добавлено в запрос",
                                  });
                                };
                                reader.readAsDataURL(blob);
                              } catch (error) {
                                console.error("Ошибка добавления изображения:", error);
                                showToast({
                                  type: "error",
                                  message: "Не удалось добавить изображение",
                                });
                              }
                            }}
                            className="p-2 hover:opacity-80 transition-opacity"
                            title="Добавить в запрос"
                          >
                            <div className="relative">
                              <Plus className="w-5 h-5 text-white drop-shadow-lg" />
                              <ArrowRight className="w-3 h-3 text-white drop-shadow-lg absolute -bottom-0.5 -right-0.5" />
                            </div>
                          </button>
                        )}
                        
                        {/* Кнопка избранного */}
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const newFavoriteState = !isFavorite;
                            
                            // Обновляем локальное состояние
                            if (newFavoriteState) {
                              setFavoriteImages(prev => [...prev, variant.url]);
                            } else {
                              setFavoriteImages(prev => prev.filter(img => img !== variant.url));
                            }
                            
                            // Обновляем избранное в Supabase через API (service_role на сервере)
                            if (user?.id) {
                              try {
                                await fetch("/api/free-feed/update-favorite", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    imageUrl: variant.url,
                                    isFavorite: newFavoriteState,
                                    userId: user.id,
                                  }),
                                });
                              } catch {
                                // Сетевые ошибки игнорируем — локальное состояние уже обновлено
                              }
                            }
                          }}
                          className="p-2 hover:opacity-80 transition-opacity"
                          title={isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
                        >
                          <Heart className={`w-5 h-5 ${isFavorite ? "fill-pink-500 text-pink-500" : "text-white drop-shadow-lg"}`} />
                        </button>
                        
                        {/* Кнопка скачивания */}
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const response = await fetch(variant.url);
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
                          className="p-2 hover:opacity-80 transition-opacity"
                          title="Скачать изображение"
                        >
                          <Download className="w-5 h-5 text-white drop-shadow-lg" />
                        </button>
                      </div>
                    </div>
                    {variant.prompt && variant.prompt.length > 0 && (
                      <div className="mt-3 px-2">
                        <p
                          className="text-sm font-semibold text-gray-800 leading-tight line-clamp-2"
                          style={{
                            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                            letterSpacing: '-0.01em',
                          }}
                          title={variant.prompt}
                        >
                          {variant.prompt}
                        </p>
                      </div>
                    )}
                    </motion.div>
                  );
                })}
              </div>
              
              {/* Заглушка показывается ТОЛЬКО если:
                  1. Данные загружены (hasLoadedFeed === true)
                  2. Есть активный слайд
                  3. У активного слайда НЕТ вариантов (variants пустой или не существует)
                  4. НЕ идет генерация
                  ВАЖНО: НЕ показываем заглушку, если есть данные в activeSlide.variants!
              */}
              {hasLoadedFeed && 
               activeSlide && 
               (!activeSlide.variants || activeSlide.variants.length === 0) && 
               !isGeneratingSlide && 
               (() => {
                // Определяем размер для пустого состояния на основе текущего формата
                let emptyStateWidth: number;
                if (slideAspectRatio === "4:3") {
                  emptyStateWidth = 520;
                } else if (slideAspectRatio === "9:16") {
                  emptyStateWidth = 320;
                } else if (slideAspectRatio === "3:4") {
                  emptyStateWidth = 400;
                } else {
                  emptyStateWidth = 400;
                }
                
                return (
                  <div
                    className="relative bg-gray-100 flex items-center justify-center rounded-lg"
                    style={{ 
                      width: `${emptyStateWidth}px`,
                      aspectRatio: placeholderAspectRatioValue
                    }}
                  >
                    <div className="text-center p-8">
                      <Sparkles className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-400 text-lg font-semibold">Готов к генерации</p>
                      <p className="text-gray-300 text-sm mt-2">Опишите слайд ниже и выберите сценарий</p>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}
      </div>
      
      {/* Нижняя панель: Unified Command Capsule - всегда на месте */}
      <div className="fixed bottom-8 left-80 right-0 px-8 flex items-center justify-center z-20">
        <motion.div
          layout
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          className={`bg-white rounded-[24px] shadow-2xl border border-gray-200 flex items-center gap-4 relative w-full ${
            generationMode === "free" ? "max-w-3xl" : "max-w-5xl"
          } py-3 px-4`}
        >
          {/* Зона 1: Input Area + референсы */}
          <div
            className={`bg-gray-100 rounded-2xl flex ${
              generationMode === "free" ? "flex-1" : ""
            }`}
            style={
              generationMode === "free"
                ? { padding: "12px", minHeight: "80px" }
                : { width: "50%", padding: "12px", minHeight: "80px" }
            }
          >
            <div className="flex-1 flex flex-col gap-2">
              <textarea
                value={slidePrompt}
                onChange={(e) => {
                  setSlidePrompt(e.target.value);
                  const textarea = e.target;
                  const maxHeight = 200;

                  // Сбрасываем высоту для пересчета
                  textarea.style.height = "auto";
                  const scrollHeight = textarea.scrollHeight;

                  if (scrollHeight <= maxHeight) {
                    textarea.style.height = `${scrollHeight}px`;
                    textarea.style.overflowY = "hidden";
                  } else {
                    textarea.style.height = `${maxHeight}px`;
                    textarea.style.overflowY = "auto";
                  }
                }}
                placeholder="Опишите, что должно быть на этом слайде (например: товар на кухонном столе)..."
                className="w-full bg-transparent text-gray-900 placeholder:text-gray-400 text-base font-medium border-none outline-none resize-none"
                rows={1}
                style={{
                  height: "48px",
                  minHeight: "48px",
                  maxHeight: "200px",
                  paddingRight: referenceImages.length === 0 ? "60px" : "0px",
                }}
                ref={(textarea) => {
                  if (textarea && !slidePrompt) {
                    // Сбрасываем высоту когда поле пустое
                    textarea.style.height = "48px";
                  }
                }}
              />

              {generationMode === "free" && (
                <div
                  className={`flex items-center gap-3 ${
                    referenceImages.length > 0 ? "mt-2" : "mt-1"
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0" suppressHydrationWarning>
                    {referenceImages.map((img, index) => {
                      return (
                        <div
                          key={`${img}-${index}`}
                          className="relative group flex-shrink-0 w-24 h-16"
                        >
                          {/* Маленькое превью - всегда видимо, не увеличивается */}
                          <div className="relative w-full h-full rounded-2xl overflow-hidden border border-gray-300 bg-white">
                            <img
                              src={img}
                              alt={`Референс ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                            {/* Крест на маленьком превью при наведении */}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReferenceImages((prev) =>
                                    prev.filter((_, i) => i !== index)
                                  );
                                }}
                                className="text-white text-5xl font-bold leading-none hover:text-gray-200 transition-colors flex items-center justify-center"
                                style={{ 
                                  lineHeight: '1',
                                  margin: 0,
                                  padding: 0,
                                  transform: 'translateY(-2px)',
                                }}
                              >
                                ×
                              </button>
                            </div>
                          </div>
                          
                          {/* Увеличенная версия - появляется при hover СНАРУЖИ, выходит за рамки */}
                          <div className="absolute bottom-full left-0 mb-2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-200 z-50">
                            <div className="relative rounded-2xl overflow-hidden border-2 border-gray-300 bg-gray-100 shadow-2xl">
                              <img
                                src={img}
                                alt={`Референс ${index + 1} увеличенный`}
                                className="block max-w-[320px] max-h-[384px] w-auto h-auto"
                                style={{ display: 'block' }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <label className="inline-flex items-center justify-center w-12 h-12 rounded-xl border-2 border-dashed border-gray-400 bg-gray-50 text-gray-600 text-2xl font-medium cursor-pointer hover:border-[#1F4E3D] hover:bg-gray-100 hover:text-[#1F4E3D] transition-all">
                      <span className="flex items-center justify-center w-full h-full leading-none">+</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleReferenceImagesUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Разделитель - только в режиме "Для товара" */}
          {generationMode === "for-product" && (
            <div className="w-[1px] bg-gray-200 h-10" />
          )}
          
          {/* Зона 2: Settings / Aspect ratio / Generate */}
          <motion.div
            layout
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className={`flex items-center gap-3 ${
              generationMode === "free" ? "flex-shrink-0" : "flex-1"
            }`}
            style={{ width: generationMode === "free" ? "auto" : "50%" }}
          >
            <AnimatePresence initial={false}>
              {/* Сценарии отображаем только для режима "Для товара" */}
              {generationMode === "for-product" && (
                <motion.div
                  key="scenarios"
                  initial={{ opacity: 0, y: 10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: 10, height: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="grid grid-cols-2 gap-2 flex-1"
                >
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
                          setSelectedScenario(
                            selectedScenario === scenario.id ? null : scenario.id
                          );
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
                </motion.div>
              )}
            </AnimatePresence>

            {/* Переключатель формата */}
            <motion.div
              key="aspect-ratio"
              layout
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
              className="grid grid-cols-2 gap-2 flex-shrink-0 place-items-center"
              style={{ width: generationMode === "free" ? "140px" : "120px" }}
            >
              {[
                { value: "9:16", label: "9:16", width: 32, height: 56 },
                { value: "3:4", label: "3:4", width: 42, height: 56 },
                { value: "1:1", label: "1:1", width: 56, height: 56 },
                { value: "4:3", label: "4:3", width: 56, height: 42 },
              ].map((format) => (
                <div
                  key={format.value}
                  className="flex items-center justify-center w-full h-full"
                  style={{ minHeight: "60px" }}
                >
                  <button
                    onClick={() =>
                      setSlideAspectRatio(
                        format.value as "3:4" | "4:3" | "9:16" | "1:1"
                      )
                    }
                    className="rounded-lg text-xs font-bold transition-all flex items-center justify-center flex-shrink-0 border-2"
                    style={{
                      width: `${format.width}px`,
                      height: `${format.height}px`,
                      minWidth: `${format.width}px`,
                      minHeight: `${format.height}px`,
                      maxWidth: `${format.width}px`,
                      maxHeight: `${format.height}px`,
                      backgroundColor:
                        slideAspectRatio === format.value
                          ? "#000000"
                          : "#F3F4F6",
                      color:
                        slideAspectRatio === format.value ? "#FFFFFF" : "#4B5563",
                      borderColor:
                        slideAspectRatio === format.value
                          ? "#000000"
                          : "#D1D5DB",
                    }}
                  >
                    {format.label}
                  </button>
                </div>
              ))}
            </motion.div>
            
              {/* Кнопка запуска генерации */}
              <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={async () => {
                if (activeSlideId === null) {
                  showToast({
                    type: "info",
                    message: "Сначала выберите слайд для генерации.",
                  });
                  return;
                }

                // Валидация: промпт обязателен только если не выбран сценарий (для режима "Для товара")
                if (generationMode === "for-product") {
                  if (!selectedScenario && !slidePrompt.trim()) {
                    showToast({
                      type: "info",
                      message: "Выберите сценарий или введите описание для генерации.",
                    });
                    return;
                  }
                } else {
                  // Для режима "Свободная" промпт обязателен
                  if (!slidePrompt.trim()) {
                    showToast({
                      type: "info",
                      message: "Введите описание для генерации в поле слева.",
                    });
                    return;
                  }
                }
                
                setIsGeneratingSlide(true);
                try {
                  if (generationMode === "free") {
                    // Свободная генерация - просто промпт без системных промптов
                    const response = await fetch("/api/generate-free", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        prompt: slidePrompt.trim(),
                        aspectRatio: slideAspectRatio,
                        referenceImages,
                      }),
                    });

                    if (!response.ok) {
                      const errorData = await response.json().catch(() => ({}));
                      throw new Error(errorData.error || "Ошибка при запросе к серверу");
                    }

                    const data = await response.json();

                    if (!data.success) {
                      throw new Error(data.error || "Ошибка генерации");
                    }

                    const generatedImageUrl = data.imageUrl;

                    // Сохраняем в Supabase напрямую с клиента (если пользователь авторизован)
                    await saveImageToSupabase({
                      imageUrl: generatedImageUrl,
                      prompt: slidePrompt.trim() || null,
                      aspectRatio: slideAspectRatio,
                      generationMode: "free",
                      scenario: null,
                    });

                    setSlides(slides.map(s => {
                      if (s.id === activeSlideId) {
                        // Нормализуем существующие варианты перед добавлением нового
                        const existingVariants: Variant[] = (s.variants || []).map(v => {
                          if (typeof v === 'object' && 'url' in v && 'aspectRatio' in v) {
                            return {
                              url: (v as Variant).url,
                              aspectRatio: (v as Variant).aspectRatio,
                              prompt: (v as Variant).prompt ?? s.prompt ?? "",
                            };
                          }
                          if (typeof v === 'string') {
                            // Для старых строк используем aspectRatio слайда (лучшее, что можем сделать)
                            return { url: v, aspectRatio: s.aspectRatio, prompt: s.prompt ?? "" };
                          }
                          return { url: String(v), aspectRatio: s.aspectRatio, prompt: s.prompt ?? "" };
                        });
                        
                        // Новые изображения добавляем в начало (сверху)
                        const newVariants = [{ 
                          url: generatedImageUrl, 
                          aspectRatio: slideAspectRatio,
                          prompt: slidePrompt.trim() || "",
                        }, ...existingVariants];
                        
                        return {
                          ...s,
                          variants: newVariants,
                          imageUrl: s.imageUrl || generatedImageUrl,
                          prompt: slidePrompt.trim(),
                          scenario: null,
                          aspectRatio: slideAspectRatio, // Оставляем для обратной совместимости
                        };
                      }
                      return s;
                    }));

                    setSlidePrompt("");
                    // Сбрасываем высоту textarea после небольшой задержки
                    setTimeout(() => {
                      const textarea = document.querySelector('textarea[placeholder*="Опишите"]') as HTMLTextAreaElement;
                      if (textarea) {
                        textarea.style.height = "48px";
                        textarea.style.overflowY = "hidden";
                      }
                    }, 100);
                  } else {
                    // Режим "Для товара" — генерация с коротким системным промптом и фото товара
                    if (!productPhotoPreview) {
                      showToast({
                        type: "info",
                        message: "Пожалуйста, загрузите фото товара в левой панели.",
                      });
                      setIsGeneratingSlide(false);
                      return;
                    }

                    const response = await fetch("/api/generate-for-product", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        prompt: slidePrompt.trim() || null, // Если промпт пустой, отправляем null
                        aspectRatio: slideAspectRatio,
                        scenario: selectedScenario,
                        productImage: productPhotoPreview,
                      }),
                    });

                    if (!response.ok) {
                      const errorData = await response.json().catch(() => ({}));
                      throw new Error(errorData.error || "Ошибка при запросе к серверу");
                    }

                    const data = await response.json();

                    if (!data.success) {
                      throw new Error(data.error || "Ошибка генерации");
                    }

                    const generatedImageUrl = data.imageUrl;

                    // Сохраняем в Supabase напрямую с клиента (если пользователь авторизован)
                    await saveImageToSupabase({
                      imageUrl: generatedImageUrl,
                      prompt: slidePrompt.trim() || null,
                      aspectRatio: slideAspectRatio,
                      generationMode: "for-product",
                      scenario: selectedScenario,
                    });

                    setSlides(
                      slides.map((s) => {
                        if (s.id === activeSlideId) {
                          // Нормализуем существующие варианты перед добавлением нового
                          const existingVariants: Variant[] = (s.variants || []).map(v => {
                            if (typeof v === 'object' && 'url' in v && 'aspectRatio' in v) {
                              return {
                                url: (v as Variant).url,
                                aspectRatio: (v as Variant).aspectRatio,
                                prompt: (v as Variant).prompt ?? s.prompt ?? "",
                              };
                            }
                            if (typeof v === 'string') {
                              // Для старых строк используем aspectRatio слайда (лучшее, что можем сделать)
                              return { url: v, aspectRatio: s.aspectRatio, prompt: s.prompt ?? "" };
                            }
                            return { url: String(v), aspectRatio: s.aspectRatio, prompt: s.prompt ?? "" };
                          });
                          
                          // Новые изображения добавляем в начало (сверху)
                          const newVariants = [
                            { url: generatedImageUrl, aspectRatio: slideAspectRatio, prompt: slidePrompt.trim() || "" },
                            ...existingVariants,
                          ];

                          return {
                            ...s,
                            variants: newVariants,
                            imageUrl: s.imageUrl || generatedImageUrl,
                            prompt: slidePrompt.trim() || null,
                            scenario: selectedScenario,
                            aspectRatio: slideAspectRatio, // Оставляем для обратной совместимости
                          };
                        }
                        return s;
                      })
                    );

                    setSlidePrompt("");
                    setSelectedScenario(null);
                    // Сбрасываем высоту textarea после небольшой задержки
                    setTimeout(() => {
                      const textarea = document.querySelector('textarea[placeholder*="Опишите"]') as HTMLTextAreaElement;
                      if (textarea) {
                        textarea.style.height = "48px";
                        textarea.style.overflowY = "hidden";
                      }
                    }, 100);
                  }
                } catch (error: any) {
                  // Не логируем ошибку в консоль, чтобы не показывать технические детали пользователю
                  // Для пользователя показываем понятное сообщение, без технических деталей
                  showToast({
                    type: "error",
                    title: "Не удалось сгенерировать изображение",
                    message:
                      "Ошибка на нашей стороне при генерации изображения. Пожалуйста, попробуйте ещё раз чуть позже.",
                  });
                  // Очищаем промпт даже при ошибке
                  setSlidePrompt("");
                  setTimeout(() => {
                    const textarea = document.querySelector('textarea[placeholder*="Опишите"]') as HTMLTextAreaElement;
                    if (textarea) {
                      textarea.style.height = "48px";
                      textarea.style.overflowY = "hidden";
                    }
                  }, 100);
                } finally {
                  // Убеждаемся, что анимация всегда скрывается
                  setIsGeneratingSlide(false);
                }
              }}
              disabled={isGeneratingSlide || activeSlideId === null}
              className="aspect-square h-full rounded-xl bg-[#4ADE80] flex items-center justify-center shadow-lg hover:shadow-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ minHeight: "48px", minWidth: "48px" }}
            >
              {isGeneratingSlide ? (
                <Loader2 className="w-5 h-5 animate-spin text-white" />
              ) : (
                <ArrowRight className="w-5 h-5 text-white" />
              )}
            </motion.button>
          </motion.div>
        </motion.div>
      </div>

      {/* Модальное окно для просмотра изображения */}
      <AnimatePresence>
        {viewingImage && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setViewingImage(null);
                setViewingPrompt(null);
              }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-8"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                onClick={(e) => e.stopPropagation()}
                className="relative max-w-[95vw] max-h-[95vh] flex flex-col"
              >
                <div className="flex-1 flex items-center justify-center min-h-0">
                  <img
                    src={viewingImage}
                    alt="Просмотр изображения"
                    className="max-w-full max-h-[85vh] w-auto h-auto object-contain"
                  />
                </div>
                {viewingPrompt && (
                  <div className="mt-4 px-4 pb-2 max-w-2xl mx-auto">
                    <p 
                      className="text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide"
                      style={{
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                        letterSpacing: '0.1em',
                      }}
                    >
                      Промпт
                    </p>
                    <p 
                      className="text-sm font-medium text-gray-300 leading-relaxed whitespace-pre-wrap break-words line-clamp-3"
                      style={{
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                        letterSpacing: '-0.01em',
                      }}
                      title={viewingPrompt}
                    >
                      {viewingPrompt}
                    </p>
                  </div>
                )}
                <button
                  onClick={() => {
                    setViewingImage(null);
                    setViewingPrompt(null);
                  }}
                  className="absolute top-4 right-4 w-10 h-10 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center transition-all backdrop-blur-sm"
                >
                  <X className="w-5 h-5" />
                </button>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Кнопка "Сообщить о проблеме" - фиксированная в правом нижнем углу, маленькая и неприметная */}
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
        onClick={() => setIsBugReportOpen(true)}
        className="fixed bottom-6 right-6 z-40 p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center group border border-gray-300"
        title="Сообщить о проблеме"
      >
        <Wrench className="w-4 h-4 group-hover:rotate-12 transition-transform" />
      </motion.button>

      {/* Модальное окно отчета о неполадке */}
      <BugReportModal
        isOpen={isBugReportOpen}
        onClose={() => setIsBugReportOpen(false)}
        user={user}
      />
    </div>
  );
}
