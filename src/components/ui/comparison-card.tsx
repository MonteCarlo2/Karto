"use client"

import { motion } from "framer-motion"
import { CheckCircle2, Sparkles, Zap, Shield, Image as ImageIcon } from "lucide-react"

interface ComparisonCardProps {
  beforeLabel?: string
  afterLabel?: string
  category?: string
  delay?: number
}

export function ComparisonCard({ 
  beforeLabel = "ДО", 
  afterLabel = "ПОСЛЕ", 
  category = "Товар",
  delay = 0 
}: ComparisonCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      className="group bg-white rounded-2xl p-6 shadow-md hover:shadow-2xl transition-all duration-300 border border-border overflow-hidden"
    >
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="relative aspect-square bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl flex items-center justify-center overflow-hidden border border-border/50">
          <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(0,0,0,0.05)_50%,transparent_75%,transparent_100%)] bg-[length:20px_20px]"></div>
          <span className="relative z-10 text-xs font-semibold text-slate-600 bg-white/80 px-3 py-1.5 rounded-full backdrop-blur-sm">
            {beforeLabel}
          </span>
        </div>
        <div className="relative aspect-square bg-gradient-to-br from-primary/10 via-primary/5 to-accent/10 rounded-xl flex items-center justify-center overflow-hidden border-2 border-primary/30 shadow-lg">
          <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(37,99,235,0.1)_50%,transparent_75%,transparent_100%)] bg-[length:20px_20px]"></div>
          <span className="relative z-10 text-xs font-bold text-primary bg-white/90 px-3 py-1.5 rounded-full backdrop-blur-sm shadow-sm">
            {afterLabel}
          </span>
          <div className="absolute top-2 right-2 w-6 h-6 bg-success rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-white" />
          </div>
        </div>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-sm font-semibold">{category}</span>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">Обработано</span>
      </div>
    </motion.div>
  )
}
