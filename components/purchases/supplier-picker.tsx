import { useEffect, useRef, useState, useTransition } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { trpc } from "~/trpc"
import { createContactAction } from "@/actions/contacts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ContactForm } from "@/components/contacts/contact-form"
import type { Contact } from "@/lib/db-types"
import { ChevronsUpDown, Check, Plus } from "lucide-react"

type Props = {
  contacts: Contact[]
  value: string
  onChange: (contactId: string) => void
}

export function SupplierPicker({ contacts, value, onChange }: Props) {
  const { t } = useTranslation("purchases")
  const utils = trpc.useUtils()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10)
  }, [open])

  const suppliers = contacts.filter((c) => c.role === "supplier" || c.role === "both")
  const pool = suppliers.length > 0 ? suppliers : contacts
  const q = query.trim().toLowerCase()
  const filtered = q
    ? pool.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.taxId ?? "").toLowerCase().includes(q) ||
          (c.city ?? "").toLowerCase().includes(q),
      )
    : pool
  const selected = contacts.find((c) => c.id === value) ?? null

  const [isPending, startTransition] = useTransition()

  function handleCreateSubmit(formData: FormData): void {
    startTransition(async () => {
      const result = await createContactAction(null, formData)
      if (result.success && result.data) {
        utils.contacts.list.invalidate()
        onChange(result.data.id)
        setCreateOpen(false)
        setOpen(false)
        toast.success(t("supplierCreated", { defaultValue: "Supplier created" }))
      } else {
        toast.error(result.error || t("attach.uploadFailed"))
      }
    })
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className={selected ? "" : "text-muted-foreground"}>
              {selected?.name ?? t("selectSupplier")}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="border-b p-2">
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("supplierSearchPlaceholder")}
              className="h-8"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" />
              {query.trim()
                ? t("supplierCreateNewNamed", {
                    name: query.trim(),
                    defaultValue: `Create "${query.trim()}"`,
                  })
                : t("supplierCreateNew")}
            </button>
            {filtered.length === 0 && !q && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                {t("noSuppliersYet", { defaultValue: "No suppliers yet." })}
              </p>
            )}
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${
                  c.id === value ? "bg-muted/50" : ""
                }`}
                onClick={() => {
                  onChange(c.id)
                  setOpen(false)
                  setQuery("")
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.name}</div>
                  {(c.taxId || c.city) && (
                    <div className="truncate text-xs text-muted-foreground">
                      {[c.taxId, c.city].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
                {c.id === value && <Check className="h-4 w-4 shrink-0" />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("supplierCreateNew")}</DialogTitle>
          </DialogHeader>
          <ContactForm
            defaultRole="supplier"
            onSubmit={handleCreateSubmit}
            isPending={isPending}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
