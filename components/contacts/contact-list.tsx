import { deleteContactAction } from "@/actions/contacts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Contact } from "@/lib/db-types"
import { Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { EditContactDialog } from "./edit-contact-dialog"
import { useConfirm } from "@/components/ui/confirm-dialog"

function roleBadgeClass(role: Contact["role"]): string {
  if (role === "supplier") return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40"
  if (role === "both") return "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/40"
  return "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/40"
}

export function ContactList({ contacts }: { contacts: Contact[] }) {
  const t = useTranslations("contacts")
  const confirm = useConfirm()
  const [editingContact, setEditingContact] = useState<Contact | null>(null)

  async function handleDelete(contactId: string) {
    const ok = await confirm({
      title: t("deleteContact"),
      description: t("deleteContact"),
      confirmLabel: "Delete",
      variant: "destructive",
    })
    if (!ok) return
    const result = await deleteContactAction(null, contactId)
    if (result.success) {
      toast.success(t("contactDeleted"))
    } else {
      toast.error(result.error || t("failedToDeleteContact"))
    }
  }

  if (contacts.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[300px] text-muted-foreground">
        {t("noContacts")}
      </div>
    )
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("name")}</TableHead>
            <TableHead>{t("role")}</TableHead>
            <TableHead>{t("kind")}</TableHead>
            <TableHead>{t("email")}</TableHead>
            <TableHead>{t("taxId")}</TableHead>
            <TableHead>{t("city")}</TableHead>
            <TableHead className="text-right">{t("actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.map((contact) => (
            <TableRow key={contact.id}>
              <TableCell className="font-medium">{contact.name}</TableCell>
              <TableCell>
                <Badge variant="outline" className={roleBadgeClass(contact.role)}>
                  {t(`role${contact.role.charAt(0).toUpperCase()}${contact.role.slice(1)}` as "roleClient" | "roleSupplier" | "roleBoth")}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {t(contact.kind === "company" ? "kindCompany" : "kindPerson")}
              </TableCell>
              <TableCell>{contact.email || "—"}</TableCell>
              <TableCell>{contact.taxId || "—"}</TableCell>
              <TableCell>{contact.city || "—"}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setEditingContact(contact)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(contact.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {editingContact && (
        <EditContactDialog contact={editingContact} onClose={() => setEditingContact(null)} />
      )}
    </>
  )
}
