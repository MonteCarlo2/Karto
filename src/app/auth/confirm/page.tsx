"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

function ConfirmEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const confirmEmail = async () => {
      // Supabase автоматически обрабатывает подтверждение через URL
      // Проверяем, есть ли токен в URL (Supabase добавляет его автоматически)
      const token_hash = searchParams.get("token_hash");
      const type = searchParams.get("type");

      if (!token_hash || type !== "signup") {
        // Если нет токена, возможно это стандартная ссылка Supabase
        // Supabase обрабатывает подтверждение автоматически через redirect
        setStatus("success");
        setMessage("Email подтверждён! Перенаправление...");
        setTimeout(() => {
          router.push("/");
        }, 2000);
        return;
      }

      try {
        const supabase = createBrowserClient();
        
        // Подтверждаем email через Supabase
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash: token_hash,
          type: "signup",
        });

        if (error) {
          throw error;
        }

        if (data.user) {
          setStatus("success");
          setMessage("Email успешно подтверждён! Перенаправление...");
          setTimeout(() => {
            router.push("/");
          }, 2000);
        } else {
          setStatus("error");
          setMessage("Не удалось подтвердить email");
        }
      } catch (err: any) {
        console.error("Ошибка:", err);
        setStatus("error");
        setMessage(err.message || "Произошла ошибка при подтверждении email");
      }
    };

    confirmEmail();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f3ef] px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center"
      >
        {status === "loading" && (
          <>
            <Loader2 className="w-16 h-16 text-[#1F4E3D] animate-spin mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Подтверждение email
            </h1>
            <p className="text-gray-600">Пожалуйста, подождите...</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Email подтверждён!
            </h1>
            <p className="text-gray-600">{message}</p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Ошибка подтверждения
            </h1>
            <p className="text-gray-600 mb-4">{message}</p>
            <button
              onClick={() => router.push("/login")}
              className="bg-[#1F4E3D] text-white px-6 py-2 rounded-lg hover:bg-[#2E5A43] transition-colors"
            >
              Вернуться к входу
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}

export default function ConfirmEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#f5f3ef] px-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
            <Loader2 className="w-16 h-16 text-[#1F4E3D] animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Загрузка...</p>
          </div>
        </div>
      }
    >
      <ConfirmEmailContent />
    </Suspense>
  );
}
