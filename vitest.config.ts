import path from "path"
import { defineConfig } from "vitest/config"

const compat = (file: string) => path.resolve(__dirname, "src/compat", file)

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
  resolve: {
    alias: [
      { find: /^~\//, replacement: `${path.resolve(__dirname, "src")}/` },
      { find: /^next-intl\/server$/, replacement: compat("next-intl-server.ts") },
      { find: /^next-intl\/navigation$/, replacement: compat("next-intl-navigation.ts") },
      { find: /^next-intl\/routing$/, replacement: compat("next-intl-routing.ts") },
      { find: /^next-intl$/, replacement: compat("next-intl.ts") },
      { find: /^next\/image$/, replacement: compat("next-image.tsx") },
      { find: /^next\/link$/, replacement: compat("next-link.tsx") },
      { find: /^next\/navigation$/, replacement: compat("next-navigation.ts") },
      { find: /^next\/cache$/, replacement: compat("next-cache.ts") },
      { find: /^next\/headers$/, replacement: compat("next-headers.ts") },
      { find: "@/actions/auth", replacement: compat("actions/auth.ts") },
      { find: "@/actions/files", replacement: compat("actions/files.ts") },
      { find: "@/actions/rules", replacement: compat("actions/rules.ts") },
      { find: "@/actions/settings", replacement: compat("actions/settings.ts") },
      { find: "@/actions/transactions", replacement: compat("actions/transactions.ts") },
      { find: "@/actions/reanalyze", replacement: compat("actions/reanalyze.ts") },
      { find: "@/actions/unsorted", replacement: compat("actions/unsorted.ts") },
      { find: "@/actions/contacts", replacement: compat("actions/contacts.ts") },
      { find: "@/actions/products", replacement: compat("actions/products.ts") },
      { find: "@/actions/quotes", replacement: compat("actions/quotes.ts") },
      { find: "@/actions/invoices", replacement: compat("actions/invoices.ts") },
      { find: "@/actions/ai-import", replacement: compat("actions/ai-import.ts") },
      { find: "@/actions/import", replacement: compat("actions/import.ts") },
      { find: "@/actions/accountant", replacement: compat("actions/accountant.ts") },
      { find: "@/actions/config", replacement: compat("actions/config.ts") },
      { find: "@/actions/bundle", replacement: compat("actions/bundle.ts") },
      { find: "@/actions/entities", replacement: compat("actions/entities.ts") },
      { find: "@", replacement: path.resolve(__dirname, ".") },
    ],
  },
})
