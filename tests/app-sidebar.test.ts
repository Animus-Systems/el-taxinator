import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("AppSidebar source", () => {
  it("does not render the desktop rail toggle line", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "components/sidebar/sidebar.tsx"),
      "utf8",
    )

    expect(source).not.toContain("<SidebarRail />")
  })
})
