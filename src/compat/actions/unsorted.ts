/**
 * Compat layer for @/actions/unsorted.
 *
 * Analysis and split operations require AI/LLM processing and have
 * no tRPC endpoint yet. File deletion uses the files.delete endpoint.
 */
import { formDataToObject, trpcMutate, type CompatActionResult } from "./shared"

export async function analyzeFileAction(..._args: unknown[]) {
  return {
    success: false as const,
    error: "File analysis is not yet available in SPA mode",
    data: { output: {} as Record<string, string> },
  }
}

export async function saveFileAsTransactionAction(
  _fileId: string,
  data: Record<string, unknown>,
): Promise<CompatActionResult>
export async function saveFileAsTransactionAction(
  _prevState: CompatActionResult | null,
  formData: FormData,
): Promise<CompatActionResult>
export async function saveFileAsTransactionAction(
  _arg1: string | CompatActionResult | null,
  arg2: Record<string, unknown> | FormData,
): Promise<CompatActionResult> {
  const payload = arg2 instanceof FormData ? formDataToObject(arg2) : arg2

  try {
    await trpcMutate("transactions.create", payload)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save transaction",
    }
  }
}

export async function deleteUnsortedFileAction(fileId: string): Promise<CompatActionResult>
export async function deleteUnsortedFileAction(
  _prevState: CompatActionResult | null,
  fileId: string,
): Promise<CompatActionResult>
export async function deleteUnsortedFileAction(
  arg1: string | CompatActionResult | null,
  arg2?: string,
): Promise<CompatActionResult> {
  const fileId = typeof arg1 === "string" ? arg1 : arg2

  try {
    await trpcMutate("files.delete", { id: fileId })
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete file",
    }
  }
}

export async function splitFileIntoItemsAction(
  _prevState: CompatActionResult | null,
  _formData: FormData,
): Promise<CompatActionResult> {
  return { success: false, error: "File splitting is not yet available in SPA mode" }
}

export async function splitAndSaveAllAction(
  _prevState: CompatActionResult | null,
  _formData: FormData,
): Promise<CompatActionResult> {
  return { success: false, error: "File splitting is not yet available in SPA mode" }
}
