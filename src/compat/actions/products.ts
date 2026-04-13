/**
 * Compat layer for @/actions/products — calls tRPC endpoints via fetch.
 */
import type { Product } from "@/lib/db-types"
import { formDataToObject, nullableStringValue, numberValue, trpcMutate, type CompatActionResult } from "./shared"

function productPayload(formData: FormData): Record<string, unknown> {
  const values = formDataToObject(formData)
  return {
    name: values.name,
    description: nullableStringValue(values.description),
    price: numberValue(values.price) ?? 0,
    currencyCode: values.currencyCode,
    vatRate: numberValue(values.vatRate) ?? 0,
    unit: nullableStringValue(values.unit),
  }
}

export async function createProductAction(data: Record<string, unknown>): Promise<CompatActionResult<Product | null>>
export async function createProductAction(
  _prevState: CompatActionResult<Product | null> | null,
  formData: FormData,
): Promise<CompatActionResult<Product | null>>
export async function createProductAction(
  arg1: Record<string, unknown> | CompatActionResult<Product | null> | null,
  arg2?: FormData,
): Promise<CompatActionResult<Product | null>> {
  const payload = arg2 ? productPayload(arg2) : arg1
  try {
    const data = await trpcMutate<Product | null>("products.create", payload)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to create product" }
  }
}

export async function updateProductAction(id: string, data: Record<string, unknown>): Promise<CompatActionResult<Product | null>>
export async function updateProductAction(
  _prevState: CompatActionResult<Product | null> | null,
  formData: FormData,
): Promise<CompatActionResult<Product | null>>
export async function updateProductAction(
  arg1: string | CompatActionResult<Product | null> | null,
  arg2: Record<string, unknown> | FormData,
): Promise<CompatActionResult<Product | null>> {
  const payload = arg2 instanceof FormData ? { id: formDataToObject(arg2).id, ...productPayload(arg2) } : { id: arg1, ...arg2 }
  try {
    const data = await trpcMutate<Product | null>("products.update", payload)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to update product" }
  }
}

export async function deleteProductAction(id: string): Promise<CompatActionResult<Product | null>>
export async function deleteProductAction(
  _prevState: CompatActionResult<Product | null> | null,
  id: string,
): Promise<CompatActionResult<Product | null>>
export async function deleteProductAction(
  arg1: string | CompatActionResult<Product | null> | null,
  arg2?: string,
): Promise<CompatActionResult<Product | null>> {
  const id = typeof arg1 === "string" ? arg1 : arg2
  try {
    const data = await trpcMutate<Product | null>("products.delete", { id })
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to delete product" }
  }
}
