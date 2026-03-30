"use server"

import { productFormSchema } from "@/forms/products"
import { ActionState } from "@/lib/actions"
import { getCurrentUser } from "@/lib/auth"
import { createProduct, deleteProduct, updateProduct } from "@/models/products"
import { Product } from "@/prisma/client"
import { revalidatePath } from "next/cache"

export async function createProductAction(
  _prev: ActionState<Product> | null,
  formData: FormData
): Promise<ActionState<Product>> {
  try {
    const user = await getCurrentUser()
    const parsed = productFormSchema.safeParse(Object.fromEntries(formData.entries()))
    if (!parsed.success) return { success: false, error: parsed.error.message }

    const product = await createProduct(user.id, {
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
    const user = await getCurrentUser()
    const productId = formData.get("productId") as string
    const parsed = productFormSchema.safeParse(Object.fromEntries(formData.entries()))
    if (!parsed.success) return { success: false, error: parsed.error.message }

    const product = await updateProduct(productId, user.id, {
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
    const user = await getCurrentUser()
    const product = await deleteProduct(productId, user.id)
    revalidatePath("/products")
    return { success: true, data: product }
  } catch (e) {
    console.error(e)
    return { success: false, error: "Failed to delete product" }
  }
}
