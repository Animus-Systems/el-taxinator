import { AccountantCommentBox } from "@/components/accountant/comment-box"
import { getAccountantInviteByToken } from "@/models/accountants"
import { AccountantPermissions } from "@/models/accountants"
import { getTaxYearSummary, getUpcomingDeadlines } from "@/models/tax"
import { notFound } from "next/navigation"

export const metadata = { title: "Impuestos — Accountant View" }

export default async function AccountantTaxPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ year?: string }>
}) {
  const { token } = await params
  const invite = await getAccountantInviteByToken(token)
  if (!invite) notFound()

  const permissions = invite.permissions as AccountantPermissions
  if (!permissions.tax) notFound()

  const { year: yearParam } = await searchParams
  const year = parseInt(yearParam ?? "") || new Date().getFullYear()

  const [quarters, deadlines] = await Promise.all([
    getTaxYearSummary(invite.userId, year),
    Promise.resolve(getUpcomingDeadlines(year)),
  ])

  // Compute annual totals from quarterly data
  const totalIgicDevengado = quarters.reduce((s, q) => s + q.modelo420.totalIgicDevengado, 0)
  const totalIgicDeducible = quarters.reduce((s, q) => s + q.modelo420.cuotaDeducible, 0)
  const totalIgicResult = quarters.reduce((s, q) => s + q.modelo420.resultado, 0)
  const totalIrpf = quarters.reduce((s, q) => s + q.modelo130.casilla06_aIngresar, 0)

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold">Impuestos</h1>
        <div className="flex gap-2">
          {[year - 1, year, year + 1].map((y) => (
            <a
              key={y}
              href={`?year=${y}`}
              className={`px-3 py-1 rounded text-sm border transition-colors ${
                y === year ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
              }`}
            >
              {y}
            </a>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {quarters.map((q) => (
          <div key={q.quarter} className="rounded-lg border p-4">
            <h3 className="font-semibold mb-3">{q.label}</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">IGIC devengado</dt>
              <dd className="text-right font-mono">&euro;{(q.modelo420.totalIgicDevengado / 100).toFixed(2)}</dd>
              <dt className="text-muted-foreground">IGIC deducible</dt>
              <dd className="text-right font-mono">&euro;{(q.modelo420.cuotaDeducible / 100).toFixed(2)}</dd>
              <dt className="text-muted-foreground font-medium">Resultado 420</dt>
              <dd className={`text-right font-mono font-semibold ${
                q.modelo420.resultado >= 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
              }`}>
                &euro;{(q.modelo420.resultado / 100).toFixed(2)}
              </dd>
              <dt className="text-muted-foreground">IRPF a ingresar (130)</dt>
              <dd className="text-right font-mono">&euro;{(q.modelo130.casilla06_aIngresar / 100).toFixed(2)}</dd>
            </dl>
          </div>
        ))}
      </div>

      <div className="rounded-lg border p-4 mb-8">
        <h3 className="font-semibold mb-3">Annual Summary {year}</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm max-w-sm">
          <dt className="text-muted-foreground">Total IGIC devengado</dt>
          <dd className="text-right font-mono">&euro;{(totalIgicDevengado / 100).toFixed(2)}</dd>
          <dt className="text-muted-foreground">Total IGIC deducible</dt>
          <dd className="text-right font-mono">&euro;{(totalIgicDeducible / 100).toFixed(2)}</dd>
          <dt className="text-muted-foreground font-medium">Net IGIC to ATC</dt>
          <dd className={`text-right font-mono font-semibold ${
            totalIgicResult >= 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
          }`}>
            &euro;{(totalIgicResult / 100).toFixed(2)}
          </dd>
          <dt className="text-muted-foreground">Total IRPF (130)</dt>
          <dd className="text-right font-mono">&euro;{(totalIrpf / 100).toFixed(2)}</dd>
        </dl>
      </div>

      <div className="rounded-lg border p-4 mb-8">
        <h3 className="font-semibold mb-3">Filing Deadlines {year}</h3>
        <div className="space-y-2">
          {deadlines.map((d) => (
            <div key={d.quarter} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
              <span className="text-muted-foreground">{d.label}</span>
              <div className="flex items-center gap-4">
                <span className="text-xs text-muted-foreground">{d.forms.map((f) => `Modelo ${f}`).join(", ")}</span>
                <span className="font-medium">{d.deadline.toLocaleDateString("es-ES")}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <AccountantCommentBox inviteId={invite.id} entityType="tax" entityId={String(year)} token={token} />
    </div>
  )
}
