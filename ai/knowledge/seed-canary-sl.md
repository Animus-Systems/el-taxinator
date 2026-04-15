# Canary Islands — Sociedad Limitada (SL) tax knowledge pack

Last verified: 2026-04-15 · Source: Taxinator seed
Applies to: private limited companies (Sociedad Limitada / SL) with tax
domicile in the Canary Islands under the IGIC regime.

## IGIC — Impuesto General Indirecto Canario

SLs operating in the Canary Islands charge and pay IGIC, not IVA.
Standard rates same as autónomo pack (0%, 3%, 7%, 9.5%, 15%, 20%).
Administered by the Agencia Tributaria Canaria (ATC).

Modelo 420 is the quarterly self-assessment (supported vs charged IGIC).
Modelo 425 is the annual summary filed in January.

## Corporate tax (Impuesto de Sociedades — IS)

Default rate: 25% on net taxable profit (Art. 29 LIS).
Reduced rate for new companies (first two profit-positive years): 15%
(Art. 29.1 LIS — Disposición transitoria).

RIC (Reserva para Inversiones en Canarias) — the Canary-specific
corporate incentive. Up to 90% of net profit can be allocated to RIC,
deferring corporate tax, subject to strict 3-year reinvestment rules
into qualifying Canary assets (Art. 27 Ley 19/1994).

ZEC (Zona Especial Canaria) regime: reduced 4% IS rate for specific
activities and with ZEC registration — very narrow eligibility, typically
requires substantial investment and new hires.

## Quarterly filings — SL calendar

| Form | Covers | Filing window |
|------|--------|---------------|
| Modelo 420 | IGIC self-assessment | Apr 20, Jul 20, Oct 20, Jan 30 |
| Modelo 202 | Corporate tax fractional payment (IS on account) | Apr 20, Oct 20, Dec 20 |
| Modelo 200 | Annual corporate tax | 25 days after 6 months of fiscal year end (typically Jul 25) |
| Modelo 111 | Retenciones IRPF — salaries and professional retentions | Monthly or quarterly |
| Modelo 115 | Retenciones IRPF on rent paid | Monthly or quarterly |
| Modelo 425 | Annual IGIC summary | Jan 30 |
| Modelo 190 | Annual summary of IRPF retentions | Jan 31 |

Corporate tax payments on account (Modelo 202):
- Three payments per year (April, October, December)
- Base: either previous year's Modelo 200 liability OR current year's
  running profit — the company chooses the method for the fiscal year
  on Modelo 036.

## Deductibility rules — what SLs can deduct

General principle (Art. 15 LIS): an expense is deductible when it is
**correlated with revenue**, properly documented (factura con NIF),
recorded in the company's books, and not explicitly excluded.

### 100% deductible

- Employee salaries and social security (empresa part).
- Rent of premises used for company activity.
- Professional services invoiced to the company.
- Insurance, software, utilities for company-used premises.
- Interest on business loans (subject to thin-cap rules in Art. 16 LIS
  for interest over €1M/year or ratio-based limits).
- Depreciation of fixed assets (tables in Art. 12 LIS).

### Mixed-use / partial deductibility

- Company vehicles: 100% only when exclusive business use can be shown
  (delivery vehicles, driving schools). Otherwise treated as retribución
  en especie for the user and only partial deductibility is recognized.
- Client meals: 1% cap on net turnover for "atenciones a clientes"
  (Art. 15.e LIS).

### Not deductible

- Fines, traffic tickets, late-filing surcharges (Art. 15.c LIS).
- Donations to non-qualifying organisations.
- Dividend distributions (these are distributions of profit, not expenses).
- Personal expenses of shareholders/directors billed to the company
  (these become retribución en especie + denial of deduction).

## Retenciones (IRPF withholding)

SLs must retain and remit IRPF on:
- Employee payroll (varies by salary, tables).
- Payments to Spanish autónomos on professional services: 15% (7% for
  new autónomos) — Modelo 111.
- Rent paid on commercial premises: 19% — Modelo 115.

## Common tax-saving angles (cite the rule)

- Use RIC (Art. 27 Ley 19/1994) for reinvestment of profits into qualifying
  Canary assets — defers corporate tax but locks funds for 3+ years.
- Fleet: capitalise vehicles and depreciate per Art. 12 LIS tables
  rather than expensing fuel piecemeal.
- Pay director (administrador) via nómina with IRPF retention rather than
  dividends when marginal rate is below company tax rate.
- Register salary-sacrifice schemes (ticket restaurante, health insurance)
  to reduce IRPF retention while keeping full corporate deduction.

## Cryptocurrency

Corporate (SL) treatment differs from the autónomo regime — there is no
"base del ahorro" for companies. All crypto P&L flows into the ordinary
corporate tax base.

- **Disposals** are ordinary corporate income/expense on Modelo 200 at the
  company's IS rate (25% default, 15% for new companies in years 1–2).
- **FIFO is the default cost-basis method** under Spanish accounting
  standards (Plan General Contable, and consistent with Art. 10.3 LIS).
  Document the method in the bookkeeping policy and apply it consistently.
- **Year-end mark-to-market** is NOT required for non-trading SLs that hold
  crypto as a financial asset. Recognize P&L on disposal only. (Trading
  companies whose main activity is crypto trading must mark-to-market.)
- **Staking / lending / yield** is ingreso financiero (casilla 1302-range
  on Modelo 200). Recognize at fair market value at receipt.
- **Airdrops and forks** = ingreso extraordinario at FMV on receipt.
- **Losses** are deductible up to the general corporate loss-offset limits
  (Art. 26 LIS) — no bracket distinction as there is for autónomos.
- **Modelo 721 (declaración informativa).** Same threshold applies to SL
  companies: aggregate > €50,000 on foreign exchanges/wallets at year-end
  (or > €20,000 change vs prior year) triggers filing between 1 Jan – 31 Mar.
- **No IGIC on crypto trades.** Crypto disposals are not IGIC-taxable supplies
  under Art. 10.1 Ley 20/1991 (intangible financial assets exemption).

Swissborg/Coinbase/Binance/Kraken bank deposits are the fiat leg of a
disposal that has already occurred on the exchange. Pair the bank row with
its disposal so the deposit is not double-booked as corporate revenue.

## Red flags (reject or reclassify)

- Receipt without NIF → not a valid factura, not deductible.
- Shareholder personal expenses on the company card → retribución en especie.
- Vehicle expenses with no mileage/business-use log → only partial.
- Cash payments over €1,000 between the SL and other companies/professionals
  (prohibited by Ley 11/2021).
- Crypto exchange withdrawal booked as ordinary revenue — must be
  crypto_disposal with matching cost basis under FIFO.

## Useful references

- AEAT — Modelos 200/202/111/115 and IS: https://sede.agenciatributaria.gob.es
- ATC — IGIC: https://www.gobiernodecanarias.org/tributos
- BOE — Ley 27/2014 (Impuesto sobre Sociedades).
- BOE — Ley 19/1994 (REF — RIC, ZEC).

---

Note for the AI: when giving tax tips, always cite the legal reference
(Modelo casilla, BOE article, or LIS/LIRPF section). If you are unsure
of the exact citation, flag it with ⚠ and ask the user to verify with
their asesor fiscal rather than fabricating one.
