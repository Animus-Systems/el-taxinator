"use server"

import {
  categoryFormSchema,
  currencyFormSchema,
  fieldFormSchema,
  projectFormSchema,
  settingsFormSchema,
} from "@/forms/settings"
import { userFormSchema } from "@/forms/users"
import { ActionState } from "@/lib/actions"
import { getCurrentUser } from "@/lib/auth"
import { getActiveEntityId, updateEntity } from "@/lib/entities"
import { uploadStaticImage } from "@/lib/uploads"
import { codeFromName, randomHexColor } from "@/lib/utils"
import { serverClient } from "@/lib/trpc/server-client"
import { SettingsMap } from "@/models/settings"
import { updateUser } from "@/models/users"
import type { User } from "@/lib/db-types"
import { revalidatePath } from "next/cache"
import path from "path"

export async function saveSettingsAction(
  _prevState: ActionState<SettingsMap> | null,
  formData: FormData
): Promise<ActionState<SettingsMap>> {
  const trpc = await serverClient()
  const validatedForm = settingsFormSchema.safeParse(Object.fromEntries(formData))

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  const settingsToUpdate: Record<string, string | undefined> = {}
  for (const key in validatedForm.data) {
    const value = validatedForm.data[key as keyof typeof validatedForm.data]
    if (value !== undefined) {
      settingsToUpdate[key] = value
    }
  }
  await trpc.settings.update(settingsToUpdate)

  revalidatePath("/settings")
  return { success: true }
}

export async function saveProfileAction(
  _prevState: ActionState<User> | null,
  formData: FormData
): Promise<ActionState<User>> {
  // Keep as model call - file upload with FormData requires getCurrentUser for file paths
  const user = await getCurrentUser()
  const entityId = await getActiveEntityId()
  const validatedForm = userFormSchema.safeParse(Object.fromEntries(formData))

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  // Upload avatar
  let avatarUrl = user.avatar
  const avatarFile = formData.get("avatar") as File | null
  if (avatarFile instanceof File && avatarFile.size > 0) {
    try {
      const uploadedAvatarPath = await uploadStaticImage(user, entityId, avatarFile, "avatar.webp", 500, 500)
      avatarUrl = `/api/files/static/${path.basename(uploadedAvatarPath)}`
    } catch (error) {
      return { success: false, error: "Failed to upload avatar: " + error }
    }
  }

  // Upload business logo
  let businessLogoUrl = user.businessLogo
  const businessLogoFile = formData.get("businessLogo") as File | null
  if (businessLogoFile instanceof File && businessLogoFile.size > 0) {
    try {
      const uploadedBusinessLogoPath = await uploadStaticImage(user, entityId, businessLogoFile, "businessLogo.png", 500, 500)
      businessLogoUrl = `/api/files/static/${path.basename(uploadedBusinessLogoPath)}`
    } catch (error) {
      return { success: false, error: "Failed to upload business logo: " + error }
    }
  }

  // Update user
  const nextBusinessName =
    validatedForm.data.businessName !== undefined ? validatedForm.data.businessName : user.businessName

  await updateUser(user.id, {
    name: validatedForm.data.name !== undefined ? validatedForm.data.name : user.name,
    avatar: avatarUrl,
    businessName: nextBusinessName,
    businessAddress:
      validatedForm.data.businessAddress !== undefined ? validatedForm.data.businessAddress : user.businessAddress,
    businessBankDetails:
      validatedForm.data.businessBankDetails !== undefined
        ? validatedForm.data.businessBankDetails
        : user.businessBankDetails,
    businessLogo: businessLogoUrl,
  })

  const trimmedBusinessName = nextBusinessName?.trim()
  if (trimmedBusinessName) {
    updateEntity(entityId, { name: trimmedBusinessName })
  }

  revalidatePath("/settings/profile")
  revalidatePath("/settings/business")
  revalidatePath("/", "layout")
  return { success: true }
}

export async function addProjectAction(data: Record<string, unknown>) {
  const trpc = await serverClient()
  const user = await getCurrentUser()
  const validatedForm = projectFormSchema.safeParse(data)

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  // Auto-translate the name if it's a plain string
  const { autoTranslate } = await import("@/lib/ai-translate")
  let name = validatedForm.data.name
  try {
    name = await autoTranslate(name, "en", user.id)
  } catch {}

  const project = await trpc.projects.create({
    name,
    llmPrompt: validatedForm.data.llmPrompt || null,
    color: validatedForm.data.color || randomHexColor(),
  })
  revalidatePath("/settings/projects")

  return { success: true, project }
}

export async function editProjectAction(code: string, data: Record<string, unknown>) {
  const trpc = await serverClient()
  const validatedForm = projectFormSchema.safeParse(data)

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  const project = await trpc.projects.update({
    code,
    name: validatedForm.data.name,
    llmPrompt: validatedForm.data.llmPrompt,
    color: validatedForm.data.color || "",
  })
  revalidatePath("/settings/projects")

  return { success: true, project }
}

async function deleteSettingsItem(
  router: "projects" | "currencies" | "categories" | "fields",
  code: string,
) {
  const trpc = await serverClient()
  try {
    await trpc[router].delete({ code })
  } catch (error) {
    return { success: false, error: `Failed to delete ${router.slice(0, -1)}: ${error}` }
  }
  revalidatePath(`/settings/${router}`)
  return { success: true }
}

export async function deleteProjectAction(code: string) { return deleteSettingsItem("projects", code) }

export async function addCurrencyAction(data: Record<string, unknown>) {
  const trpc = await serverClient()
  const validatedForm = currencyFormSchema.safeParse(data)

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  const currency = await trpc.currencies.create({
    code: validatedForm.data.code,
    name: validatedForm.data.name,
  })
  revalidatePath("/settings/currencies")

  return { success: true, currency }
}

export async function editCurrencyAction(code: string, data: Record<string, unknown>) {
  const trpc = await serverClient()
  const validatedForm = currencyFormSchema.safeParse(data)

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  const currency = await trpc.currencies.update({ code, name: validatedForm.data.name })
  revalidatePath("/settings/currencies")
  return { success: true, currency }
}

export async function deleteCurrencyAction(code: string) { return deleteSettingsItem("currencies", code) }

export async function addCategoryAction(data: Record<string, unknown>) {
  const trpc = await serverClient()
  const user = await getCurrentUser()
  const validatedForm = categoryFormSchema.safeParse(data)

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  // Auto-translate the name
  const { autoTranslate } = await import("@/lib/ai-translate")
  let name = validatedForm.data.name
  try {
    name = await autoTranslate(name, "en", user.id)
  } catch {}

  const code = codeFromName(validatedForm.data.name)
  try {
    const category = await trpc.categories.create({
      name,
      llmPrompt: validatedForm.data.llmPrompt,
      color: validatedForm.data.color || "",
    })
    revalidatePath("/settings/categories")

    return { success: true, category }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("unique") || message.includes("duplicate") || message.includes("already exists")) {
      return {
        success: false,
        error: `Category with the code "${code}" already exists. Try a different name.`,
      }
    }
    return { success: false, error: "Failed to create category" }
  }
}

export async function editCategoryAction(code: string, data: Record<string, unknown>) {
  const trpc = await serverClient()
  const validatedForm = categoryFormSchema.safeParse(data)

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  const category = await trpc.categories.update({
    code,
    name: validatedForm.data.name,
    llmPrompt: validatedForm.data.llmPrompt,
    color: validatedForm.data.color || "",
  })
  revalidatePath("/settings/categories")

  return { success: true, category }
}

export async function deleteCategoryAction(code: string) { return deleteSettingsItem("categories", code) }

export async function addFieldAction(data: Record<string, unknown>) {
  const trpc = await serverClient()
  const validatedForm = fieldFormSchema.safeParse(data)

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  const field = await trpc.fields.create({
    name: validatedForm.data.name,
    type: validatedForm.data.type,
    llmPrompt: validatedForm.data.llmPrompt,
    isVisibleInList: validatedForm.data.isVisibleInList,
    isVisibleInAnalysis: validatedForm.data.isVisibleInAnalysis,
    isRequired: validatedForm.data.isRequired,
    isExtra: true,
  })
  revalidatePath("/settings/fields")

  return { success: true, field }
}

export async function editFieldAction(code: string, data: Record<string, unknown>) {
  const trpc = await serverClient()
  const validatedForm = fieldFormSchema.safeParse(data)

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  const field = await trpc.fields.update({
    code,
    name: validatedForm.data.name,
    type: validatedForm.data.type,
    llmPrompt: validatedForm.data.llmPrompt,
    isVisibleInList: validatedForm.data.isVisibleInList,
    isVisibleInAnalysis: validatedForm.data.isVisibleInAnalysis,
    isRequired: validatedForm.data.isRequired,
  })
  revalidatePath("/settings/fields")

  return { success: true, field }
}

export async function deleteFieldAction(code: string) { return deleteSettingsItem("fields", code) }
