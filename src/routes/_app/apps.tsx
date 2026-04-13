/**
 * Apps page — SPA equivalent of app/[locale]/(app)/apps/page.tsx
 *
 * The original loaded app manifests from the filesystem via getApps().
 * In the SPA, we hardcode the known apps since dynamic filesystem scanning
 * is not available client-side.
 */
import { Link } from "@/lib/navigation"

type AppManifest = {
  name: string
  description: string
  icon: string
}

// Known apps — mirrors the filesystem-based discovery from Next.js
const APPS: { id: string; manifest: AppManifest }[] = [
  {
    id: "invoices",
    manifest: {
      name: "Invoice Generator",
      description: "Generate custom invoices and send them to your customers",
      icon: "\uD83E\uDDFE",
    },
  },
]

export function AppsPage() {
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">Apps</span>
          <span className="text-3xl tracking-tight opacity-20">{APPS.length}</span>
        </h2>
      </header>

      <main className="flex flex-row gap-4 flex-wrap">
        {APPS.map((app) => (
          <Link
            key={app.id}
            href={`/apps/${app.id}`}
            className="block shadow-xl max-w-[320px] p-6 bg-white rounded-lg hover:shadow-md transition-shadow border-4 border-gray-100"
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-row items-center gap-4">
                <div className="text-4xl">{app.manifest.icon}</div>
                <div className="text-2xl font-semibold">{app.manifest.name}</div>
              </div>
              <div className="text-sm">{app.manifest.description}</div>
            </div>
          </Link>
        ))}
      </main>
    </>
  )
}
