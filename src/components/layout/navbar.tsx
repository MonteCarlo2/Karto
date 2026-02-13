"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Logo } from "@/components/ui/logo"
import { Button } from "@/components/ui/button"
import { Menu, X, User, LogOut } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { createBrowserClient } from "@/lib/supabase/client"

export function Navbar() {
  const [isOpen, setIsOpen] = React.useState(false)
  const [user, setUser] = React.useState<any>(null)
  const [showProfileMenu, setShowProfileMenu] = React.useState(false)
  const [showStudioMenu, setShowStudioMenu] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const [subscriptionLabel, setSubscriptionLabel] = React.useState<string | null>(null)
  const pathname = usePathname()
  const router = useRouter()
  const isHome = pathname === "/"
  const isFreeGeneration = pathname === "/studio/free"

  // Предотвращаем гидратацию до монтирования на клиенте
  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Проверка авторизации
  React.useEffect(() => {
    const checkUser = async () => {
      try {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user || null);
      } catch (error: any) {
        // Если Supabase не настроен, просто не показываем пользователя
        if (error.message?.includes("Supabase не настроен")) {
          console.warn("Supabase не настроен, авторизация недоступна");
        } else {
          console.warn("Ошибка проверки сессии:", error);
        }
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

  React.useEffect(() => {
    if (!user) {
      setSubscriptionLabel(null);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token || !mounted) return;
        const res = await fetch("/api/subscription", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!mounted) return;
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted || !data.subscription) return;
        const s = data.subscription;
        if (!mounted) return;
        if (s.planType === "flow") {
          const left = Math.max(0, s.flowsLimit - s.flowsUsed);
          setSubscriptionLabel(left === 1 ? "1 поток" : `${left} потоков`);
        } else {
          const left = Math.max(0, s.creativeLimit - s.creativeUsed);
          setSubscriptionLabel(left === 1 ? "1 ген." : `${left} ген.`);
        }
      } catch {
        if (!mounted) return;
        setSubscriptionLabel(null);
      }
    })();
    return () => { mounted = false; };
  }, [user]);

  // Закрытие меню профиля и мастерской при клике вне их
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showProfileMenu && !(event.target as Element).closest('.profile-menu-container')) {
        setShowProfileMenu(false);
      }
      if (showStudioMenu && !(event.target as Element).closest('.studio-menu-container')) {
        setShowStudioMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileMenu, showStudioMenu]);

  const handleLogout = async () => {
    try {
      const supabase = createBrowserClient();
      await supabase.auth.signOut();
      setUser(null);
      setShowProfileMenu(false);
      router.push("/");
    } catch (error: any) {
      if (error.message?.includes("Supabase не настроен")) {
        // Если Supabase не настроен, просто очищаем состояние
        setUser(null);
        setShowProfileMenu(false);
        router.push("/");
      } else {
        console.error("Ошибка при выходе:", error);
      }
    }
  };

  const navLinks = [
    { name: "Как это работает?", href: isHome ? "#how-it-works" : "/#how-it-works" },
    { name: "Цена", href: isHome ? "#pricing" : "/#pricing" },
    { name: "Вопросы", href: isHome ? "#faq" : "/#faq" },
  ]

  // Скрываем navbar на странице свободной генерации
  if (isFreeGeneration) {
    return null;
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full" style={{ backgroundImage: 'url(/hero-image.png)', backgroundSize: 'cover', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }}>
      <div className="container mx-auto px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <Logo />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8 flex-1 justify-center" suppressHydrationWarning>
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className="text-base font-medium text-foreground transition-colors hover:text-[#2E5A43]"
              >
                {link.name}
              </Link>
            ))}
          </nav>

          {/* CTA Buttons */}
          <div className="hidden md:flex items-center gap-4" suppressHydrationWarning>
            <div className="relative studio-menu-container" suppressHydrationWarning>
              <Button 
                variant="ghost" 
                size="default" 
                className="text-base font-medium text-foreground hover:text-[#2E5A43] hover:bg-transparent border border-[#2E5A43]"
                onClick={() => setShowStudioMenu(!showStudioMenu)}
              >
                Мастерская
              </Button>
              <AnimatePresence>
                {showStudioMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1.5 z-50"
                  >
                    <Link
                      href="/studio?intro=true"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-[#1F4E3D] transition-colors"
                      onClick={() => setShowStudioMenu(false)}
                    >
                      <svg className="w-4 h-4 text-[#1F4E3D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <div className="flex-1">
                        <div className="font-medium">Поток</div>
                        <div className="text-xs text-gray-500 mt-0.5">От идеи до готовой карточки</div>
                      </div>
                    </Link>
                    <div className="h-px bg-gray-100 mx-2 my-1" />
                    <Link
                      href="/studio/free"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-[#1F4E3D] transition-colors"
                      onClick={() => setShowStudioMenu(false)}
                    >
                      <svg className="w-4 h-4 text-[#1F4E3D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <div className="flex-1">
                        <div className="font-medium">Свободное творчество</div>
                        <div className="text-xs text-gray-500 mt-0.5">Карточки без полного потока</div>
                      </div>
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {mounted && user ? (
              <div className="relative profile-menu-container flex items-center gap-2" suppressHydrationWarning>
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-[#2E5A43] hover:bg-[#2E5A43] hover:text-white transition-colors"
                  aria-label="Профиль"
                >
                  <User className="w-5 h-5 text-foreground" />
                </button>
                {subscriptionLabel && (
                  <span className="hidden sm:inline text-xs font-medium text-[#2E5A43] bg-[#2E5A43]/10 px-2.5 py-1 rounded-full border border-[#2E5A43]/30">
                    {subscriptionLabel}
                  </span>
                )}
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
            ) : mounted ? (
              <Button asChild size="default" className="text-base font-medium bg-[#2E5A43] hover:bg-[#1e3d2d] text-white" suppressHydrationWarning>
                <Link href="/login">Попробовать</Link>
              </Button>
            ) : (
              <div className="w-24 h-10" suppressHydrationWarning />
            )}
          </div>

          {/* Mobile Nav Toggle */}
          <button
            className="md:hidden p-2"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle menu"
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-border bg-background/95 backdrop-blur-xl overflow-hidden"
          >
            <nav className="flex flex-col gap-1 px-4 py-6">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  className="text-base font-medium text-muted-foreground transition-colors hover:text-foreground py-2 px-4 rounded-lg hover:bg-muted"
                  onClick={() => setIsOpen(false)}
                >
                  {link.name}
                </Link>
              ))}
              <div className="w-full mt-2">
                <Button 
                  variant="ghost" 
                  className="w-full"
                  onClick={() => {
                    setShowStudioMenu(!showStudioMenu);
                  }}
                >
                  Мастерская
                </Button>
                {showStudioMenu && (
                  <div className="mt-2 ml-4 bg-white rounded-lg shadow-lg border border-gray-200 py-1.5">
                    <Link
                      href="/studio?intro=true"
                      className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-[#1F4E3D] transition-colors"
                      onClick={() => {
                        setIsOpen(false);
                        setShowStudioMenu(false);
                      }}
                    >
                      <svg className="w-4 h-4 text-[#1F4E3D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <div className="flex-1">
                        <div className="font-medium">Поток</div>
                        <div className="text-xs text-gray-500 mt-0.5">От идеи до готовой карточки</div>
                      </div>
                    </Link>
                    <div className="h-px bg-gray-100 mx-2 my-1" />
                    <Link
                      href="/studio/free"
                      className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-[#1F4E3D] transition-colors"
                      onClick={() => {
                        setIsOpen(false);
                        setShowStudioMenu(false);
                      }}
                    >
                      <svg className="w-4 h-4 text-[#1F4E3D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <div className="flex-1">
                        <div className="font-medium">Свободное творчество</div>
                        <div className="text-xs text-gray-500 mt-0.5">Карточки без полного потока</div>
                      </div>
                    </Link>
                  </div>
                )}
              </div>
              {mounted && user ? (
                <Button
                  onClick={() => {
                    handleLogout();
                    setIsOpen(false);
                  }}
                  className="w-full mt-2 flex items-center justify-center gap-2"
                  suppressHydrationWarning
                >
                  <LogOut className="w-4 h-4" />
                  Выйти
                </Button>
              ) : mounted ? (
                <Button asChild className="w-full mt-2" suppressHydrationWarning>
                  <Link href="/login" onClick={() => setIsOpen(false)}>
                    Попробовать
                  </Link>
                </Button>
              ) : null}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
