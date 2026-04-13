/**
 * Entity picker / home route — SPA equivalent of app/page.tsx
 *
 * Outside the _app layout (no sidebar). Shows the entity picker
 * for selecting which company/entity to work with.
 */
import { EntityPicker } from "@/components/auth/entity-picker"
import { trpc } from "~/trpc"
import { Loader2 } from "lucide-react"

export function EntityPickerPage() {
  const { data: entities, isLoading } = trpc.entities.list.useQuery()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return <EntityPicker entities={entities ?? []} />
}
