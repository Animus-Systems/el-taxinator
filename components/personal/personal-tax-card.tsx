import { Link } from "@/lib/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

type Props = {
  title: string
  description: string
  icon: React.ReactNode
  href: string
  cta: string
  summary?: string | null
  impact?: string | null
}

export function PersonalTaxCard({
  title,
  description,
  icon,
  href,
  cta,
  summary,
  impact,
}: Props) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-foreground/80">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">{title}</h3>
            <p className="truncate text-xs text-muted-foreground">{description}</p>
          </div>
        </div>

        {summary && (
          <p className="text-sm">{summary}</p>
        )}
        {impact && (
          <p className="text-xs text-muted-foreground">{impact}</p>
        )}

        <Link href={href} className="ml-auto">
          <Button type="button" variant="outline" size="sm" className="gap-1">
            {cta}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}
