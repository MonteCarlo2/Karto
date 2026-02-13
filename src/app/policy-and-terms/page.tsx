"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";

export default function PolicyAndTermsPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#f5f3ef] relative" suppressHydrationWarning>
      {/* Grid pattern background */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(to right, #000 1px, transparent 1px),
            linear-gradient(to bottom, #000 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px'
        }}
        suppressHydrationWarning
      />

      <div className="relative z-10 container mx-auto px-6 py-12 max-w-4xl" suppressHydrationWarning>
        {/* Header with back button and small title */}
        <div className="flex items-start justify-between mb-12" suppressHydrationWarning>
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors group"
            suppressHydrationWarning
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span>Назад</span>
          </button>
          
          <p className="text-xs text-gray-400 uppercase tracking-wider" suppressHydrationWarning>
            ПОЛИТИКА И УСЛОВИЯ
          </p>
        </div>

        {/* Main title */}
        <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-16" suppressHydrationWarning>
          Политика и условия
        </h1>

        {/* Content sections */}
        <div className="space-y-8" suppressHydrationWarning>
          {/* УСЛОВИЯ ИСПОЛЬЗОВАНИЯ */}
          <section className="flex items-center gap-12" suppressHydrationWarning>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider w-48 flex-shrink-0" suppressHydrationWarning>
              УСЛОВИЯ ИСПОЛЬЗОВАНИЯ
            </h2>
            <div className="flex-1" suppressHydrationWarning>
              <Link
                href="/terms"
                className="group flex items-center justify-between py-4 border-b border-gray-200 hover:border-[#1F4E3D] transition-colors"
                suppressHydrationWarning
              >
                <span className="text-lg text-gray-900 group-hover:text-[#1F4E3D] transition-colors">
                  Условия использования KARTO
                </span>
                <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-[#1F4E3D] transition-colors flex-shrink-0" />
              </Link>
            </div>
          </section>

          {/* ПОЛИТИКИ */}
          <section className="flex items-start gap-12" suppressHydrationWarning>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider w-48 flex-shrink-0 pt-1" suppressHydrationWarning>
              ПОЛИТИКИ
            </h2>
            <div className="flex-1 space-y-4" suppressHydrationWarning>
              <Link
                href="/privacy"
                className="group flex items-center justify-between py-4 border-b border-gray-200 hover:border-[#1F4E3D] transition-colors"
                suppressHydrationWarning
              >
                <span className="text-lg text-gray-900 group-hover:text-[#1F4E3D] transition-colors">
                  Политика конфиденциальности
                </span>
                <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-[#1F4E3D] transition-colors flex-shrink-0" />
              </Link>

              <Link
                href="/ai-policy"
                className="group flex items-center justify-between py-4 border-b border-gray-200 hover:border-[#1F4E3D] transition-colors"
                suppressHydrationWarning
              >
                <span className="text-lg text-gray-900 group-hover:text-[#1F4E3D] transition-colors">
                  Политика использования искусственного интеллекта (AI Policy)
                </span>
                <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-[#1F4E3D] transition-colors flex-shrink-0" />
              </Link>

              <Link
                href="/data-processing"
                className="group flex items-center justify-between py-4 border-b border-gray-200 hover:border-[#1F4E3D] transition-colors"
                suppressHydrationWarning
              >
                <span className="text-lg text-gray-900 group-hover:text-[#1F4E3D] transition-colors">
                  Политика по обработке данных пользователей
                </span>
                <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-[#1F4E3D] transition-colors flex-shrink-0" />
              </Link>

              <Link
                href="/payments-policy"
                className="group flex items-center justify-between py-4 border-b border-gray-200 hover:border-[#1F4E3D] transition-colors"
                suppressHydrationWarning
              >
                <span className="text-lg text-gray-900 group-hover:text-[#1F4E3D] transition-colors">
                  Политика платежей и подписок
                </span>
                <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-[#1F4E3D] transition-colors flex-shrink-0" />
              </Link>
            </div>
          </section>

          {/* СОГЛАСИЯ */}
          <section className="flex items-start gap-12" suppressHydrationWarning>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider w-48 flex-shrink-0 pt-1" suppressHydrationWarning>
              СОГЛАСИЯ
            </h2>
            <div className="flex-1 space-y-4" suppressHydrationWarning>
              <Link
                href="/consent-personal-data"
                className="group flex items-center justify-between py-4 border-b border-gray-200 hover:border-[#1F4E3D] transition-colors"
                suppressHydrationWarning
              >
                <span className="text-lg text-gray-900 group-hover:text-[#1F4E3D] transition-colors">
                  Согласие на обработку персональных данных пользователей платформы KARTO
                </span>
                <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-[#1F4E3D] transition-colors flex-shrink-0" />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
