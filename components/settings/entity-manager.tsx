"use client"

import { createLocalEntityAction, removeEntityAction } from "@/actions/entities"
import { disconnectAction } from "@/actions/auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Entity, EntityType } from "@/lib/entities"
import { Building2, Loader2, LogOut, Plus, Trash2, User } from "lucide-react"
import { useRouter } from "@/lib/navigation"
import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"

type Props = {
  entities: Entity[]
}

export function EntityManager({ entities: initialEntities }: Props) {
  const router = useRouter()
  const t = useTranslations("settings")
  const [showAddForm, setShowAddForm] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleRemove = (id: string, name: string) => {
    if (!confirm(t("removeEntityConfirm", { name }))) return
    startTransition(async () => {
      try {
        const result = await removeEntityAction(id)
        if (!result.success) { alert(result.error); return }
      } catch {
        // Server restarted
      }
      setTimeout(() => window.location.reload(), 3000)
    })
  }

  const handleDisconnect = () => {
    startTransition(async () => {
      const result = await disconnectAction()
      if (!result.success) {
        alert(result.error)
        return
      }
      router.push("/")
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {initialEntities.map((entity) => (
        <Card key={entity.id}>
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              {entity.type === "sl" ? (
                <Building2 className="h-5 w-5 text-blue-600" />
              ) : (
                <User className="h-5 w-5 text-green-600" />
              )}
              <div>
                <p className="font-medium">{entity.name}</p>
                <p className="text-xs text-muted-foreground">
                  {entity.type === "sl" ? t("sociedadLimitada") : t("autonomo")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDisconnect}
                disabled={isPending}
                title={t("disconnect")}
              >
                <LogOut className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemove(entity.id, entity.name)}
                disabled={isPending || initialEntities.length <= 1}
                className="text-destructive hover:text-destructive"
                title={t("delete")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {showAddForm ? (
        <AddEntityForm
          onClose={() => setShowAddForm(false)}
          onSuccess={() => {
            setShowAddForm(false)
            router.refresh()
          }}
        />
      ) : (
        <Button variant="outline" className="w-full" onClick={() => setShowAddForm(true)}>
          <Plus className="h-4 w-4" /> {t("addEntity")}
        </Button>
      )}
    </div>
  )
}

function AddEntityForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const t = useTranslations("settings")
  const [name, setName] = useState("")
  const [type, setType] = useState<EntityType>("autonomo")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async () => {
    if (!name) {
      setError(t("nameAndConnectionRequired"))
      return
    }
    setSubmitting(true)
    setError("")
    try {
      const result = await createLocalEntityAction({ name, type })
      if (result && !result.success) {
        setError(result.error ?? t("failedToAdd"))
        setSubmitting(false)
        return
      }
    } catch {
      // Server restarted
    }
    setTimeout(() => window.location.reload(), 3000)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("addEntity")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Name */}
        <div>
          <label className="text-sm font-medium">{t("entityName")}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm bg-background mt-1"
            placeholder="e.g. Seth (Autónomo) or Acme SL"
            autoFocus
          />
        </div>

        {/* Type */}
        <div>
          <label className="text-sm font-medium">{t("entityType")}</label>
          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={() => setType("autonomo")}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition-colors ${
                type === "autonomo" ? "bg-green-50 border-green-300 text-green-800" : "hover:bg-muted"
              }`}
            >
              <User className="h-4 w-4" /> {t("autonomo")}
            </button>
            <button
              type="button"
              onClick={() => setType("sl")}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition-colors ${
                type === "sl" ? "bg-blue-50 border-blue-300 text-blue-800" : "hover:bg-muted"
              }`}
            >
              <Building2 className="h-4 w-4" /> {t("sociedadLimitada")}
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSubmit} disabled={submitting || !name}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {t("addEntity")}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
