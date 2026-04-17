# Modelo 721 — Filing procedure

_Last verified: 2026-01-01 (seed)_
_Agency portals change — verify steps against the official help before filing._

## Overview

- Informative declaration of **virtual currencies held abroad** (exchanges / wallets outside Spain). Mandatory when aggregate year-end value of such holdings exceeds €50,000 (as of 2026 — subject to legislative updates).
- Frequency: annual. Statutory deadline: **1 to 31 March** of the year following the reporting exercise (e.g. Modelo 721 for 2026 filed 1–31 Mar 2027).
- Purely informativa — no tax due on this form; actual crypto gains are taxed via Modelo 100 (base del ahorro).
- Failure to file when obligated carries high sanctions (historically €5,000 per datum for unfiled mandatory 720/721).

## Portal

- Agency: **AEAT**.
- Sede electrónica: <https://sede.agenciatributaria.gob.es/>
- Filing path: "Todas las gestiones → Declaraciones informativas → Modelo 721 — Declaración informativa sobre monedas virtuales situadas en el extranjero".

## Login options

- **Certificado electrónico** (strongly recommended given the volume of data and the sanction risk — you want a signed justificante).
- **Cl@ve PIN / permanente** also works.
- **DNIe** supported.

## Step-by-step

1. Open the AEAT sede, search "Modelo 721".
2. Authenticate and select the **ejercicio**.
3. For each foreign custodian (exchange / wallet provider / cold wallet abroad), add a registro:
   - Identification data: name of entity or wallet operator, NIF/tax ID if available, country code.
   - Position: type of currency (BTC, ETH, USDT, etc.), **cantidad** held at 31 December, **valoración en euros** at year-end (use each currency's 31 Dec closing price from a reputable source).
   - Aggregation: if you operate self-custody wallets, group by blockchain/wallet provider as appropriate.
4. Review the aggregate totals; confirm threshold is exceeded (otherwise filing is voluntary / not required).
5. Validate and **Firmar y enviar**.

## Payment / result

- No payment (informativa).
- Download the **justificante** and retain — AEAT can audit up to 10 years back for informative declarations about foreign assets.

## Common issues

- Spanish-custodied crypto (on Bit2Me, Bitnovo, Kraken ES entity, etc.) does NOT go on 721 — those are taxed and reported via ordinary IRPF mechanisms.
- Valuation method: AEAT accepts reasonable market price as of 31 December — document your source (CoinGecko / Binance / custodian statement).
- Airdrops and staking yield received during the year increase the year-end balance but themselves are taxable in IRPF (base ahorro via rendimiento capital mobiliario) — report both.
- Hardware wallet with mixed Spanish and foreign exposure: only the portion under foreign custody counts; self-custody held in Spain is outside the 721 scope.

## References

- BOE normativa: Real Decreto 249/2023, Orden HFP/886/2023 creating Modelo 721.
- AEAT help: <https://sede.agenciatributaria.gob.es/> → Declaraciones informativas → Modelo 721.
