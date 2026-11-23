"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { hubSans } from "./hub-ui";

/**
 * Папка, как в базе знаний: задняя стенка с язычком, из неё выглядывают листы, спереди лицевая сторона с цветной окантовкой.
 * При появлении лицевая сторона «открывается», листы выезжают. Статьи WB в фиолетовой папке, остальное в бежевой с салатовым краем.
 */

const PALETTE = {
  karto: { outline: "#B9FF4B", fill: "#F7F3E7", deep: "#E6E0CC" },
  wb: { outline: "#B02FC9", fill: "#F8F1FB", deep: "#E8D8F1" },
} as const;

const EASE = [0.22, 1, 0.36, 1] as const;

export function FolderFrame({ tab, palette = "karto", children, className = "" }: { tab: string; palette?: keyof typeof PALETTE; children: ReactNode; className?: string }) {
  const c = PALETTE[palette];
  return (
    <motion.div initial="closed" animate="open" className={`relative pt-[46px] [perspective:1200px] ${className}`}>
      <span className="absolute left-0 top-0 flex h-10 max-w-[75%] items-center truncate rounded-t-[16px] px-4 text-[12.5px] font-semibold" style={{ ...hubSans, backgroundColor: c.deep, color: "#011408" }}>
        {tab}
      </span>
      <span aria-hidden className="absolute inset-x-0 bottom-0 top-[30px] rounded-[22px] rounded-tl-none" style={{ backgroundColor: c.deep }} />
      <motion.span aria-hidden variants={{ closed: { y: 18, opacity: 0 }, open: { y: 0, opacity: 1 } }} transition={{ delay: 0.12, duration: 0.55, ease: EASE }} className="absolute inset-x-6 top-[36px] h-10 rotate-[-1.3deg] rounded-t-[10px] bg-white" style={{ boxShadow: "0 0 0 1px rgba(1,20,8,0.08)" }} />
      <motion.span aria-hidden variants={{ closed: { y: 18, opacity: 0 }, open: { y: 0, opacity: 1 } }} transition={{ delay: 0.2, duration: 0.55, ease: EASE }} className="absolute inset-x-9 top-[33px] h-10 rotate-[0.9deg] rounded-t-[10px] bg-white" style={{ boxShadow: "0 0 0 1px rgba(1,20,8,0.08)" }} />
      <motion.div variants={{ closed: { rotateX: -22, opacity: 0.55 }, open: { rotateX: 0, opacity: 1 } }} transition={{ duration: 0.65, ease: EASE }} className="relative z-10 rounded-[22px] border-2 p-3 sm:p-4" style={{ transformOrigin: "bottom", backgroundColor: c.fill, borderColor: c.outline, boxShadow: "0 22px 34px -26px rgba(1, 20, 8, 0.5)" }}>
        {children}
      </motion.div>
    </motion.div>
  );
}
