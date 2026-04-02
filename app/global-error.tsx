"use client"

import { Button } from "@/components/ui/button"
import { Ghost } from "lucide-react"
import Link from "next/link"

export default function GlobalError({ error }: { error: Error }) {
  console.error("Global error:", error)

  return (
    <html>
      <body>
        <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
          <div className="text-center space-y-4">
            <Ghost className="w-24 h-24 text-destructive mx-auto" />
            <h1 className="text-4xl font-bold text-foreground">Oops! Something went wrong</h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              Something unexpected happened. Try refreshing the page.
            </p>
            <div className="pt-4">
              <Button asChild>
                <Link href="/">Go Home</Link>
              </Button>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
