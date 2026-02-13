"use client"

import { motion, type Variants } from "framer-motion"
import React, { forwardRef } from "react"
import { cn } from "@/lib/utils"

interface TimelineContentProps {
  as?: keyof React.JSX.IntrinsicElements
  animationNum?: number
  timelineRef?: React.RefObject<HTMLElement | null>
  customVariants?: { visible: (i: number) => object; hidden: object }
  className?: string
  children?: React.ReactNode
}

export const TimelineContent = forwardRef<HTMLDivElement, TimelineContentProps>(
  (
    {
      animationNum = 0,
      customVariants = {
        visible: (i: number) => ({
          y: 0,
          opacity: 1,
          filter: "blur(0px)",
          transition: { delay: i * 0.2, duration: 0.5 },
        }),
        hidden: { filter: "blur(10px)", y: -20, opacity: 0 },
      },
      className,
      children,
    },
    ref
  ) => {
    const variants = {
      visible: (i: number) => customVariants.visible(i),
      hidden: customVariants.hidden,
    } as Variants

    return (
      <motion.div
        ref={ref}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.15 }}
        custom={animationNum}
        variants={variants}
        className={cn(className)}
      >
        {children}
      </motion.div>
    )
  }
)

TimelineContent.displayName = "TimelineContent"
