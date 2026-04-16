# Spanish personal IRPF (individual filer, 2026 rules)

## Filing basics
- Annual Modelo 100 declaration ("Renta").
- Tax year is the calendar year; filing opens April and closes end of June.
- Residents (183+ days in Spain) declare worldwide income.

## Income categories (rendimientos)
- **Rendimientos del trabajo** (employment): salary, pensions, severance, certain in-kind benefits.
  - Deductible: employee SS contribution; standard "gastos deducibles" of €2,000; €7,500 for disabled workers.
  - Reduction for low income: 5,565€ starting, scaled down.
- **Rendimientos del capital mobiliario**: interest, dividends, distributions. Go to "base del ahorro".
- **Rendimientos del capital inmobiliario**: rental income (long-term residential gets a 60% reduction; short-term/touristic does not).
- **Rendimientos de actividades económicas**: autónomo business activity (combined into Modelo 100 alongside personal when the filer is self-employed).
- **Ganancias y pérdidas patrimoniales**: capital gains from stock/fund/crypto sales, property sales. Go to "base del ahorro".

## Base liquidable
- **Base general**: work + rental + autónomo activity − reducible deductions.
- **Base del ahorro**: dividends + interest + realised capital gains.

## 2026 IRPF brackets (estatal + autonómica combined, reference)
Base general (approximate total, varies by autonomous community):
- 0 – 12,450 €: 19%
- 12,450 – 20,200 €: 24%
- 20,200 – 35,200 €: 30%
- 35,200 – 60,000 €: 37%
- 60,000 – 300,000 €: 45%
- 300,000+ €: 47%

Base del ahorro (savings bracket — applies to dividends, interest, capital gains):
- 0 – 6,000 €: 19%
- 6,000 – 50,000 €: 21%
- 50,000 – 200,000 €: 23%
- 200,000 – 300,000 €: 27%
- 300,000+ €: 28%

## Common deductions
- **Pension plan contributions**: up to €1,500 / year (plus employer matching up to €8,500).
- **Donations to registered ONG**: 80% on first €250, 40%/45% beyond.
- **Family**: per dependent child, per dependent elder, disability multipliers. Canary Islands adds bumps.
- **Mortgage on primary residence**: only pre-2013 acquisition is still deductible (15% up to €9,040).
- **Regional deductions (Canary Islands specific)**: rent on primary residence (<€20k income), healthcare expenses, education, child under 3 with dependent care.

## Retenciones (withholdings)
- Employer withholds IRPF from payroll; total withheld feeds the Modelo 100 "cuota diferencial" as a credit.
- Freelance invoices often include 7%/15% IRPF retention (autónomo).
- Dividends/interest: bank withholds 19% at source.

## Filing triggers (non-exhaustive)
- Employment income > €22,000 (single employer) or > €15,876 (multiple employers).
- Rental income > €1,000.
- Capital gains > €1,600.
- Any autónomo activity.

## What Taxinator tracks to build Modelo 100
- Income sources (employers, landlords-of-record, brokers, banks).
- Personal-income transactions tagged to a source with `status='personal_income'`.
- Crypto + stock disposals with realised gains from the lot ledger.
- Personal deductions with supporting files.
- Business activity rendimiento from invoices + expenses.
