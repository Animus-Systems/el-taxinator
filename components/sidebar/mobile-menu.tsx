
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useSidebar } from "@/components/ui/sidebar"
import config from "@/lib/config"
import { Link } from "@/lib/navigation"

export default function MobileMenu({ unsortedFilesCount }: { unsortedFilesCount: number }) {
  const { toggleSidebar } = useSidebar()

  return (
    <menu className="flex flex-row gap-2 p-2 items-center justify-between fixed top-0 left-0 w-full z-50 border-b-2 border-solid bg-background md:hidden">
      <Avatar className="h-10 w-10 rounded-lg cursor-pointer" onClick={toggleSidebar}>
        <AvatarImage src="/logo/logo.webp" />
        <AvatarFallback className="rounded-lg">AI</AvatarFallback>
      </Avatar>
      <Link href="/" className="text-lg font-bold">
        {config.app.title}
      </Link>
      <Link
        href="/unsorted"
        className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground"
      >
        {unsortedFilesCount}
      </Link>
    </menu>
  )
}
