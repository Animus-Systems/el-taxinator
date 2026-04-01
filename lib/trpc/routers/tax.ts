import { z } from "zod"
import { router, authedProcedure } from "../init"
import {
  getTaxYearSummary,
  calcModelo420,
  calcModelo130,
  calcModelo425,
  getUpcomingDeadlines,
} from "@/models/tax"
import { calcModelo202, calcModelo200, getSLTaxYearSummary } from "@/models/tax-sl"
import type { Quarter } from "@/models/tax"
import { getActiveEntity } from "@/lib/entities"

const quarterSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])

const periodSchema = z.object({
  start: z.date(),
  end: z.date(),
})

const modelo420Schema = z.object({
  year: z.number(),
  quarter: quarterSchema,
  period: periodSchema,
  baseZero: z.number(),
  cuotaZero: z.number(),
  baseReducido: z.number(),
  cuotaReducido: z.number(),
  baseGeneral: z.number(),
  cuotaGeneral: z.number(),
  baseIncrementado: z.number(),
  cuotaIncrementado: z.number(),
  baseEspecial: z.number(),
  cuotaEspecial: z.number(),
  totalIgicDevengado: z.number(),
  baseDeducible: z.number(),
  cuotaDeducible: z.number(),
  resultado: z.number(),
  invoiceCount: z.number(),
  expenseCount: z.number(),
})

const modelo130Schema = z.object({
  year: z.number(),
  quarter: quarterSchema,
  period: periodSchema,
  casilla01_ingresos: z.number(),
  casilla02_gastos: z.number(),
  casilla03_rendimientoNeto: z.number(),
  casilla04_cuota20pct: z.number(),
  casilla05_irpfRetenido: z.number(),
  casilla06_aIngresar: z.number(),
  invoiceCount: z.number(),
  expenseCount: z.number(),
})

const modelo202Schema = z.object({
  year: z.number(),
  quarter: quarterSchema,
  period: periodSchema,
  casilla01_baseImponible: z.number(),
  casilla02_tipoGravamen: z.number(),
  casilla03_cuotaIntegra: z.number(),
  casilla04_pagosACuenta: z.number(),
  casilla05_aIngresar: z.number(),
  invoiceCount: z.number(),
  expenseCount: z.number(),
})

const modelo200Schema = z.object({
  year: z.number(),
  quarters: z.array(modelo202Schema),
  totalRevenue: z.number(),
  totalExpenses: z.number(),
  baseImponible: z.number(),
  tipoGravamen: z.number(),
  cuotaIntegra: z.number(),
  totalPagosACuenta: z.number(),
  cuotaDiferencial: z.number(),
})

const modelo425Schema = z.object({
  year: z.number(),
  quarters: z.array(modelo420Schema),
  totalBaseGeneral: z.number(),
  totalCuotaGeneral: z.number(),
  totalBaseReducido: z.number(),
  totalCuotaReducido: z.number(),
  totalIgicDevengado: z.number(),
  totalIgicDeducible: z.number(),
  totalResultado: z.number(),
})

const quarterlySummarySchema = z.object({
  quarter: quarterSchema,
  label: z.string(),
  deadline: z.date(),
  forms: z.array(z.string()),
  modelo420: modelo420Schema,
  modelo130: modelo130Schema.optional(),
  modelo202: modelo202Schema.optional(),
})

const deadlineSchema = z.object({
  quarter: quarterSchema,
  label: z.string(),
  deadline: z.date(),
  forms: z.array(z.string()),
})

export const taxRouter = router({
  entityType: authedProcedure
    .input(z.object({}))
    .output(z.object({ type: z.enum(["autonomo", "sl"]) }))
    .query(async () => {
      const entity = await getActiveEntity()
      return { type: entity.type }
    }),

  yearSummary: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/tax/{year}" } })
    .input(z.object({ year: z.number().int(), locale: z.string().optional() }))
    .output(z.array(quarterlySummarySchema))
    .query(async ({ ctx, input }) => {
      const entity = await getActiveEntity()
      if (entity.type === "sl") {
        return getSLTaxYearSummary(ctx.user.id, input.year, input.locale)
      }
      return getTaxYearSummary(ctx.user.id, input.year, input.locale)
    }),

  modelo420: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/tax/{year}/{quarter}/420" } })
    .input(z.object({ year: z.number().int(), quarter: quarterSchema }))
    .output(modelo420Schema)
    .query(async ({ ctx, input }) => {
      return calcModelo420(ctx.user.id, input.year, input.quarter as Quarter)
    }),

  modelo130: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/tax/{year}/{quarter}/130" } })
    .input(z.object({ year: z.number().int(), quarter: quarterSchema }))
    .output(modelo130Schema)
    .query(async ({ ctx, input }) => {
      return calcModelo130(ctx.user.id, input.year, input.quarter as Quarter)
    }),

  modelo202: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/tax/{year}/{quarter}/202" } })
    .input(z.object({ year: z.number().int(), quarter: quarterSchema, taxRate: z.number().default(25) }))
    .output(modelo202Schema)
    .query(async ({ ctx, input }) => {
      return calcModelo202(ctx.user.id, input.year, input.quarter as Quarter, input.taxRate)
    }),

  modelo200: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/tax/{year}/200" } })
    .input(z.object({ year: z.number().int(), taxRate: z.number().default(25) }))
    .output(modelo200Schema)
    .query(async ({ ctx, input }) => {
      return calcModelo200(ctx.user.id, input.year, input.taxRate)
    }),

  modelo425: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/tax/{year}/425" } })
    .input(z.object({ year: z.number().int() }))
    .output(modelo425Schema)
    .query(async ({ ctx, input }) => {
      return calcModelo425(ctx.user.id, input.year)
    }),

  deadlines: authedProcedure
    .meta({ openapi: { method: "GET", path: "/api/v1/tax/{year}/deadlines" } })
    .input(z.object({ year: z.number().int(), locale: z.string().optional() }))
    .output(z.array(deadlineSchema))
    .query(async ({ input }) => {
      return getUpcomingDeadlines(input.year, input.locale)
    }),
})
