"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { UserProfile } from "@/lib/auth"
import { disconnectAction } from "@/actions/auth"
import { formatBytes } from "@/lib/utils"
import { Building2, HardDrive, LogOut, MoreVertical, Settings, User } from "lucide-react"
import { Link } from "@/lib/navigation"
import { useTranslations } from "next-intl"

export default function SidebarUser({ profile }: { profile: UserProfile }) {
  const t = useTranslations("sidebar")

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="default"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <Avatar className="h-6 w-6 rounded-full bg-sidebar-accent">
            <AvatarImage src={profile.avatar} alt={profile.name || ""} />
            <AvatarFallback className="rounded-full bg-sidebar-accent text-sidebar-accent-foreground">
              <User className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <span className="truncate font-medium">{profile.name || profile.email}</span>
          <MoreVertical className="ml-auto size-4" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
        side="top"
        align="center"
        sideOffset={4}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarImage src={profile.avatar} alt={profile.name || ""} />
              <AvatarFallback className="rounded-lg">
                <User className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{profile.name || profile.email}</span>
              <span className="truncate text-xs text-muted-foreground">
                <HardDrive className="inline h-3 w-3 mr-1" />{formatBytes(profile.storageUsed)} used
              </span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              {t("settings")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings/entities" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              {t("switchCompany")}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form suppressHydrationWarning action={disconnectAction}>
            <button type="submit" className="flex items-center gap-2 text-red-600 cursor-pointer w-full text-left">
              <LogOut className="h-4 w-4" />
              {t("disconnect")}
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
