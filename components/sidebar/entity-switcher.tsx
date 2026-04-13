
import { switchEntityAction } from "@/actions/entities"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import type { Entity } from "@/lib/entities"
import { Building2, ChevronDown, User } from "lucide-react"
import { useRouter } from "@/lib/navigation"
import { useTransition } from "react"

function EntityIcon({ type }: { type: string }) {
  return type === "sl" ? <Building2 className="h-4 w-4" /> : <User className="h-4 w-4" />
}

function EntityBadge({ type }: { type: string }) {
  return (
    <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${
      type === "sl" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
    }`}>
      {type === "sl" ? "SL" : "Autónomo"}
    </span>
  )
}

export function EntitySwitcher({
  entities,
  activeId,
}: {
  entities: Entity[]
  activeId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const active = entities.find((e) => e.id === activeId) ?? entities[0]

  const handleSwitch = (entityId: string) => {
    if (entityId === activeId) return
    startTransition(async () => {
      const result = await switchEntityAction(entityId)
      if (!result.success) {
        return
      }

      router.push("/dashboard")
      router.refresh()
    })
  }

  if (entities.length <= 1) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="default"
          className="w-full justify-between data-[state=open]:bg-sidebar-accent"
        >
          <div className="flex items-center gap-2 min-w-0">
            <EntityIcon type={active.type} />
            <span className="truncate font-medium">{active.name}</span>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {entities.map((entity) => (
          <DropdownMenuItem
            key={entity.id}
            onClick={() => handleSwitch(entity.id)}
            className={`flex items-center justify-between gap-2 ${
              entity.id === activeId ? "bg-accent" : ""
            } ${isPending ? "opacity-50" : ""}`}
            disabled={isPending}
          >
            <div className="flex items-center gap-2 min-w-0">
              <EntityIcon type={entity.type} />
              <span className="truncate">{entity.name}</span>
            </div>
            <EntityBadge type={entity.type} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
