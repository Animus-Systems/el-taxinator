import { ImportCSVTable } from "@/components/import/csv"
import { serverClient } from "@/lib/trpc/server-client"
import { setRequestLocale } from "next-intl/server"

export default async function CSVImportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const trpc = await serverClient()
  const fields = await trpc.fields.list({})
  return (
    <div className="flex flex-col gap-4 p-4">
      <ImportCSVTable fields={fields} />
    </div>
  )
}
