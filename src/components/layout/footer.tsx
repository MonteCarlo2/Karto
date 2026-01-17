"use client"

import Link from "next/link"
import { Logo } from "@/components/ui/logo"

export function Footer() {
  // Используем фиксированный год для избежания hydration mismatch
  const currentYear = 2026;
  
  return (
    <footer className="border-t border-border bg-muted/50">
      <div className="container py-12 md:py-16">
        <div className="grid gap-8 md:grid-cols-4 lg:grid-cols-5">
          <div className="col-span-2 lg:col-span-2">
            <Logo className="mb-4" />
            <p className="text-sm text-muted-foreground max-w-xs">
              Профессиональный инструмент для создания продающих карточек товара на маркетплейсах.
              Быстро, качественно, без искажений.
            </p>
          </div>
          
          <div>
            <h3 className="font-semibold mb-4">Продукт</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/pricing" className="hover:text-foreground">Цены</Link></li>
              <li><Link href="/studio" className="hover:text-foreground">Студия</Link></li>
              <li><Link href="/#how-it-works" className="hover:text-foreground">Как это работает</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Компания</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/#faq" className="hover:text-foreground">Вопросы и ответы</Link></li>
              <li><Link href="#" className="hover:text-foreground">О нас</Link></li>
              <li><Link href="#" className="hover:text-foreground">Контакты</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Правовая информация</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/privacy" className="hover:text-foreground">Политика конфиденциальности</Link></li>
              <li><Link href="/terms" className="hover:text-foreground">Условия использования</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="mt-12 pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-muted-foreground">
          <p>© {currentYear} KARTO. Все права защищены.</p>
        </div>
      </div>
    </footer>
  )
}
