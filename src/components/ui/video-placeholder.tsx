"use client"

import { motion } from "framer-motion"
import { Play, Sparkles } from "lucide-react"

interface VideoPlaceholderProps {
  title?: string
  description?: string
  className?: string
  size?: "sm" | "md" | "lg"
}

export function VideoPlaceholder({ 
  title = "Демонстрация работы", 
  description,
  className = "",
  size = "md"
}: VideoPlaceholderProps) {
  const sizeClasses = {
    sm: "aspect-video",
    md: "aspect-video",
    lg: "aspect-[16/9]"
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className={`relative group ${sizeClasses[size]} ${className}`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-accent/10 rounded-2xl border border-border/50 shadow-xl overflow-hidden">
        {/* Animated background pattern */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(37,99,235,0.1)_50%,transparent_75%,transparent_100%)] bg-[length:20px_20px] animate-[slide_20s_linear_infinite]"></div>
        </div>
        
        {/* Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 p-8">
          <motion.div
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="relative mb-6"
          >
            <div className="w-20 h-20 rounded-full bg-white shadow-2xl flex items-center justify-center group-hover:shadow-primary/20 transition-all">
              <Play className="w-8 h-8 text-primary ml-1" fill="currentColor" />
            </div>
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping"></div>
          </motion.div>
          
          <h3 className="text-lg font-semibold mb-2 text-foreground">{title}</h3>
          {description && (
            <p className="text-sm text-muted-foreground text-center max-w-md">{description}</p>
          )}
        </div>
        
        {/* Corner accent */}
        <div className="absolute top-4 right-4 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
      </div>
    </motion.div>
  )
}
