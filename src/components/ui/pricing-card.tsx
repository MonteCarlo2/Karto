"use client"

import Link from "next/link"
import { Check, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"

interface PricingCardProps {
  title: string
  price: string
  description?: string
  features: string[]
  isPopular?: boolean
  buttonText?: string
  href?: string
}

export function PricingCard({
  title,
  price,
  description,
  features,
  isPopular,
  buttonText = "Выбрать",
  href = "/app",
}: PricingCardProps) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "relative flex flex-col p-8 bg-white border rounded-2xl shadow-md hover:shadow-2xl transition-all duration-300 h-full",
        isPopular ? "border-primary ring-2 ring-primary shadow-xl scale-105 md:scale-105" : "border-border"
      )}
    >
      {isPopular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-gradient-primary text-white text-xs font-bold rounded-full shadow-lg flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" />
          Популярный
        </div>
      )}
      
      <div className="mb-8">
        <h3 className="text-2xl font-bold mb-3">{title}</h3>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-5xl font-bold">{price}</span>
          {price !== "Бесплатно" && !price.includes("₽") && price !== "Индивидуально" && (
            <span className="text-lg text-muted-foreground">₽</span>
          )}
        </div>
        {description && (
          <p className="text-base text-muted-foreground leading-relaxed">{description}</p>
        )}
      </div>

      <ul className="space-y-4 mb-10 flex-grow">
        {features.map((feature, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
            className="flex items-start gap-3"
          >
            <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Check className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-sm text-muted-foreground leading-relaxed">{feature}</span>
          </motion.li>
        ))}
      </ul>

      <Button 
        asChild 
        variant={isPopular ? "default" : "outline"}
        size="lg"
        className={cn(
          "w-full h-12 font-semibold shadow-md hover:shadow-lg transition-all",
          isPopular && "bg-gradient-primary hover:opacity-90"
        )}
      >
        <Link href={href}>{buttonText}</Link>
      </Button>
    </motion.div>
  )
}
