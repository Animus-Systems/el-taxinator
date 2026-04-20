import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"

const compat = (file: string) => path.resolve(__dirname, "src/compat", file)

export default defineConfig({
  plugins: [react()],
  define: {
    // Provide a minimal process.env so that lib/config.ts and other modules
    // that read process.env at import-time don't crash in the browser.
    "process.env": JSON.stringify({}),
  },
  resolve: {
    alias: [
      // --- Source aliases ---
      { find: "~", replacement: path.resolve(__dirname, "src") },

      // --- Next.js / next-intl compat shims ---
      { find: /^next-intl\/server$/, replacement: compat("next-intl-server.ts") },
      { find: /^next-intl\/navigation$/, replacement: compat("next-intl-navigation.ts") },
      { find: /^next-intl\/routing$/, replacement: compat("next-intl-routing.ts") },
      { find: /^next-intl$/, replacement: compat("next-intl.ts") },
      { find: /^next\/image$/, replacement: compat("next-image.tsx") },
      { find: /^next\/link$/, replacement: compat("next-link.tsx") },
      { find: /^next\/navigation$/, replacement: compat("next-navigation.ts") },
      { find: /^next\/cache$/, replacement: compat("next-cache.ts") },
      { find: /^next\/headers$/, replacement: compat("next-headers.ts") },

      // --- Server action stubs (must come before the generic @/ alias) ---
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

      // --- Server-only module stubs ---
      { find: "@/lib/trpc/server-client", replacement: compat("server-client.ts") },
      { find: "@/lib/auth", replacement: compat("auth.ts") },
      { find: "@/lib/pg", replacement: compat("pg.ts") },
      { find: "@/lib/entities", replacement: compat("entities.ts") },

      // --- Generic @ alias (must be last so specific @/ paths above take precedence) ---
      { find: "@", replacement: path.resolve(__dirname, ".") },
    ],
  },
  build: {
    rollupOptions: {
      // Externalize Node.js builtins so that server-only code that is
      // transitively imported (e.g. models pulled in for type re-exports)
      // doesn't break the bundle. These modules are never called at runtime.
      external: [
        "crypto",
        "fs",
        "fs/promises",
        "path",
        "os",
        "net",
        "tls",
        "dns",
        "stream",
        "events",
        "util",
        "http",
        "https",
        "zlib",
        "child_process",
        "cluster",
        "worker_threads",
        "pg",
        "pg-native",
        "embedded-postgres",
        /^@embedded-postgres\//,
        /^node:/,
      ],
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:7331",
        changeOrigin: true,
        // During `yarn dev`, Vite (fast) and Fastify+embedded Postgres (slow)
        // boot in parallel. The client's initial tRPC batch hits Vite before
        // Postgres is ready, producing ECONNREFUSED spam. React Query retries
        // transparently, so suppress that one error code while still
        // surfacing anything else.
        configure: (proxy) => {
          proxy.on("error", (err) => {
            if ((err as NodeJS.ErrnoException).code === "ECONNREFUSED") return
            console.error("[vite proxy]", err)
          })
        },
      },
      "/files": {
        target: "http://localhost:7331",
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("error", (err) => {
            if ((err as NodeJS.ErrnoException).code === "ECONNREFUSED") return
            console.error("[vite proxy]", err)
          })
        },
      },
    },
  },
})
