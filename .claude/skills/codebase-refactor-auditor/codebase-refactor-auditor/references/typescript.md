# TypeScript / JavaScript Refactor Reference

## Barrel Exports (index.ts)

Barrel files let you split a module into multiple files while maintaining a single public import surface.

```ts
// src/services/payments/index.ts  ← barrel / shim
export { charge, refund, capture } from './core'
export { handleWebhook } from './webhooks'
export type { PaymentIntent, ChargeResult } from './types'
```

Consumers continue importing from `'@/services/payments'` — no migration needed immediately.

**Warning:** Barrel files can cause circular dependency issues. Check with `madge`:
```bash
npx madge --circular --extensions ts src/
```

## Import Alias Setup (tsconfig paths)

If moving files changes relative import depths, use path aliases:
```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/lib/*": ["src/lib/*"],
      "@/services/*": ["src/services/*"]
    }
  }
}
```

## Dead Code Detection

```bash
# ts-prune: finds exported symbols that are never imported
npx ts-prune | grep -v "(used in module)"

# knip: comprehensive unused exports, files, deps
npx knip
```

## Duplication Detection

```bash
# jscpd: copy-paste detector
npx jscpd src/ --min-lines 10 --reporters console
```

## Circular Dependency Visualization

```bash
npx madge --image deps.svg --extensions ts src/
```

## File Size Audit

```bash
find src -name "*.ts" ! -name "*.test.ts" ! -name "*.d.ts" \
  | xargs wc -l | sort -rn | head -30
```

## Test Commands

```bash
# Jest
npx jest --coverage --passWithNoTests

# Vitest
npx vitest run --coverage

# Type check only
npx tsc --noEmit

# Check specific file compiled output
npx tsc --noEmit --strict src/services/payments/core.ts
```

## Refactor Commit Convention

```
refactor(payments): split monolith into core/webhooks/validators
refactor(auth): merge duplicate auth helpers into shared/auth
chore(dead-code): remove confirmed orphan legacy formatter
test(payments): add characterization tests before split
```

## Shim Deprecation Pattern

```ts
// payments.ts  ← original file, now a temporary shim
/**
 * @deprecated This file is a compatibility shim.
 * Import directly from '@/services/payments' instead.
 * TODO: Remove this shim after all consumers migrated (target: next sprint)
 */
export * from './payments/index'
```
