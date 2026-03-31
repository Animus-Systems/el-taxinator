import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/prisma/client"

const globalForPrisma = globalThis as unknown as {
  prismaAdapter: PrismaPg | undefined
  prisma: PrismaClient | undefined
}

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error("DATABASE_URL is not set")
}

const adapter =
  globalForPrisma.prismaAdapter ?? new PrismaPg({ connectionString })

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ["query", "info", "warn", "error"],
  })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaAdapter = adapter
  globalForPrisma.prisma = prisma
}
