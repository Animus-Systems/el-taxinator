/**
 * Contacts page — unified list for parties the user transacts with (clients
 * of invoices/quotes AND suppliers of purchases). Renamed from the former
 * Clients page as part of schema v27 (clients→contacts).
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { trpc } from "~/trpc"
import { Button } from "@/components/ui/button"
import { ContactList } from "@/components/contacts/contact-list"
import { NewContactDialog } from "@/components/contacts/new-contact-dialog"
import { ImportContactsDialog } from "@/components/contacts/import-contacts-dialog"
import { Plus, Sparkles } from "lucide-react"

export function ContactsPage() {
  const { t } = useTranslation("contacts")
  const [importOpen, setImportOpen] = useState(false)

  const { data: contacts, isLoading } = trpc.contacts.list.useQuery({})

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const contactList = contacts ?? []

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">{t("title")}</span>
          <span className="text-3xl tracking-tight opacity-20">{contactList.length}</span>
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Sparkles className="h-4 w-4" />
            <span className="hidden md:inline">{t("import.buttonLabel")}</span>
          </Button>
          <NewContactDialog>
            <Plus /> <span className="hidden md:block">{t("add")}</span>
          </NewContactDialog>
        </div>
      </header>
      <main>
        <ContactList contacts={contactList} />
      </main>
      <ImportContactsDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  )
}
