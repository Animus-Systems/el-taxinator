"use server"

import config from "@/lib/config"
import { isResendConfigured, resend, sendNewsletterWelcomeEmail } from "@/lib/email"

export async function subscribeToNewsletterAction(email: string) {
  try {
    if (!email || !email.includes("@")) {
      return { success: false, error: "Invalid email address" }
    }
    if (!isResendConfigured()) {
      return { success: false, error: "Newsletter email is not configured on this instance" }
    }

    const existingContacts = await resend.contacts.list({
      audienceId: config.email.audienceId,
    })

    if (existingContacts.data) {
      const existingContact = existingContacts.data.data.find((contact: { email: string }) => contact.email === email)

      if (existingContact) {
        return { success: false, error: "You are already subscribed to the newsletter" }
      }
    }

    await resend.contacts.create({
      email,
      audienceId: config.email.audienceId,
      unsubscribed: false,
    })

    await sendNewsletterWelcomeEmail(email)

    return { success: true }
  } catch (error) {
    console.error("Newsletter subscription error:", error)
    return { error: "Failed to subscribe. Please try again later." }
  }
}
