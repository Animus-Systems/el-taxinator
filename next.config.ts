import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n.ts")

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  devIndicators: false,
  // embedded-postgres dynamically requires a platform-specific native binary
  // (one of @embedded-postgres/{darwin-arm64,darwin-x64,linux-x64,linux-arm64,
  // windows-x64}). Bundlers can't resolve optional deps for absent platforms,
  // so we tell Next.js to treat the package as external on the server.
  serverExternalPackages: ["embedded-postgres"],
  experimental: {
    serverActions: {
      bodySizeLimit: "256mb",
    },
  },
}

export default withNextIntl(nextConfig)
