import * as React from "react"
import { cn } from "@/lib/utils"

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  container?: boolean
}

export function Section({
  className,
  children,
  container = true,
  ...props
}: SectionProps) {
  return (
    <section
      className={cn("py-16 md:py-24", className)}
      suppressHydrationWarning
      {...props}
    >
      {container ? (
        <div className="container" suppressHydrationWarning>
          {children}
        </div>
      ) : (
        children
      )}
    </section>
  )
}
