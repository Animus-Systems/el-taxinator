import { serverClient } from "@/lib/trpc/server-client"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"

export default async function TransactionLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string; transactionId: string }>
}) {
  const { locale, transactionId } = await params
  setRequestLocale(locale)
  const trpc = await serverClient()
  const transaction = await trpc.transactions.getById({ id: transactionId })

  if (!transaction) {
    notFound()
  }

  return (
    <>
      <header className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Transaction Details</h2>
      </header>
      <main>
        <div className="flex flex-1 flex-col gap-4 pt-0">{children}</div>
      </main>
    </>
  )
}
