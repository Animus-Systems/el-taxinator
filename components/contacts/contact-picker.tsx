import { useEffect, useRef, useState, useTransition } from "react"
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
import type { ContactRole } from "@/models/contacts"
import { ChevronsUpDown, Check, Plus } from "lucide-react"

export type ContactPickerLabels = {
  trigger: string
  searchPlaceholder: string
  createNew: string
  /** Accepts a `{name}` placeholder substituted with the current search text. */
  createNewNamed: string
  noneYet: string
  createdToast: string
  createDialogTitle: string
  createError: string
}

type Props = {
  contacts: Contact[]
  value: string
  onChange: (contactId: string) => void
  /** Used both for filtering the visible pool and as the default role on the
   *  inline create form. Accepts "client" | "supplier" | "both". */
  role: ContactRole
  labels: ContactPickerLabels
}

export function ContactPicker({ contacts, value, onChange, role, labels }: Props) {
  const utils = trpc.useUtils()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10)
  }, [open])

  const matching =
    role === "both"
      ? contacts
      : contacts.filter((c) => c.role === role || c.role === "both")
  const pool = matching.length > 0 ? matching : contacts

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
        toast.success(labels.createdToast)
      } else {
        toast.error(result.error || labels.createError)
      }
    })
  }

  const createLabel = query.trim()
    ? labels.createNewNamed.replace("{name}", query.trim())
    : labels.createNew

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
              {selected?.name ?? labels.trigger}
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
              placeholder={labels.searchPlaceholder}
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
              {createLabel}
            </button>
            {filtered.length === 0 && !q && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                {labels.noneYet}
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
            <DialogTitle>{labels.createDialogTitle}</DialogTitle>
          </DialogHeader>
          <ContactForm
            defaultRole={role === "both" ? "client" : role}
            onSubmit={handleCreateSubmit}
            isPending={isPending}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
