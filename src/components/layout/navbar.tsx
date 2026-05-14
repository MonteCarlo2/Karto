"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Logo } from "@/components/ui/logo"
import { Button } from "@/components/ui/button"
import { Menu, X, User, LogOut } from "lucide-react"
import { UserNotificationBell } from "@/components/layout/user-notification-bell"
import { CommunityVoteModal, CommunityVoteNavButton } from "@/components/layout/community-vote-modal"
import {
  NAV_DROPDOWN_PANEL,
  NAV_MENU_DIVIDER,
  NAV_MENU_ICON_WRAP,
  NAV_MENU_ICON_WRAP_LOGOUT,
  NAV_LOGOUT_LABEL,
  NAV_MENU_ROW_LOGOUT,
  NAV_MENU_ROW_PROFILE,
  NAV_MENU_ROW_STUDIO,
  NAV_MENU_SUBTITLE,
  NAV_MENU_TITLE,
  NAV_PROFILE_LABEL,
} from "@/components/layout/nav-dropdown-classes"
import { motion, AnimatePresence } from "framer-motion"
import { createBrowserClient } from "@/lib/supabase/client"
import { useProfileUpdateBadge } from "@/hooks/use-profile-update-badge"
import { cn } from "@/lib/utils"
import {
  ProfileAvatarNewTag,
  ProfileMenuUpdateCue,
} from "@/components/layout/profile-update-cue"

export function Navbar() {
  const [isOpen, setIsOpen] = React.useState(false)
  const [user, setUser] = React.useState<any>(null)
  const [showProfileMenu, setShowProfileMenu] = React.useState(false)
  const [showStudioMenu, setShowStudioMenu] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const [subscriptionLabels, setSubscriptionLabels] = React.useState<string[]>([])
  const [communityVoteOpen, setCommunityVoteOpen] = React.useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const isHome = pathname === "/"
  const isFreeGeneration = pathname === "/studio/free"
  const { showBadge: profileUpdateBadge, dismissProfileUpdateBadge } = useProfileUpdateBadge()

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
      setSubscriptionLabels([]);
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
        if (!mounted) return;
        const s = data.subscription as
          | {
              flowsLimit?: number;
              flowsUsed?: number;
              creativeLimit?: number;
              creativeUsed?: number;
              videoTokenBalance?: number;
            }
          | null
          | undefined;
        const labels: string[] = [];
        if (s && s.flowsLimit && s.flowsLimit > 0) {
          const left = Math.max(0, s.flowsLimit - (s.flowsUsed ?? 0));
          labels.push(left === 1 ? "1 поток" : `${left} потоков`);
        }
        if (s && s.creativeLimit && s.creativeLimit > 0) {
          const left = Math.max(0, s.creativeLimit - (s.creativeUsed ?? 0));
          labels.push(left === 1 ? "1 ген." : `${left} ген.`);
        }
        const vt = Number(s?.videoTokenBalance ?? data.videoTokenBalance ?? 0);
        if (vt > 0) {
          labels.push(
            vt >= 1000
              ? `${(vt / 1000).toFixed(vt % 1000 === 0 ? 0 : 1)}k ток.`
              : `${vt} ток.`
          );
        }
        setSubscriptionLabels(labels);
      } catch {
        if (!mounted) return;
        setSubscriptionLabels([]);
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

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (pathname !== "/") return
    const hash = href.startsWith("#") ? href : href.replace(/^[^#]*/, "") || ""
    const id = hash.slice(1)
    if (!id) return
    e.preventDefault()
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
      window.history.replaceState({}, "", `/${hash}`)
    }
  }

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
                onClick={(e) => handleNavClick(e, link.href)}
                className="text-base font-medium text-foreground transition-colors hover:text-[#2E5A43]"
              >
                {link.name}
              </Link>
            ))}
          </nav>

          {/* CTA Buttons */}
          <div className="hidden md:flex items-center gap-3" suppressHydrationWarning>
            <CommunityVoteNavButton onClick={() => setCommunityVoteOpen(true)} />
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
                    className={`absolute right-0 top-full z-50 mt-2 w-[min(calc(100vw-2rem),296px)] ${NAV_DROPDOWN_PANEL}`}
                  >
                    <Link
                      href="/studio?intro=true"
                      className={NAV_MENU_ROW_STUDIO}
                      onClick={() => setShowStudioMenu(false)}
                    >
                      <span className={NAV_MENU_ICON_WRAP} aria-hidden>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className={NAV_MENU_TITLE}>Поток</div>
                        <div className={NAV_MENU_SUBTITLE}>От идеи до готовой карточки</div>
                      </div>
                    </Link>
                    <div className={NAV_MENU_DIVIDER} />
                    <Link
                      href="/studio/free"
                      className={NAV_MENU_ROW_STUDIO}
                      onClick={() => setShowStudioMenu(false)}
                    >
                      <span className={NAV_MENU_ICON_WRAP} aria-hidden>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className={NAV_MENU_TITLE}>Свободное творчество</div>
                        <div className={NAV_MENU_SUBTITLE}>Карточки без полного потока</div>
                      </div>
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {mounted && user ? (
              <div className="flex items-center gap-2" suppressHydrationWarning>
                <UserNotificationBell />
                <div className="flex items-center gap-2">
                  <div className="relative profile-menu-container">
                    <ProfileAvatarNewTag show={Boolean(mounted && user && profileUpdateBadge)}>
                      <button
                        type="button"
                        onClick={() => setShowProfileMenu(!showProfileMenu)}
                        className="relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#2E5A43] transition-colors hover:bg-[#2E5A43] hover:text-white"
                        aria-label="Меню личного кабинета"
                        title={profileUpdateBadge ? "Новое в личном кабинете" : undefined}
                      >
                        <User className="h-5 w-5 text-foreground" />
                      </button>
                    </ProfileAvatarNewTag>
                    <AnimatePresence>
                      {showProfileMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: -10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -10, scale: 0.95 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className={`absolute left-0 top-full z-50 mt-2 w-[min(calc(100vw-2rem),238px)] ${NAV_DROPDOWN_PANEL}`}
                        >
                          <Link
                            href="/profile"
                            className={cn(
                              NAV_MENU_ROW_PROFILE,
                              profileUpdateBadge && "items-start"
                            )}
                            onClick={() => {
                              dismissProfileUpdateBadge()
                              setShowProfileMenu(false)
                            }}
                          >
                            <span className={NAV_MENU_ICON_WRAP} aria-hidden>
                              <User className="h-4 w-4" strokeWidth={2} />
                            </span>
                            <div className="flex min-w-0 flex-1 flex-col items-start gap-0">
                              <span className={NAV_PROFILE_LABEL}>Личный кабинет</span>
                              {profileUpdateBadge ? <ProfileMenuUpdateCue /> : null}
                            </div>
                          </Link>
                          <button type="button" onClick={handleLogout} className={NAV_MENU_ROW_LOGOUT}>
                            <span className={NAV_MENU_ICON_WRAP_LOGOUT} aria-hidden>
                              <LogOut className="h-4 w-4" strokeWidth={2} />
                            </span>
                            <span className={NAV_LOGOUT_LABEL}>Выйти</span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  {subscriptionLabels.length > 0 && (
                    <div className="hidden sm:flex items-center gap-1.5">
                      {subscriptionLabels.map((label, i) => (
                        <span
                          key={i}
                          className="text-xs font-medium text-[#2E5A43] bg-[#2E5A43]/10 px-2.5 py-1 rounded-full border border-[#2E5A43]/30"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : mounted ? (
              <Button
                asChild
                variant="ghost"
                size="default"
                className="border border-[#84CC16]/45 bg-[#ECF7DB] text-base font-semibold tracking-tight text-neutral-900 antialiased shadow-none transition-colors hover:bg-[#dff3c4] hover:text-neutral-900"
                suppressHydrationWarning
              >
                <Link href="/login">Вход / Регистрация</Link>
              </Button>
            ) : (
              <div className="w-24 h-10" suppressHydrationWarning />
            )}
          </div>

          {/* Mobile: голосование + колокольчик — слева от кнопки меню */}
          <div className="flex items-center gap-1.5 md:hidden">
            <CommunityVoteNavButton compact onClick={() => setCommunityVoteOpen(true)} />
            {mounted && user ? <UserNotificationBell /> : null}
            <button
              className="p-2"
              onClick={() => setIsOpen(!isOpen)}
              aria-label="Toggle menu"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
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
                  onClick={(e) => {
                    handleNavClick(e, link.href)
                    setIsOpen(false)
                  }}
                  className="text-base font-medium text-muted-foreground transition-colors hover:text-foreground py-2 px-4 rounded-lg hover:bg-muted"
                >
                  {link.name}
                </Link>
              ))}
              <button
                type="button"
                className="text-left text-base font-semibold text-[#1F4E3D] py-2 px-4 rounded-lg hover:bg-[#1F4E3D]/10"
                onClick={() => {
                  setCommunityVoteOpen(true)
                  setIsOpen(false)
                }}
              >
                Что внедрим следующим?
              </button>
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
                  <div className={`ml-4 mt-2 ${NAV_DROPDOWN_PANEL}`}>
                    <Link
                      href="/studio?intro=true"
                      className={NAV_MENU_ROW_STUDIO}
                      onClick={() => {
                        setIsOpen(false);
                        setShowStudioMenu(false);
                      }}
                    >
                      <span className={NAV_MENU_ICON_WRAP} aria-hidden>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className={NAV_MENU_TITLE}>Поток</div>
                        <div className={NAV_MENU_SUBTITLE}>От идеи до готовой карточки</div>
                      </div>
                    </Link>
                    <div className={NAV_MENU_DIVIDER} />
                    <Link
                      href="/studio/free"
                      className={NAV_MENU_ROW_STUDIO}
                      onClick={() => {
                        setIsOpen(false);
                        setShowStudioMenu(false);
                      }}
                    >
                      <span className={NAV_MENU_ICON_WRAP} aria-hidden>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className={NAV_MENU_TITLE}>Свободное творчество</div>
                        <div className={NAV_MENU_SUBTITLE}>Карточки без полного потока</div>
                      </div>
                    </Link>
                  </div>
                )}
              </div>
              {mounted && user ? (
                <>
                  <Link
                    href="/profile"
                    onClick={() => {
                      dismissProfileUpdateBadge()
                      setIsOpen(false)
                    }}
                    className={cn(
                      "mt-2",
                      NAV_MENU_ROW_PROFILE,
                      profileUpdateBadge && "items-start"
                    )}
                  >
                    <span className={NAV_MENU_ICON_WRAP} aria-hidden>
                      <User className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col items-start gap-0">
                      <span className={NAV_PROFILE_LABEL}>Личный кабинет</span>
                      {profileUpdateBadge ? <ProfileMenuUpdateCue /> : null}
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      handleLogout();
                      setIsOpen(false);
                    }}
                    className={`mt-1 w-full ${NAV_MENU_ROW_LOGOUT}`}
                    suppressHydrationWarning
                  >
                    <span className={NAV_MENU_ICON_WRAP_LOGOUT} aria-hidden>
                      <LogOut className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <span className={NAV_LOGOUT_LABEL}>Выйти</span>
                  </button>
                </>
              ) : mounted ? (
                <Button
                  asChild
                  variant="ghost"
                  className="mt-2 w-full border border-[#84CC16]/45 bg-[#ECF7DB] text-base font-semibold tracking-tight text-neutral-900 antialiased shadow-none transition-colors hover:bg-[#dff3c4] hover:text-neutral-900"
                  suppressHydrationWarning
                >
                  <Link href="/login" onClick={() => setIsOpen(false)}>
                    Вход / Регистрация
                  </Link>
                </Button>
              ) : null}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      <CommunityVoteModal open={communityVoteOpen} onOpenChange={setCommunityVoteOpen} />
    </header>
  )
}
