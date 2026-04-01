import { Metadata } from "next"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"

export const metadata: Metadata = {
  title: "Uploading...",
}

export default async function UploadStatusPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  notFound()
}
