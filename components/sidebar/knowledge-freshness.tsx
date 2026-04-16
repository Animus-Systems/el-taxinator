import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { BookOpen, AlertTriangle } from "lucide-react"
import type { KnowledgePack } from "@/lib/db-types"
import Link from "next/link"

type Bucket = "fresh" | "aging" | "stale" | "never"

function bucketFor(pack: KnowledgePack): Bucket {
  if (!pack.lastRefreshedAt) return "never"
  const days = (Date.now() - new Date(pack.lastRefreshedAt).getTime()) / (1000 * 60 * 60 * 24)
  if (days <= 14) return "fresh"
  if (days <= 30) return "aging"
  return "stale"
}

function worstBucket(packs: KnowledgePack[]): Bucket {
  if (packs.length === 0) return "never"
  const priority: Record<Bucket, number> = { fresh: 0, aging: 1, stale: 2, never: 3 }
  return packs
    .map(bucketFor)
    .reduce<Bucket>((worst, b) => (priority[b] > priority[worst] ? b : worst), "fresh")
}

function relativeDays(pack: KnowledgePack): string {
  if (!pack.lastRefreshedAt) return "—"
  const days = Math.floor((Date.now() - new Date(pack.lastRefreshedAt).getTime()) / (1000 * 60 * 60 * 24))
  if (days === 0) return "today"
  if (days === 1) return "yesterday"
  return `${days}d ago`
}

const dotColour: Record<Bucket, string> = {
  fresh: "bg-emerald-500",
  aging: "bg-amber-500",
  stale: "bg-red-500",
  never: "bg-red-500",
}

export function KnowledgeFreshnessIndicator() {
  const { t } = useTranslation("sidebar")
  const { data: packs = [] } = trpc.knowledge.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  })

  const overall = useMemo(() => worstBucket(packs), [packs])
  const oldestPack = useMemo(() => {
    if (packs.length === 0) return null
    const withRefresh = packs.filter((p) => p.lastRefreshedAt !== null)
    if (withRefresh.length === 0) return packs[0] ?? null
    const [first, ...rest] = withRefresh
    if (!first) return null
    return rest.reduce<KnowledgePack>((oldest, p) => {
      if (!oldest.lastRefreshedAt) return p
      if (!p.lastRefreshedAt) return oldest
      return new Date(p.lastRefreshedAt) < new Date(oldest.lastRefreshedAt) ? p : oldest
    }, first)
  }, [packs])

  const label = (() => {
    if (overall === "fresh") return t("knowledge.freshLabel")
    if (overall === "never") return t("knowledge.neverRefreshed")
    if (overall === "stale") return t("knowledge.staleLabel")
    const days = oldestPack ? relativeDays(oldestPack) : "—"
    return t("knowledge.agingLabel", { days })
  })()

  const showWarning = overall === "stale" || overall === "never"

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        <Link href="/settings/knowledge">
          <BookOpen />
          <span>{label}</span>
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${dotColour[overall]}`}
            aria-hidden
          />
          {showWarning && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
