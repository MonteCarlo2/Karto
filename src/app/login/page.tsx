"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, ArrowLeft, User, Check, X } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import Image from "next/image";
import { useNotification } from "@/components/ui/notification";
import { validateDisplayName, validatePasswordForAuth } from "@/lib/auth/password-policy";

const AUTH_API_TIMEOUT_MS = 90_000;

async function fetchAuthApi(url: string, body: object): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_API_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showNotification, NotificationComponent } = useNotification();
  const [vantaEffect, setVantaEffect] = useState<any>(null);
  const vantaRef = useRef<HTMLDivElement>(null);
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [consentPersonalData, setConsentPersonalData] = useState(false);
  /** Добровольное согласие на редкие email с предложениями (отдельно от ПДн). */
  const [consentEmailMarketing, setConsentEmailMarketing] = useState(false);

  /** Подтверждение email 4-значным кодом после регистрации */
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingPassword, setPendingPassword] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendClicksUsed, setResendClicksUsed] = useState(0);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [verifyModalError, setVerifyModalError] = useState<string | null>(null);
  const maxResendClicks = 2;

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => {
      setResendCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  // Функции валидации пароля
  const checkPasswordRequirements = (pwd: string) => {
    return {
      minLength: pwd.length >= 8,
      hasUpperCase: /[A-Z]/.test(pwd),
      hasDigit: /\d/.test(pwd),
      hasLowerCase: /[a-z]/.test(pwd),
      onlyEnglish: /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]*$/.test(pwd), // Только английские буквы, цифры и спецсимволы
      noSpaces: !/\s/.test(pwd), // Без пробелов
      maxLength: pwd.length <= 128, // Максимум 128 символов
    };
  };

  const getPasswordStrength = (pwd: string): number => {
    if (!pwd) return 0;
    const requirements = checkPasswordRequirements(pwd);
    let strength = 0;
    
    // Базовая сила: минимум 8 символов
    if (requirements.minLength) strength++;
    
    // Дополнительные требования
    if (requirements.hasUpperCase) strength++;
    if (requirements.hasDigit) strength++;
    if (requirements.hasLowerCase) strength++;
    
    return Math.min(strength, 4);
  };

  const passwordRequirements = !isLogin && password ? checkPasswordRequirements(password) : null;
  const passwordStrength = !isLogin && password ? getPasswordStrength(password) : 0;

  // Валидация email
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Ошибка из URL (например после редиректа с /api/auth/yandex/callback)
  useEffect(() => {
    const err = searchParams.get("error");
    if (err) setError(decodeURIComponent(err));
  }, [searchParams]);

  // Скрываем navbar и footer на странице входа
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

  // Инициализация Vanta.js эффекта птиц через CDN
  useEffect(() => {
    if (!vantaEffect && vantaRef.current && typeof window !== "undefined") {
      let mounted = true;
      
      // Проверяем, не загружены ли скрипты уже
      const threeLoaded = !!(window as any).THREE;
      const vantaLoaded = !!(window as any).VANTA?.BIRDS;
      
      const initVanta = () => {
        if (!mounted || !vantaRef.current) return;
        
        try {
          const VANTA = (window as any).VANTA;
          if (VANTA && VANTA.BIRDS) {
            const effect = VANTA.BIRDS({
              el: vantaRef.current,
              mouseControls: true,
              touchControls: true,
              gyroControls: false,
              minHeight: 200.0,
              minWidth: 200.0,
              scale: 1.0,
              scaleMobile: 1.0,
              backgroundColor: 0xf5f3ef, // Бежевый цвет как на главном экране
              color1: 0x1F4E3D, // Фирменный зелёный
              color2: 0x2E5A43, // Фирменный зелёный (оттенок)
              birdSize: 1.4, // Увеличен размер птичек
              speedLimit: 3.0,
              quantity: 3.8, // Немного больше птичек
              wingSpan: 35.0, // Увеличен размах крыльев
              separation: 35.0, // Увеличено расстояние между птичками
              alignment: 20.0,
              cohesion: 20.0,
            });
            if (mounted) {
              setVantaEffect(effect);
            }
          }
        } catch (error) {
          console.warn("Ошибка инициализации Vanta.js:", error);
        }
      };
      
      if (threeLoaded && vantaLoaded) {
        // Скрипты уже загружены
        initVanta();
      } else {
        // Загружаем скрипты
        const script1 = document.createElement("script");
        script1.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js";
        script1.async = true;

        const script2 = document.createElement("script");
        script2.src = "https://cdn.jsdelivr.net/npm/vanta@latest/dist/vanta.birds.min.js";
        script2.async = true;

        const runAfterScript1Loaded = () => {
          script2.onload = () => {
            if (mounted) initVanta();
          };
          if (!document.head.querySelector(`script[src="${script2.src}"]`)) {
            document.head.appendChild(script2);
          } else {
            initVanta();
          }
        };

        script1.onload = () => runAfterScript1Loaded();

        if (!document.head.querySelector(`script[src="${script1.src}"]`)) {
          document.head.appendChild(script1);
        } else {
          runAfterScript1Loaded();
        }
      }
      
      return () => {
        mounted = false;
        if (vantaEffect) {
          try {
            if (typeof vantaEffect.destroy === "function") {
              vantaEffect.destroy();
            }
          } catch (e) {
            console.warn("Ошибка при уничтожении Vanta эффекта:", e);
          }
        }
      };
    }
  }, [vantaEffect]);

  // Проверка авторизации
  useEffect(() => {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        return; // Не перенаправляем, если Supabase не настроен
      }

      const supabase = createBrowserClient();
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          router.push("/");
        }
      }).catch((error) => {
        console.warn("Ошибка проверки сессии:", error);
      });
    } catch (error) {
      console.warn("Supabase не настроен:", error);
    }
  }, [router]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        setError(
          "Supabase не настроен. Добавьте NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY в .env.local"
        );
        return;
      }

      const supabase = createBrowserClient();

      if (isLogin) {
        const { data, error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInErr) {
          const code = (signInErr as { code?: string }).code;
          const msg = (signInErr.message || "").toLowerCase();
          if (
            code === "email_not_confirmed" ||
            msg.includes("email not confirmed") ||
            msg.includes("email address not confirmed")
          ) {
            setError(null);
            showNotification(
              "Этот email ещё не подтверждён. Откройте вкладку «Регистрация», введите тот же email и пароль — мы отправим код на почту; после ввода кода вы войдёте в аккаунт.",
              "info"
            );
            return;
          }
          if (msg.includes("invalid login") || msg.includes("invalid credentials")) {
            setError("Неверный email или пароль");
            return;
          }
          setError(signInErr.message || "Не удалось войти");
          return;
        }

        if (data.user) {
          router.push("/");
        }
        return;
      }

      // Регистрация
      if (!isValidEmail(email)) {
        setError("Введите корректный email адрес");
        return;
      }

      const pwdPolicy = validatePasswordForAuth(password);
      if (!pwdPolicy.ok) {
        setError(pwdPolicy.error);
        return;
      }

      const namePolicy = validateDisplayName(name);
      if (!namePolicy.ok) {
        setError(namePolicy.error);
        return;
      }

      if (password !== confirmPassword) {
        setError("Пароли не совпадают");
        return;
      }

      const regRes = await fetchAuthApi("/api/auth/register-send-code", {
        email: email.trim(),
        password,
        name: name.trim(),
        emailMarketingOptIn: consentEmailMarketing,
      });
      const regData = await regRes.json().catch(() => ({}));
      if (!regRes.ok) {
        const apiMsg =
          typeof regData.error === "string" ? regData.error : "Не удалось зарегистрироваться";
        setError(apiMsg);
        if (regRes.status >= 500) {
          showNotification(apiMsg, "error");
        }
        return;
      }

      setPendingEmail(email.trim().toLowerCase());
      setPendingPassword(password);
      setVerifyCode("");
      setResendClicksUsed(0);
      setResendCooldown(0);
      setShowVerifyModal(true);
      setError(null);
      setVerifyModalError(null);
      showNotification(
        "На вашу почту отправлен 4-значный код. Введите его в окне ниже.",
        "success"
      );
      setName("");
      setConfirmPassword("");
      setConsentPersonalData(false);
      setConsentEmailMarketing(false);
      setPassword("");
    } catch (err: unknown) {
      const isAbort =
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError");
      if (isAbort) {
        setError(
          "Сервер не ответил вовремя. Проверьте связь или попробуйте позже. Если проблема повторяется — напишите в поддержку."
        );
        return;
      }
      console.error("Ошибка входа/регистрации:", err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Failed to fetch") || msg.includes("network") || msg.includes("ERR_NAME_NOT_RESOLVED")) {
        setError("Ошибка подключения к серверу. Проверьте интернет и попробуйте снова.");
      } else {
        setError(msg || "Произошла ошибка");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = verifyCode.replace(/\D/g, "").slice(0, 4);
    if (digits.length !== 4) {
      setVerifyModalError("Введите все 4 цифры кода");
      return;
    }
    setVerifyBusy(true);
    setVerifyModalError(null);
    try {
      const res = await fetchAuthApi("/api/auth/verify-signup-code", {
        email: pendingEmail,
        password: pendingPassword,
        code: digits,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setVerifyModalError(
          typeof data.error === "string" ? data.error : "Не удалось подтвердить код"
        );
        return;
      }
      const supabase = createBrowserClient();
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: pendingEmail,
        password: pendingPassword,
      });
      if (signErr) {
        setVerifyModalError(signErr.message || "Не удалось войти");
        return;
      }
      setShowVerifyModal(false);
      setPendingPassword("");
      setVerifyCode("");
      showNotification("Добро пожаловать в KARTO!", "success");
      router.push("/");
    } catch (err: unknown) {
      const isAbort =
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError");
      setVerifyModalError(
        isAbort
          ? "Таймаут запроса. Попробуйте ещё раз."
          : err instanceof Error
            ? err.message
            : "Ошибка входа"
      );
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleResendSignupCode = async () => {
    if (resendClicksUsed >= maxResendClicks || resendCooldown > 0 || resendBusy) return;
    setResendBusy(true);
    setVerifyModalError(null);
    try {
      const res = await fetchAuthApi("/api/auth/resend-signup-code", {
        email: pendingEmail,
        password: pendingPassword,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === "COOLDOWN" && typeof data.error === "string") {
          setVerifyModalError(data.error);
        } else {
          setVerifyModalError(
            typeof data.error === "string" ? data.error : "Не удалось отправить код"
          );
        }
        return;
      }
      setResendClicksUsed((n) => n + 1);
      setResendCooldown(60);
      showNotification("Код отправлен повторно. Проверьте почту.", "success");
    } catch (err: unknown) {
      const isAbort =
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError");
      setVerifyModalError(isAbort ? "Таймаут запроса. Попробуйте ещё раз." : err instanceof Error ? err.message : "Ошибка отправки");
    } finally {
      setResendBusy(false);
    }
  };

  const closeVerifyModal = () => {
    setShowVerifyModal(false);
    setPendingPassword("");
    setVerifyCode("");
    setResendCooldown(0);
    setResendClicksUsed(0);
    setVerifyModalError(null);
    setIsLogin(true);
  };

  const handleYandexLogin = () => {
    // Вход через наш API: редирект на Яндекс → callback на /api/auth/yandex/callback → Supabase сессия
    window.location.href = "/api/auth/yandex";
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSendingReset(true);
    setError(null);

    if (!isValidEmail(forgotPasswordEmail)) {
      setError("Введите корректный email адрес");
      setIsSendingReset(false);
      return;
    }

    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.resetPasswordForEmail(forgotPasswordEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      showNotification(
        "Письмо для сброса пароля отправлено на вашу почту. Проверьте почтовый ящик.",
        "success"
      );
      setShowForgotPassword(false);
      setForgotPasswordEmail("");
    } catch (err: any) {
      console.error('Ошибка отправки письма сброса пароля:', err);
      if (err.message?.includes("rate limit") || err.message?.includes("too many")) {
        setError("Слишком много запросов. Пожалуйста, подождите несколько минут.");
      } else {
        setError("Не удалось отправить письмо. Проверьте email адрес и попробуйте снова.");
      }
      showNotification(
        "Не удалось отправить письмо для сброса пароля. Проверьте email адрес.",
        "error"
      );
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: "#f5f3ef" }} suppressHydrationWarning>
      {/* Уведомление */}
      {NotificationComponent}

      <AnimatePresence>
        {showVerifyModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="verify-email-title"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-md rounded-3xl border border-white/60 bg-white/95 p-8 shadow-2xl"
            >
              <h2 id="verify-email-title" className="text-xl font-bold text-gray-900 text-center mb-2">
                Подтвердите email
              </h2>
              <p className="text-sm text-gray-600 text-center mb-6 leading-relaxed">
                На <span className="font-medium text-gray-800">{pendingEmail}</span> отправлен{" "}
                <strong>4-значный код</strong>. Введите его ниже — после подтверждения вы сразу войдёте в аккаунт.
              </p>
              <form onSubmit={handleVerifySubmit} className="space-y-5">
                <div>
                  <label htmlFor="signup-verify-code" className="sr-only">
                    Код из письма
                  </label>
                  <input
                    id="signup-verify-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={4}
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    className="w-full text-center text-3xl font-bold tracking-[0.5em] py-4 rounded-2xl border-2 border-gray-200 focus:border-[#1F4E3D] focus:ring-2 focus:ring-[#1F4E3D]/20 outline-none font-mono text-gray-900"
                    placeholder="••••"
                    autoFocus
                  />
                </div>
                {verifyModalError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                    {verifyModalError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={verifyBusy || verifyCode.replace(/\D/g, "").length !== 4}
                  className="w-full bg-[#D1F85A] text-gray-900 py-3 h-12 rounded-2xl font-semibold text-base hover:bg-[#C5E84F] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md"
                >
                  {verifyBusy ? (
                    <div className="w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    "Подтвердить и войти"
                  )}
                </button>
              </form>
              <div className="mt-6 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleResendSignupCode}
                  disabled={
                    resendBusy ||
                    verifyBusy ||
                    resendCooldown > 0 ||
                    resendClicksUsed >= maxResendClicks
                  }
                  className="w-full py-2.5 rounded-xl text-sm font-medium text-[#1F4E3D] border border-[#1F4E3D]/30 hover:bg-[#1F4E3D]/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {resendCooldown > 0
                    ? `Отправить ещё раз через ${resendCooldown} с`
                    : resendClicksUsed >= maxResendClicks
                      ? "Повторные отправки исчерпаны"
                      : `Отправить код ещё раз (осталось ${maxResendClicks - resendClicksUsed})`}
                </button>
                <button
                  type="button"
                  onClick={closeVerifyModal}
                  className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  Закрыть и войти позже
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Фон с эффектом птиц */}
      <div ref={vantaRef} className="absolute inset-0 w-full h-full" suppressHydrationWarning />
      
      {/* Стеклянная кнопка "Назад" в левом верхнем углу */}
      <Link
        href="/"
        className="fixed top-6 left-6 z-50 w-12 h-12 rounded-full flex items-center justify-center transition-all hover:scale-110"
        style={{
          background: "rgba(255, 255, 255, 0.7)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.4)",
          boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
        }}
      >
        <ArrowLeft className="w-5 h-5 text-gray-700" />
      </Link>

      {/* Контент - две колонки как в AIORA */}
      <div className="relative z-10 min-h-screen grid grid-cols-1 lg:grid-cols-2 gap-8 px-6 lg:px-12 xl:px-16" suppressHydrationWarning>
        {/* Левая часть - приветственный текст */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
          className="flex flex-col justify-center items-start lg:items-start text-left lg:pr-8 xl:pr-12 max-w-2xl"
          suppressHydrationWarning
        >
          <div className="space-y-4" suppressHydrationWarning>
            {/* Каллиграфический текст "Добро пожаловать в" */}
            <h1 
              className="text-7xl lg:text-8xl xl:text-9xl font-normal text-gray-900 leading-none tracking-tight"
              style={{ 
                fontFamily: '"Great Vibes", "Dancing Script", cursive',
                fontWeight: 400
              }}
            >
              Добро
              <br />
              пожаловать
              <br />
              в <span className="text-[#1F4E3D] font-bold ml-8 lg:ml-12 xl:ml-16" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>KARTO</span>
            </h1>
            
            {/* Подзаголовок - более серый, serif шрифт в две строчки */}
            <div 
              className="text-xl lg:text-2xl xl:text-3xl text-gray-500 mt-5 max-w-lg leading-relaxed flex flex-col"
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif'
              }}
              suppressHydrationWarning
            >
              <span style={{ whiteSpace: 'nowrap' }}>Создавайте карточки товаров в одном потоке</span>
              <span style={{ whiteSpace: 'nowrap' }}>и экспериментируйте в Мастерской</span>
            </div>
          </div>
        </motion.div>

        {/* Правая часть - стеклянная панель с формой */}
        <div className="flex items-center justify-center lg:justify-end lg:pr-8 xl:pr-12" suppressHydrationWarning>
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="w-full max-w-md rounded-[32px] p-8"
            style={{
              background: "linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.1) 100%)",
              backdropFilter: "blur(40px)",
              WebkitBackdropFilter: "blur(40px)",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
            }}
            suppressHydrationWarning
          >
          {/* Логотип - только вверху (увеличен в 1.7 раза) */}
          <div className="flex justify-center mb-8" suppressHydrationWarning>
            <div className="relative" style={{ width: '130px', height: '130px' }} suppressHydrationWarning>
              <Image
                src="/logo-flow.png"
                alt="KARTO"
                width={130}
                height={130}
                className="object-contain"
                priority
                sizes="130px"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/logo.png";
                }}
              />
            </div>
          </div>

          {/* Табы Вход/Регистрация - прямоугольный с чуть округленными краями, узкий */}
          <div 
            className="flex gap-0.5 mb-8 rounded-lg p-0.5 relative overflow-hidden" 
            style={{
              background: "linear-gradient(135deg, rgba(240, 248, 255, 0.8) 0%, rgba(230, 240, 255, 0.7) 100%)",
            }}
            suppressHydrationWarning
          >
            <motion.div
              className="absolute inset-y-0 rounded-md bg-white shadow-sm"
              initial={false}
              animate={{
                left: isLogin ? '2px' : 'calc(50% + 1px)',
                width: 'calc(50% - 3px)',
              }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              suppressHydrationWarning
            />
            <button
              onClick={() => {
                setIsLogin(true);
                setError(null);
                setName("");
                setConfirmPassword("");
                setConsentEmailMarketing(false);
              }}
              className={`relative z-10 flex-1 py-2 px-3 rounded-md font-bold text-base transition-colors duration-300 ${
                isLogin
                  ? "text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              suppressHydrationWarning
            >
              Вход
            </button>
            <button
              onClick={() => {
                setIsLogin(false);
                setError(null);
                setName("");
                setConfirmPassword("");
                setConsentPersonalData(false);
                setConsentEmailMarketing(false);
              }}
              className={`relative z-10 flex-1 py-2 px-3 rounded-md font-bold text-base transition-colors duration-300 ${
                !isLogin
                  ? "text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              suppressHydrationWarning
            >
              Регистрация
            </button>
          </div>

          {/* Форма */}
          <form onSubmit={handleEmailLogin} className="space-y-5" suppressHydrationWarning>
            {/* Имя - только для регистрации */}
            {!isLogin && (
              <div suppressHydrationWarning>
                <div className="relative" suppressHydrationWarning>
                  <User className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required={!isLogin}
                    maxLength={16}
                    className="w-full pl-12 pr-4 py-3 h-12 text-sm border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#1F4E3D]/30 focus:border-[#1F4E3D] outline-none transition-all bg-white/60 backdrop-blur-sm"
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace' }}
                    placeholder="Имя"
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div suppressHydrationWarning>
              <div className="relative" suppressHydrationWarning>
                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={`w-full pl-12 pr-4 py-3 h-12 text-sm border rounded-2xl focus:ring-2 focus:ring-[#1F4E3D]/30 focus:border-[#1F4E3D] outline-none transition-all bg-white/60 backdrop-blur-sm ${
                    email && !isValidEmail(email) ? "border-red-300" : "border-gray-200"
                  }`}
                  style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace' }}
                  placeholder="Email"
                />
              </div>
              {email && !isValidEmail(email) && !isLogin && (
                <p className="mt-2 text-sm text-red-500">Введите корректный email адрес</p>
              )}
            </div>

            {/* Password */}
            <div suppressHydrationWarning>
              <div className="relative" suppressHydrationWarning>
                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Ограничение: только английские буквы, цифры и спецсимволы, без пробелов, максимум 128 символов
                    if (value.length <= 128 && /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]*$/.test(value) && !/\s/.test(value)) {
                      setPassword(value);
                    } else if (value.length > 128) {
                      // Если превышен лимит, просто не обновляем
                      return;
                    } else {
                      // Если есть недопустимые символы или пробелы, фильтруем их
                      const filtered = value.replace(/[^a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g, '').slice(0, 128);
                      setPassword(filtered);
                    }
                  }}
                  required
                  minLength={isLogin ? 6 : 8}
                  maxLength={128}
                  className="w-full pl-12 pr-20 py-3 h-12 text-sm border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#1F4E3D]/30 focus:border-[#1F4E3D] outline-none transition-all bg-white/60 backdrop-blur-sm"
                  style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace' }}
                  placeholder="Пароль"
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                  {isLogin && (
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-xs text-blue-600 hover:text-blue-700 transition-colors"
                    >
                      Забыли?
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Индикатор силы пароля и требования - только для регистрации */}
              {!isLogin && password && (
                <div className="mt-3 space-y-3" suppressHydrationWarning>
                  {/* Индикатор силы пароля (4 полоски) */}
                  <div className="flex gap-1" suppressHydrationWarning>
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          level <= passwordStrength
                            ? level <= 1
                              ? "bg-red-400"
                              : level <= 2
                              ? "bg-orange-400"
                              : level <= 3
                              ? "bg-yellow-400"
                              : "bg-green-500"
                            : "bg-gray-200"
                        }`}
                        suppressHydrationWarning
                      />
                    ))}
                  </div>

                  {/* Требования к паролю */}
                  <div className="space-y-2" suppressHydrationWarning>
                    <div className="flex items-center gap-2 text-sm" suppressHydrationWarning>
                      {passwordRequirements?.minLength ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <X className="w-4 h-4 text-red-500" />
                      )}
                      <span className={passwordRequirements?.minLength ? "text-gray-700" : "text-gray-500"}>
                        Минимум 8 символов
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm" suppressHydrationWarning>
                      {passwordRequirements?.hasUpperCase ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <X className="w-4 h-4 text-red-500" />
                      )}
                      <span className={passwordRequirements?.hasUpperCase ? "text-gray-700" : "text-gray-500"}>
                        Заглавная буква
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm" suppressHydrationWarning>
                      {passwordRequirements?.hasDigit ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <X className="w-4 h-4 text-red-500" />
                      )}
                      <span className={passwordRequirements?.hasDigit ? "text-gray-700" : "text-gray-500"}>
                        Цифра
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Подтвердить пароль - только для регистрации */}
            {!isLogin && (
              <div suppressHydrationWarning>
                <div className="relative" suppressHydrationWarning>
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Ограничение: только английские буквы, цифры и спецсимволы, без пробелов, максимум 128 символов
                      if (value.length <= 128 && /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]*$/.test(value) && !/\s/.test(value)) {
                        setConfirmPassword(value);
                      } else if (value.length > 128) {
                        // Если превышен лимит, просто не обновляем
                        return;
                      } else {
                        // Если есть недопустимые символы или пробелы, фильтруем их
                        const filtered = value.replace(/[^a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g, '').slice(0, 128);
                        setConfirmPassword(filtered);
                      }
                    }}
                    required={!isLogin}
                    minLength={8}
                    maxLength={128}
                    className={`w-full pl-12 pr-12 py-3 h-12 text-sm border rounded-2xl focus:ring-2 focus:ring-[#1F4E3D]/30 focus:border-[#1F4E3D] outline-none transition-all bg-white/60 backdrop-blur-sm ${
                      confirmPassword && password !== confirmPassword
                        ? "border-red-300"
                        : confirmPassword && password === confirmPassword
                        ? "border-green-300"
                        : "border-gray-200"
                    }`}
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace' }}
                    placeholder="Подтвердить пароль"
                  />
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="mt-2 text-sm text-red-500">Пароли не совпадают</p>
                )}
                {confirmPassword && password === confirmPassword && (
                  <p className="mt-2 text-sm text-green-500">Пароли совпадают</p>
                )}
              </div>
            )}

            {/* Согласие на обработку персональных данных — только для регистрации */}
            {!isLogin && (
              <label className="flex items-start gap-3 cursor-pointer group" suppressHydrationWarning>
                <input
                  type="checkbox"
                  checked={consentPersonalData}
                  onChange={(e) => setConsentPersonalData(e.target.checked)}
                  className="mt-1 w-5 h-5 rounded border-gray-300 text-[#1F4E3D] focus:ring-[#1F4E3D] focus:ring-offset-0 cursor-pointer flex-shrink-0"
                  suppressHydrationWarning
                />
                <span className="text-sm text-gray-700 leading-snug" suppressHydrationWarning>
                  Даю согласие на обработку моих персональных данных в соответствии с{" "}
                  <Link
                    href="/consent-personal-data"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#1F4E3D] font-medium underline underline-offset-2 hover:text-[#2E5A43] transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    соглашением
                  </Link>
                  .
                </span>
              </label>
            )}

            {!isLogin && (
              <label className="flex items-start gap-3 cursor-pointer group" suppressHydrationWarning>
                <input
                  type="checkbox"
                  checked={consentEmailMarketing}
                  onChange={(e) => setConsentEmailMarketing(e.target.checked)}
                  className="mt-1 w-5 h-5 rounded border-gray-300 text-[#1F4E3D] focus:ring-[#1F4E3D] focus:ring-offset-0 cursor-pointer flex-shrink-0"
                  suppressHydrationWarning
                />
                <span className="text-sm text-gray-700 leading-snug" suppressHydrationWarning>
                  Разрешаю получать на email предложения и новости KARTO (без навязчивой рекламы, не
                  чаще нескольких писем в месяц). Можно отказаться в любой момент.
                </span>
              </label>
            )}

            {/* Ошибка */}
            {error && !showVerifyModal && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            {/* Кнопка входа - салатовая */}
            <button
              type="submit"
              disabled={
                isLoading ||
                !email ||
                !password ||
                (!isLogin && (
                  !name ||
                  !confirmPassword ||
                  !consentPersonalData ||
                  !isValidEmail(email) ||
                  !passwordRequirements?.minLength ||
                  !passwordRequirements?.maxLength ||
                  !passwordRequirements?.onlyEnglish ||
                  !passwordRequirements?.noSpaces ||
                  !passwordRequirements?.hasUpperCase ||
                  !passwordRequirements?.hasLowerCase ||
                  !passwordRequirements?.hasDigit ||
                  password !== confirmPassword
                ))
              }
              className="w-full bg-[#D1F85A] text-gray-900 py-3 h-12 rounded-2xl font-semibold text-base hover:bg-[#C5E84F] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
              ) : (
                isLogin ? "Войти" : "Создать аккаунт"
              )}
            </button>
          </form>

          {/* Разделитель */}
          <div className="flex items-center gap-4 my-6" suppressHydrationWarning>
            <div className="flex-1 h-px bg-gray-300" suppressHydrationWarning />
            <span className="text-sm text-gray-500" suppressHydrationWarning>или</span>
            <div className="flex-1 h-px bg-gray-300" suppressHydrationWarning />
          </div>

          {/* Кнопка входа через Яндекс */}
          <button
            onClick={handleYandexLogin}
            disabled={isLoading}
            className="w-full bg-white border-2 border-gray-300 text-gray-700 py-2 h-11 rounded-xl font-semibold hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-sm"
            suppressHydrationWarning
          >
            <div className="w-7 h-7 flex items-center justify-center flex-shrink-0 relative">
              <Image
                src="/yandex-logo.png"
                alt="Яндекс"
                width={28}
                height={28}
                className="object-contain"
                unoptimized
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = "none";
                  const svg = target.parentElement?.querySelector(".yandex-fallback-svg") as HTMLElement;
                  if (svg) svg.style.display = "block";
                }}
              />
              {/* Fallback: логотип Яндекса «Я» (если /yandex-logo.png не загрузился) */}
              <svg
                className="yandex-fallback-svg w-6 h-6 hidden absolute inset-0 m-auto"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
              >
                <rect width="24" height="24" rx="4" fill="#FC3F1D" />
                <text x="12" y="17" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold" fontFamily="Arial, sans-serif">Я</text>
              </svg>
            </div>
            Продолжить с Яндекс
          </button>

          </motion.div>
        </div>
      </div>

      {/* Модальное окно "Забыли пароль" */}
      <AnimatePresence>
        {showForgotPassword && (
          <motion.div
            key="forgot-password-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            suppressHydrationWarning
          >
            {/* Затемнение фона */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowForgotPassword(false);
                setForgotPasswordEmail("");
                setError(null);
              }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            
            {/* Модальное окно */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md rounded-[32px] p-8"
              style={{
                background: "linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.98) 100%)",
                backdropFilter: "blur(40px)",
                WebkitBackdropFilter: "blur(40px)",
                border: "1px solid rgba(255, 255, 255, 0.3)",
                boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
              }}
            >
            {/* Кнопка закрытия */}
            <button
              onClick={() => {
                setShowForgotPassword(false);
                setForgotPasswordEmail("");
                setError(null);
              }}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Заголовок */}
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Восстановление пароля</h2>
            <p className="text-sm text-gray-600 mb-6">
              Введите email адрес, на который зарегистрирован ваш аккаунт. Мы отправим вам письмо с инструкциями по сбросу пароля.
            </p>

            {/* Форма */}
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={forgotPasswordEmail}
                    onChange={(e) => setForgotPasswordEmail(e.target.value)}
                    required
                    className={`w-full pl-12 pr-4 py-3 h-12 text-sm border rounded-2xl focus:ring-2 focus:ring-[#1F4E3D]/30 focus:border-[#1F4E3D] outline-none transition-all bg-white ${
                      forgotPasswordEmail && !isValidEmail(forgotPasswordEmail) ? "border-red-300" : "border-gray-200"
                    }`}
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace' }}
                    placeholder="Email"
                    autoFocus
                  />
                </div>
                {forgotPasswordEmail && !isValidEmail(forgotPasswordEmail) && (
                  <p className="mt-2 text-sm text-red-500">Введите корректный email адрес</p>
                )}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setForgotPasswordEmail("");
                    setError(null);
                  }}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 h-12 rounded-2xl font-semibold text-base hover:bg-gray-200 transition-all"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSendingReset || !forgotPasswordEmail || !isValidEmail(forgotPasswordEmail)}
                  className="flex-1 bg-[#1F4E3D] text-white py-3 h-12 rounded-2xl font-semibold text-base hover:bg-[#2E5A43] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSendingReset ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    "Отправить"
                  )}
                </button>
              </div>
            </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#F5F5F0] text-[#1F4E3D]">Загрузка...</div>}>
      <LoginContent />
    </Suspense>
  );
}
