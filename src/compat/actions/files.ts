/**
 * Client-side stub for @/actions/files server actions.
 *
 * File uploads in the SPA should go through the /api endpoint directly.
 * This stub exists so components that import uploadFilesAction don't crash.
 */

type ActionState<T> = { success: boolean; error?: string | null; data?: T }

export async function uploadFilesAction(formData: FormData): Promise<ActionState<null>> {
  // Forward the upload to the API endpoint
  try {
    const response = await fetch("/api/files/upload", {
      method: "POST",
      body: formData,
    })
    if (!response.ok) {
      return { success: false, error: "Upload failed: " + response.statusText }
    }
    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: "Upload failed: " + String(error) }
  }
}
