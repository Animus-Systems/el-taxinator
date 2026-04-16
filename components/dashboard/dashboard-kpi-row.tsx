import type { ReactNode } from "react"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"

import { Link } from "@/lib/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type DashboardKpiTone = "positive" | "negative" | "neutral"

export type DashboardKpiItem = {
  label: string
  value: string
  description?: string
  tone?: DashboardKpiTone
  href?: string
  icon?: ReactNode
}

const toneStyles: Record<DashboardKpiTone, string> = {
  positive: "border-emerald-200/70 bg-gradient-to-br from-white via-emerald-50/40 to-emerald-100/30",
  negative: "border-rose-200/70 bg-gradient-to-br from-white via-rose-50/40 to-rose-100/30",
  neutral: "border-slate-200/70 bg-gradient-to-br from-white via-slate-50/60 to-slate-100/40",
}

const toneIcons: Record<DashboardKpiTone, ReactNode> = {
  positive: <ArrowUpRight className="h-4 w-4 text-emerald-600" />,
  negative: <ArrowDownRight className="h-4 w-4 text-rose-600" />,
  neutral: <Minus className="h-4 w-4 text-slate-500" />,
}

export function DashboardKpiRow({
  items,
  className,
}: {
  items: DashboardKpiItem[]
  className?: string
}) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {items.map((item) => {
        const tone = item.tone ?? "neutral"
        const content = (
          <Card className={cn("h-full border shadow-sm transition-shadow hover:shadow-md", toneStyles[tone])}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div className="space-y-1">
                <CardTitle className="text-sm font-medium text-slate-600">{item.label}</CardTitle>
                {item.description ? (
                  <CardDescription className="text-xs text-slate-500">{item.description}</CardDescription>
                ) : null}
              </div>
              {item.icon ?? toneIcons[tone]}
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-2xl font-semibold tracking-tight text-slate-950">{item.value}</div>
            </CardContent>
          </Card>
        )

        return item.href ? (
          <Link
            key={item.label}
            href={item.href}
            className="block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {content}
          </Link>
        ) : (
          <div key={item.label} className="h-full">
            {content}
          </div>
        )
      })}
    </div>
  )
}
