"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Check, Edit, Trash2 } from "lucide-react"
import { type ReactNode, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { getLocalizedValue } from "@/lib/i18n-db"

interface CrudColumn<T> {
  key: keyof T
  label: string
  type?: "text" | "number" | "checkbox" | "select" | "color"
  options?: string[]
  defaultValue?: string | boolean
  editable?: boolean
}

interface CrudProps<T> {
  items: T[]
  columns: CrudColumn<T>[]
  onDelete: (id: string) => Promise<{ success: boolean; error?: string }>
  onAdd: (data: Partial<T>) => Promise<{ success: boolean; error?: string }>
  onEdit?: (id: string, data: Partial<T>) => Promise<{ success: boolean; error?: string }>
}

export function CrudTable<T extends Record<string, unknown>>({ items, columns, onDelete, onAdd, onEdit }: CrudProps<T>) {
  const t = useTranslations("settings")
  const locale = useLocale()
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newItem, setNewItem] = useState<Partial<T>>(itemDefaults(columns))
  const [editingItem, setEditingItem] = useState<Partial<T>>(itemDefaults(columns))
  const optimisticItems = items

  const getCellValue = (item: Partial<T>, column: CrudColumn<T>) => item[column.key]

  const renderPrimitiveValue = (value: unknown): ReactNode => {
    if (value == null) {
      return ""
    }
    // Localize i18n values — parsed objects or JSON strings
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return getLocalizedValue(value, locale)
    }
    if (typeof value === "string" && value.startsWith("{")) {
      return getLocalizedValue(value, locale)
    }
    if (typeof value === "boolean") {
      return value ? "True" : "False"
    }
    if (typeof value === "string" || typeof value === "number") {
      return value
    }
    return String(value)
  }

  const FormCell = (item: T, column: CrudColumn<T>) => {
    if (column.type === "checkbox") {
      return getCellValue(item, column) ? <Check /> : ""
    }
    if (column.type === "color" || column.key === "color") {
      const value = String(getCellValue(item, column) ?? "")
      return (
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full border" style={{ backgroundColor: value || "#ffffff" }} />
          <span>{value}</span>
        </div>
      )
    }
    return renderPrimitiveValue(getCellValue(item, column))
  }

  const EditFormCell = (item: T, column: CrudColumn<T>) => {
    if (column.type === "checkbox") {
      return (
        <input
          type="checkbox"
          checked={Boolean(getCellValue(editingItem, column))}
          aria-label={String(column.label)}
          onChange={(e) =>
            setEditingItem({
              ...editingItem,
              [column.key]: e.target.checked,
            })
          }
        />
      )
    } else if (column.type === "select") {
      return (
        <select
          value={String(getCellValue(editingItem, column) ?? "")}
          className="p-2 rounded-md border bg-transparent"
          aria-label={String(column.label)}
          onChange={(e) =>
            setEditingItem({
              ...editingItem,
              [column.key]: e.target.value,
            })
          }
        >
          {column.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )
    } else if (column.type === "color" || column.key === "color") {
      return (
        <div className="flex items-center gap-2">
          <div className="relative">
            <span
              className="block h-4 w-4 rounded-full border"
              style={{ backgroundColor: String(getCellValue(editingItem, column) ?? "#000") }}
            />
            <input
              type="color"
              className="absolute inset-0 h-4 w-4 opacity-0 cursor-pointer"
              value={String(getCellValue(editingItem, column) ?? "#000")}
              onChange={(e) =>
                setEditingItem({
                  ...editingItem,
                  [column.key]: e.target.value,
                })
              }
            />
          </div>
          <Input
            type="text"
            value={String(getCellValue(editingItem, column) ?? "")}
            aria-label={String(column.label)}
            onChange={(e) =>
              setEditingItem({
                ...editingItem,
                [column.key]: e.target.value,
              })
            }
            placeholder="#FFFFFF"
          />
        </div>
      )
    }

    return (
      <Input
        type="text"
        value={String(getCellValue(editingItem, column) ?? "")}
        aria-label={String(column.label)}
        onChange={(e) =>
          setEditingItem({
            ...editingItem,
            [column.key]: e.target.value,
          })
        }
      />
    )
  }

  const AddFormCell = (column: CrudColumn<T>) => {
    if (column.type === "checkbox") {
      return (
        <input
          type="checkbox"
          checked={Boolean(newItem[column.key] || column.defaultValue)}
          aria-label={String(column.label)}
          onChange={(e) =>
            setNewItem({
              ...newItem,
              [column.key]: e.target.checked,
            })
          }
        />
      )
    } else if (column.type === "select") {
      return (
        <select
          value={String(newItem[column.key] || column.defaultValue || "")}
          className="p-2 rounded-md border bg-transparent"
          aria-label={String(column.label)}
          onChange={(e) =>
            setNewItem({
              ...newItem,
              [column.key]: e.target.value,
            })
          }
        >
          {column.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )
    } else if (column.type === "color" || column.key === "color") {
      return (
        <div className="flex items-center gap-2">
          <div className="relative">
            <span
              className="block h-4 w-4 rounded-full border"
              style={{ backgroundColor: String(newItem[column.key] || column.defaultValue || "#000") }}
            />
            <input
              type="color"
              className="absolute inset-0 h-4 w-4 opacity-0 cursor-pointer"
              value={String(newItem[column.key] || column.defaultValue || "#000")}
              onChange={(e) =>
                setNewItem({
                  ...newItem,
                  [column.key]: e.target.value,
                })
              }
            />
          </div>
          <Input
            type="text"
            value={String(newItem[column.key] || column.defaultValue || "")}
            aria-label={String(column.label)}
            onChange={(e) =>
              setNewItem({
                ...newItem,
                [column.key]: e.target.value,
              })
            }
            placeholder="#FFFFFF"
          />
        </div>
      )
    }
    return (
      <Input
        type={column.type || "text"}
        value={String(newItem[column.key] || column.defaultValue || "")}
        aria-label={String(column.label)}
        onChange={(e) =>
          setNewItem({
            ...newItem,
            [column.key]: e.target.value,
          })
        }
      />
    )
  }

  const handleAdd = async () => {
    try {
      const result = await onAdd(newItem)
      if (result.success) {
        setIsAdding(false)
        setNewItem(itemDefaults(columns))
      } else {
        alert(result.error)
      }
    } catch (error) {
      console.error("Failed to add item:", error)
    }
  }

  const handleEdit = async (id: string) => {
    if (!onEdit) return
    try {
      const result = await onEdit(id, editingItem)
      if (result.success) {
        setEditingId(null)
        setEditingItem({})
      } else {
        alert(result.error)
      }
    } catch (error) {
      console.error("Failed to edit item:", error)
    }
  }

  const startEditing = (item: T) => {
    setEditingId(String(item.code ?? item.id ?? ""))
    setEditingItem(item)
  }

  const handleDelete = async (id: string) => {
    try {
      const result = await onDelete(id)
      if (!result.success) {
        alert(result.error)
      }
    } catch (error) {
      console.error("Failed to delete item:", error)
    }
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={String(column.key)}>{column.label}</TableHead>
            ))}
            <TableHead className="w-[100px]">{t("actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {optimisticItems.map((item, index) => (
            <TableRow key={index}>
              {columns.map((column) => (
                <TableCell key={String(column.key)} className="first:font-semibold">
                  {editingId === String(item.code ?? item.id ?? "") && column.editable
                    ? EditFormCell(item, column)
                    : FormCell(item, column)}
                </TableCell>
              ))}
              <TableCell>
                <div className="flex gap-2">
                  {editingId === String(item.code ?? item.id ?? "") ? (
                    <>
                      <Button size="sm" onClick={() => handleEdit(String(item.code ?? item.id ?? ""))} aria-label={t("saveNewItem")}>
                        {t("saveItem")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)} aria-label={t("cancelNewItem")}>
                        {t("cancelEditing")}
                      </Button>
                    </>
                  ) : (
                    <>
                      {onEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            startEditing(item)
                            setIsAdding(false)
                          }}
                          aria-label={t("editItem", { name: String(item.name ?? item.code ?? "item") })}
                        >
                          <Edit />
                        </Button>
                      )}
                      {item.isDeletable && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleDelete(String(item.code ?? item.id ?? ""))}
                          aria-label={t("deleteItem", { name: String(item.name ?? item.code ?? "item") })}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {isAdding && (
            <TableRow>
              {columns.map((column) => (
                <TableCell key={String(column.key)} className="first:font-semibold">
                  {column.editable && AddFormCell(column)}
                </TableCell>
              ))}
              <TableCell>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAdd} aria-label={t("saveNewItem")}>
                    {t("saveItem")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setIsAdding(false)} aria-label={t("cancelNewItem")}>
                    {t("cancelEditing")}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {!isAdding && (
        <Button
          onClick={() => {
            setIsAdding(true)
            setEditingId(null)
          }}
          aria-label={t("addNewItem")}
        >
          {t("addNew")}
        </Button>
      )}
    </div>
  )
}
function itemDefaults<T>(columns: CrudColumn<T>[]) {
  return columns.reduce((acc, column) => {
    acc[column.key] = column.defaultValue as T[keyof T]
    return acc
  }, {} as Partial<T>)
}
