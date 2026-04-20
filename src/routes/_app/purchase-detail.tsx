import { useParams } from "@tanstack/react-router"
import type { ComponentProps } from "react"
import { trpc } from "~/trpc"
import { PurchaseDetail } from "@/components/purchases/purchase-detail"

type PurchaseProp = ComponentProps<typeof PurchaseDetail>["purchase"]

export function PurchaseDetailPage() {
  const { purchaseId } = useParams({ strict: false }) as { purchaseId: string }

  const { data: purchase, isLoading } = trpc.purchases.getById.useQuery(
    { id: purchaseId },
    { enabled: !!purchaseId },
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!purchase) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Purchase not found</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <PurchaseDetail purchase={purchase as PurchaseProp} />
    </div>
  )
}
