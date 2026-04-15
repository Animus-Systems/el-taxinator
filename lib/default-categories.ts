/**
 * Default accountant-friendly categories for Canary Islands freelancers.
 *
 * Each category has bilingual names (en/es), a taxFormRef pointing to the
 * relevant Spanish/Canary Islands tax form section, and an llmPrompt to guide
 * automated categorisation.
 */

export type DefaultCategory = {
  code: string
  name: { en: string; es: string }
  taxFormRef: string
  llmPrompt: string
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  // -------------------------------------------------------------------------
  // Expense categories
  // -------------------------------------------------------------------------
  {
    code: "office_supplies",
    name: { en: "Office Supplies", es: "Material de oficina" },
    taxFormRef: "Gastos deducibles IRPF",
    llmPrompt: "Office supplies, stationery, printer ink, paper",
  },
  {
    code: "professional_services",
    name: { en: "Professional Services", es: "Servicios profesionales" },
    taxFormRef: "IGIC soportado 7% / Gastos deducibles IRPF",
    llmPrompt: "Legal, accounting, consulting, freelancer payments",
  },
  {
    code: "telecommunications",
    name: { en: "Telecommunications", es: "Telecomunicaciones" },
    taxFormRef: "Gastos deducibles IRPF",
    llmPrompt: "Phone, internet, mobile, Vodafone, Movistar",
  },
  {
    code: "rent",
    name: { en: "Rent", es: "Alquiler" },
    taxFormRef: "Gastos deducibles + retenciones",
    llmPrompt: "Office rent, coworking space",
  },
  {
    code: "insurance",
    name: { en: "Insurance", es: "Seguros" },
    taxFormRef: "Gastos deducibles IRPF (exento IGIC)",
    llmPrompt: "Business insurance, liability, health",
  },
  {
    code: "travel",
    name: { en: "Travel", es: "Viajes y desplazamientos" },
    taxFormRef: "Gastos deducibles IRPF",
    llmPrompt: "Flights, hotels, trains, taxis, Uber",
  },
  {
    code: "meals",
    name: { en: "Meals & Entertainment", es: "Comidas y representacion" },
    taxFormRef: "50% deducible IRPF",
    llmPrompt: "Business meals, restaurant, client entertainment",
  },
  {
    code: "bank_fees",
    name: { en: "Bank Fees", es: "Comisiones bancarias" },
    taxFormRef: "Gastos deducibles (exento IGIC)",
    llmPrompt: "Bank charges, wire fees, card fees",
  },
  {
    code: "software",
    name: { en: "Software & Subscriptions", es: "Software y suscripciones" },
    taxFormRef: "IGIC soportado 7% / Gastos deducibles IRPF",
    llmPrompt: "SaaS, cloud, Netflix, Adobe, GitHub, hosting",
  },
  {
    code: "training",
    name: { en: "Training", es: "Formacion" },
    taxFormRef: "Gastos deducibles IRPF",
    llmPrompt: "Courses, workshops, conferences, books",
  },
  {
    code: "vehicle",
    name: { en: "Vehicle", es: "Vehiculo" },
    taxFormRef: "50% deducible IRPF (autonomo)",
    llmPrompt: "Fuel, car maintenance, parking, tolls",
  },
  {
    code: "taxes_ss",
    name: { en: "Taxes & Social Security", es: "Impuestos y Seg. Social" },
    taxFormRef: "No deducible IRPF",
    llmPrompt: "IGIC payments, IRPF, Social Security cuota",
  },
  {
    code: "utilities",
    name: { en: "Utilities", es: "Suministros" },
    taxFormRef: "Gastos deducibles IRPF",
    llmPrompt: "Electricity, water, gas, Endesa",
  },
  {
    code: "marketing",
    name: { en: "Marketing & Advertising", es: "Marketing y publicidad" },
    taxFormRef: "IGIC soportado 7% / Gastos deducibles IRPF",
    llmPrompt: "Google Ads, Facebook Ads, social media",
  },
  {
    code: "equipment",
    name: { en: "Equipment", es: "Equipamiento" },
    taxFormRef: "Gastos deducibles / amortizable",
    llmPrompt: "Computer, laptop, monitor, furniture",
  },

  // -------------------------------------------------------------------------
  // Income categories
  // -------------------------------------------------------------------------
  {
    code: "sales",
    name: { en: "Sales", es: "Ventas" },
    taxFormRef: "IGIC repercutido 7%",
    llmPrompt: "Product sales, merchandise",
  },
  {
    code: "professional_fees",
    name: { en: "Professional Fees", es: "Honorarios profesionales" },
    taxFormRef: "Retencion IRPF 15%",
    llmPrompt: "Client invoices, freelance payments",
  },
  {
    code: "other_income",
    name: { en: "Other Income", es: "Otros ingresos" },
    taxFormRef: "Base imponible IRPF",
    llmPrompt: "Interest, refunds, grants, subsidies",
  },

  // -------------------------------------------------------------------------
  // Crypto categories
  //
  // Crypto disposals are ganancia/pérdida patrimonial on the savings base
  // (Modelo 100) for autónomos, and ordinary corporate income (Modelo 200)
  // for SL companies. Treat them separately from trade income so the tax
  // engine can pipe them to the right form.
  // -------------------------------------------------------------------------
  {
    code: "crypto_disposal",
    name: {
      en: "Crypto Disposal",
      es: "Disposición de criptomoneda",
    },
    taxFormRef: "Ganancia patrimonial — base del ahorro (Modelo 100) / Modelo 200 SL",
    llmPrompt:
      "Sale, withdrawal, or exchange of crypto into fiat or another asset. " +
      "Triggered by merchants like Swissborg, Coinbase, Binance, Kraken, " +
      "Bitstamp, Bit2Me, Bitpanda, Crypto.com, Revolut crypto, or any " +
      "account with account_type crypto_exchange/crypto_wallet.",
  },
  {
    code: "crypto_purchase",
    name: {
      en: "Crypto Purchase",
      es: "Compra de criptomoneda",
    },
    taxFormRef: "Coste de adquisición (FIFO, no deducible directo)",
    llmPrompt:
      "Buying crypto with fiat — not a taxable event, but builds cost basis " +
      "for FIFO tracking. Transfers to Swissborg/Coinbase/Binance/Kraken/etc.",
  },
  {
    code: "crypto_fee",
    name: {
      en: "Crypto Network Fee",
      es: "Comisión de red/exchange",
    },
    taxFormRef: "Coste asociado al activo",
    llmPrompt:
      "Network gas fees, exchange trading fees, withdrawal fees on crypto " +
      "platforms. Added to cost basis or deducted from proceeds.",
  },
  {
    code: "crypto_staking_reward",
    name: {
      en: "Staking Reward",
      es: "Recompensa de staking",
    },
    taxFormRef: "Rendimiento del capital mobiliario (Modelo 100)",
    llmPrompt:
      "Staking rewards, lending interest, yield farming, liquidity provision " +
      "payouts. Taxed as capital yield when received.",
  },
  {
    code: "crypto_airdrop",
    name: {
      en: "Airdrop",
      es: "Airdrop",
    },
    taxFormRef: "Ganancia patrimonial sin valor de adquisición",
    llmPrompt:
      "Free token airdrops, hard-fork distributions, free NFTs. Taxed at " +
      "fair market value on receipt.",
  },
]
