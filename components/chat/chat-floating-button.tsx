import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { MessageSquare } from "lucide-react"
import { ChatPanel } from "@/components/chat/chat-panel"
import { useTranslations } from "next-intl"

export function ChatFloatingButton() {
  const t = useTranslations("chat")
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="default"
          size="icon"
          className="fixed bottom-4 right-4 z-50 h-12 w-12 rounded-full shadow-lg"
          aria-label={t("title")}
        >
          <MessageSquare className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="right-0 top-0 h-screen max-h-screen translate-x-0 translate-y-0 rounded-none border-l bg-background p-0 sm:max-w-md grid-rows-1"
        style={{ left: "auto" }}
      >
        <DialogTitle className="sr-only">{t("title")}</DialogTitle>
        <DialogDescription className="sr-only">{t("placeholder")}</DialogDescription>
        <ChatPanel className="h-full" />
      </DialogContent>
    </Dialog>
  )
}
