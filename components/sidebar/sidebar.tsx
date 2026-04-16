
import { useNotification } from "@/lib/context"
import { usePathname } from "@/lib/navigation"
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
} from "@/components/ui/sidebar"
import config from "@/lib/config"
import Link from "next/link"
import {
  Calculator,
  ClockArrowUp,
  Coins,
  FileText,
  FolderOpen,
  History,
  House,
  LogOut,
  Package,
  Receipt,
  ScrollText,
  Settings,
  Users,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { useTransition } from "react"
import { ColoredText } from "../ui/colored-text"
import { Blinker } from "./blinker"
import { LanguageSwitcher } from "./language-switcher"
import { disconnectAction } from "@/actions/auth"

function NavLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  )
}

function NavItem({ href, icon: Icon, label, badge, blink }: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  badge?: number
  blink?: boolean
}) {
  const pathname = usePathname()
  const isActive = href === "/" ? pathname === href : pathname.startsWith(href)

  return (
    <SidebarMenuItem className={isActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium rounded-md" : "font-medium rounded-md"}>
      <SidebarMenuButton asChild>
        <NavLink href={href}>
          <Icon />
          <span>{label}</span>
          {badge !== undefined && badge > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {badge}
            </span>
          )}
          {blink && <Blinker />}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppSidebar({
  unsortedFilesCount,
  untrackedCryptoCount = 0,
  entityName,
}: {
  unsortedFilesCount: number
  untrackedCryptoCount?: number
  entityName?: string
}) {
  const { t } = useTranslation("sidebar")
  const { notification } = useNotification()
  const [isDisconnecting, startDisconnectTransition] = useTransition()

  const handleDisconnect = () => {
    startDisconnectTransition(async () => {
      const result = await disconnectAction()
      if (!result.success) return
      window.location.href = "/"
    })
  }

  return (
    <>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader>
          <NavLink href="/dashboard" className="flex items-center gap-2">
            <img src="/logo/logo.webp" alt="Logo" className="h-10 w-10 rounded-lg" width={40} height={40} />
            <div className="grid flex-1 text-left leading-tight">
              <span className="truncate font-semibold text-lg">
                <ColoredText>{config.app.title}</ColoredText>
              </span>
              {entityName && <span className="truncate text-xs text-sidebar-foreground/70">{entityName}</span>}
            </div>
          </NavLink>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavItem href="/dashboard" icon={House} label={t("home")} />
                <NavItem
                  href="/transactions"
                  icon={FileText}
                  label={t("transactions")}
                  blink={notification?.code === "sidebar.transactions" && !!notification.message}
                />
                <NavItem
                  href="/unsorted"
                  icon={ClockArrowUp}
                  label={t("inbox")}
                  badge={unsortedFilesCount}
                  blink={notification?.code === "sidebar.unsorted" && !!notification.message}
                />
                <NavItem href="/files" icon={FolderOpen} label={t("files")} />
                <NavItem
                  href="/crypto"
                  icon={Coins}
                  label={t("crypto")}
                  badge={untrackedCryptoCount}
                />
                <NavItem href="/invoices" icon={Receipt} label={t("invoices")} />
                <NavItem href="/quotes" icon={ScrollText} label={t("quotes")} />
                <NavItem href="/clients" icon={Users} label={t("clients")} />
                <NavItem href="/products" icon={Package} label={t("products")} />
                <NavItem href="/tax" icon={Calculator} label={t("tax")} />
                <NavItem href="/reports" icon={History} label={t("reports")} />
                <NavItem href="/settings" icon={Settings} label={t("settings")} />
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
                  <SidebarMenuButton
                    className="w-full text-red-600 disabled:opacity-50"
                    onClick={handleDisconnect}
                    disabled={isDisconnecting}
                  >
                    <LogOut className="h-4 w-4" />
                    <span>{t("disconnect")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarFooter>
      </Sidebar>
    </>
  )
}
