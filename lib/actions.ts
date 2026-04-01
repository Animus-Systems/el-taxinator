export type ActionState<T> = {
  success: boolean
  error?: string | null
  data?: T | null
}

/** Safely parse a JSON items array from FormData. */
export function parseItemsFromFormData(raw: FormDataEntryValue | null): unknown[] {
  try {
    if (!raw || typeof raw !== "string") return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}
