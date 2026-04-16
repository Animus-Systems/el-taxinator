import { useTranslation } from "react-i18next"
import { useNavigate } from "@tanstack/react-router"
import { trpc } from "~/trpc"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Sparkles } from "lucide-react"

/**
 * Compact list of in-progress wizard sessions for use on the inbox
 * (/unsorted) page so users can jump back into partially-classified
 * imports without having to remember /wizard/new.
 */
export function WizardSessionsInline() {
  const { t } = useTranslation("wizard")
  const navigate = useNavigate()
  const { data: sessions = [], isLoading } = trpc.wizard.listResumable.useQuery()

  if (isLoading || sessions.length === 0) return null

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-medium">{t("inboxSectionTitle")}</h2>
        <Badge variant="secondary" className="ml-1">
          {sessions.length}
        </Badge>
      </div>
      <div className="flex flex-col gap-2">
        {sessions.map((s) => (
          <Card
            key={s.id}
            className="hover:bg-muted/30 transition-colors cursor-pointer"
            onClick={() => navigate({ to: `/wizard/${s.id}` as string })}
          >
            <CardContent className="py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate text-sm">
                  {s.title || s.fileName || `Session ${s.id.slice(0, 8)}`}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className="text-[10px]">
                    {t(`entryMode${s.entryMode.charAt(0).toUpperCase()}${s.entryMode.slice(1)}`)}
                  </Badge>
                  <span>
                    {s.candidateCount} {t("candidateCountLabel")}
                  </span>
                  {s.unresolvedCount > 0 ? (
                    <Badge variant="destructive" className="text-[10px]">
                      {s.unresolvedCount} {t("unresolvedCountLabel")}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <Button variant="ghost" size="sm">
                {t("resumeOpen")}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
