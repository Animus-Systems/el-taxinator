
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import type { AccountantPermissions } from "@/models/accountants"
import { createInviteAction, deleteInviteAction, reactivateInviteAction, revokeInviteAction } from "@/actions/accountant"
import { Check, Copy, Link, Plus, Trash2, UserX, UserCheck } from "lucide-react"
import { useTranslations } from "next-intl"
import { useConfirm } from "@/components/ui/confirm-dialog"

type InviteWithUrl = {
  id: string
  name: string
  email: string | null
  token: string
  permissions: AccountantPermissions
  isActive: boolean
  expiresAt: Date | null
  accessUrl: string
  _count: { accessLogs: number; comments: number }
}

function CopyButton({ text }: { text: string }) {
  const t = useTranslations("accountantInvite")
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? t("copied") : t("copyLink")}
    </Button>
  )
}

function PermissionBadge({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${
      enabled
        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
        : "bg-muted text-muted-foreground line-through"
    }`}>
      {label}
    </span>
  )
}

function InviteCard({ invite }: { invite: InviteWithUrl }) {
  const t = useTranslations("accountantInvite")
  const confirm = useConfirm()
  const [pending, setPending] = useState(false)

  async function handleRevoke() {
    setPending(true)
    await revokeInviteAction(invite.id)
    setPending(false)
  }
  async function handleReactivate() {
    setPending(true)
    await reactivateInviteAction(invite.id)
    setPending(false)
  }
  async function handleDelete() {
    const ok = await confirm({
      title: t("deleteConfirmTitle"),
      description: t("deleteConfirm", { name: invite.name }),
      confirmLabel: t("delete"),
      variant: "destructive",
    })
    if (!ok) return
    setPending(true)
    await deleteInviteAction(invite.id)
    setPending(false)
  }

  return (
    <div className={`rounded-lg border p-4 ${!invite.isActive ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{invite.name}</span>
            {invite.isActive ? (
              <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">{t("active")}</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">{t("revoked")}</Badge>
            )}
          </div>
          {invite.email && <p className="text-sm text-muted-foreground">{invite.email}</p>}
          <p className="text-xs text-muted-foreground mt-1">
            {invite._count.accessLogs} accesses · {invite._count.comments} comments
            {invite.expiresAt && ` · Expires ${new Date(invite.expiresAt).toLocaleDateString()}`}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {invite.isActive && <CopyButton text={invite.accessUrl} />}
          {invite.isActive ? (
            <Button variant="outline" size="sm" onClick={handleRevoke} disabled={pending} className="gap-1.5">
              <UserX className="h-3 w-3" /> {t("revoke")}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={handleReactivate} disabled={pending} className="gap-1.5">
              <UserCheck className="h-3 w-3" /> {t("reactivate")}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={handleDelete} disabled={pending} className="h-8 w-8 text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <PermissionBadge label={t("transactions")} enabled={invite.permissions.transactions} />
        <PermissionBadge label={t("invoices")} enabled={invite.permissions.invoices} />
        <PermissionBadge label={t("taxReports")} enabled={invite.permissions.tax} />
      </div>

      {invite.isActive && (
        <div className="flex items-center gap-2 bg-muted/50 rounded px-3 py-1.5 text-xs font-mono text-muted-foreground overflow-hidden">
          <Link className="h-3 w-3 shrink-0" />
          <span className="truncate">{invite.accessUrl}</span>
        </div>
      )}
    </div>
  )
}

export function AccountantInviteManager({ invites }: { invites: InviteWithUrl[] }) {
  const t = useTranslations("accountantInvite")
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)

  async function handleCreate(formData: FormData) {
    setCreating(true)
    try {
      await createInviteAction(formData)
      setShowForm(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-4">
      {invites.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground py-4">{t("noInvites")}</p>
      )}

      {invites.map((invite) => (
        <InviteCard key={invite.id} invite={invite} />
      ))}

      {showForm ? (
        <div className="rounded-lg border p-4">
          <h3 className="font-medium mb-4">{t("newAccountantInvite")}</h3>
          <form action={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="name">{t("name")}</Label>
                <Input id="name" name="name" placeholder={t("namePlaceholder")} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email">{t("emailOptional")}</Label>
                <Input id="email" name="email" type="email" placeholder="accountant@example.com" />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="expires_at">{t("expires")}</Label>
              <Input id="expires_at" name="expires_at" type="date" />
            </div>

            <div>
              <Label className="mb-2 block">{t("sectionsToShare")}</Label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: "perm_transactions", label: t("transactions"), default: true },
                  { key: "perm_invoices", label: t("invoices"), default: true },
                  { key: "perm_tax", label: t("taxReports"), default: true },
                ].map(({ key, label, default: def }) => (
                  <div key={key} className="flex items-center gap-2">
                    <Switch id={key} name={key} defaultChecked={def} value="on" />
                    <Label htmlFor={key} className="font-normal cursor-pointer">{label}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={creating}>
                {creating ? t("creating") : t("createInvite")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                {t("cancel")}
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="h-4 w-4" /> {t("newInvite")}
        </Button>
      )}
    </div>
  )
}
