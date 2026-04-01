import { ColoredText } from "@/components/ui/colored-text"
import config from "@/lib/config"
import { getTranslations } from "next-intl/server"
import Image from "next/image"
import Link from "next/link"

export default async function LandingPage() {
  const t = await getTranslations("landing")
  const tAuth = await getTranslations("auth")

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-50">
      <header className="py-6 px-4 md:px-8 bg-white/90 backdrop-blur-xl shadow-lg border-b border-gradient-to-r from-pink-200 to-indigo-200 fixed w-full z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="relative">
              <Image
                src="/logo/256.png"
                alt="Logo"
                width={32}
                height={32}
                className="h-8 group-hover:scale-110 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-pink-600 to-indigo-600 rounded-full opacity-20 blur-md group-hover:opacity-40 transition-opacity duration-300" />
            </div>
            <ColoredText className="text-2xl font-bold">Taxinator</ColoredText>
          </Link>
          <Link
            href="/enter"
            className="cursor-pointer font-medium px-4 py-2 rounded-full border-2 border-gradient-to-r from-pink-300 to-indigo-300 hover:from-pink-400 hover:to-indigo-400 bg-white/80 hover:bg-white transition-all duration-300 hover:scale-105 text-xs md:text-sm"
          >
            {tAuth("logIn")}
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-8 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 bg-gradient-to-br from-pink-100/50 via-purple-100/30 to-indigo-100/50" />
        <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-r from-pink-400 to-indigo-400 rounded-full opacity-10 blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-gradient-to-r from-indigo-400 to-pink-400 rounded-full opacity-10 blur-3xl animate-pulse" />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-12">
            <div className="inline-block px-6 py-3 rounded-full border-2 border-pink-600/50 text-sm font-medium mb-6 shadow-lg hover:shadow-xl transition-all duration-300">
              {t("hero.tagline")}
            </div>
            <h1 className="text-5xl font-bold tracking-tight sm:text-6xl mb-6 bg-gradient-to-r from-gray-900 via-pink-700 to-indigo-700 bg-clip-text text-transparent pb-2">
              {t("hero.title")}
            </h1>
            <p className="text-xl text-gray-700 mb-8 max-w-2xl mx-auto font-medium">
              {t("hero.subtitle")}
            </p>
            <div className="flex gap-4 justify-center text-sm md:text-lg">
              <Link
                href="#start"
                className="px-8 py-4 bg-gradient-to-r from-pink-600 to-indigo-600 text-white font-bold rounded-full hover:from-pink-700 hover:to-indigo-700 transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-110 border-2 border-white/20"
              >
                {t("hero.getStarted")}
              </Link>
              <Link
                href="mailto:me@vas3k.com"
                className="px-8 py-4 border-2 border-gradient-to-r from-pink-300 to-indigo-300 text-gray-800 font-bold rounded-full hover:bg-gradient-to-r hover:from-pink-50 hover:to-indigo-50 transition-all duration-300 hover:scale-105 bg-white/80"
              >
                {t("hero.contactUs")}
              </Link>
            </div>
          </div>
          <div className="relative aspect-auto rounded-3xl overflow-hidden shadow-2xl ring-4 ring-gradient-to-r from-pink-200 to-indigo-200">
            <div className="absolute inset-0 bg-gradient-to-b from-pink-500/5 via-purple-500/5 to-indigo-500/10 z-10" />
            <video className="w-full h-auto" autoPlay loop muted playsInline poster="/landing/ai-scanner-big.webp">
              <source src="/landing/video.mp4" type="video/mp4" />
              <Image src="/landing/ai-scanner-big.webp" alt="Taxinator" width={1728} height={1080} priority />
            </video>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-8 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-white/50 to-indigo-50/50" />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <h2 className="flex flex-col gap-3 mb-4">
              <span className="text-6xl font-bold bg-gradient-to-r from-pink-600 to-indigo-600 bg-clip-text text-transparent">
                {t("features.title")}
              </span>
              <span className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                {t("features.subtitle")}
              </span>
            </h2>
          </div>

          {/* AI Scanner Feature */}
          <div className="flex flex-wrap items-center gap-12 mb-20 bg-gradient-to-br from-white via-pink-50/30 to-indigo-50/30 p-8 rounded-3xl shadow-xl ring-2 ring-gradient-to-r from-pink-200 to-indigo-200 hover:shadow-2xl transition-all duration-500 group">
            <div className="flex-1 min-w-60">
              <div className="inline-block px-4 py-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-bold mb-4 shadow-lg">
                {t("features.aiScanner.badge")}
              </div>
              <h3 className="text-2xl font-bold mb-4 bg-gradient-to-r from-blue-700 to-indigo-700 bg-clip-text text-transparent">
                {t("features.aiScanner.title")}
              </h3>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-center">
                  <span className="text-blue-600 mr-3 text-lg">✨</span>
                  {t("features.aiScanner.desc1")}
                </li>
                <li className="flex items-center">
                  <span className="text-blue-600 mr-3 text-lg">✨</span>
                  {t("features.aiScanner.desc2")}
                </li>
                <li className="flex items-center">
                  <span className="text-blue-600 mr-3 text-lg">✨</span>
                  {t("features.aiScanner.desc3")}
                </li>
                <li className="flex items-center">
                  <span className="text-blue-600 mr-3 text-lg">✨</span>
                  {t("features.aiScanner.desc4")}
                </li>
                <li className="flex items-center">
                  <span className="text-blue-600 mr-3 text-lg">✨</span>
                  {t("features.aiScanner.desc5")}
                </li>
              </ul>
            </div>
            <div className="flex-1 relative aspect-auto rounded-3xl overflow-hidden shadow-2xl ring-4 ring-gradient-to-r from-blue-200 to-indigo-200 hover:scale-105 transition-all duration-500">
              <Image src="/landing/ai-scanner.webp" alt="AI Document Analyzer" width={1900} height={1524} />
            </div>
          </div>

          {/* Multi-currency Feature */}
          <div className="flex flex-wrap items-center gap-12 mb-20 bg-gradient-to-br from-white via-green-50/30 to-emerald-50/30 p-8 rounded-3xl shadow-xl ring-2 ring-gradient-to-r from-green-200 to-emerald-200 hover:shadow-2xl transition-all duration-500 group flex-row-reverse">
            <div className="flex-1 min-w-60">
              <div className="inline-block px-4 py-2 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 text-white text-sm font-bold mb-4 shadow-lg">
                {t("features.currencyConverter.badge")}
              </div>
              <h3 className="text-2xl font-bold mb-4 bg-gradient-to-r from-green-700 to-emerald-700 bg-clip-text text-transparent">
                {t("features.currencyConverter.title")}
              </h3>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-center">
                  <span className="text-green-600 mr-3 text-lg">💰</span>
                  {t("features.currencyConverter.desc1")}
                </li>
                <li className="flex items-center">
                  <span className="text-green-600 mr-3 text-lg">💰</span>
                  {t("features.currencyConverter.desc2")}
                </li>
                <li className="flex items-center">
                  <span className="text-green-600 mr-3 text-lg">💰</span>
                  {t("features.currencyConverter.desc3")}
                </li>
                <li className="flex items-center">
                  <span className="text-green-600 mr-3 text-lg">💰</span>
                  {t("features.currencyConverter.desc4")}
                </li>
                <li className="flex items-center">
                  <span className="text-green-600 mr-3 text-lg">💰</span>
                  {t("features.currencyConverter.desc5")}
                </li>
              </ul>
            </div>
            <div className="flex-1 relative aspect-auto rounded-3xl overflow-hidden shadow-2xl ring-4 ring-gradient-to-r from-green-200 to-emerald-200 hover:scale-105 transition-all duration-500">
              <Image src="/landing/multi-currency.webp" alt="Currency Converter" width={1400} height={1005} />
            </div>
          </div>

          {/* Transaction Table Feature */}
          <div className="flex flex-wrap items-center gap-12 mb-20 bg-gradient-to-br from-white via-pink-50/30 to-rose-50/30 p-8 rounded-3xl shadow-xl ring-2 ring-gradient-to-r from-pink-200 to-rose-200 hover:shadow-2xl transition-all duration-500 group flex-row-reverse">
            <div className="flex-1 relative aspect-auto rounded-3xl overflow-hidden shadow-2xl ring-4 ring-gradient-to-r from-pink-200 to-rose-200 hover:scale-105 transition-all duration-500">
              <Image src="/landing/transactions.webp" alt="Transactions Table" width={2000} height={1279} />
            </div>
            <div className="flex-1  min-w-60">
              <div className="inline-block px-4 py-2 rounded-full bg-gradient-to-r from-pink-500 to-rose-600 text-white text-sm font-bold mb-4 shadow-lg">
                {t("features.filtersAndCategories.badge")}
              </div>
              <h3 className="text-2xl font-bold mb-4 bg-gradient-to-r from-pink-700 to-rose-700 bg-clip-text text-transparent">
                {t("features.filtersAndCategories.title")}
              </h3>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-center">
                  <span className="text-pink-600 mr-3 text-lg">📊</span>
                  {t("features.filtersAndCategories.desc1")}
                </li>
                <li className="flex items-center">
                  <span className="text-pink-600 mr-3 text-lg">📊</span>
                  {t("features.filtersAndCategories.desc2")}
                </li>
                <li className="flex items-center">
                  <span className="text-pink-600 mr-3 text-lg">📊</span>
                  {t("features.filtersAndCategories.desc3")}
                </li>
                <li className="flex items-center">
                  <span className="text-pink-600 mr-3 text-lg">📊</span>
                  {t("features.filtersAndCategories.desc4")}
                </li>
                <li className="flex items-center">
                  <span className="text-pink-600 mr-3 text-lg">📊</span>
                  {t("features.filtersAndCategories.desc5")}
                </li>
              </ul>
            </div>
          </div>

          {/* Invoice Generator */}
          <div className="flex flex-wrap items-center gap-12 mb-20 bg-gradient-to-br from-white via-purple-50/30 to-indigo-50/30 p-8 rounded-3xl shadow-xl ring-2 ring-gradient-to-r from-purple-200 to-indigo-200 hover:shadow-2xl transition-all duration-500 group">
            <div className="max-w-sm flex-1 relative aspect-auto rounded-3xl overflow-hidden shadow-2xl ring-4 ring-gradient-to-r from-purple-200 to-indigo-200 hover:scale-105 transition-all duration-500">
              <Image src="/landing/invoice-generator.webp" alt="Invoice Generator" width={1800} height={1081} />
            </div>
            <div className="flex-1 min-w-60">
              <div className="inline-block px-4 py-2 rounded-full bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-sm font-bold mb-4 shadow-lg">
                {t("features.invoiceGenerator.badge")}
              </div>
              <h3 className="text-2xl font-bold mb-4 bg-gradient-to-r from-purple-700 to-indigo-700 bg-clip-text text-transparent">
                {t("features.invoiceGenerator.title")}
              </h3>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-center">
                  <span className="text-purple-600 mr-3 text-lg">📄</span>
                  {t("features.invoiceGenerator.desc1")}
                </li>
                <li className="flex items-center">
                  <span className="text-purple-600 mr-3 text-lg">📄</span>
                  {t("features.invoiceGenerator.desc2")}
                </li>
                <li className="flex items-center">
                  <span className="text-purple-600 mr-3 text-lg">📄</span>
                  {t("features.invoiceGenerator.desc3")}
                </li>
                <li className="flex items-center">
                  <span className="text-purple-600 mr-3 text-lg">📄</span>
                  {t("features.invoiceGenerator.desc4")}
                </li>
                <li className="flex items-center">
                  <span className="text-purple-600 mr-3 text-lg">📄</span>
                  {t("features.invoiceGenerator.desc5")}
                </li>
              </ul>
            </div>
          </div>

          {/* Custom Fields & Categories */}
          <div className="flex flex-wrap items-center gap-12 mb-20 bg-gradient-to-br from-white via-violet-50/30 to-purple-50/30 p-8 rounded-3xl shadow-xl ring-2 ring-gradient-to-r from-violet-200 to-purple-200 hover:shadow-2xl transition-all duration-500 group">
            <div className="flex-1 min-w-60">
              <div className="inline-block px-4 py-2 rounded-full bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-bold mb-4 shadow-lg">
                {t("features.customLlm.badge")}
              </div>
              <h3 className="text-2xl font-bold mb-4 bg-gradient-to-r from-violet-700 to-purple-700 bg-clip-text text-transparent">
                {t("features.customLlm.title")}
              </h3>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-center">
                  <span className="text-violet-600 mr-3 text-lg">🔧</span>
                  {t("features.customLlm.desc1")}
                </li>
                <li className="flex items-center">
                  <span className="text-violet-600 mr-3 text-lg">🔧</span>
                  {t("features.customLlm.desc2")}
                </li>
                <li className="flex items-center">
                  <span className="text-violet-600 mr-3 text-lg">🔧</span>
                  {t("features.customLlm.desc3")}
                </li>
                <li className="flex items-center">
                  <span className="text-violet-600 mr-3 text-lg">🔧</span>
                  {t("features.customLlm.desc4")}
                </li>
                <li className="flex items-center">
                  <span className="text-violet-600 mr-3 text-lg">🔧</span>
                  {t("features.customLlm.desc5")}
                </li>
              </ul>
            </div>
            <div className="flex-1 relative aspect-auto rounded-3xl overflow-hidden shadow-2xl ring-4 ring-gradient-to-r from-violet-200 to-purple-200 hover:scale-105 transition-all duration-500">
              <Image src="/landing/custom-llm.webp" alt="Custom LLM promts" width={1800} height={1081} />
            </div>
          </div>

          {/* Data Export */}
          <div className="flex flex-wrap items-center gap-12 mb-20 bg-gradient-to-br from-white via-orange-50/30 to-amber-50/30 p-8 rounded-3xl shadow-xl ring-2 ring-gradient-to-r from-orange-200 to-amber-200 hover:shadow-2xl transition-all duration-500 group flex-row-reverse">
            <div className="flex-1 min-w-60">
              <div className="inline-block px-4 py-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-600 text-white text-sm font-bold mb-4 shadow-lg">
                {t("features.dataExport.badge")}
              </div>
              <h3 className="text-2xl font-bold mb-4 bg-gradient-to-r from-orange-700 to-amber-700 bg-clip-text text-transparent">
                {t("features.dataExport.title")}
              </h3>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-center">
                  <span className="text-orange-600 mr-3 text-lg">📤</span>
                  {t("features.dataExport.desc1")}
                </li>
                <li className="flex items-center">
                  <span className="text-orange-600 mr-3 text-lg">📤</span>
                  {t("features.dataExport.desc2")}
                </li>
                <li className="flex items-center">
                  <span className="text-orange-600 mr-3 text-lg">📤</span>
                  {t("features.dataExport.desc3")}
                </li>
                <li className="flex items-center">
                  <span className="text-orange-600 mr-3 text-lg">📤</span>
                  {t("features.dataExport.desc4")}
                </li>
              </ul>
            </div>
            <div className="flex-1 relative aspect-auto rounded-3xl overflow-hidden shadow-2xl ring-4 ring-gradient-to-r from-orange-200 to-amber-200 hover:scale-105 transition-all duration-500">
              <Image src="/landing/export.webp" alt="Export" width={1200} height={1081} />
            </div>
          </div>
        </div>
      </section>

      {/* Deployment Options */}
      <section
        id="start"
        className="py-20 px-8 bg-gradient-to-br from-white via-pink-50/20 to-indigo-50/20 scroll-mt-20 relative"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-pink-100/20 to-indigo-100/20" />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4 bg-gradient-to-r from-pink-600 to-indigo-600 bg-clip-text text-transparent">
              {t("deployment.title")}
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-16">
            {/* Self-Hosted Version */}
            <div className="bg-gradient-to-br from-white via-violet-50/50 to-indigo-50/50 p-8 rounded-3xl shadow-xl ring-2 ring-gradient-to-r from-violet-200 to-indigo-200 hover:shadow-2xl transition-all duration-500 group">
              <div className="inline-block px-4 py-2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-600 text-white text-sm font-bold mb-6 shadow-lg">
                {t("deployment.selfHosted.badge")}
              </div>
              <h3 className="text-2xl font-bold mb-4">
                <ColoredText>{t("deployment.selfHosted.title")}</ColoredText>
              </h3>
              <ul className="space-y-3 text-gray-700 mb-8">
                <li className="flex items-center">
                  <span className="text-indigo-600 mr-3 text-lg">🆓</span>
                  {t("deployment.selfHosted.free")}
                </li>
                <li className="flex items-center">
                  <span className="text-indigo-600 mr-3 text-lg">🔒</span>
                  {t("deployment.selfHosted.control")}
                </li>
                <li className="flex items-center">
                  <span className="text-indigo-600 mr-3 text-lg">🏗️</span>
                  {t("deployment.selfHosted.deploy")}
                </li>
                <li className="flex items-center">
                  <span className="text-indigo-600 mr-3 text-lg">🔑</span>
                  {t("deployment.selfHosted.bringKeys")}
                </li>
              </ul>
              <Link
                href="https://github.com/vas3k/Taxinator"
                target="_blank"
                className="block w-full text-center px-6 py-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold rounded-full hover:from-violet-700 hover:to-indigo-700 transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-110"
              >
                {t("deployment.selfHosted.cta")}
              </Link>
            </div>

            {/* Cloud Version */}
            <div className="bg-gradient-to-br from-white via-pink-50/50 to-purple-50/50 p-8 rounded-3xl shadow-xl ring-2 ring-gradient-to-r from-pink-200 to-purple-200 hover:shadow-2xl transition-all duration-500 group relative">
              <div className="inline-block px-4 py-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white text-sm font-bold mb-6 shadow-lg">
                {t("deployment.cloud.badge")}
              </div>
              <h3 className="text-2xl font-bold mb-4">
                <ColoredText>{t("deployment.cloud.title")}</ColoredText>
              </h3>
              <ul className="space-y-3 text-gray-700 mb-8">
                <li className="flex items-center">
                  <span className="text-purple-600 mr-3 text-lg">🎯</span>
                  {t("deployment.cloud.saas")}
                </li>
                <li className="flex items-center">
                  <span className="text-purple-600 mr-3 text-lg">🤖</span>
                  {t("deployment.cloud.aiKeys")}
                </li>
                <li className="flex items-center">
                  <span className="text-purple-600 mr-3 text-lg">💳</span>
                  {t("deployment.cloud.subscription")}
                </li>
                <li className="flex items-center">
                  <span className="text-purple-600 mr-3 text-lg">🚀</span>
                  {t("deployment.cloud.updates")}
                </li>
              </ul>
              <button
                type="button"
                disabled
                className="block w-full text-center px-6 py-4 bg-gradient-to-r from-gray-300 to-gray-400 text-gray-700 font-bold rounded-full shadow-xl opacity-80 cursor-not-allowed"
              >
                {t("deployment.cloud.cta")}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Upcoming Features */}
      <section className="py-20 px-8 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 mt-28 relative overflow-hidden">
        <div className="absolute top-10 left-10 w-64 h-64 bg-gradient-to-r from-pink-400 to-indigo-400 rounded-full opacity-5 blur-3xl" />
        <div className="absolute bottom-10 right-10 w-80 h-80 bg-gradient-to-r from-indigo-400 to-pink-400 rounded-full opacity-5 blur-3xl" />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4 bg-gradient-to-r from-pink-600 to-indigo-600 bg-clip-text text-transparent">
              {t("upcoming.title")}
            </h2>
            <p className="text-gray-700 max-w-2xl mx-auto font-medium">
              {t("upcoming.subtitle")}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-16">
            {/* AI Improvements */}
            <div className="bg-gradient-to-br from-white via-purple-50/50 to-indigo-50/50 p-8 rounded-3xl shadow-xl ring-2 ring-gradient-to-r from-purple-200 to-indigo-200 hover:shadow-2xl transition-all duration-500 hover:scale-105">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">🤖</span>
                <h3 className="text-xl font-bold bg-gradient-to-r from-purple-700 to-indigo-700 bg-clip-text text-transparent">
                  {t("upcoming.aiAnalytics.title")}
                </h3>
              </div>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-center">
                  <span className="text-purple-600 mr-3 text-lg">🔮</span>
                  {t("upcoming.aiAnalytics.desc1")}
                </li>
                <li className="flex items-center">
                  <span className="text-purple-600 mr-3 text-lg">🔮</span>
                  {t("upcoming.aiAnalytics.desc2")}
                </li>
                <li className="flex items-center">
                  <span className="text-purple-600 mr-3 text-lg">🔮</span>
                  {t("upcoming.aiAnalytics.desc3")}
                </li>
                <li className="flex items-center">
                  <span className="text-purple-600 mr-3 text-lg">🔮</span>
                  {t("upcoming.aiAnalytics.desc4")}
                </li>
              </ul>
            </div>

            {/* Smart Reports */}
            <div className="bg-gradient-to-br from-white via-pink-50/50 to-rose-50/50 p-8 rounded-3xl shadow-xl ring-2 ring-gradient-to-r from-pink-200 to-rose-200 hover:shadow-2xl transition-all duration-500 hover:scale-105">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">📊</span>
                <h3 className="text-xl font-bold bg-gradient-to-r from-pink-700 to-rose-700 bg-clip-text text-transparent">
                  {t("upcoming.smartReports.title")}
                </h3>
              </div>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-center">
                  <span className="text-pink-600 mr-3 text-lg">📈</span>
                  {t("upcoming.smartReports.desc1")}
                </li>
                <li className="flex items-center">
                  <span className="text-pink-600 mr-3 text-lg">📈</span>
                  {t("upcoming.smartReports.desc2")}
                </li>
                <li className="flex items-center">
                  <span className="text-pink-600 mr-3 text-lg">📈</span>
                  {t("upcoming.smartReports.desc3")}
                </li>
              </ul>
            </div>

            {/* Transaction Review */}
            <div className="bg-gradient-to-br from-white via-green-50/50 to-emerald-50/50 p-8 rounded-3xl shadow-xl ring-2 ring-gradient-to-r from-green-200 to-emerald-200 hover:shadow-2xl transition-all duration-500 hover:scale-105">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">📥</span>
                <h3 className="text-xl font-bold bg-gradient-to-r from-green-700 to-emerald-700 bg-clip-text text-transparent">
                  {t("upcoming.transactionReview.title")}
                </h3>
              </div>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-center">
                  <span className="text-green-600 mr-3 text-lg">💳</span>
                  {t("upcoming.transactionReview.desc1")}
                </li>
                <li className="flex items-center">
                  <span className="text-green-600 mr-3 text-lg">💳</span>
                  {t("upcoming.transactionReview.desc2")}
                </li>
                <li className="flex items-center">
                  <span className="text-green-600 mr-3 text-lg">💳</span>
                  {t("upcoming.transactionReview.desc3")}
                </li>
              </ul>
            </div>

            {/* Custom Fields */}
            <div className="bg-gradient-to-br from-white via-orange-50/50 to-amber-50/50 p-8 rounded-3xl shadow-xl ring-2 ring-gradient-to-r from-orange-200 to-amber-200 hover:shadow-2xl transition-all duration-500 hover:scale-105">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">🧩</span>
                <h3 className="text-xl font-bold bg-gradient-to-r from-orange-700 to-amber-700 bg-clip-text text-transparent">
                  {t("upcoming.presetsPlugins.title")}
                </h3>
              </div>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-center">
                  <span className="text-orange-600 mr-3 text-lg">🌍</span>
                  {t("upcoming.presetsPlugins.desc1")}
                </li>
                <li className="flex items-center">
                  <span className="text-orange-600 mr-3 text-lg">🌍</span>
                  {t("upcoming.presetsPlugins.desc2")}
                </li>
                <li className="flex items-center">
                  <span className="text-orange-600 mr-3 text-lg">🌍</span>
                  {t("upcoming.presetsPlugins.desc3")}
                </li>
              </ul>
            </div>
          </div>

          {/* Stay Tuned / GitHub CTA */}
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-8 rounded-2xl shadow-sm ring-1 ring-gray-100">
            <div className="max-w-2xl mx-auto text-center">
              <h3 className="text-2xl font-semibold mb-4">{t("footer.stayTuned")}</h3>
              <p className="text-gray-600 mb-6">
                {t("footer.stayTunedDesc")}
              </p>
              <div className="flex flex-col gap-4 max-w-md mx-auto">
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <a
                    href="https://github.com/vas3k/Taxinator"
                    target="_blank"
                    rel="noreferrer"
                    className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium rounded-full hover:opacity-90 transition-all shadow-lg shadow-purple-500/20"
                  >
                    {t("footer.openGithub")}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="py-8 px-8 bg-gradient-to-r from-pink-50 to-indigo-50 border-t-2 border-gradient-to-r from-pink-200 to-indigo-200">
        <div className="max-w-7xl mx-auto text-center text-sm text-gray-600">
          {t("footer.madeWith")}{" "}
          <Link
            href="https://github.com/vas3k"
            className="underline font-semibold hover:text-pink-600 transition-colors"
          >
            @vas3k
          </Link>
        </div>

        <section className="py-12 px-8">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-wrap gap-4 justify-center">
              <Link
                href={`mailto:${config.app.supportEmail}`}
                className="text-sm text-gray-600 hover:text-pink-600 font-medium transition-colors"
              >
                {t("footer.contactUs")}
              </Link>
              <Link
                href="/docs/terms"
                className="text-sm text-gray-600 hover:text-pink-600 font-medium transition-colors"
              >
                {t("footer.termsOfService")}
              </Link>
              <Link
                href="/docs/privacy_policy"
                className="text-sm text-gray-600 hover:text-pink-600 font-medium transition-colors"
              >
                {t("footer.privacyPolicy")}
              </Link>
              <Link href="/docs/ai" className="text-sm text-gray-600 hover:text-pink-600 font-medium transition-colors">
                {t("footer.aiUseDisclosure")}
              </Link>
              <Link
                href="/docs/cookie"
                className="text-sm text-gray-600 hover:text-pink-600 font-medium transition-colors"
              >
                {t("footer.cookiePolicy")}
              </Link>
              <Link
                href="https://github.com/vas3k/Taxinator"
                target="_blank"
                className="text-sm text-gray-600 hover:text-pink-600 font-medium transition-colors"
              >
                {t("footer.sourceCode")}
              </Link>
            </div>
          </div>
        </section>
      </footer>
    </div>
  )
}
