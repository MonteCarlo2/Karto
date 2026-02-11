"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface AccordionItemProps {
  title: string
  children: React.ReactNode
  isOpen?: boolean
  onClick?: () => void
  noBorder?: boolean
}

export function AccordionItem({
  title,
  children,
  isOpen,
  onClick,
  noBorder,
}: AccordionItemProps) {
  return (
    <div className={noBorder ? "py-0" : "border-b border-border/60 last:border-0 py-1"}>
      <button
        onClick={onClick}
        className={cn(
          "flex w-full items-center justify-between px-0 py-4 text-left text-base md:text-lg font-medium tracking-tight transition-colors",
          "text-neutral-700 hover:text-neutral-900",
          isOpen && "text-neutral-900"
        )}
      >
        {title}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-200",
            {
              "rotate-180 text-neutral-700": isOpen,
            }
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pb-4 text-sm text-muted-foreground leading-relaxed">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function Accordion({
  items,
  variant = "default",
}: {
  items: { title: string; content: React.ReactNode }[]
  variant?: "default" | "cards"
}) {
  const [openIndex, setOpenIndex] = React.useState<number | null>(0)

  if (variant === "cards") {
    return (
      <div className="w-full space-y-4">
        {items.map((item, index) => (
          <div
            key={index}
            className="rounded-2xl bg-white/95 shadow-[0_8px_32px_rgba(0,0,0,0.08)] border border-neutral-100 p-4 md:p-5 transition-shadow hover:shadow-[0_16px_48px_rgba(0,0,0,0.12)]"
          >
            <AccordionItem
              title={item.title}
              isOpen={openIndex === index}
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              noBorder
            >
              {item.content}
            </AccordionItem>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="w-full">
      {items.map((item, index) => (
        <AccordionItem
          key={index}
          title={item.title}
          isOpen={openIndex === index}
          onClick={() => setOpenIndex(openIndex === index ? null : index)}
        >
          {item.content}
        </AccordionItem>
      ))}
    </div>
  )
}
