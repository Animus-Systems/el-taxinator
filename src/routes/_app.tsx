/**
 * Authenticated app layout route.
 *
 * Renders the sidebar + main content area.
 * Auth checks and entity picker are deferred to a later phase.
 */
import { Outlet } from "@tanstack/react-router"
import { AppSidebar } from "@/components/sidebar/sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { NotificationProvider } from "@/lib/context"
import { trpc } from "~/trpc"

export function AppLayout() {
  // Fetch unsorted files count for the sidebar badge
  const { data: unsortedFiles } = trpc.files.listUnsorted.useQuery({})
  const { data: entities } = trpc.entities.list.useQuery()
  const { data: activeEntityId } = trpc.entities.getActive.useQuery()
  const unsortedFilesCount = unsortedFiles?.length ?? 0
  const entityName = entities?.find((entity) => entity.id === activeEntityId)?.name

  return (
    <NotificationProvider>
      <SidebarProvider>
        <AppSidebar unsortedFilesCount={unsortedFilesCount} entityName={entityName} />
        <SidebarInset>
          <div className="flex flex-1 flex-col p-4 md:p-6 overflow-x-hidden">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </NotificationProvider>
  )
}
