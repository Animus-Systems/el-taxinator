"use client"

import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  type ChartOptions,
} from "chart.js"

import { formatPeriodLabel } from "@/lib/utils"

export type DashboardTimeSeriesPoint = {
  period: string
  income: number
  expenses: number
  date: Date
}

export type DashboardCategoryBreakdownPoint = {
  code: string
  name: string
  color: string
  expenses: number
  transactionCount: number
}

export type DashboardMerchantBreakdownPoint = {
  merchant: string
  expenses: number
  transactionCount: number
}

export type DashboardProfitTrendPoint = {
  period: string
  profit: number
  date: Date
}

export const dashboardChartTheme = {
  colors: {
    panel: "#ffffff",
    surface: "#f8fafc",
    mutedSurface: "#e2e8f0",
    border: "rgba(148, 163, 184, 0.28)",
    grid: "rgba(148, 163, 184, 0.22)",
    text: "#0f172a",
    mutedText: "#475569",
    positive: "#10b981",
    positiveSoft: "rgba(16, 185, 129, 0.18)",
    expense: "#ef4444",
    expenseSoft: "rgba(239, 68, 68, 0.18)",
    slate: "#334155",
    coral: "#fb7185",
  },
  fonts: {
    family: "Inter, ui-sans-serif, system-ui, sans-serif",
  },
  categoryPalette: [
    "#0f766e",
    "#14b8a6",
    "#2dd4bf",
    "#0ea5e9",
    "#38bdf8",
    "#64748b",
    "#fb7185",
    "#ef4444",
  ],
} as const

let chartJsRegistered = false

export function registerDashboardChartJs() {
  if (chartJsRegistered) return

  ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler)
  chartJsRegistered = true
}

function hashString(input: string) {
  let hash = 0

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index)
    hash |= 0
  }

  return Math.abs(hash)
}

export function getDashboardCategoryColor(code: string | null | undefined, index = 0) {
  const palette = dashboardChartTheme.categoryPalette
  if (code && code.trim()) {
    return palette[hashString(code) % palette.length] ?? dashboardChartTheme.colors.slate
  }

  return palette[Math.abs(index) % palette.length] ?? dashboardChartTheme.colors.slate
}

export function formatDashboardPeriodLabel(period: string, date: Date) {
  return formatPeriodLabel(period, date)
}

function buildTooltipOptions() {
  return {
    backgroundColor: dashboardChartTheme.colors.panel,
    titleColor: dashboardChartTheme.colors.text,
    bodyColor: dashboardChartTheme.colors.text,
    borderColor: dashboardChartTheme.colors.border,
    borderWidth: 1,
    padding: 12,
    displayColors: true,
    caretPadding: 10,
    titleFont: {
      family: dashboardChartTheme.fonts.family,
      weight: 600,
    },
    bodyFont: {
      family: dashboardChartTheme.fonts.family,
      weight: 400,
    },
  }
}

function buildLegendOptions() {
  return {
    labels: {
      color: dashboardChartTheme.colors.mutedText,
      usePointStyle: true,
      pointStyle: "circle" as const,
      boxWidth: 8,
      boxHeight: 8,
      padding: 16,
      font: {
        family: dashboardChartTheme.fonts.family,
      },
    },
  }
}

export function createDashboardLineChartOptions(): ChartOptions<"line"> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index",
      intersect: false,
    },
    layout: {
      padding: {
        top: 8,
        right: 8,
        bottom: 0,
        left: 0,
      },
    },
    plugins: {
      legend: buildLegendOptions(),
      tooltip: buildTooltipOptions(),
    },
    elements: {
      line: {
        tension: 0.35,
        borderWidth: 2,
      },
      point: {
        radius: 2,
        hoverRadius: 5,
        hitRadius: 8,
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: dashboardChartTheme.colors.mutedText,
          font: {
            family: dashboardChartTheme.fonts.family,
          },
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: dashboardChartTheme.colors.grid,
        },
        ticks: {
          color: dashboardChartTheme.colors.mutedText,
          font: {
            family: dashboardChartTheme.fonts.family,
          },
        },
      },
    },
  }
}

export function createDashboardBarChartOptions(horizontal = false): ChartOptions<"bar"> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? "y" : "x",
    interaction: {
      mode: "index",
      intersect: false,
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: buildTooltipOptions(),
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: {
          color: dashboardChartTheme.colors.grid,
        },
        ticks: {
          color: dashboardChartTheme.colors.mutedText,
          font: {
            family: dashboardChartTheme.fonts.family,
          },
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          display: false,
        },
        ticks: {
          color: dashboardChartTheme.colors.mutedText,
          font: {
            family: dashboardChartTheme.fonts.family,
          },
        },
      },
    },
  }
}

export function createDashboardDoughnutChartOptions(): ChartOptions<"doughnut"> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "66%",
    plugins: {
      legend: {
        display: false,
      },
      tooltip: buildTooltipOptions(),
    },
  }
}
