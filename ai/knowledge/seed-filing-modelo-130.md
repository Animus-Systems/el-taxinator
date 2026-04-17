# Modelo 130 — Filing procedure

_Last verified: 2026-01-01 (seed)_
_Agency portals change — verify steps against the official help before filing._

## Overview

- Quarterly IRPF payment on account ("pago fraccionado") for autónomos under estimación directa (normal or simplificada) whose activity is not predominantly subject to retención ≥ 70%.
- Frequency: quarterly. Statutory deadline: **1 to 20 of the month following the quarter end**; Q4 runs 1 to 30 January.
- Amounts are **cumulative from 1 January** — each quarter's figure is (YTD ingresos – YTD gastos) × 20%, minus prior quarter payments and client retenciones.

## Portal

- Agency: **AEAT** (Agencia Estatal de Administración Tributaria).
- Sede electrónica: <https://sede.agenciatributaria.gob.es/>
- Direct path: "Todas las gestiones → Impuestos y tasas → IRPF → Modelo 130 — Pago fraccionado".

## Login options

- **Cl@ve PIN** (SMS-based, 24 h validity) — common for occasional filers.
- **Cl@ve permanente** (username + password + SMS) — persistent, good for frequent filers.
- **Certificado electrónico** (FNMT / DNI electrónico) — required if filing for a representative or managing multiple clients.
- All three work; pick whichever is set up.

## Step-by-step

1. Open the AEAT sede: <https://sede.agenciatributaria.gob.es/> and search "Modelo 130".
2. Click "Presentación ejercicio <YYYY>" under Modelo 130.
3. Authenticate with your chosen credential.
4. Pick the **ejercicio** and **periodo** (1T / 2T / 3T / 4T).
5. Casilla 01 — Ingresos acumulados del ejercicio: cumulative invoice totals (ex-VAT) from 1 Jan.
6. Casilla 02 — Gastos deducibles acumulados: cumulative deductible expenses from 1 Jan.
7. Casilla 03 — Rendimiento neto: auto-computed (01 − 02).
8. Casilla 04 — 20% del rendimiento neto (minus minoración por rendimientos bajos, if applicable).
9. Casilla 05 — Retenciones soportadas: IRPF withheld by clients that issued B2B invoices with retención.
10. Casilla 06 — A ingresar (or "0" if 05 ≥ 04).
11. Click **Validar**, fix warnings, then **Firmar y enviar**.

## Payment / result

- Positive (a ingresar): pay via **NRC** (banking app → "Pago de impuestos" → Modelo 130) or **domiciliación bancaria** (deadline 15th, not 20th).
- Zero: file anyway; no payment, just submit the zero form for record-keeping.
- Download the **justificante** (PDF with CSV) after the confirmation screen.

## Common issues

- 20% + retenciones already covers most autónomos with high-retention clients → result usually zero; still file.
- Casilla 02 must match the expenses registered in your libro de gastos — AEAT can cross-check against Modelo 347/303 in annual audit.
- Q1 errors propagate cumulatively: fix via a **declaración complementaria** on the correct quarter.

## References

- BOE normativa: Ley 35/2006 (IRPF), Orden HFP/1823/2016 (Modelo 130).
- AEAT help: <https://sede.agenciatributaria.gob.es/> → Ayuda → IRPF → Pagos fraccionados → Modelo 130.
