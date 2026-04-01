import { getPool } from "@/lib/pg"
import {
  sql,
  queryMany,
  queryOne,
  buildInsert,
  buildUpdate,
  execute,
  mapRow,
} from "@/lib/sql"
import type {
  AccountantInvite,
  AccountantAccessLog,
  AccountantComment,
  User,
} from "@/lib/db-types"
import { randomBytes } from "crypto"
import { cache } from "react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Invite with counts type
// ---------------------------------------------------------------------------

type AccountantInviteWithCounts = AccountantInvite & {
  _count: { accessLogs: number; comments: number }
}

type AccountantInviteWithUser = AccountantInvite & {
  user?: User | null
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

export const getAccountantInvites = cache(
  async (userId: string): Promise<AccountantInviteWithCounts[]> => {
    const pool = await getPool()
    const result = await pool.query(
      `SELECT ai.*,
              (SELECT COUNT(*)::int FROM accountant_access_logs aal WHERE aal.invite_id = ai.id) AS access_log_count,
              (SELECT COUNT(*)::int FROM accountant_comments ac WHERE ac.invite_id = ai.id) AS comment_count
       FROM accountant_invites ai
       WHERE ai.user_id = $1
       ORDER BY ai.created_at DESC`,
      [userId],
    )
    return result.rows.map((row) => {
      const invite = mapRow<AccountantInviteWithCounts>(row)
      invite._count = {
        accessLogs: row.access_log_count ?? 0,
        comments: row.comment_count ?? 0,
      }
      return invite
    })
  },
)

export const getAccountantInviteByToken = cache(
  async (token: string): Promise<AccountantInviteWithUser | null> => {
    const pool = await getPool()
    const result = await pool.query(
      `SELECT ai.*,
              u.id AS u_id, u.email AS u_email, u.name AS u_name, u.avatar AS u_avatar,
              u.created_at AS u_created_at, u.updated_at AS u_updated_at,
              u.stripe_customer_id AS u_stripe_customer_id,
              u.membership_plan AS u_membership_plan,
              u.membership_expires_at AS u_membership_expires_at,
              u.email_verified AS u_email_verified,
              u.storage_used AS u_storage_used, u.storage_limit AS u_storage_limit,
              u.ai_balance AS u_ai_balance,
              u.business_name AS u_business_name, u.business_address AS u_business_address,
              u.business_bank_details AS u_business_bank_details,
              u.business_logo AS u_business_logo, u.business_tax_id AS u_business_tax_id
       FROM accountant_invites ai
       JOIN users u ON u.id = ai.user_id
       WHERE ai.token = $1`,
      [token],
    )

    if (result.rows.length === 0) return null

    const row = result.rows[0]
    const invite = mapRow<AccountantInviteWithUser>(row)

    if (!invite.isActive) return null
    if (invite.expiresAt && invite.expiresAt < new Date()) return null

    invite.user = {
      id: row.u_id,
      email: row.u_email,
      name: row.u_name,
      avatar: row.u_avatar ?? null,
      createdAt: row.u_created_at ? new Date(row.u_created_at) : new Date(),
      updatedAt: row.u_updated_at ? new Date(row.u_updated_at) : new Date(),
      stripeCustomerId: row.u_stripe_customer_id ?? null,
      membershipPlan: row.u_membership_plan ?? null,
      membershipExpiresAt: row.u_membership_expires_at
        ? new Date(row.u_membership_expires_at)
        : null,
      emailVerified: row.u_email_verified ?? false,
      storageUsed: typeof row.u_storage_used === "string" ? Number(row.u_storage_used) : (row.u_storage_used ?? 0),
      storageLimit: typeof row.u_storage_limit === "string" ? Number(row.u_storage_limit) : (row.u_storage_limit ?? 0),
      aiBalance: typeof row.u_ai_balance === "string" ? Number(row.u_ai_balance) : (row.u_ai_balance ?? 0),
      businessName: row.u_business_name ?? null,
      businessAddress: row.u_business_address ?? null,
      businessBankDetails: row.u_business_bank_details ?? null,
      businessLogo: row.u_business_logo ?? null,
      businessTaxId: row.u_business_tax_id ?? null,
    } as User

    return invite
  },
)

export async function createAccountantInvite(userId: string, data: AccountantInviteData) {
  const token = generateToken()
  return queryOne<AccountantInvite>(
    buildInsert("accountant_invites", {
      userId,
      token,
      name: data.name,
      email: data.email ?? null,
      permissions: data.permissions ?? DEFAULT_PERMISSIONS,
      expiresAt: data.expiresAt ?? null,
    }),
  )
}

export async function updateAccountantInvite(
  id: string,
  userId: string,
  data: Partial<AccountantInviteData> & { isActive?: boolean },
) {
  const updateData: Record<string, unknown> = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.email !== undefined) updateData.email = data.email
  if (data.permissions !== undefined) updateData.permissions = data.permissions
  if (data.expiresAt !== undefined) updateData.expiresAt = data.expiresAt
  if (data.isActive !== undefined) updateData.isActive = data.isActive

  return queryOne<AccountantInvite>(
    buildUpdate("accountant_invites", updateData, "id = $1 AND user_id = $2", [id, userId]),
  )
}

export async function revokeAccountantInvite(id: string, userId: string) {
  return queryOne<AccountantInvite>(
    buildUpdate("accountant_invites", { isActive: false }, "id = $1 AND user_id = $2", [id, userId]),
  )
}

export async function deleteAccountantInvite(id: string, userId: string) {
  const result = await queryOne<AccountantInvite>(
    sql`DELETE FROM accountant_invites WHERE id = ${id} AND user_id = ${userId} RETURNING *`,
  )
  return result
}

// ---------------------------------------------------------------------------
// Access logs
// ---------------------------------------------------------------------------

export async function logAccountantAccess(
  inviteId: string,
  section: string,
  ipAddress?: string,
  userAgent?: string,
) {
  return queryOne<AccountantAccessLog>(
    buildInsert("accountant_access_logs", {
      inviteId,
      section,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    }),
  )
}

export const getAccountantAccessLogs = cache(
  async (inviteId: string, userId: string): Promise<AccountantAccessLog[]> => {
    // Verify ownership
    const invite = await queryOne<AccountantInvite>(
      sql`SELECT * FROM accountant_invites WHERE id = ${inviteId} AND user_id = ${userId}`,
    )
    if (!invite) return []

    return queryMany<AccountantAccessLog>(
      sql`SELECT * FROM accountant_access_logs WHERE invite_id = ${inviteId} ORDER BY accessed_at DESC LIMIT 100`,
    )
  },
)

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function createAccountantComment(
  inviteId: string,
  entityType: string,
  entityId: string,
  body: string,
) {
  return queryOne<AccountantComment>(
    buildInsert("accountant_comments", {
      inviteId,
      entityType,
      entityId,
      body,
    }),
  )
}

export const getAccountantComments = cache(
  async (inviteId: string, entityType: string, entityId: string): Promise<AccountantComment[]> => {
    return queryMany<AccountantComment>(
      sql`SELECT * FROM accountant_comments
          WHERE invite_id = ${inviteId} AND entity_type = ${entityType} AND entity_id = ${entityId}
          ORDER BY created_at ASC`,
    )
  },
)

export const getAllAccountantCommentsByInvite = cache(
  async (inviteId: string, userId: string): Promise<AccountantComment[]> => {
    const invite = await queryOne<AccountantInvite>(
      sql`SELECT * FROM accountant_invites WHERE id = ${inviteId} AND user_id = ${userId}`,
    )
    if (!invite) return []

    return queryMany<AccountantComment>(
      sql`SELECT * FROM accountant_comments WHERE invite_id = ${inviteId} ORDER BY created_at DESC`,
    )
  },
)
