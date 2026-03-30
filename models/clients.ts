import { prisma } from "@/lib/db"
import { cache } from "react"

export type ClientData = {
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
  taxId?: string | null
  notes?: string | null
}

export const getClients = cache(async (userId: string) => {
  return prisma.client.findMany({
    where: { userId },
    orderBy: { name: "asc" },
  })
})

export const getClientById = cache(async (id: string, userId: string) => {
  return prisma.client.findFirst({ where: { id, userId } })
})

export async function createClient(userId: string, data: ClientData) {
  return prisma.client.create({ data: { ...data, userId } })
}

export async function updateClient(id: string, userId: string, data: ClientData) {
  return prisma.client.update({ where: { id, userId }, data })
}

export async function deleteClient(id: string, userId: string) {
  return prisma.client.delete({ where: { id, userId } })
}
