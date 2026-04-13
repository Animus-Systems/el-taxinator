
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { BankAccount } from "@/lib/db-types"
import { ImportUpload } from "./import-upload"
import { useRouter } from "@/lib/navigation"

export function AIImportDialog({
  accounts,
  onClose,
}: {
  accounts: BankAccount[]
  onClose: () => void
}) {
  const router = useRouter()

  return (
    <Dialog defaultOpen onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">AI Import</DialogTitle>
        </DialogHeader>
        <ImportUpload
          accounts={accounts}
          onComplete={() => {
            onClose()
            router.refresh()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
