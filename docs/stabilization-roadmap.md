# Stabilization And Product Direction

## What Changed

This repo was stabilized around the strongest workflows it already had:

- freelancer back-office flows: invoices, quotes, clients, products, time tracking, and tax reporting
- supporting operations: receipt inbox, transaction management, accountant collaboration, export/import, and backups
- validation at the server boundary for invoices, quotes, time entries, and accountant comments
- a repaired file-deletion path that now resolves against the user upload root instead of unlinking a relative database path

The app copy and sidebar were also narrowed so the product reads as a self-hosted freelancer operations tool instead of an AI-only experiment.

## Current Technical Baseline

The repo now has:

- passing `npx tsc --noEmit`
- passing `npm run lint`
- a minimal `vitest` setup with regression coverage for path safety and schema normalization

This is enough to keep extending the current codebase without working in a permanently broken tree.

## Product Focus

Primary surface:

- invoices
- quotes
- clients
- products
- time tracking
- tax dashboard and quarterly reporting
- accountant sharing

Secondary/supporting surface:

- receipt inbox and AI extraction
- transaction review and categorization
- imports, exports, backups

Experimental mini-apps should stay out of the primary navigation unless they are promoted into a maintained product workflow.

## Option 3: Architectural Next Step

The repo is still mostly page-driven and server-action-driven. The next serious step is to move to a typed backend contract instead of continuing to grow page-local business logic.

Recommended sequence:

1. Introduce a backend API layer in TypeScript using `tRPC`.
2. Add the `tRPC OpenAPI` plugin for external contract generation.
3. Publish shared request/response types for UI consumers instead of duplicating form and model shapes.
4. Move validation, authorization, and business logic fully behind that API boundary.
5. Expand test coverage around auth, permissions, tax/reporting calculations, and accountant-sharing flows.

That keeps this repo usable today while creating a path toward the stricter API-first model required for a long-lived product.
