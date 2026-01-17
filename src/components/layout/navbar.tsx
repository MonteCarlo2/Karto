"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Logo } from "@/components/ui/logo"
import { Button } from "@/components/ui/button"
import { Menu, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

export function Navbar() {
  const [isOpen, setIsOpen] = React.useState(false)
  const pathname = usePathname()
  const isHome = pathname === "/"

  const navLinks = [
    { name: "Как это работает?", href: isHome ? "#how-it-works" : "/#how-it-works" },
    { name: "Цена", href: "/pricing" },
    { name: "Вопросы", href: isHome ? "#faq" : "/#faq" },
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full" style={{ backgroundImage: 'url(/hero-image.png)', backgroundSize: 'cover', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }}>
      <div className="container mx-auto px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <Logo />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
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
          <div className="hidden md:flex items-center gap-4">
            <Button variant="ghost" asChild size="default" className="text-base font-medium text-foreground hover:text-[#2E5A43] hover:bg-transparent">
              <Link href="/studio">Мастерская</Link>
            </Button>
            <Button asChild size="default" className="text-base font-medium bg-[#2E5A43] hover:bg-[#1e3d2d] text-white">
              <Link href="/studio?intro=true">Попробовать</Link>
            </Button>
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
              <Button asChild className="w-full mt-2">
                <Link href="/studio?intro=true" onClick={() => setIsOpen(false)}>
                  Попробовать
                </Link>
              </Button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
