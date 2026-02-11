'use client'

import React from "react"
import { CheckIcon, SparklesIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

type PricingCardProps = {
  titleBadge: string
  priceLabel: string
  priceSuffix?: string
  features: string[]
  cta?: string
  className?: string
}

function FilledCheck() {
  return (
    <div className="rounded-full bg-primary p-0.5 text-primary-foreground">
      <CheckIcon className="size-3" strokeWidth={3} />
    </div>
  )
}

function PricingCard({
  titleBadge,
  priceLabel,
  priceSuffix = "/month",
  features,
  cta = "Subscribe",
  className,
}: PricingCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border border-foreground/10 bg-background",
        "backdrop-blur supports-[backdrop-filter]:bg-background/10",
        className
      )}
    >
      <div className="flex items-center gap-3 p-4">
        <Badge variant="secondary">{titleBadge}</Badge>
        <div className="ml-auto">
          <Button variant="outline">{cta}</Button>
        </div>
      </div>

      <div className="flex items-end gap-2 px-4 py-2">
        <span className="font-mono text-5xl font-semibold tracking-tight">{priceLabel}</span>
        {priceLabel.toLowerCase() !== "free" && (
          <span className="text-sm text-muted-foreground">{priceSuffix}</span>
        )}
      </div>

      <ul className="grid gap-4 p-4 text-sm text-muted-foreground">
        {features.map((f, i) => (
          <li key={i} className="flex items-center gap-3">
            <FilledCheck />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function BentoPricing() {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-8">
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-md border border-foreground/10 bg-background",
          "backdrop-blur supports-[backdrop-filter]:bg-background/10",
          "lg:col-span-5"
        )}
      >
        <div className="pointer-events-none absolute left-1/2 top-0 -ml-20 -mt-2 h-full w-full [mask-image:linear-gradient(white,transparent)]">
          <div className="absolute inset-0 bg-gradient-to-r from-foreground/5 to-foreground/20 [mask-image:radial-gradient(farthest-side_at_top,white,transparent)]">
            <div
              aria-hidden="true"
              className={cn(
                "absolute inset-0 size-full mix-blend-overlay",
                "bg-[linear-gradient(to_right,var(--theme-foreground,_rgba(0,0,0,0.1))_1px,transparent_1px)]",
                "bg-[size:24px]"
              )}
            />
          </div>
        </div>
        <div className="flex items-center gap-3 p-4">
          <Badge variant="secondary">CREATORS SPECIAL</Badge>
          <Badge variant="outline" className="hidden lg:flex">
            <SparklesIcon className="me-1 size-3" /> Most Recommended
          </Badge>
          <div className="ml-auto">
            <Button>Subscribe</Button>
          </div>
        </div>
        <div className="flex flex-col p-4 lg:flex-row">
          <div className="pb-4 lg:w-[30%]">
            <span className="font-mono text-5xl font-semibold tracking-tight">$19</span>
            <span className="text-sm text-muted-foreground">/month</span>
          </div>
          <ul className="grid gap-4 text-sm text-muted-foreground lg:w-[70%]">
            {[
              "Perfect for individual bloggers",
              "freelancers and entrepreneurs",
              "AI-Powered editing tools",
              "Basic Analytics to track content performance",
            ].map((f, i) => (
              <li key={i} className="flex items-center gap-3">
                <FilledCheck />
                <span className="leading-relaxed">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <PricingCard
        titleBadge="STARTERS"
        priceLabel="$0"
        features={["Perfect for beginners", "Unlimited Content Generation", "AI-Powered editing tools"]}
        className="lg:col-span-3"
      />

      <PricingCard
        titleBadge="TEAMS"
        priceLabel="$49"
        features={[
          "Ideal for small teams and agencies",
          "Collaborative features like shared projects",
          "Advanced Analytics to optimize content strategy",
        ]}
        className="lg:col-span-4"
      />

      <PricingCard
        titleBadge="ENTERPRISE"
        priceLabel="$99"
        features={[
          "Designed for large companies",
          "high-volume content creators",
          "dedicated account management",
        ]}
        className="lg:col-span-4"
      />
    </div>
  )
}

