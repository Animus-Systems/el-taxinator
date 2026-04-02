"use client"

import { useNotification } from "@/lib/context"
import { UploadButton } from "@/components/files/upload-button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import config from "@/lib/config"
import {
  Calculator,
  Clock,
  ClockArrowUp,
  FileText,
  House,
  LogOut,
  Package,
  Receipt,
  ScrollText,
  Settings,
  Upload,
  Users,
} from "lucide-react"
import Image from "next/image"
import { Link, usePathname } from "@/lib/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { ColoredText } from "../ui/colored-text"
import { Blinker } from "./blinker"
import { LanguageSwitcher } from "./language-switcher"
import { SidebarMenuItemWithHighlight } from "./sidebar-item"
import { disconnectAction } from "@/actions/auth"

export function AppSidebar({
  unsortedFilesCount,
  entityName,
}: {
  unsortedFilesCount: number
  entityName?: string
}) {
  const t = useTranslations("sidebar")
  const { open, setOpenMobile } = useSidebar()
  const pathname = usePathname()
  const { notification } = useNotification()

  // Hide sidebar on mobile when clicking an item
  useEffect(() => {
    setOpenMobile(false)
  }, [pathname, setOpenMobile])

  return (
    <>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader>
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image src="/logo/logo.webp" alt="Logo" className="h-10 w-10 rounded-lg" width={40} height={40} />
            <div className="grid flex-1 text-left leading-tight">
              <span className="truncate font-semibold text-lg">
                <ColoredText>{config.app.title}</ColoredText>
              </span>
              {entityName && <span className="truncate text-xs text-sidebar-foreground/70">{entityName}</span>}
            </div>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <UploadButton className="w-full mt-4 mb-2">
              <Upload className="h-4 w-4" />
              {open ? <span>{t("upload")}</span> : ""}
            </UploadButton>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItemWithHighlight href="/dashboard">
                  <SidebarMenuButton asChild>
                    <Link href="/dashboard">
                      <House />
                      <span>{t("home")}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItemWithHighlight>

                <SidebarMenuItemWithHighlight href="/transactions">
                  <SidebarMenuButton asChild>
                    <Link href="/transactions">
                      <FileText />
                      <span>{t("transactions")}</span>
                      {notification && notification.code === "sidebar.transactions" && notification.message && (
                        <Blinker />
                      )}
                      <span></span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItemWithHighlight>

                <SidebarMenuItemWithHighlight href="/unsorted">
                  <SidebarMenuButton asChild>
                    <Link href="/unsorted">
                      <ClockArrowUp />
                      <span>{t("inbox")}</span>
                      {unsortedFilesCount > 0 && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                          {unsortedFilesCount}
                        </span>
                      )}
                      {notification && notification.code === "sidebar.unsorted" && notification.message && <Blinker />}
                      <span></span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItemWithHighlight>
                <SidebarMenuItemWithHighlight href="/invoices">
                  <SidebarMenuButton asChild>
                    <Link href="/invoices">
                      <Receipt />
                      <span>{t("invoices")}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItemWithHighlight>
                <SidebarMenuItemWithHighlight href="/quotes">
                  <SidebarMenuButton asChild>
                    <Link href="/quotes">
                      <ScrollText />
                      <span>{t("quotes")}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItemWithHighlight>
                <SidebarMenuItemWithHighlight href="/clients">
                  <SidebarMenuButton asChild>
                    <Link href="/clients">
                      <Users />
                      <span>{t("clients")}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItemWithHighlight>
                <SidebarMenuItemWithHighlight href="/products">
                  <SidebarMenuButton asChild>
                    <Link href="/products">
                      <Package />
                      <span>{t("products")}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItemWithHighlight>
                <SidebarMenuItemWithHighlight href="/time">
                  <SidebarMenuButton asChild>
                    <Link href="/time">
                      <Clock />
                      <span>{t("timeTracking")}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItemWithHighlight>
                <SidebarMenuItemWithHighlight href="/tax">
                  <SidebarMenuButton asChild>
                    <Link href="/tax">
                      <Calculator />
                      <span>{t("tax")}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItemWithHighlight>
                <SidebarMenuItemWithHighlight href="/settings">
                  <SidebarMenuButton asChild>
                    <Link href="/settings">
                      <Settings />
                      <span>{t("settings")}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItemWithHighlight>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarRail />
        <SidebarFooter>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <LanguageSwitcher />
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <form suppressHydrationWarning action={disconnectAction}>
                    <SidebarMenuButton asChild>
                      <button type="submit" className="w-full text-red-600">
                        <LogOut className="h-4 w-4" />
                        <span>{t("disconnect")}</span>
                      </button>
                    </SidebarMenuButton>
                  </form>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarFooter>
      </Sidebar>
    </>
  )
}
