# Spanish crypto tax reference (2026)

> Last verified: 2026-04-01. Covers disposals, staking, airdrops, mining,
> informative filings (Modelo 721, 720), and wealth tax treatment.
> Applies to individual residents; autónomo/SL-specific notes flagged
> inline.

## 1. The tax character of crypto

Spanish AEAT treats cryptocurrency as a **non-financial movable asset**,
not currency. What you did with it determines the rendimiento category:

| Activity | Category | Feeds |
|----------|----------|-------|
| Sale for fiat | ganancia patrimonial (transfer) | base del ahorro |
| Swap to another crypto | ganancia patrimonial (transfer) | base del ahorro |
| Spend on goods/services | ganancia patrimonial (transfer) | base del ahorro |
| Staking rewards | rendimiento del capital mobiliario | base del ahorro |
| Lending / yield / DeFi interest | rendimiento del capital mobiliario | base del ahorro |
| Airdrop | rendimiento del capital mobiliario (fair value on receipt) | base del ahorro |
| Mining (individual) | rendimiento de actividad económica | base general |
| Salary paid in crypto | rendimiento del trabajo (EUR value on receipt) | base general |
| Gift received (cryptolegado) | ISD (Impuesto de Sucesiones y Donaciones) | separate filing |

## 2. Realisation — when does a taxable event happen?

- **Purchase** with fiat → **not taxable**. Record the EUR cost basis.
- **Swap** (BTC → ETH) → **TAXABLE**. Realised gain = EUR value of the
  side sold − EUR cost basis of that side. The new asset's cost basis
  becomes its EUR value at swap time.
- **Spending crypto** to buy a coffee, a car, anything → **TAXABLE**.
  Same math as a swap: gain on the crypto spent, cost basis of the good
  purchased = its EUR price tag.
- **Transfer between your own wallets** → **not taxable**, but you lose
  cost-basis information if you don't track the move.
- **Sale for fiat** → **TAXABLE**. Gain = sale proceeds − FIFO cost basis.

## 3. FIFO cost basis — mandatory

Per AEAT criteria (Consulta Vinculante V1948-21), Spain requires **FIFO**
cost-basis matching **per asset, per filer**.

- You cannot choose LIFO, HIFO, or specific-lot identification.
- FIFO runs across wallets and exchanges for the same asset — for IRPF
  purposes you have ONE pool of BTC, not per-exchange pools.
- Fees paid in the asset being disposed of reduce both the remaining
  quantity AND are added to cost basis where allowed (acquisition fees
  capitalised; disposal fees reduce proceeds).
- Gifts and inherited crypto inherit their cost basis from the donor
  (for ISD-taxed transfers, cost basis is the ISD-declared value).

## 4. Staking, lending, DeFi (rendimiento del capital mobiliario)

- Reward taxed at **fair EUR value at moment of receipt**.
- Feeds **base del ahorro** bracket 19–28%.
- Cost basis of the received asset = the fair EUR value reported.
- Later disposal of the staked asset is a **separate** realisation event.
- DeFi protocols: rewards taxed when **claimed / accrued to your control**,
  not when "earning" accrues inside the protocol — but conservative stance
  is to use the claim moment.
- **Autónomo special case**: if staking is the activity itself (a
  validator running node operations as a business), report as activity,
  not capital mobiliario.

## 5. Mining (rendimiento de actividad económica)

- Requires registration as autónomo (epígrafe 831.9 "otras actividades
  relacionadas con operaciones financieras", often 832.9 in practice).
- Mining income = fair EUR value of the coin mined at time of reward.
- Expenses deductible: electricity, hardware amortisation (8 years),
  internet, hosting, gateway hardware.
- Fair EUR value becomes the cost basis of the coin; subsequent sale
  generates a separate ganancia patrimonial.

## 6. Loss offsetting rules

- **Disposal losses** (ahorro category) offset other ahorro gains.
- Excess losses offset up to **25%** of rendimientos del capital mobiliario
  (interest, dividends, staking).
- Unused losses carry forward **4 years**.
- **Wash-sale rule (2-month norma antiaplicación)**: if you re-buy the
  same asset within **2 months** of realising a loss, the loss is
  disallowed until the replacement position is sold.
  - Applies to disposal of assets with an active market quote.
  - Crypto: applies (AEAT has taken the position since V0999-18).

## 7. Modelo 721 — informative filing for foreign crypto

**Purpose**: report crypto held on **foreign** platforms (exchanges,
wallets managed by foreign custodians).

- **Filing threshold**: total value of foreign crypto holdings at year-end
  **> €50,000**, OR total inflows/outflows during the year that suggest
  > €50K even if year-end balance is below.
- **Due date**: **March 31** of the following year.
- **Scope**: does NOT apply to non-custodial wallets where you hold the
  private keys — those are Modelo 720 territory if > €50K in any single
  asset class.
- **Penalties**: fixed-amount fines; failure to file is a sanctionable
  offence independent of any underlying tax due.

### 7.1 What counts as "foreign"

- Non-Spanish exchanges: Coinbase (USA), Binance (offshore), Kraken (USA),
  etc. — yes.
- Bit2Me, Bitbase, Bitnovo — Spanish-based exchanges → NOT in Modelo 721.
- Self-custody (hardware wallet, MetaMask with your own keys) → NOT in
  Modelo 721; relevant for Modelo 720 / 714 instead.

## 8. Modelo 714 (wealth tax) — crypto inclusion

- Include **year-end market value** of all crypto holdings (Spanish + foreign,
  custodial + self-custody).
- Reduces Modelo 714 mortgage-like shields by the same amount as any
  leveraged position (margin loans collateralized by crypto).
- **Canarias 50% bonificación** applies to the final cuota, softening the
  impact.

## 9. Modelo 720 vs Modelo 721

| Asset type | Form | Threshold |
|------------|------|-----------|
| Foreign bank accounts | Modelo 720 | > €50K in any of the four asset blocks |
| Foreign securities (stocks/ETFs) | Modelo 720 | same |
| Foreign real estate | Modelo 720 | same |
| **Foreign-custody crypto** | **Modelo 721** | > €50K year-end value |
| **Self-custody crypto** (non-custodial) | Modelo 720 block 4 (arguable) | > €50K |

When in doubt, consult — self-custody crypto is a grey area that AEAT has
not fully clarified.

## 10. No IGIC on crypto transactions

Cryptocurrency transfers and swaps are **exempt** from IGIC (and VAT).
Basis: Hedqvist ruling (C-264/14), applied by AEAT. Applies to:

- Exchange of crypto for fiat
- Exchange of crypto for crypto
- Holding and custody services (when paid as a flat-fee subscription)

**IGIC may still apply** to:

- Hardware wallets purchased
- Subscription services billed in EUR even if the service is crypto-related
- Professional services you buy from a Spanish gestor to handle crypto
  reporting

## 11. B2B reverse-charge quirks

When an autónomo in the Canary Islands buys crypto-related services (trading
fees, custody, KYC services) from a foreign company:

- Services are treated as B2B reverse charge for IGIC/VAT purposes.
- The autónomo accounts for IGIC in Modelo 420 as both output (repercutido)
  and input (soportado) simultaneously — net-zero effect but must be
  declared.

## 12. What Taxinator tracks for crypto

- **`crypto_lots`** — per-acquisition lot with `asset`, `acquired_at`,
  `quantity_total`, `quantity_remaining`, `cost_per_unit_cents`,
  `fees_cents`, `asset_class='crypto'` (vs. `'stock'` for equities).
- **`crypto_disposal_matches`** — FIFO consumption records on disposal;
  one row per lot consumed by a given disposal, with
  `realized_gain_cents` calculated.
- **Transactions with `extra.crypto`** meta — linking the transaction to
  the asset, quantity, and cost-basis source.
- **Categories**:
  - `crypto_purchase` — buy side, adds lot.
  - `crypto_disposal` — sell/swap/spend side, consumes lots.
  - `crypto_fee` — exchange/network fees.
  - `crypto_staking` — rendimiento del capital mobiliario.
  - `crypto_airdrop` — rendimiento del capital mobiliario.
- **Modelo 100** aggregates disposal gains into base del ahorro and
  staking/airdrop into rendimiento del capital mobiliario on the same
  filing. Modelo 721 threshold check runs over year-end holdings across
  foreign-custody accounts.

## 13. Common mistakes

- **"I didn't cash out to euros so it's not taxable"** — wrong. Every
  swap is a realisation event.
- **Exchange-provided cost-basis reports not using FIFO** — many
  exchanges default to average cost basis. AEAT won't accept; recompute
  in FIFO terms.
- **Ignoring gas fees** — failed transaction gas is a loss realisation
  moment; successful transaction gas is either capitalised (acquisition)
  or deducted from proceeds (disposal).
- **Forgetting Modelo 721** when holdings cross €50K mid-year — the
  threshold is year-end balance, but large mid-year flows also trigger.
- **Self-custody across multiple chains** — LN channels, bridged assets,
  wrapped tokens — treat as separate assets with their own FIFO queue.
- **NFTs** — each NFT is its own "asset" (non-fungible) — straight
  ganancia patrimonial on sale; no FIFO needed since each NFT is unique.
