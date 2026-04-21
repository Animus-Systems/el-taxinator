import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Check, Landmark, Loader2, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { trpc } from "~/trpc"
import type { BankAccount, AccountTypeValue } from "@/lib/db-types"

type Props = {
  open: boolean
  accounts: BankAccount[]
  suggestedAccountId?: string | null
  onCancel: () => void
  onConfirm: (accountId: string) => void
}

const ACCOUNT_TYPES: AccountTypeValue[] = [
  "bank",
  "credit_card",
  "crypto_exchange",
  "crypto_wallet",
  "cash",
]

/**
 *  Account picker that gates transaction imports. The caller opens this after
 *  the user drops files but BEFORE anything hits the server — so the final
 *  upload always carries a real `accountId`. Transactions arriving without an
 *  account are how they end up invisible to the per-account balance filter,
 *  which is the problem this dialog exists to prevent.
 */
export function ImportAccountPickerDialog({
  open,
  accounts,
  suggestedAccountId,
  onCancel,
  onConfirm,
}: Props) {
  const { t } = useTranslation("wizard")
  const utils = trpc.useUtils()

  const [selectedId, setSelectedId] = useState<string | null>(suggestedAccountId ?? null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newBankName, setNewBankName] = useState("")
  const [newCurrency, setNewCurrency] = useState("EUR")
  const [newType, setNewType] = useState<AccountTypeValue>("bank")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSelectedId(suggestedAccountId ?? null)
    setCreating(false)
    setNewName("")
    setNewBankName("")
    setNewCurrency("EUR")
    setNewType("bank")
    setError(null)
  }, [open, suggestedAccountId])

  const createMutation = trpc.accounts.create.useMutation({
    onSuccess: (acct) => {
      utils.accounts.list.invalidate()
      utils.accounts.listActive.invalidate()
      if (acct?.id) {
        onConfirm(acct.id)
      }
    },
    onError: (err) => {
      setError(err.message)
    },
  })

  const handleConfirm = () => {
    setError(null)
    if (creating) {
      const trimmedName = newName.trim()
      if (!trimmedName) {
        setError(t("accountPicker.nameRequired", { defaultValue: "Account name is required." }))
        return
      }
      const trimmedCurrency = newCurrency.trim().toUpperCase() || "EUR"
      createMutation.mutate({
        name: trimmedName,
        bankName: newBankName.trim() || null,
        currencyCode: trimmedCurrency,
        accountType: newType,
      })
      return
    }
    if (!selectedId) {
      setError(t("accountPicker.pickOne", { defaultValue: "Pick an account to continue." }))
      return
    }
    onConfirm(selectedId)
  }

  const pending = createMutation.isPending

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !pending) onCancel() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("accountPicker.title", { defaultValue: "Which account is this for?" })}
          </DialogTitle>
          <DialogDescription>
            {t("accountPicker.description", {
              defaultValue:
                "Pick the bank account these transactions belong to. Rows left unassigned won't show up under any account's balance later.",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {accounts.map((account) => {
            const active = !creating && selectedId === account.id
            return (
              <button
                key={account.id}
                type="button"
                onClick={() => { setCreating(false); setSelectedId(account.id); setError(null) }}
                className={cn(
                  "w-full flex items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                  active
                    ? "border-foreground bg-muted/40"
                    : "border-border hover:bg-muted/20",
                )}
              >
                <Landmark className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{account.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[account.bankName, account.currencyCode, account.accountType]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                {active ? <Check className="h-4 w-4 text-foreground flex-shrink-0" /> : null}
              </button>
            )
          })}

          <button
            type="button"
            onClick={() => { setCreating(true); setSelectedId(null); setError(null) }}
            className={cn(
              "w-full flex items-center gap-3 rounded-md border border-dashed px-3 py-2.5 text-left transition-colors",
              creating
                ? "border-foreground bg-muted/40"
                : "border-border hover:bg-muted/20",
            )}
          >
            <Plus className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="text-sm font-medium">
              {t("accountPicker.createNew", { defaultValue: "Create new account" })}
            </div>
          </button>

          {creating ? (
            <div className="space-y-3 rounded-md border p-3 bg-muted/10">
              <div className="space-y-1">
                <Label htmlFor="pick-new-name" className="text-xs">
                  {t("accountPicker.name", { defaultValue: "Account name" })}
                </Label>
                <Input
                  id="pick-new-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="BBVA Cuenta Principal"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="pick-new-bank" className="text-xs">
                    {t("accountPicker.bank", { defaultValue: "Bank (optional)" })}
                  </Label>
                  <Input
                    id="pick-new-bank"
                    value={newBankName}
                    onChange={(e) => setNewBankName(e.target.value)}
                    placeholder="BBVA"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pick-new-currency" className="text-xs">
                    {t("accountPicker.currency", { defaultValue: "Currency" })}
                  </Label>
                  <Input
                    id="pick-new-currency"
                    value={newCurrency}
                    onChange={(e) => setNewCurrency(e.target.value)}
                    maxLength={10}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="pick-new-type" className="text-xs">
                  {t("accountPicker.type", { defaultValue: "Type" })}
                </Label>
                <Select
                  value={newType}
                  onValueChange={(v) => setNewType(v as AccountTypeValue)}
                >
                  <SelectTrigger id="pick-new-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {t(`accountPicker.type_${v}`, { defaultValue: v.replace("_", " ") })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            {t("accountPicker.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            {creating
              ? t("accountPicker.createAndContinue", { defaultValue: "Create & continue" })
              : t("accountPicker.useAccount", { defaultValue: "Use this account" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
