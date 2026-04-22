import { useEffect, useMemo, useRef, useState } from "react"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronsUpDown } from "lucide-react"

/**
 * Baseline ISO 4217 currencies the picker always offers so search works
 * on a fresh install. User-defined currencies (from the currencies table)
 * take precedence on code collision.
 */
const BASELINE_CURRENCIES: { code: string; name: string }[] = [
  { code: "EUR", name: "Euro" },
  { code: "USD", name: "US Dollar" },
  { code: "GBP", name: "British Pound" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "DKK", name: "Danish Krone" },
  { code: "PLN", name: "Polish Zloty" },
  { code: "CZK", name: "Czech Koruna" },
  { code: "HUF", name: "Hungarian Forint" },
  { code: "RON", name: "Romanian Leu" },
  { code: "BGN", name: "Bulgarian Lev" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "KRW", name: "South Korean Won" },
  { code: "INR", name: "Indian Rupee" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "ARS", name: "Argentine Peso" },
  { code: "ZAR", name: "South African Rand" },
  { code: "TRY", name: "Turkish Lira" },
  { code: "ILS", name: "Israeli Shekel" },
  { code: "AED", name: "UAE Dirham" },
  { code: "SAR", name: "Saudi Riyal" },
  { code: "RUB", name: "Russian Ruble" },
  { code: "UAH", name: "Ukrainian Hryvnia" },
]

type Props = {
  value: string
  onChange: (code: string) => void
  placeholder?: string
  searchPlaceholder?: string
  id?: string
}

/**
 * Searchable currency combobox. Merges the user's custom currencies with a
 * built-in list of common ISO codes so search works out of the box. The
 * emitted value is always an uppercase three-letter code, even when the
 * user typed one that doesn't match any known row.
 */
export function CurrencyPicker({
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  id,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)
  const listQuery = trpc.currencies.list.useQuery({})
  const customCurrencies = listQuery.data ?? []

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 10)
    else setQuery("")
  }, [open])

  const merged = useMemo(() => {
    const byCode = new Map<string, { code: string; name: string }>()
    for (const b of BASELINE_CURRENCIES) byCode.set(b.code, b)
    for (const c of customCurrencies) byCode.set(c.code, { code: c.code, name: c.name })
    return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code))
  }, [customCurrencies])

  const q = query.trim().toUpperCase()
  const filtered = useMemo(() => {
    if (!q) return merged
    return merged.filter(
      (c) => c.code.includes(q) || c.name.toUpperCase().includes(q),
    )
  }, [merged, q])

  const selected = merged.find((c) => c.code === value) ?? null
  // Let the user commit an arbitrary three-letter code that isn't in the
  // list — e.g. a template-only currency they haven't saved yet.
  const freeCodeCandidate = /^[A-Z]{3}$/.test(q) ? q : null

  function commit(code: string) {
    onChange(code.toUpperCase().slice(0, 3))
    setOpen(false)
    setQuery("")
  }

  const displayLabel = value
    ? selected
      ? `${value} · ${selected.name}`
      : value
    : placeholder ?? "Currency"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={value ? "font-medium" : "text-muted-foreground"}>
            {displayLabel}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="border-b p-2">
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder ?? "Search code or name…"}
            className="h-8 uppercase"
            onKeyDown={(e) => {
              if (e.key === "Enter" && freeCodeCandidate) {
                e.preventDefault()
                commit(freeCodeCandidate)
              }
            }}
          />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {filtered.length === 0 && freeCodeCandidate && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => commit(freeCodeCandidate)}
            >
              <span className="font-medium">{freeCodeCandidate}</span>
              <span className="text-xs text-muted-foreground">Use custom code</span>
            </button>
          )}
          {filtered.length === 0 && !freeCodeCandidate && (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              No matches. Type a three-letter code to use a custom one.
            </p>
          )}
          {filtered.map((c) => (
            <button
              key={c.code}
              type="button"
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${
                c.code === value ? "bg-muted/50" : ""
              }`}
              onClick={() => commit(c.code)}
            >
              <div className="min-w-0 flex-1">
                <span className="font-medium">{c.code}</span>
                <span className="ml-2 text-xs text-muted-foreground truncate">{c.name}</span>
              </div>
              {c.code === value && <Check className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
