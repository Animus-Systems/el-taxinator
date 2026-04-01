# Phase 1: Context Analysis

## Issue
Language switching doesn't work correctly:
1. English version shows Spanish content on tax page
2. Spanish version (/es/*) returns 404 for all pages

## Root Cause Analysis
The `[locale]` dynamic segment is inside the route group `(app)`. In Next.js:
- Route groups (parentheses) don't create URL segments
- But they affect how next-intl's plugin processes routes
- The next-intl plugin expects `[locale]` at root app/ level

Current structure:
```
app/
  layout.tsx          <- Expects params.locale
  (app)/
    [locale]/         <- Locale INSIDE route group (PROBLEM)
      tax/page.tsx
      dashboard/page.tsx
      ...
```

This causes:
1. Routes register as `/tax`, `/dashboard` (no locale segment)
2. Root layout doesn't receive `params.locale`
3. Spanish URLs `/es/*` don't match any route → 404

## Solution
Move `[locale]` to root level:
```
app/
  layout.tsx
  [locale]/           <- Locale at root level (FIX)
    layout.tsx        <- Wraps locale routes
    (app)/
      tax/page.tsx
      dashboard/page.tsx
      ...
  (auth)/             <- Auth outside locale
  (accountant)/       <- Accountant outside locale
```

## Files to Modify
1. Create `app/[locale]/layout.tsx`
2. Move `app/(app)/layout.tsx` content to `app/[locale]/layout.tsx`
3. Move pages from `app/(app)/[locale]/` to `app/[locale]/(app)/`
4. Update `app/layout.tsx` - remove locale params, add NextIntlClientProvider
5. Update imports in moved files
