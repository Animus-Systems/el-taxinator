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
import { WizardDockProvider } from "@/lib/wizard-dock-context"
import { WizardDock } from "@/components/wizard/wizard-dock"
import { ChatFloatingButton } from "@/components/chat/chat-floating-button"
import { trpc } from "~/trpc"

export function AppLayout() {
  // Fetch unsorted files + in-progress wizard sessions for the sidebar badge
  const { data: unsortedFiles } = trpc.files.listUnsorted.useQuery({})
  const { data: resumableSessions } = trpc.wizard.listResumable.useQuery()
  const { data: entities } = trpc.entities.list.useQuery()
  const { data: activeEntityId } = trpc.entities.getActive.useQuery()
  const { data: cryptoSummary } = trpc.crypto.summary.useQuery({})
  const unsortedFilesCount = unsortedFiles?.length ?? 0
  const resumableSessionsCount = resumableSessions?.length ?? 0
  const inboxCount = unsortedFilesCount + resumableSessionsCount
  const untrackedCryptoCount = cryptoSummary?.untrackedDisposalsCount ?? 0
  const activeEntity = entities?.find((entity) => entity.id === activeEntityId)
  const entityName = activeEntity?.name
  const entityType = activeEntity?.type

  return (
    <NotificationProvider>
      <WizardDockProvider>
        <SidebarProvider>
          <AppSidebar
            unsortedFilesCount={inboxCount}
            untrackedCryptoCount={untrackedCryptoCount}
            {...(entityName !== undefined ? { entityName } : {})}
            {...(entityType !== undefined ? { entityType } : {})}
          />
          <SidebarInset>
            <div className="flex flex-1 flex-col overflow-x-hidden p-4 md:py-6 md:pl-1 md:pr-6">
              <Outlet />
            </div>
          </SidebarInset>
        </SidebarProvider>
        <WizardDock />
        <ChatFloatingButton />
      </WizardDockProvider>
    </NotificationProvider>
  )
}
