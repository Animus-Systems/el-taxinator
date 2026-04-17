import { Link } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"
import { useTranslations } from "next-intl"
import type { QuarterStatus } from "./quarter-status"

export type QuarterTimelineStep = {
  quarter: number
  label: string
  status: QuarterStatus
}

export type QuarterTimelineProps = {
  year: number
  steps: QuarterTimelineStep[]
}

function statusClasses(status: QuarterStatus): { dot: string; text: string; connector: string } {
  switch (status) {
    case "filed":
      return {
        dot: "bg-green-500 border-green-500 text-white",
        text: "text-green-700 dark:text-green-400",
        connector: "bg-green-300 dark:bg-green-700",
      }
    case "overdue":
      return {
        dot: "bg-red-500 border-red-500 text-white",
        text: "text-red-700 dark:text-red-400",
        connector: "bg-border",
      }
    case "current":
      return {
        dot: "bg-primary border-primary text-primary-foreground ring-4 ring-primary/15",
        text: "text-foreground font-medium",
        connector: "bg-border",
      }
    case "upcoming":
      return {
        dot: "bg-background border-foreground/50 text-foreground",
        text: "text-foreground",
        connector: "bg-border",
      }
    default:
      return {
        dot: "bg-background border-muted-foreground/30 text-muted-foreground",
        text: "text-muted-foreground",
        connector: "bg-border",
      }
  }
}

export function QuarterTimeline({ year, steps }: QuarterTimelineProps) {
  const t = useTranslations("tax.timeline")
  const statusLabel = (s: QuarterStatus): string => {
    if (s === "filed") return t("filed")
    if (s === "overdue") return t("overdue")
    if (s === "current") return t("current")
    if (s === "upcoming") return t("upcoming")
    return t("future")
  }

  return (
    <div className="flex items-stretch">
      {steps.map((step, idx) => {
        const { dot, text, connector } = statusClasses(step.status)
        const isLast = idx === steps.length - 1
        return (
          <div key={step.quarter} className="flex flex-1 items-center">
            <Link
              href={`/tax/${year}/${step.quarter}`}
              className="group flex flex-col items-center gap-1.5 px-2"
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-medium transition-transform group-hover:scale-105",
                  dot,
                )}
              >
                {step.status === "filed" ? <Check className="h-4 w-4" /> : `Q${step.quarter}`}
              </span>
              <div className="flex flex-col items-center text-center">
                <span className={cn("text-[11px] leading-tight", text)}>{step.label}</span>
                <span className="text-[10px] text-muted-foreground">{statusLabel(step.status)}</span>
              </div>
            </Link>
            {!isLast ? (
              <div className={cn("h-px flex-1 mb-7", connector)} />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
