"use server"

import { productFormSchema } from "@/forms/products"
import { ActionState } from "@/lib/actions"
import { serverClient } from "@/lib/trpc/server-client"
import type { Product } from "@/lib/db-types"
import { revalidatePath } from "next/cache"

export async function createProductAction(
  _prev: ActionState<Product> | null,
  formData: FormData
): Promise<ActionState<Product>> {
  try {
    const trpc = await serverClient()
    const parsed = productFormSchema.safeParse(Object.fromEntries(formData.entries()))
    if (!parsed.success) return { success: false, error: parsed.error.message }

    const product = await trpc.products.create({
      ...parsed.data,
      description: parsed.data.description || null,
      unit: parsed.data.unit || null,
    })
    revalidatePath("/products")
    return { success: true, data: product }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Failed to create product" }
  }
}

export async function updateProductAction(
  _prev: ActionState<Product> | null,
  formData: FormData
): Promise<ActionState<Product>> {
  try {
    const trpc = await serverClient()
    const productId = formData.get("productId") as string
    const parsed = productFormSchema.safeParse(Object.fromEntries(formData.entries()))
    if (!parsed.success) return { success: false, error: parsed.error.message }

    const product = await trpc.products.update({
      id: productId,
      ...parsed.data,
      description: parsed.data.description || null,
      unit: parsed.data.unit || null,
    })
    revalidatePath("/products")
    return { success: true, data: product }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Failed to update product" }
  }
}

export async function deleteProductAction(
  _prev: ActionState<Product> | null,
  productId: string
): Promise<ActionState<Product>> {
  try {
    const trpc = await serverClient()
    const product = await trpc.products.delete({ id: productId })
    revalidatePath("/products")
    return { success: true, data: product }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Failed to delete product" }
  }
}
