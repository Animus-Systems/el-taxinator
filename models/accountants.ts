import { prisma } from "@/lib/db"
import { randomBytes } from "crypto"
import { cache } from "react"

export type AccountantPermissions = {
  transactions: boolean
  invoices: boolean
  tax: boolean
  time: boolean
}

export type AccountantInviteData = {
  name: string
  email?: string | null
  permissions?: AccountantPermissions
  expiresAt?: Date | null
}

const DEFAULT_PERMISSIONS: AccountantPermissions = {
  transactions: true,
  invoices: true,
  tax: true,
  time: false,
}

function generateToken(): string {
  return randomBytes(32).toString("hex")
}

export const getAccountantInvites = cache(async (userId: string) => {
  return prisma.accountantInvite.findMany({
    where: { userId },
    include: {
      _count: { select: { accessLogs: true, comments: true } },
    },
    orderBy: { createdAt: "desc" },
  })
})

export const getAccountantInviteByToken = cache(async (token: string) => {
  const invite = await prisma.accountantInvite.findUnique({
    where: { token },
    include: { user: true },
  })
  if (!invite) return null
  if (!invite.isActive) return null
  if (invite.expiresAt && invite.expiresAt < new Date()) return null
  return invite
})

export async function createAccountantInvite(userId: string, data: AccountantInviteData) {
  const token = generateToken()
  return prisma.accountantInvite.create({
    data: {
      userId,
      token,
      name: data.name,
      email: data.email ?? null,
      permissions: (data.permissions ?? DEFAULT_PERMISSIONS) as object,
      expiresAt: data.expiresAt ?? null,
    },
  })
}

export async function updateAccountantInvite(id: string, userId: string, data: Partial<AccountantInviteData> & { isActive?: boolean }) {
  return prisma.accountantInvite.update({
    where: { id, userId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.permissions !== undefined && { permissions: data.permissions as object }),
      ...(data.expiresAt !== undefined && { expiresAt: data.expiresAt }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  })
}

export async function revokeAccountantInvite(id: string, userId: string) {
  return prisma.accountantInvite.update({
    where: { id, userId },
    data: { isActive: false },
  })
}

export async function deleteAccountantInvite(id: string, userId: string) {
  return prisma.accountantInvite.delete({ where: { id, userId } })
}

export async function logAccountantAccess(
  inviteId: string,
  section: string,
  ipAddress?: string,
  userAgent?: string
) {
  return prisma.accountantAccessLog.create({
    data: { inviteId, section, ipAddress, userAgent },
  })
}

export const getAccountantAccessLogs = cache(async (inviteId: string, userId: string) => {
  // Verify ownership
  const invite = await prisma.accountantInvite.findUnique({ where: { id: inviteId, userId } })
  if (!invite) return []
  return prisma.accountantAccessLog.findMany({
    where: { inviteId },
    orderBy: { accessedAt: "desc" },
    take: 100,
  })
})

export async function createAccountantComment(inviteId: string, entityType: string, entityId: string, body: string) {
  return prisma.accountantComment.create({
    data: { inviteId, entityType, entityId, body },
  })
}

export const getAccountantComments = cache(async (inviteId: string, entityType: string, entityId: string) => {
  return prisma.accountantComment.findMany({
    where: { inviteId, entityType, entityId },
    orderBy: { createdAt: "asc" },
  })
})

export const getAllAccountantCommentsByInvite = cache(async (inviteId: string, userId: string) => {
  const invite = await prisma.accountantInvite.findUnique({ where: { id: inviteId, userId } })
  if (!invite) return []
  return prisma.accountantComment.findMany({
    where: { inviteId },
    orderBy: { createdAt: "desc" },
  })
})
