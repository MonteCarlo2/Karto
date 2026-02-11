"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Lock, Eye, EyeOff, ArrowLeft, Check, X } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import Image from "next/image";
import { useNotification } from "@/components/ui/notification";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showNotification, NotificationComponent } = useNotification();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Функции валидации пароля
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

  const passwordRequirements = password ? checkPasswordRequirements(password) : null;
  const passwordStrength = password ? getPasswordStrength(password) : 0;

  // Скрываем navbar и footer на странице
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

  // Обработка токена из URL при загрузке страницы
  useEffect(() => {
    const handleTokenVerification = async () => {
      const token_hash = searchParams.get("token_hash");
      const type = searchParams.get("type");

      // Если есть токен в URL, верифицируем его
      if (token_hash && type === "recovery") {
        try {
          const supabase = createBrowserClient();
          const { error } = await supabase.auth.verifyOtp({
            token_hash: token_hash,
            type: "recovery",
          });

          if (error) {
            setError("Ссылка для сброса пароля устарела или недействительна. Пожалуйста, запросите новую ссылку.");
          }
          // Если успешно, сессия установлена и можно обновлять пароль
        } catch (err: any) {
          console.error("Ошибка верификации токена:", err);
          setError("Не удалось проверить ссылку для сброса пароля.");
        }
      }
    };

    handleTokenVerification();
  }, [searchParams]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Валидация пароля
    const requirements = checkPasswordRequirements(password);
    if (!requirements.minLength) {
      setError("Пароль должен содержать минимум 8 символов");
      setIsLoading(false);
      return;
    }
    if (!requirements.maxLength) {
      setError("Пароль не должен превышать 128 символов");
      setIsLoading(false);
      return;
    }
    if (!requirements.onlyEnglish) {
      setError("Пароль должен содержать только английские буквы");
      setIsLoading(false);
      return;
    }
    if (!requirements.noSpaces) {
      setError("Пароль не должен содержать пробелы");
      setIsLoading(false);
      return;
    }
    if (!requirements.hasUpperCase) {
      setError("Пароль должен содержать заглавную букву");
      setIsLoading(false);
      return;
    }
    if (!requirements.hasDigit) {
      setError("Пароль должен содержать цифру");
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Пароли не совпадают");
      setIsLoading(false);
      return;
    }

    try {
      const supabase = createBrowserClient();
      
      // Обновляем пароль через Supabase
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      setIsSuccess(true);
      showNotification(
        "Пароль успешно изменён! Теперь вы можете войти с новым паролем.",
        "success"
      );

      // Перенаправляем на страницу входа через 2 секунды
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (err: any) {
      console.error("Ошибка сброса пароля:", err);
      
      if (err.message?.includes("session") || err.message?.includes("expired")) {
        setError("Ссылка для сброса пароля устарела или недействительна. Пожалуйста, запросите новую ссылку.");
      } else {
        setError(err.message || "Произошла ошибка при сбросе пароля. Попробуйте ещё раз.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: "#f5f3ef" }} suppressHydrationWarning>
      {/* Уведомление */}
      {NotificationComponent}
      
      {/* Стеклянная кнопка "Назад" в левом верхнем углу */}
      <Link
        href="/login"
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

      {/* Контент */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-6" suppressHydrationWarning>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
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
          {/* Логотип */}
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

          {isSuccess ? (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Пароль успешно изменён!</h2>
              <p className="text-gray-600">
                Вы будете перенаправлены на страницу входа...
              </p>
            </div>
          ) : (
            <>
              {/* Заголовок */}
              <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Создание нового пароля</h2>
              <p className="text-sm text-gray-600 mb-6 text-center">
                Введите новый пароль для вашего аккаунта
              </p>

              {/* Форма */}
              <form onSubmit={handleResetPassword} className="space-y-5" suppressHydrationWarning>
                {/* Новый пароль */}
                <div suppressHydrationWarning>
                  <div className="relative" suppressHydrationWarning>
                    <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value.length <= 128 && /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]*$/.test(value) && !/\s/.test(value)) {
                          setPassword(value);
                        } else if (value.length > 128) {
                          return;
                        } else {
                          const filtered = value.replace(/[^a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g, '').slice(0, 128);
                          setPassword(filtered);
                        }
                      }}
                      required
                      minLength={8}
                      maxLength={128}
                      className="w-full pl-12 pr-12 py-3 h-12 text-sm border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#1F4E3D]/30 focus:border-[#1F4E3D] outline-none transition-all bg-white/60 backdrop-blur-sm"
                      style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace' }}
                      placeholder="Новый пароль"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>

                  {/* Индикатор силы пароля и требования */}
                  {password && (
                    <div className="mt-3 space-y-3" suppressHydrationWarning>
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

                {/* Подтверждение пароля */}
                <div suppressHydrationWarning>
                  <div className="relative" suppressHydrationWarning>
                    <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value.length <= 128 && /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]*$/.test(value) && !/\s/.test(value)) {
                          setConfirmPassword(value);
                        } else if (value.length > 128) {
                          return;
                        } else {
                          const filtered = value.replace(/[^a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g, '').slice(0, 128);
                          setConfirmPassword(filtered);
                        }
                      }}
                      required
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
                      placeholder="Подтвердите пароль"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p className="mt-2 text-sm text-red-500">Пароли не совпадают</p>
                  )}
                  {confirmPassword && password === confirmPassword && (
                    <p className="mt-2 text-sm text-green-500">Пароли совпадают</p>
                  )}
                </div>

                {/* Ошибка */}
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                    {error}
                  </div>
                )}

                {/* Кнопка сброса пароля */}
                <button
                  type="submit"
                  disabled={
                    isLoading ||
                    !password ||
                    !confirmPassword ||
                    !passwordRequirements?.minLength ||
                    !passwordRequirements?.hasUpperCase ||
                    !passwordRequirements?.hasDigit ||
                    password !== confirmPassword
                  }
                  className="w-full bg-[#1F4E3D] text-white py-3 h-12 rounded-2xl font-semibold text-base hover:bg-[#2E5A43] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    "Изменить пароль"
                  )}
                </button>
              </form>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
