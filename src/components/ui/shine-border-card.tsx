"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface ShineBorderCardProps {
  children: React.ReactNode
  className?: string
  /** Показывать анимированную градиентную рамку */
  shine?: boolean
}

export function ShineBorderCard({ children, className, shine = true }: ShineBorderCardProps) {
  return (
    <motion.div
      className={cn(
        "rounded-2xl p-[2px]",
        "bg-gradient-to-r from-[#84CC16]/60 via-[#1F4E3D]/50 to-[#84CC16]/60",
        "bg-[length:200%_100%]",
        shine && "animate-[shine_4s_ease-in-out_infinite]",
        className
      )}
      initial={false}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
    >
      <div className="rounded-[14px] bg-[#F5F5F0] p-6">
        {children}
      </div>
    </motion.div>
  )
}
