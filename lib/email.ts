import { NewsletterWelcomeEmail } from "@/components/emails/newsletter-welcome-email"
import { OTPEmail } from "@/components/emails/otp-email"
import React from "react"
import { Resend } from "resend"
import config from "./config"

const RESEND_PLACEHOLDER_KEY = "please-set-your-resend-api-key-here"

export function isResendConfigured() {
  return Boolean(config.email.apiKey && config.email.apiKey !== RESEND_PLACEHOLDER_KEY)
}

function requireResend() {
  if (!isResendConfigured()) {
    throw new Error("RESEND_API_KEY is not configured")
  }
}

// Better Auth expects a Resend client during setup, so keep the client shape
// available and fail only when an email operation is actually attempted.
export const resend = new Resend(isResendConfigured() ? config.email.apiKey : "re_placeholder")

export async function sendOTPCodeEmail({ email, otp }: { email: string; otp: string }) {
  requireResend()
  const html = React.createElement(OTPEmail, { otp })

  return await resend.emails.send({
    from: config.email.from,
    to: email,
    subject: "Your Taxinator verification code",
    react: html,
  })
}

export async function sendNewsletterWelcomeEmail(email: string) {
  requireResend()
  const html = React.createElement(NewsletterWelcomeEmail)

  return await resend.emails.send({
    from: config.email.from,
    to: email,
    subject: "Welcome to Taxinator Newsletter!",
    react: html,
  })
}
