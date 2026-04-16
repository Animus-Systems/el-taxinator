import { describe, expect, it } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { Sidebar, SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

describe("sidebar inset spacing", () => {
  it("removes the inset page margin on desktop", () => {
    const html = renderToStaticMarkup(createElement(SidebarInset))

    expect(html).toContain("md:peer-data-[variant=inset]:m-0 md:peer-data-[state=collapsed]:peer-data-[variant=inset]:ml-0")
    expect(html).toContain("md:peer-data-[variant=inset]:rounded-none md:peer-data-[variant=inset]:shadow-none")
  })

  it("removes inset padding around the desktop sidebar shell", () => {
    const html = renderToStaticMarkup(
      createElement(
        SidebarProvider,
        null,
        createElement(
          Sidebar,
          { variant: "inset", collapsible: "icon" },
          createElement("div", null, "content"),
        ),
      ),
    )

    expect(html).toContain("p-0 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_2px)]")
  })
})
