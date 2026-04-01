---
milestone: "ANI-154: Fix language switching issue"
current_phase: "implementation"
status: "in_progress"
progress:
  total_phases: 3
  completed_phases: 1
  percent: 33
---
# ANI-154: Language Switching Bug Fix

## Issue Summary
- Tax page in English version shows Spanish content
- Spanish version pages return 404

## Root Cause
The `[locale]` segment is nested inside route group `(app)`, which breaks next-intl's routing:
- Routes register without `[locale]` in the URL path
- Locale context is not properly propagated
- Spanish URLs (/es/*) don't match any routes

## Solution
Move `[locale]` from `app/(app)/[locale]/` to `app/[locale]/` at the root level.
