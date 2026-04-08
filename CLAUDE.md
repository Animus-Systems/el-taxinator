# Taxinator — Agent Rules

These rules are mandatory for all work in this repository.

## Architecture Overview

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Database**: PostgreSQL via raw `pg` pool (`lib/pg.ts`), no ORM. Cluster runs in-process via `embedded-postgres` (a real Postgres 17 binary spawned by Node), bootstrapped from `instrumentation.ts` → `lib/embedded-pg.ts`. Each entity gets its own database inside the shared cluster. Data lives under `TAXINATOR_DATA_DIR` (default `./data`).
- **API layer**: tRPC with OpenAPI plugin (`trpc-to-openapi`), fully typesafe
- **i18n**: next-intl with `[locale]` route segment, `localePrefix: "as-needed"`
- **UI**: Radix UI + Tailwind CSS + shadcn/ui components
- **Testing**: Vitest, tests in `tests/` directory

## Quick Start

```bash
yarn dev                  # Start dev server on :7331 (also boots embedded Postgres)
yarn test                 # Run tests
yarn build                # Production build
```

No Docker, no external Postgres install. The first launch runs `initdb` and stores the cluster in `./data/pgdata/`. The TCP port and superuser password are persisted in `./data/runtime.json`.

## Core Engineering Rules

### 1. Types are the contract
- No `any` in application code. Use `unknown` with narrowing for dynamic data.
- No silent casts (`as unknown as X`) to bypass type safety. Fix at source.
- DB row types live in `lib/db-types.ts` with Zod schemas. They are the single source of truth.
- tRPC router outputs must use proper Zod schemas, never `z.any()`.
- `tsc --noEmit` and `yarn build` are release gates.

### 2. Database discipline
- Raw SQL via `lib/sql.ts` helpers: `sql` tagged template, `queryMany`, `queryOne`, `execute`, `withTransaction`.
- All SQL queries must be parameterized (use `sql` template or `$N` placeholders). Never interpolate user input.
- Column ordering in `buildOrderBy` must validate against an allowlist.
- Schema is a single `schema.sql` file at the repo root, applied lazily by `lib/schema.ts:ensureSchema()` on first connection. There is no migration tool — modify `schema.sql` directly and the change is picked up on next fresh database.
- Always scope queries by `user_id` — never trust client-supplied user IDs.
- Add `LIMIT` to list queries. No unbounded SELECTs.

### 3. tRPC API layer
- All data access from pages and actions goes through tRPC server caller (`lib/trpc/server-client.ts`).
- Server components: `const trpc = await serverClient()` then `trpc.domain.procedure()`.
- Server actions may call model functions directly only for file I/O operations.
- Every tRPC procedure must have a typed `.output()` Zod schema.
- OpenAPI endpoints at `/api/v1/...` — spec at `/api/v1/openapi.json`.
- Input validation happens at the tRPC boundary via Zod schemas.

### 4. Boundary discipline
- **Server**: validation, auth, business logic, DB access (models + tRPC).
- **Client**: presentation, state, UX only.
- Server actions (`"use server"`) handle form submissions and mutations.
- Client components never import from `models/` or `lib/pg.ts`.

### 5. i18n rules
- All pages/layouts under `app/[locale]/` must call `setRequestLocale(locale)` before any translation calls.
- Use `getTranslations()` in server components, `useTranslations()` in client components.
- Auth pages (`(auth)/`) are outside `[locale]` and always use default locale.
- Translation files: `messages/en.json` and `messages/es.json` — keep key structures identical.
- TypeScript property names use camelCase (`llmPrompt`). SQL columns use snake_case (`llm_prompt`). `mapRow()` converts automatically.

### 6. Auth and security
- `getCurrentUser()` returns the authenticated user or redirects. Use it in layouts/pages that render user data.
- tRPC context handles auth via `authedProcedure` — don't pass `userId` as a client parameter.
- Never expose API keys, internal paths, or stack traces in error responses.
- Validate file MIME types on upload. Use `Content-Disposition` with sanitized filenames.
- Rate limit auth endpoints.

### 7. Error handling
- Validate all inputs at API/tRPC boundary with Zod schemas.
- Use `sanitizeError()` for user-facing error messages.
- Never expose raw DB errors, file paths, or internal details.
- Server actions return `{ success, error?, data? }` shape consistently.

### 8. Testing
- Tests in `tests/` directory using Vitest.
- Test pure functions, form schemas, config validation, translation integrity.
- Mock DB with `vi.mock("@/lib/pg")` — don't hit real databases in tests.
- Bug fixes must include a regression test.
- Run `yarn test` before push.

### 9. Performance
- Use `Promise.all()` for independent data fetches in server components.
- Don't create both `getCurrentUser()` and `serverClient()` in the same scope — pick one.
- Stats and tax queries use SQL aggregation (`SUM`/`GROUP BY`), not loading all rows.
- The `proxy.ts` middleware caches resolved locale via cookie to avoid re-running intl middleware.

### 10. File organization
- Prefer small focused modules. Split files past ~800 lines.
- Models: `models/` — one file per domain, exports query functions.
- tRPC routers: `lib/trpc/routers/` — one file per domain.
- Server actions: `actions/` — canonical location. Don't create duplicate action files in `app/`.
- Form schemas: `forms/` — Zod schemas for form validation.
- Types: `lib/db-types.ts` — all DB types and Zod schemas.

### 11. Naming conventions
- TypeScript properties: camelCase (`llmPrompt`, `userId`, `createdAt`).
- DB columns: snake_case (`llm_prompt`, `user_id`, `created_at`).
- `mapRow()` handles the conversion — don't write custom row mappers.
- Table names live in `schema.sql`.

### 12. Self-hosted vs Cloud mode
- `SELF_HOSTED_MODE=true`: single user, auto-login, no signup, LLM keys in settings.
- Cloud mode: email OTP auth, Stripe billing, multi-user.
- `config.selfHosted.isEnabled` determines mode. Auth flow differs per mode.
- Self-hosted setup: `/` initializes defaults inline, redirects to `/dashboard`.

## Definition of Done

A task is done when:
- Types pass end-to-end (`tsc --noEmit`).
- Tests pass (`yarn test`).
- No `any` types introduced.
- tRPC outputs have proper Zod schemas.
- SQL queries are parameterized and scoped by `user_id`.
- Translation keys are present in both `en.json` and `es.json`.
- Error cases handled with sanitized messages.
