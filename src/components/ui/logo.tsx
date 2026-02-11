import * as React from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center", className)} suppressHydrationWarning>
      <Image
        src="/logo.png"
        alt="KARTO"
        width={200}
        height={130}
        className="object-contain"
        priority
        unoptimized
        style={{ width: 'auto', height: 'auto', maxWidth: '200px', maxHeight: '130px' }}
      />
    </div>
  )
}
