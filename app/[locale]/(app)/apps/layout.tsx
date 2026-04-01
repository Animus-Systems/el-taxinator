import { setRequestLocale } from "next-intl/server"

export default async function AppsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  return <div className="flex flex-col gap-4 p-4">{children}</div>
}
