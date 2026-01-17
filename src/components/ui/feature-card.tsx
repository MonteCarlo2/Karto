"use client"

import { motion } from "framer-motion"
import { CheckCircle2, ArrowRight } from "lucide-react"

interface FeatureCardProps {
  icon?: React.ReactNode
  title: string
  description: string
  delay?: number
  className?: string
}

export function FeatureCard({ icon, title, description, delay = 0, className = "" }: FeatureCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      className={`group relative bg-white border border-border rounded-2xl p-8 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 ${className}`}
    >
      {icon && (
        <div className="mb-6 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
          {icon}
        </div>
      )}
      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
      
      {/* Hover effect */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
    </motion.div>
  )
}

interface StepCardProps {
  number: number
  title: string
  description: string
  videoPlaceholder?: boolean
  delay?: number
}

export function StepCard({ number, title, description, videoPlaceholder = true, delay = 0 }: StepCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay }}
      className="flex flex-col h-full group"
    >
      <div className="bg-white border border-border rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 h-full flex flex-col hover:-translate-y-1">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-primary text-white font-bold text-lg shadow-lg group-hover:scale-110 transition-transform">
            {number}
          </div>
          <h3 className="text-xl font-bold">{title}</h3>
        </div>
        <p className="text-muted-foreground mb-6 flex-grow leading-relaxed">{description}</p>
        
        {videoPlaceholder && (
          <div className="w-full aspect-video bg-gradient-to-br from-muted to-muted/50 rounded-xl border border-border/50 flex items-center justify-center overflow-hidden relative group/placeholder">
            <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(37,99,235,0.05)_50%,transparent_75%,transparent_100%)] bg-[length:15px_15px]"></div>
            <div className="relative z-10 text-center">
              <div className="w-12 h-12 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center mx-auto mb-2 shadow-md">
                <div className="w-0 h-0 border-t-[8px] border-t-transparent border-l-[14px] border-l-primary border-b-[8px] border-b-transparent ml-0.5"></div>
              </div>
              <p className="text-xs text-muted-foreground font-medium">Видео шага {number}</p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
