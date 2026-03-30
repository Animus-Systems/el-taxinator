"use client"

import { deleteClientAction } from "@/app/(app)/clients/actions"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Client } from "@/prisma/client"
import { Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { EditClientDialog } from "./edit-client-dialog"

export function ClientList({ clients }: { clients: Client[] }) {
  const [editingClient, setEditingClient] = useState<Client | null>(null)

  async function handleDelete(clientId: string) {
    if (!confirm("Delete this client?")) return
    const result = await deleteClientAction(null, clientId)
    if (result.success) {
      toast.success("Client deleted")
    } else {
      toast.error(result.error || "Failed to delete client")
    }
  }

  if (clients.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[300px] text-muted-foreground">
        No clients yet. Add your first client to get started.
      </div>
    )
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Tax ID</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => (
            <TableRow key={client.id}>
              <TableCell className="font-medium">{client.name}</TableCell>
              <TableCell>{client.email || "—"}</TableCell>
              <TableCell>{client.phone || "—"}</TableCell>
              <TableCell>{client.taxId || "—"}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setEditingClient(client)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(client.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {editingClient && (
        <EditClientDialog client={editingClient} onClose={() => setEditingClient(null)} />
      )}
    </>
  )
}
