import type { ReactNode } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type DashboardEmptyPanelProps = {
  title: string
  description: string
  icon?: ReactNode
  action?: ReactNode
  children?: ReactNode
  className?: string | undefined
}

export function DashboardEmptyPanel({
  title,
  description,
  icon,
  action,
  children,
  className,
}: DashboardEmptyPanelProps) {
  return (
    <Card className={cn("border-dashed bg-slate-50/80 shadow-none", className)}>
      <CardHeader className="space-y-4">
        <div className="flex items-start gap-3">
          {icon ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500">
              {icon}
            </div>
          ) : null}
          <div className="space-y-1">
            <CardTitle className="text-base text-slate-900">{title}</CardTitle>
            <CardDescription className="text-sm text-slate-600">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
      {action ? <div className="px-6 pb-6">{action}</div> : null}
    </Card>
  )
}
