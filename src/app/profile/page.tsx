"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, 
  ArrowRight,
  Edit2, 
  Lock, 
  Mail,
  Package,
  Calendar,
  Image as ImageIcon,
  FileText,
  X,
  Eye,
  EyeOff,
  User,
  Shield,
  Check,
  Circle,
  Sparkles,
  DollarSign
} from "lucide-react";
import Image from "next/image";
import { useNotification } from "@/components/ui/notification";
import type { SubscriptionState } from "@/lib/subscription";

type Project = {
  id: string;
  createdAt: string;
  updatedAt: string;
  productName: string;
  photoUrl: string | null;
  method: string | null;
  description: string | null;
  isCompleted?: boolean;
  hasVisual?: boolean;
  hasPrice?: boolean;
  progress?: {
    hasUnderstanding: boolean;
    hasDescription: boolean;
    hasVisual: boolean;
    hasPrice: boolean;
    nextStage: "understanding" | "description" | "visual" | "price" | "results" | null;
  };
};

function ProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paymentSuccess = searchParams.get("payment") === "success";
  const { showNotification, NotificationComponent } = useNotification();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  
  // Модалки
  const [showNameModal, setShowNameModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showPasswordStep2, setShowPasswordStep2] = useState(false);
  
  // Формы
  const [newName, setNewName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [paymentSuccessPolling, setPaymentSuccessPolling] = useState(false);

  const fetchSubscription = async (): Promise<SubscriptionState | null> => {
    const supabase = createBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    const res = await fetch("/api/subscription", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.subscription || null;
  };

  useEffect(() => {
    if (!user) {
      setSubscription(null);
      return;
    }
    let mounted = true;
    (async () => {
      const sub = await fetchSubscription();
      if (!mounted) return;
      setSubscription(sub);
    })();
    return () => { mounted = false; };
  }, [user]);

  // После возврата с оплаты: подтверждаем платёж через API (данные об ожидающем платеже берутся из Supabase), затем опрашиваем подписку
  useEffect(() => {
    if (!user || !paymentSuccess) return;
    setPaymentSuccessPolling(true);
    (async () => {
      try {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        // Передаём payment_id из cookie в теле — при редиректе с ЮKassa cookie может не уйти с запросом
        let paymentId: string | null = null;
        if (typeof document !== "undefined") {
          const m = document.cookie.match(/karto_pending_payment_id=([^;]+)/);
          if (m) paymentId = decodeURIComponent(m[1].trim());
        }
        const res = await fetch("/api/payment/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify(paymentId ? { payment_id: paymentId } : {}),
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (data?.success) {
          const sub = await fetchSubscription();
          setSubscription(sub);
        }
      } catch {}
    })();
    const maxAttempts = 6;
    const intervalMs = 2000;
    let attempts = 0;
    const t = setInterval(async () => {
      attempts++;
      const sub = await fetchSubscription();
      setSubscription(sub);
      if (attempts >= maxAttempts || (sub && (sub.flowsLimit > 0 || sub.creativeLimit > 0))) {
        clearInterval(t);
        setPaymentSuccessPolling(false);
        if (typeof window !== "undefined") {
          const u = new URL(window.location.href);
          u.searchParams.delete("payment");
          window.history.replaceState({}, "", u.pathname + u.search);
        }
      }
    }, intervalMs);
    return () => clearInterval(t);
  }, [user, paymentSuccess]);

  // Функции для проверки пароля (как в login/page.tsx)
  const checkPasswordRequirements = (pwd: string) => {
    return {
      minLength: pwd.length >= 8,
      hasUpperCase: /[A-Z]/.test(pwd),
      hasDigit: /\d/.test(pwd),
      hasLowerCase: /[a-z]/.test(pwd),
      onlyEnglish: /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]*$/.test(pwd),
      noSpaces: !/\s/.test(pwd),
      maxLength: pwd.length <= 128,
    };
  };

  const getPasswordStrength = (pwd: string): number => {
    if (!pwd) return 0;
    const requirements = checkPasswordRequirements(pwd);
    let strength = 0;
    
    if (requirements.minLength) strength++;
    if (requirements.hasUpperCase) strength++;
    if (requirements.hasDigit) strength++;
    if (requirements.hasLowerCase) strength++;
    
    return Math.min(strength, 4);
  };

  const newPasswordRequirements = showPasswordStep2 && newPassword ? checkPasswordRequirements(newPassword) : null;
  const newPasswordStrength = showPasswordStep2 && newPassword ? getPasswordStrength(newPassword) : 0;

  useEffect(() => {
    const loadUser = async () => {
      try {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push("/login");
          return;
        }
        const { data: { user: fullUser } } = await supabase.auth.getUser();
        const u = fullUser || session.user;
        setUser(u);
        setNewName(u?.user_metadata?.name || u?.user_metadata?.full_name || "");
      } catch (error) {
        console.error("Ошибка загрузки пользователя:", error);
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, [router]);

  // Загружаем проекты только после того, как пользователь установлен
  useEffect(() => {
    // Проверяем, что мы на странице профиля и пользователь загружен
    if (user && !loading && typeof window !== 'undefined' && window.location.pathname === '/profile' && !projectsLoading) {
      // Добавляем небольшую задержку, чтобы дать время cookies установиться
      const timer = setTimeout(() => {
        loadProjects();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [user, loading]);

  const loadProjects = async () => {
    // Дополнительная проверка перед началом загрузки
    if (!user || loading) {
      return;
    }

    // Проверяем, что мы на странице профиля
    if (typeof window !== 'undefined' && window.location.pathname !== '/profile') {
      return;
    }

    setProjectsLoading(true);
    try {
      // Проверяем, что пользователь авторизован перед запросом
      const supabase = createBrowserClient();
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.user || !session.access_token) {
        setProjectsLoading(false);
        return;
      }
      
      // Передаем access_token через заголовок - более надежный способ
      const response = await fetch("/api/profile/get-projects", {
        method: "GET",
        credentials: "include", // Передаем cookies (на всякий случай)
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`, // Передаем токен в заголовке
        },
      });
      
      if (!response.ok) {
        // Тихая обработка ошибок - не показываем уведомления для 401
        if (response.status === 401) {
          setProjectsLoading(false);
          return;
        }
        
        // Только для других ошибок показываем уведомление
        const errorData = await response.json().catch(() => ({ error: "Неизвестная ошибка" }));
        showNotification(errorData.error || "Ошибка загрузки проектов", "error");
        setProjectsLoading(false);
        return;
      }
      
      const data = await response.json();
      
      if (data.success) {
        // Показываем все проекты (и завершенные, и незавершенные)
        setProjects(data.projects || []);
      }
    } catch (error: any) {
      // Тихая обработка ошибок - не показываем уведомления для сетевых ошибок
      // (возможно, Supabase недоступен из-за технических проблем)
    } finally {
      setProjectsLoading(false);
    }
  };

  const handleUpdateName = async () => {
    const trimmedName = newName.trim();
    
    if (!trimmedName) {
      showNotification("Имя не может быть пустым", "error");
      return;
    }

    if (trimmedName.length > 16) {
      showNotification("Имя не должно превышать 16 символов", "error");
      return;
    }

    setUpdating(true);
    try {
      const supabase = createBrowserClient();
      
      // Обновляем имя через Supabase напрямую
      const { data, error } = await supabase.auth.updateUser({
        data: {
          name: trimmedName,
        },
      });

      if (error) {
        showNotification(error.message || "Ошибка обновления имени", "error");
        setUpdating(false);
        return;
      }

      if (data.user) {
        setUser(data.user);
        setShowNameModal(false);
        showNotification("Имя успешно обновлено", "success");
      }
    } catch (error: any) {
      showNotification(error.message || "Ошибка обновления имени", "error");
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!showPasswordStep2) {
      // Шаг 1: Проверка текущего пароля
      if (!currentPassword) {
        showNotification("Введите текущий пароль", "error");
        return;
      }

      setUpdating(true);
      try {
        // Проверяем текущий пароль через попытку входа
        const supabase = createBrowserClient();
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: userEmail,
          password: currentPassword,
        });

        if (signInError) {
          showNotification("Неверный текущий пароль", "error");
          setUpdating(false);
          return;
        }

        // Если пароль правильный, переходим ко второму шагу
        setShowPasswordStep2(true);
        setUpdating(false);
      } catch (error: any) {
        showNotification(error.message || "Ошибка проверки пароля", "error");
        setUpdating(false);
      }
    } else {
      if (!newPassword || !confirmPassword) {
        showNotification("Заполните все поля", "error");
        return;
      }

      if (newPassword !== confirmPassword) {
        showNotification("Пароли не совпадают", "error");
        return;
      }

      // Проверка требований к паролю
      const requirements = checkPasswordRequirements(newPassword);
      if (!requirements.minLength) {
        showNotification("Пароль должен содержать минимум 8 символов", "error");
        return;
      }
      if (!requirements.maxLength) {
        showNotification("Пароль не должен превышать 128 символов", "error");
        return;
      }
      if (!requirements.onlyEnglish) {
        showNotification("Пароль должен содержать только английские буквы", "error");
        return;
      }
      if (!requirements.noSpaces) {
        showNotification("Пароль не должен содержать пробелы", "error");
        return;
      }
      if (!requirements.hasUpperCase) {
        showNotification("Пароль должен содержать заглавную букву", "error");
        return;
      }
      if (!requirements.hasDigit) {
        showNotification("Пароль должен содержать цифру", "error");
        return;
      }

      setUpdating(true);
      try {
        const supabase = createBrowserClient();
        
        // Обновляем пароль через Supabase
        const { error: updateError } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (updateError) {
          showNotification(updateError.message || "Ошибка обновления пароля", "error");
          setUpdating(false);
          return;
        }

        // Успешно обновлено
        setShowPasswordModal(false);
        setShowPasswordStep2(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        showNotification("Пароль успешно изменён", "success");
        setUpdating(false);
      } catch (error: any) {
        showNotification(error.message || "Ошибка обновления пароля", "error");
        setUpdating(false);
      }
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f3ef]" suppressHydrationWarning>
        <div className="w-8 h-8 border-4 border-[#1F4E3D] border-t-transparent rounded-full animate-spin" suppressHydrationWarning />
      </div>
    );
  }

  const userName = user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Пользователь";
  const userEmail = user?.email || "";

  const handleLogout = async () => {
    try {
      const supabase = createBrowserClient();
      await supabase.auth.signOut();
      router.push("/");
    } catch (error) {
      console.error("Ошибка при выходе:", error);
      showNotification("Ошибка при выходе", "error");
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f3ef] pb-20" suppressHydrationWarning>
      {NotificationComponent}
      
      {/* Кнопка "Назад" */}
      <div className="container mx-auto px-6 pt-6" suppressHydrationWarning>
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors mb-6"
          suppressHydrationWarning
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Назад</span>
        </button>
      </div>

      <div className="container mx-auto px-6 max-w-6xl pt-8 md:pt-12" suppressHydrationWarning>
        {/* Приветствие - по центру, большая надпись */}
        <div className="text-center mb-8 mt-4" suppressHydrationWarning>
          <h1
            className="text-5xl md:text-6xl font-bold text-gray-900 mb-2"
            style={{ 
              fontFamily: "'Great Vibes', cursive", 
              textShadow: "0 2px 8px rgba(0,0,0,0.15), 0 0 2px rgba(0,0,0,0.1)" 
            }}
            suppressHydrationWarning
          >
            Добро пожаловать,
          </h1>
          <p 
            className="text-6xl md:text-7xl font-semibold text-gray-900"
            style={{ 
              fontFamily: "'Great Vibes', cursive",
              textShadow: "0 2px 8px rgba(0,0,0,0.15), 0 0 2px rgba(0,0,0,0.1)"
            }}
            suppressHydrationWarning
          >
            {userName}
          </p>
        </div>

        {/* Основной контент: две колонки */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" suppressHydrationWarning>
          {/* Левая колонка: Мои потоки (Проекты) */}
          <div className="lg:col-span-1" suppressHydrationWarning>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white/80 backdrop-blur-xl rounded-2xl p-5 shadow-xl h-fit"
              style={{
                border: "1px solid rgba(255, 255, 255, 0.3)",
              }}
              suppressHydrationWarning
            >
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Package className="w-5 h-5 text-[#1F4E3D]" />
                  Мои потоки
                </h3>
                <span className="text-xs font-semibold text-[#1F4E3D] bg-green-50 px-2.5 py-1 rounded-full border border-green-200">
                  {projects.length}
                </span>
              </div>

              {projectsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-3 border-[#1F4E3D] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : projects.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#1F4E3D] to-[#2E5A43] flex items-center justify-center">
                    <Package className="w-8 h-8 text-white" />
                  </div>
                  <p className="text-sm text-gray-600 mb-5 font-medium">У вас пока нет проектов</p>
                  <button
                    onClick={() => router.push("/studio")}
                    className="px-6 py-3 bg-[#1F4E3D] text-white rounded-xl hover:bg-[#2E5A43] transition-all shadow-lg hover:shadow-xl text-sm font-semibold"
                  >
                    Создать первый проект
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
                  {(() => {
                    // Сортируем проекты: незавершенные сверху, затем завершенные
                    const sortedProjects = [...projects].sort((a, b) => {
                      // Незавершенные идут первыми
                      if (!a.isCompleted && b.isCompleted) return -1;
                      if (a.isCompleted && !b.isCompleted) return 1;
                      // Внутри каждой группы сортируем по дате обновления (новые сверху)
                      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
                    });
                    
                    if (sortedProjects.length === 0) {
                      return (
                        <div className="text-center py-10 px-4">
                          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#1F4E3D] to-[#2E5A43] flex items-center justify-center">
                            <Package className="w-8 h-8 text-white" />
                          </div>
                          <p className="text-sm text-gray-600 mb-5 font-medium">У вас пока нет проектов</p>
                          <button
                            onClick={() => router.push("/studio")}
                            className="px-6 py-3 bg-[#1F4E3D] text-white rounded-xl hover:bg-[#2E5A43] transition-all shadow-lg hover:shadow-xl text-sm font-semibold"
                          >
                            Создать первый проект
                          </button>
                        </div>
                      );
                    }
                    
                    return sortedProjects.map((project) => {
                      // Определяем следующий этап для незавершенных потоков
                      const getNextStageRoute = (nextStage: string | null): string => {
                        switch (nextStage) {
                          case "understanding":
                            return "/studio/understanding";
                          case "description":
                            return "/studio/description";
                          case "visual":
                            return "/studio/visual";
                          case "price":
                            return "/studio/price";
                          case "results":
                            return "/studio/results";
                          default:
                            return "/studio/understanding";
                        }
                      };
                      
                      const handleProjectClick = () => {
                        // Сохраняем session_id в localStorage
                        localStorage.setItem("karto_session_id", project.id);
                        
                        if (project.isCompleted) {
                          // Завершенный поток - переходим к результатам
                          router.push("/studio/results");
                        } else {
                          // Незавершенный поток - продолжаем с нужного этапа
                          const nextStage = project.progress?.nextStage || "understanding";
                          router.push(getNextStageRoute(nextStage));
                        }
                      };
                      
                      // Определяем текст статуса для незавершенных потоков
                      const getStatusText = (): string => {
                        if (project.isCompleted) return "";
                        const progress = project.progress;
                        if (!progress) return "Начать";
                        
                        if (!progress.hasUnderstanding) return "Начать";
                        if (!progress.hasDescription) return "Продолжить: Описание";
                        if (!progress.hasVisual) return "Продолжить: Визуал";
                        if (!progress.hasPrice) return "Продолжить: Цена";
                        return "Продолжить";
                      };
                      
                      return (
                        <motion.div
                          key={project.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-white rounded-lg p-2.5 border border-gray-200 hover:border-[#1F4E3D] hover:shadow-md transition-all cursor-pointer group flex gap-2.5 items-start"
                          onClick={handleProjectClick}
                        >
                          {/* Компактная квадратная миниатюра */}
                          {project.photoUrl ? (
                            <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 shadow-sm relative flex-shrink-0">
                              <Image
                                src={project.photoUrl}
                                alt={project.productName}
                                width={64}
                                height={64}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                              />
                              {/* Индикатор завершенности - маленький */}
                              {project.isCompleted && (
                                <div className="absolute top-1 right-1 w-4 h-4 bg-[#1F4E3D] rounded-full flex items-center justify-center shadow-sm">
                                  <Check className="w-2.5 h-2.5 text-white" />
                                </div>
                              )}
                              {/* Индикатор незавершенности */}
                              {!project.isCompleted && (
                                <div className="absolute top-1 right-1 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center shadow-sm">
                                  <div className="w-2 h-2 bg-white rounded-full" />
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="w-16 h-16 rounded-lg bg-gray-100 shadow-sm relative flex-shrink-0 flex items-center justify-center">
                              <Package className="w-6 h-6 text-gray-400" />
                              {!project.isCompleted && (
                                <div className="absolute top-1 right-1 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center shadow-sm">
                                  <div className="w-2 h-2 bg-white rounded-full" />
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* Информация о проекте */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h4 className="text-sm font-semibold text-gray-900 line-clamp-2 group-hover:text-[#1F4E3D] transition-colors leading-tight flex-1">
                                {project.productName}
                              </h4>
                              {!project.isCompleted && (
                                <span className="text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200 flex-shrink-0 whitespace-nowrap">
                                  НЕ ЗАВЕРШЁН
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
                              <Calendar className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{formatDate(project.createdAt)}</span>
                            </div>
                            
                            {/* Индикатор прогресса по этапам */}
                            {!project.isCompleted && project.progress && (
                              <div className="flex items-center gap-1.5 mb-1">
                                {/* Этап 1: Понимание */}
                                <div className="flex items-center gap-0.5" title="Понимание">
                                  {project.progress.hasUnderstanding ? (
                                    <Check className="w-3 h-3 text-green-600" />
                                  ) : (
                                    <Circle className="w-3 h-3 text-gray-300" />
                                  )}
                                </div>
                                
                                {/* Этап 2: Описание */}
                                <div className="flex items-center gap-0.5" title="Описание">
                                  {project.progress.hasDescription ? (
                                    <Check className="w-3 h-3 text-green-600" />
                                  ) : (
                                    <Circle className="w-3 h-3 text-gray-300" />
                                  )}
                                </div>
                                
                                {/* Этап 3: Визуал */}
                                <div className="flex items-center gap-0.5" title="Визуал">
                                  {project.progress.hasVisual ? (
                                    <Check className="w-3 h-3 text-green-600" />
                                  ) : (
                                    <Circle className="w-3 h-3 text-gray-300" />
                                  )}
                                </div>
                                
                                {/* Этап 4: Цена */}
                                <div className="flex items-center gap-0.5" title="Цена">
                                  {project.progress.hasPrice ? (
                                    <Check className="w-3 h-3 text-green-600" />
                                  ) : (
                                    <Circle className="w-3 h-3 text-gray-300" />
                                  )}
                                </div>
                                
                                {/* Текст статуса */}
                                <span className="text-xs text-orange-600 font-medium ml-1">
                                  {getStatusText()}
                                </span>
                              </div>
                            )}
                            
                            {/* Для завершенных проектов показываем только дату */}
                            {project.isCompleted && (
                              <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
                                <Check className="w-3 h-3" />
                                <span>Завершён</span>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    });
                  })()}
                </div>
              )}
            </motion.div>
          </div>

          {/* Правая колонка: Информация об аккаунте */}
          <div className="lg:col-span-2" suppressHydrationWarning>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 shadow-xl"
              style={{
                border: "1px solid rgba(255, 255, 255, 0.3)",
              }}
              suppressHydrationWarning
            >
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Мой аккаунт</h2>
              <p className="text-gray-600 mb-6 -mt-4">Управляйте информацией вашего аккаунта.</p>

              {/* После оплаты: сообщение об обновлении данных */}
              {paymentSuccessPolling && (
                <div className="mb-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
                  Оплата прошла. Обновляем данные…
                </div>
              )}

              {/* Ваши услуги */}
              {subscription && (subscription.flowsLimit > 0 || subscription.creativeLimit > 0) && (
                <div className="mb-6 p-4 rounded-xl bg-[#F5F5F0] border border-[#2E5A43]/20">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-[#2E5A43]" />
                    Ваши услуги
                  </h3>
                  <div className="space-y-1">
                    {subscription.flowsLimit > 0 && (
                      <p className="text-sm text-gray-800">
                        Поток: осталось <strong>{Math.max(0, subscription.flowsLimit - subscription.flowsUsed)}</strong> из {subscription.flowsLimit}.
                      </p>
                    )}
                    {subscription.creativeLimit > 0 && (
                      <p className="text-sm text-gray-800">
                        Свободное творчество: осталось <strong>{Math.max(0, subscription.creativeLimit - subscription.creativeUsed)}</strong> из {subscription.creativeLimit} генераций.
                      </p>
                    )}
                  </div>
                  <Link href="/#pricing" className="text-xs text-[#2E5A43] hover:underline mt-1 inline-block">Сменить тариф</Link>
                </div>
              )}

              {/* Основная информация */}
              <div className="space-y-5">
                {/* Полное имя */}
                <div className="flex items-center justify-between py-4 border-b border-gray-200">
                  <div className="flex-1">
                    <p className="text-sm text-gray-500 mb-1">Полное имя</p>
                    <p className="text-lg font-medium text-gray-900">{userName}</p>
                  </div>
                  <button
                    onClick={() => {
                      setNewName(userName);
                      setShowNameModal(true);
                    }}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <Edit2 className="w-4 h-4" />
                    Изменить имя
                  </button>
                </div>

                {/* Email */}
                <div className="flex items-center justify-between py-4 border-b border-gray-200">
                  <div className="flex-1">
                    <p className="text-sm text-gray-500 mb-1">Электронная почта</p>
                    <p className="text-lg font-medium text-gray-900">{userEmail}</p>
                  </div>
                  <div className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm font-medium flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    Активен
                  </div>
                </div>

                {/* Пароль */}
                <div className="flex items-center justify-between py-4 border-b border-gray-200">
                  <div className="flex-1">
                    <p className="text-sm text-gray-500 mb-1">Пароль</p>
                    <p className="text-lg font-medium text-gray-900">••••••••</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowPasswordModal(true);
                      setShowPasswordStep2(false);
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <Lock className="w-4 h-4" />
                    Изменить пароль
                  </button>
                </div>

                {/* Способы входа */}
                <div className="py-4 border-t border-gray-200 mt-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">Способы входа</h3>
                  <p className="text-xs text-gray-500 mb-4">Управляйте способами входа в KARTO.</p>
                  
                  <div className="space-y-3">
                    {/* Яндекс: всегда показываем логотип; созданный через callback хранит provider в user_metadata */}
                    <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 flex items-center justify-center shrink-0 relative">
                          <Image
                            src="/yandex-logo.png"
                            alt="Яндекс"
                            width={32}
                            height={32}
                            className="object-contain"
                            unoptimized
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = "none";
                              const svg = target.parentElement?.querySelector(".yandex-fallback-svg") as HTMLElement;
                              if (svg) svg.style.display = "block";
                            }}
                          />
                          <svg
                            className="yandex-fallback-svg w-8 h-8 hidden absolute inset-0 m-auto"
                            viewBox="0 0 32 32"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            aria-hidden
                          >
                            <rect width="32" height="32" rx="4" fill="#FC3F1D" />
                            <text x="16" y="23" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold" fontFamily="Arial, sans-serif">Я</text>
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">Яндекс</p>
                          <p className="text-xs text-gray-500">
                            {user?.user_metadata?.provider === 'yandex' ||
                             user?.app_metadata?.provider === 'yandex' ||
                             user?.identities?.some((id: any) => id.provider === 'yandex')
                             ? "Подключен" : "Подключите аккаунт Яндекс"}
                          </p>
                        </div>
                      </div>
                      {user?.user_metadata?.provider === 'yandex' ||
                       user?.app_metadata?.provider === 'yandex' ||
                       user?.identities?.some((id: any) => id.provider === 'yandex') ? (
                        <div className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-medium flex items-center gap-1.5">
                          <div className="w-2 h-2 bg-green-500 rounded-full" />
                          Активен
                        </div>
                      ) : (
                        <button
                          onClick={() => router.push("/login")}
                          className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded-lg text-xs font-medium transition-colors"
                        >
                          Подключить
                        </button>
                      )}
                    </div>

                    {/* Email */}
                    <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <Mail className="w-8 h-8 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">Электронная почта</p>
                          <p className="text-xs text-gray-500">{userEmail}</p>
                        </div>
                      </div>
                      <div className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-medium flex items-center gap-1.5">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        Активен
                      </div>
                    </div>
                  </div>
                </div>

                {/* Выход из аккаунта */}
                <div className="pt-4 border-t border-gray-200 mt-4">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Выход из аккаунта</h3>
                      <p className="text-xs text-gray-500 mt-0.5">Завершить текущую сессию.</p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="px-3 py-2 bg-white hover:bg-red-50 text-red-600 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 border-2 border-red-200 hover:border-red-300 shrink-0"
                    >
                      <ArrowRight className="w-4 h-4" />
                      Выйти
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Модалка: Изменить имя */}
      <AnimatePresence>
        {showNameModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onMouseDown={(e) => {
              // Закрываем только при клике на фон, не на модалку
              if (e.target === e.currentTarget) {
                setShowNameModal(false);
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onMouseDown={(e) => {
                // Предотвращаем закрытие модалки при любом клике внутри
                e.stopPropagation();
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Изменить имя</h2>
                <button
                  onClick={() => setShowNameModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <p className="text-gray-600 mb-6">
                Введите новое имя для вашего аккаунта.
              </p>
              <input
                type="text"
                value={newName}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.length <= 16) {
                    setNewName(value);
                  }
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#1F4E3D] focus:border-transparent outline-none mb-2"
                placeholder="Введите имя"
                maxLength={16}
              />
              <p className="text-xs text-gray-500 mb-6">
                {newName.length}/16 символов
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowNameModal(false)}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={handleUpdateName}
                  disabled={updating || !newName.trim()}
                  className="flex-1 px-4 py-3 bg-[#1F4E3D] hover:bg-[#2E5A43] text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updating ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Модалка: Изменить пароль */}
      <AnimatePresence>
        {showPasswordModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onMouseDown={(e) => {
              // Закрываем только при клике на фон, не на модалку
              if (e.target === e.currentTarget) {
                setShowPasswordModal(false);
                setShowPasswordStep2(false);
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onMouseDown={(e) => {
                // Предотвращаем закрытие модалки при любом клике внутри
                e.stopPropagation();
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Изменить пароль</h2>
                <button
                  onClick={() => {
                    setShowPasswordModal(false);
                    setShowPasswordStep2(false);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {!showPasswordStep2 ? (
                <>
                  <p className="text-gray-600 mb-6">
                    Для безопасности сначала подтвердите текущий пароль.
                  </p>
                  <div className="relative mb-6">
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#1F4E3D] focus:border-transparent outline-none pr-12"
                      placeholder="Введите текущий пароль"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowPasswordModal(false);
                        setShowPasswordStep2(false);
                      }}
                      className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={handleUpdatePassword}
                      disabled={updating || !currentPassword}
                      className="flex-1 px-4 py-3 bg-[#1F4E3D] hover:bg-[#2E5A43] text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {updating ? "Проверка..." : "Продолжить"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-gray-600 mb-6">
                    Введите новый пароль.
                  </p>
                  <div className="space-y-4 mb-6">
                    <div className="relative">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Ограничение: только английские буквы, цифры и спецсимволы, без пробелов, максимум 128 символов
                          if (value.length <= 128 && /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]*$/.test(value) && !/\s/.test(value)) {
                            setNewPassword(value);
                          } else if (value.length > 128) {
                            return;
                          } else {
                            const filtered = value.replace(/[^a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g, '').slice(0, 128);
                            setNewPassword(filtered);
                          }
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                        }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#1F4E3D] focus:border-transparent outline-none pr-12"
                        placeholder="Новый пароль"
                        minLength={8}
                        maxLength={128}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>

                    {/* Индикатор силы пароля и требования */}
                    {newPassword && (
                      <div className="space-y-3 bg-gray-50 rounded-xl p-4">
                        {/* Индикатор силы пароля (4 полоски) */}
                        <div className="flex gap-1">
                          {[1, 2, 3, 4].map((level) => (
                            <div
                              key={level}
                              className={`h-1.5 flex-1 rounded-full transition-colors ${
                                level <= newPasswordStrength
                                  ? level <= 1
                                    ? "bg-red-400"
                                    : level <= 2
                                    ? "bg-orange-400"
                                    : level <= 3
                                    ? "bg-yellow-400"
                                    : "bg-green-500"
                                  : "bg-gray-200"
                              }`}
                            />
                          ))}
                        </div>

                        {/* Требования к паролю */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            {newPasswordRequirements?.minLength ? (
                              <Check className="w-4 h-4 text-green-500" />
                            ) : (
                              <X className="w-4 h-4 text-red-500" />
                            )}
                            <span className={newPasswordRequirements?.minLength ? "text-gray-700" : "text-gray-500"}>
                              Минимум 8 символов
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            {newPasswordRequirements?.hasUpperCase ? (
                              <Check className="w-4 h-4 text-green-500" />
                            ) : (
                              <X className="w-4 h-4 text-red-500" />
                            )}
                            <span className={newPasswordRequirements?.hasUpperCase ? "text-gray-700" : "text-gray-500"}>
                              Заглавная буква
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            {newPasswordRequirements?.hasDigit ? (
                              <Check className="w-4 h-4 text-green-500" />
                            ) : (
                              <X className="w-4 h-4 text-red-500" />
                            )}
                            <span className={newPasswordRequirements?.hasDigit ? "text-gray-700" : "text-gray-500"}>
                              Цифра
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Ограничение: только английские буквы, цифры и спецсимволы, без пробелов, максимум 128 символов
                          if (value.length <= 128 && /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]*$/.test(value) && !/\s/.test(value)) {
                            setConfirmPassword(value);
                          } else if (value.length > 128) {
                            return;
                          } else {
                            const filtered = value.replace(/[^a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g, '').slice(0, 128);
                            setConfirmPassword(filtered);
                          }
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                        }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-[#1F4E3D] focus:border-transparent outline-none pr-12 ${
                          confirmPassword && newPassword !== confirmPassword
                            ? "border-red-300"
                            : confirmPassword && newPassword === confirmPassword
                            ? "border-green-300"
                            : "border-gray-300"
                        }`}
                        placeholder="Подтвердите пароль"
                        minLength={8}
                        maxLength={128}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    {confirmPassword && newPassword !== confirmPassword && (
                      <p className="text-sm text-red-500">Пароли не совпадают</p>
                    )}
                    {confirmPassword && newPassword === confirmPassword && (
                      <p className="text-sm text-green-500">Пароли совпадают</p>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowPasswordStep2(false)}
                      className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
                    >
                      Назад
                    </button>
                    <button
                      onClick={handleUpdatePassword}
                      disabled={
                        updating || 
                        !newPassword || 
                        !confirmPassword || 
                        newPassword !== confirmPassword ||
                        !newPasswordRequirements?.minLength ||
                        !newPasswordRequirements?.hasUpperCase ||
                        !newPasswordRequirements?.hasDigit
                      }
                      className="flex-1 px-4 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {updating ? "Сохранение..." : "Сохранить"}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">Загрузка...</div>}>
      <ProfileContent />
    </Suspense>
  );
}
