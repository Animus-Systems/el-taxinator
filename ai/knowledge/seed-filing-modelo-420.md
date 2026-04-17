# Modelo 420 — Filing procedure

_Last verified: 2026-01-01 (seed)_
_Agency portals change — verify steps against the official help before filing._

## Overview

- Quarterly IGIC (Impuesto General Indirecto Canario) self-assessment for Canary Islands taxpayers registered under the régimen general.
- Frequency: quarterly. Statutory deadline: **1 to 20 of the month following the quarter end** (Q4 extends to 30 January for annual recap synchronisation).
- Who: autónomos and sociedades with economic activity localised in the Canary Islands whose sales are subject to IGIC. Exempt: régimen especial de pequeños comerciantes unless specified.

## Portal

- Agency: **Agencia Tributaria Canaria (ATC)** — Gobierno de Canarias.
- Sede electrónica: <https://sede.gobiernodecanarias.org/tributos/jsf/publico/index.jsf>
- Filing service: "Presentación de autoliquidaciones" → "Modelo 420 — Régimen general".

## Login options

- **Certificado digital** (FNMT, certificado de persona física/jurídica) — most reliable for SLs.
- **Cl@ve permanente / Cl@ve PIN** — works for autónomos.
- DNI electrónico is accepted but rarely used.
- Common gotcha: the ATC sede has its own certificate store — you may need to install the Autofirma application.

## Step-by-step

1. Go to the ATC sede electrónica URL above, pick the language, and log in with the chosen credential.
2. Navigate to **Mis gestiones → Presentar autoliquidaciones → Modelo 420**.
3. Select the **ejercicio** (year) and **periodo** (1T / 2T / 3T / 4T) matching the quarter.
4. Fill the IGIC devengado section — one row per applicable tipo (0%, 3%, 7%, 9.5%, 15%, 20%, 35%). For each: **base imponible** in euros, **cuota** auto-computes.
5. Fill the IGIC deducible section: base and cuota of deductible input IGIC (verify actual rates on supplier invoices — our app estimates at 7% inclusive).
6. If you have unapplied compensación from prior periods, enter it.
7. Review the resultado. Positive = a pagar; negative = a compensar.
8. Click **Validar** to run server-side checks; fix any errores.
9. Click **Firmar y enviar**.

## Payment / result

- Positive result: choose **Ingreso** (requires NRC from your bank) or **Domiciliación bancaria** (if filed before the 15th of the month).
  - NRC flow: log in to your bank's tax portal, pay Modelo 420, copy the NRC code back into the ATC form.
- Negative result: select **A compensar en períodos siguientes** (carries forward) or request **Devolución** on the Q4 form if you're entitled.
- After sending, download the **Justificante de presentación** (PDF with the CSV / código seguro de verificación) and save it with your records.

## Common issues

- "El certificado no es válido": Autofirma not installed or expired certificate.
- IGIC deducible greater than devengado: normal, results in compensación — not an error.
- Mismatched total from invoices: re-export our CSV and reconcile row by row.

## References

- BOE / BOC normativa: Ley 20/1991 (régimen económico-fiscal de Canarias), Decreto 268/2011.
- Help portal: <https://sede.gobiernodecanarias.org/tributos/> → Ayuda → Modelo 420.
