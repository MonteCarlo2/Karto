"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Logo } from "@/components/ui/logo"
import { ContactQuestionModal } from "@/components/ui/contact-question-modal"
import { createBrowserClient } from "@/lib/supabase/client"

export function Footer() {
  const currentYear = 2026
  const [isContactOpen, setIsContactOpen] = useState(false)
  const [user, setUser] = useState<{ id: string; email?: string; user_metadata?: { name?: string; full_name?: string } } | null>(null)

  useEffect(() => {
    let mounted = true
    createBrowserClient()
      .auth.getSession()
      .then(({ data: { session } }) => {
        if (mounted) setUser(session?.user ?? null)
      })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  return (
    <footer className="border-t border-neutral-200 bg-[#F5F5F0] noise-texture" suppressHydrationWarning>
      <div className="container py-12 md:py-16" suppressHydrationWarning>
        <div className="grid gap-8 md:grid-cols-4 lg:grid-cols-5" suppressHydrationWarning>
          <div className="col-span-2 lg:col-span-2" suppressHydrationWarning>
            <Logo className="mb-4" />
            <p className="text-sm text-muted-foreground max-w-xs">
              Профессиональный инструмент для создания продающих карточек товара на маркетплейсах.
              Быстро, качественно, без искажений.
            </p>
          </div>

          <div suppressHydrationWarning>
            <h3 className="font-semibold mb-4">Продукт</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/#pricing" className="hover:text-foreground">Цены</Link></li>
              <li><Link href="/#how-it-works" className="hover:text-foreground">Как это работает</Link></li>
            </ul>
          </div>

          <div suppressHydrationWarning>
            <h3 className="font-semibold mb-4">Компания</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/#faq" className="hover:text-foreground">Вопросы и ответы</Link></li>
              <li><Link href="#" className="hover:text-foreground">О нас</Link></li>
              <li>
                <button type="button" onClick={() => setIsContactOpen(true)} className="hover:text-foreground text-left">
                  Контакты
                </button>
              </li>
            </ul>
          </div>

          <div suppressHydrationWarning>
            <h3 className="font-semibold mb-4">Правовая информация</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/policy-and-terms" className="hover:text-foreground">Политика и условия</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="mt-12 pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-muted-foreground" suppressHydrationWarning>
          <p>© {currentYear} KARTO. Все права защищены.</p>
        </div>
      </div>
      <ContactQuestionModal
        isOpen={isContactOpen}
        onClose={() => setIsContactOpen(false)}
        user={user}
      />
    </footer>
  )
}
