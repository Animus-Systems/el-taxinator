/**
 * Compat layer for @/actions/settings — calls tRPC endpoints via fetch.
 *
 * Settings router uses authedProcedure. In self-hosted mode the Fastify
 * context always injects the self-hosted user, so no auth headers needed.
 */
import { formDataToObject, trpcMutate, trpcQuery, type CompatActionResult } from "./shared"

export async function saveSettingsAction(
  _prevState: CompatActionResult<unknown> | null,
  formData: FormData,
): Promise<CompatActionResult<unknown>> {
  try {
    const data: Record<string, string> = {}
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") {
        data[key] = value
      }
    }
    await trpcMutate("settings.update", data)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save settings",
    }
  }
}

export async function saveProfileAction(
  _prevState: CompatActionResult<unknown> | null,
  formData: FormData,
): Promise<CompatActionResult<unknown>> {
  try {
    const values = formDataToObject(formData)
    const payload = {
      name: typeof values["name"] === "string" ? values["name"] : undefined,
      businessName: typeof values["businessName"] === "string" ? values["businessName"] : null,
      businessAddress: typeof values["businessAddress"] === "string" ? values["businessAddress"] : null,
      businessBankDetails:
        typeof values["businessBankDetails"] === "string" ? values["businessBankDetails"] : null,
      businessTaxId: typeof values["businessTaxId"] === "string" ? values["businessTaxId"] : null,
    }

    const user = await trpcMutate("users.update", payload)

    if (payload.businessName) {
      const activeEntityId = await trpcQuery<string>("entities.getActive")
      await trpcMutate("entities.update", {
        entityId: activeEntityId,
        name: payload.businessName,
      })
    }

    return { success: true, data: user }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save profile",
    }
  }
}

export async function testProviderAction(data: {
  provider: string
  apiKey: string
  model: string
  thinking?: string
  baseUrl?: string
}): Promise<{ success: boolean; error?: string; responseTime?: number }> {
  try {
    return await trpcMutate<{ success: boolean; error?: string; responseTime?: number }>(
      "settings.testProvider",
      data,
    )
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to test provider",
    }
  }
}

export async function addProjectAction(data: Record<string, unknown>) {
  try {
    await trpcMutate("projects.create", data)
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to add project" }
  }
}

export async function editProjectAction(code: string, data: Record<string, unknown>) {
  try {
    await trpcMutate("projects.update", { code, ...data })
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to edit project" }
  }
}

export async function deleteProjectAction(code: string) {
  try {
    await trpcMutate("projects.delete", { code })
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to delete project" }
  }
}

export async function addCurrencyAction(data: Record<string, unknown>) {
  try {
    await trpcMutate("currencies.create", data)
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to add currency" }
  }
}

export async function editCurrencyAction(code: string, data: Record<string, unknown>) {
  try {
    await trpcMutate("currencies.update", { code, ...data })
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to edit currency" }
  }
}

export async function deleteCurrencyAction(code: string) {
  try {
    await trpcMutate("currencies.delete", { code })
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to delete currency" }
  }
}

export async function addCategoryAction(data: Record<string, unknown>) {
  try {
    await trpcMutate("categories.create", data)
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to add category" }
  }
}

export async function editCategoryAction(code: string, data: Record<string, unknown>) {
  try {
    await trpcMutate("categories.update", { code, ...data })
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to edit category" }
  }
}

export async function deleteCategoryAction(code: string) {
  try {
    await trpcMutate("categories.delete", { code })
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to delete category" }
  }
}

export async function addFieldAction(data: Record<string, unknown>) {
  try {
    await trpcMutate("fields.create", data)
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to add field" }
  }
}

export async function editFieldAction(code: string, data: Record<string, unknown>) {
  try {
    await trpcMutate("fields.update", { code, ...data })
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to edit field" }
  }
}

export async function deleteFieldAction(code: string) {
  try {
    await trpcMutate("fields.delete", { code })
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to delete field" }
  }
}

export async function addAccountAction(data: Record<string, unknown>) {
  try {
    await trpcMutate("accounts.create", data)
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to add account" }
  }
}

export async function editAccountAction(id: string, data: Record<string, unknown>) {
  try {
    await trpcMutate("accounts.update", { id, ...data })
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to edit account" }
  }
}

export async function deleteAccountAction(id: string) {
  try {
    await trpcMutate("accounts.delete", { id })
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Failed to delete account" }
  }
}
