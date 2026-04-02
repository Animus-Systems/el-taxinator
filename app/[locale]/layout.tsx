import { SubscriptionExpired } from "@/components/auth/subscription-expired"
import ScreenDropArea from "@/components/files/screen-drop-area"
import MobileMenu from "@/components/sidebar/mobile-menu"
import { AppSidebar } from "@/components/sidebar/sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { getCurrentUser, isSubscriptionExpired } from "@/lib/auth"
import config from "@/lib/config"
import { getActiveEntity } from "@/lib/entities"
import { getUnsortedFilesCount } from "@/models/files"
import type { Metadata, Viewport } from "next"
import { NextIntlClientProvider } from "next-intl"
import { getMessages, setRequestLocale } from "next-intl/server"
import "../globals.css"
import { NotificationProvider } from "@/lib/context"

export const metadata: Metadata = {
  title: {
    template: "%s | Taxinator",
    default: config.app.title,
  },
  description: config.app.description,
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
}

export const viewport: Viewport = {
  themeColor: "#ffffff",
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const messages = await getMessages()
  const user = await getCurrentUser()
  const unsortedFilesCount = await getUnsortedFilesCount(user.id)
  const entity = await getActiveEntity()

  return (
    <NextIntlClientProvider messages={messages}>
    <NotificationProvider>
      <SidebarProvider>
        <MobileMenu unsortedFilesCount={unsortedFilesCount} />
        <AppSidebar unsortedFilesCount={unsortedFilesCount} entityName={entity.name} />
        <SidebarInset style={{ marginLeft: "var(--sidebar-width)" }} className="mt-[60px] md:mt-0 overflow-auto max-md:!ml-0">
          <ScreenDropArea>
            {isSubscriptionExpired(user) && <SubscriptionExpired />}
            {children}
          </ScreenDropArea>
        </SidebarInset>
      </SidebarProvider>
      <Toaster />
    </NotificationProvider>
    </NextIntlClientProvider>
  )
}

export const dynamic = "force-dynamic"
