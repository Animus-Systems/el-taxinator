import { prisma } from "@/lib/db"
import { cache } from "react"

export type ProductData = {
  name: string
  description?: string | null
  price: number
  currencyCode?: string
  vatRate?: number
  unit?: string | null
}

export const getProducts = cache(async (userId: string) => {
  return prisma.product.findMany({
    where: { userId },
    orderBy: { name: "asc" },
  })
})

export const getProductById = cache(async (id: string, userId: string) => {
  return prisma.product.findFirst({ where: { id, userId } })
})

export async function createProduct(userId: string, data: ProductData) {
  return prisma.product.create({ data: { ...data, userId } })
}

export async function updateProduct(id: string, userId: string, data: ProductData) {
  return prisma.product.update({ where: { id, userId }, data })
}

export async function deleteProduct(id: string, userId: string) {
  return prisma.product.delete({ where: { id, userId } })
}
