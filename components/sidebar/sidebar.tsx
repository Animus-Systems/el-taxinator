
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
  useSidebar,
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
  PanelLeft,
  Package,
  Receipt,
  ShoppingBag,
  ScrollText,
  Settings,
  UserRound,
  Users,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { useTransition } from "react"
import { Blinker } from "./blinker"
import { LanguageSwitcher } from "./language-switcher"
import { KnowledgeFreshnessIndicator } from "./knowledge-freshness"
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
  entityType,
}: {
  unsortedFilesCount: number
  untrackedCryptoCount?: number
  entityName?: string
  entityType?: "autonomo" | "sl" | "individual"
}) {
  const { t } = useTranslation("sidebar")
  const { notification } = useNotification()
  const [isDisconnecting, startDisconnectTransition] = useTransition()
  const { toggleSidebar } = useSidebar()

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
        <SidebarHeader className="items-center">
          <NavLink href="/dashboard" className="block w-full text-center leading-tight">
            <img
              src="/logo/logo.webp"
              alt="Logo"
              className="mx-auto block h-[7.5rem] w-[7.5rem] rounded-lg group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8"
              width={120}
              height={120}
            />
            <div className="-mt-2 block font-semibold text-lg text-sidebar-foreground group-data-[collapsible=icon]:hidden">
              {config.app.title}
            </div>
            {entityName && (
              <div className="mt-0.5 block truncate px-2 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
                {entityName}
              </div>
            )}
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
                <NavItem href="/purchases" icon={ShoppingBag} label={t("purchases")} />
                <NavItem href="/quotes" icon={ScrollText} label={t("quotes")} />
                <NavItem href="/contacts" icon={Users} label={t("contacts")} />
                <NavItem href="/products" icon={Package} label={t("products")} />
                {entityType !== "sl" && (
                  <NavItem href="/personal" icon={UserRound} label={t("personal")} />
                )}
                <NavItem href="/tax" icon={Calculator} label={t("tax")} />
                <NavItem href="/reports" icon={History} label={t("reports")} />
                <NavItem href="/settings" icon={Settings} label={t("settings")} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <KnowledgeFreshnessIndicator />
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={toggleSidebar} className="w-full">
                    <PanelLeft className="h-4 w-4" />
                    <span>{t("foldSidebar")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
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
