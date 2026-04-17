import { useState } from "react"
import { Button } from "@/components/ui/button"
import { MessageSquare } from "lucide-react"
import { ChatFloatingPanel } from "@/components/chat/chat-floating-panel"
import { useTranslations } from "next-intl"

export function ChatFloatingButton() {
  const t = useTranslations("chat")
  const [open, setOpen] = useState(false)

  return (
    <>
      {!open ? (
        <Button
          variant="default"
          size="icon"
          className="fixed bottom-4 right-4 z-50 h-12 w-12 rounded-full shadow-lg"
          aria-label={t("title")}
          onClick={() => setOpen(true)}
        >
          <MessageSquare className="h-5 w-5" />
        </Button>
      ) : null}
      {open ? <ChatFloatingPanel onClose={() => setOpen(false)} /> : null}
    </>
  )
}
