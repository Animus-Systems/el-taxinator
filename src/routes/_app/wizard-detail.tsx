import { useParams } from "@tanstack/react-router"
import { WizardShell } from "@/components/wizard/wizard-shell"

export function WizardDetailPage() {
  const { sessionId } = useParams({ strict: false }) as { sessionId: string }
  if (!sessionId) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">No session selected</div>
      </div>
    )
  }
  return <WizardShell sessionId={sessionId} />
}
