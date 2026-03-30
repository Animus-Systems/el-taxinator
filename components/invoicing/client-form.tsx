"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Client } from "@/prisma/client"

type Props = {
  client?: Client
  onSubmit: (formData: FormData) => void
  isPending: boolean
}

export function ClientForm({ client, onSubmit, isPending }: Props) {
  return (
    <form action={onSubmit} className="space-y-4">
      {client && <input type="hidden" name="clientId" value={client.id} />}
      <div className="space-y-1">
        <Label htmlFor="name">Name *</Label>
        <Input id="name" name="name" defaultValue={client?.name} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" defaultValue={client?.email || ""} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" defaultValue={client?.phone || ""} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="taxId">Tax ID (NIF/CIF)</Label>
        <Input id="taxId" name="taxId" defaultValue={client?.taxId || ""} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="address">Address</Label>
        <Input id="address" name="address" defaultValue={client?.address || ""} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="notes">Notes</Label>
        <Input id="notes" name="notes" defaultValue={client?.notes || ""} />
      </div>
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Saving..." : client ? "Save Changes" : "Create Client"}
      </Button>
    </form>
  )
}
