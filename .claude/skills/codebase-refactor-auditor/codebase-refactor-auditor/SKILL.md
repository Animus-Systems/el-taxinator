---
name: codebase-refactor-auditor
description: >
  Comprehensive codebase audit, modularization, and refactor skill. Use this skill whenever
  the user wants to clean up, restructure, or refactor a codebase — including breaking large
  files into smaller modules, eliminating dead code and legacy paths, extracting shared logic,
  enforcing file-size limits, adding safety-net tests, or reducing technical debt. Trigger on
  phrases like "audit the codebase", "clean up the code", "break this into modules",
  "refactor", "remove dead code", "modularize", "reduce file bloat", "extract shared logic",
  "codebase cleanup", or when the user pastes large files and asks to improve structure.
  Also trigger when the user wants a pre-feature-work cleanup so the codebase is lean before
  new development begins. This skill always plans before it acts and runs work in parallel
  where possible — never jumping straight to edits.
---

# Codebase Refactor Auditor

A structured skill for auditing, slimming, and modularizing codebases without breaking existing functionality.

## Core Philosophy

> Understand before you cut. Plan before you build. Test before you ship.

The refactor cycle is: **Audit → Classify → Plan → Safety-net → Execute → Verify**. Never skip steps. Never refactor without a test harness in place first. Never delete code you haven't traced.

---

## Phase 0 — Context Gathering

Before touching a single file, establish:

1. **Stack & tooling** — language(s), framework(s), package manager, test runner, build system
2. **Entry points** — what runs this app? (e.g., `src/index.ts`, `app/main.py`, `cmd/server/main.go`)
3. **Current pain points** — what does the user already know is messy?
4. **Constraints** — anything that must NOT be touched (vendor code, generated files, frozen APIs)
5. **Target file-size budget** — default: max 5k lines per file, target average 1–2k lines
6. **Test situation** — existing test coverage? CI? tolerated downtime during refactor?

If the user hasn't provided the codebase (or a directory listing), ask them to share:
- Output of `find . -type f | head -200` or a tree view
- Any particularly large or messy files they already know about

---

## Phase 1 — Audit

### 1a. File-size scan

Identify files that violate the size budget:

```bash
# Files over 300 lines (yellow flag)
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.py" -o -name "*.go" \) \
  | xargs wc -l | sort -rn | head -40

# Or for a specific extension
find . -name "*.ts" | xargs wc -l | sort -rn | head -30
```

### 1b. Dead code detection

Look for:
- Exported symbols that are never imported elsewhere
- Feature flags that are always-on or always-off
- Commented-out blocks > 10 lines
- `TODO(deprecated)` / `FIXME` / `@deprecated` markers
- Files that are never imported (orphans)

```bash
# Find files with no inbound imports (rough heuristic — adjust pattern to stack)
# TypeScript/JS example:
for f in $(find src -name "*.ts" ! -name "*.test.ts" ! -name "index.ts"); do
  base=$(basename "$f" .ts)
  if ! grep -r "from.*$base" src --include="*.ts" -l | grep -v "$f" > /dev/null 2>&1; then
    echo "Possibly orphaned: $f"
  fi
done
```

### 1c. Duplication scan

Look for repeated logic across files — identical or near-identical functions, copy-pasted validation, duplicated constants. Tools to consider (if available):
- `jscpd` (JS/TS copy-paste detector)
- `pylint --disable=all --enable=duplicate-code` (Python)
- Manual grep for suspicious patterns the user flags

### 1d. Dependency graph (optional but recommended)

For TS/JS projects: `madge --circular src/` or `depcruise` to map circular deps and find clusters.

---

## Phase 2 — Classify & Prioritize

After the audit, produce a **Refactor Inventory** — a structured list of findings:

```
REFACTOR INVENTORY
==================
[BLOAT]    src/services/payments.ts         847 lines  → split into 3 modules
[DEAD]     src/utils/legacyFormatter.ts     confirmed orphan → delete
[DUPE]     src/api/auth.ts + src/middleware/auth.ts → merge into shared/auth/
[SIMPLIFY] src/routes/orders.ts             5 codepaths → 2 after flag removal
[TEST]     src/jobs/reconciler.ts           0 test coverage → add before touching
```

Severity tiers:
- **P0 — Safety first**: Files with 0 test coverage that need to be touched → write tests FIRST
- **P1 — High impact**: Files >1k lines, heavily duplicated logic, confirmed dead code
- **P2 — Medium impact**: Moderate duplication, mild structural issues
- **P3 — Low impact**: Style, naming, minor reorganization

Present the inventory to the user and **get sign-off** before proceeding. Don't start cutting without approval.

---

## Phase 3 — Refactor Plan

For each item in the inventory, write a concrete plan entry:

```
[PLAN] src/services/payments.ts  (847 lines)
  → Split into:
      src/services/payments/core.ts          (charge, refund, capture)
      src/services/payments/webhooks.ts      (stripe/paypal event handlers)
      src/services/payments/validators.ts    (amount, currency, card checks)
      src/services/payments/index.ts         (re-exports, backward compat shim)
  → Shared logic extracted to: src/lib/money.ts
  → Tests: src/services/payments/__tests__/core.test.ts (new)
  → Risk: HIGH — touches checkout flow. Run integration tests after.
```

Rules for the plan:
- Every split file must have a corresponding `index.ts` / `__init__.py` re-export shim so existing imports don't break immediately
- Backward-compat shims are temporary scaffolding — mark them `// TODO: remove shim after consumers updated`
- Every file that gets deleted must have its call sites confirmed as either updated or also deleted
- State the test command that will confirm no regression

---

## Phase 4 — Safety Net (Tests First)

Before refactoring any module with < 80% coverage:

1. Write **smoke tests** that capture current behavior (inputs → outputs, API endpoints → responses)
2. Write **characterization tests** for complex logic (lock in current behavior even if imperfect — it's the baseline)
3. Confirm the test suite passes on the unmodified code

```bash
# Confirm baseline passes before any changes
npm test -- --coverage 2>&1 | tail -20
# or
pytest --tb=short 2>&1 | tail -20
```

Do not proceed until baseline is green.

---

## Phase 5 — Execute (Parallel Where Possible)

With the plan approved and tests green, begin execution.

### Parallelization strategy

Group independent modules into parallel work streams. Files that share no imports can be refactored simultaneously. Use subagents when available:

```
Stream A: payments domain  (payments.ts → split into 3)
Stream B: auth domain      (auth duplication → merge)
Stream C: dead code removal (confirmed orphans → delete)
Stream D: utils barrel     (utils/index.ts → proper barrels)
```

Never parallelize streams that touch the same file.

### Per-module execution checklist

For each module being refactored:

- [ ] Read the entire file before touching it
- [ ] Map all imports and exports
- [ ] Create new target files
- [ ] Move logic (don't copy — move, then verify)
- [ ] Update the original file to re-export from new locations (shim)
- [ ] Update direct consumers if shim isn't sufficient
- [ ] Run tests after each module — not at the end
- [ ] Confirm file sizes are within budget

### Shared logic extraction pattern

When extracting shared logic:
1. Identify the most "neutral" home (usually `src/lib/` or `src/shared/`)
2. Write the shared function/class first, with its own unit tests
3. Replace both (all) usages — don't leave one using the old version
4. Delete the originals only after all references updated

---

## Phase 6 — Verify & Report

After all streams complete:

```bash
# Full test suite
npm test
# Type check (TS)
npx tsc --noEmit
# Lint
npm run lint
# Build
npm run build
```

All must pass. If anything breaks:
- Isolate the failing stream
- Revert that stream only using git
- Do not revert unrelated completed streams

### Final report format

```
REFACTOR COMPLETE — SUMMARY
============================
Files deleted:      12  (confirmed dead)
Files split:         8  (into 24 new modules)
Files merged:        4  (into 2 shared modules)
Shared lib created:  src/lib/money.ts, src/lib/validators.ts
LOC before:       18,420
LOC after:        11,340  (-38%)
Max file size:     1,847 lines (payments/core.ts)
Avg file size:       623 lines
Test coverage:       72% → 81%
Shims remaining:      6  (marked TODO, safe to remove after next sprint)
```

---

## Execution Rules (Non-Negotiable)

1. **No blind deletes.** Every deletion must have a confirmed "nothing imports this" check.
2. **Shims before cuts.** Create re-export shims before removing original exports. Consumers can migrate gradually.
3. **Test after each module** — not at the end. Catch regressions immediately.
4. **Commit frequently.** Each completed stream = one git commit. Makes rollback surgical.
5. **Flag, don't auto-fix, ambiguous code.** If logic is unclear, flag it in the report rather than guessing intent.
6. **Stay in scope.** Don't refactor things the plan didn't cover just because you noticed them. Log them as future work.
7. **Max file budget is a hard ceiling.** If a split still produces a file > 5k lines, split further.

---

## Language-Specific Notes

Read the relevant reference file for stack-specific tooling and patterns:

- `references/typescript.md` — TS/JS barrel exports, circular dep tools, import aliasing
- `references/python.md` — `__init__.py` patterns, `pylint`, `vulture` for dead code
- `references/go.md` — package organization, interface extraction, `deadcode` tool

---

## When to Stop and Ask

Stop and check in with the user when:
- A file's purpose is genuinely ambiguous and deleting it is risky
- Two files appear to do the same thing but behave differently — don't merge without clarification
- Test coverage for a high-risk module is < 30% — write tests collaboratively
- The plan would require changes to > 50 files in one stream — reconsider scope

---

## Common Anti-Patterns to Avoid

| Anti-Pattern | Instead |
|---|---|
| Refactoring without tests | Write characterization tests first |
| Deleting "looks unused" code | Trace all imports before deleting |
| Mega-PRs touching everything at once | Parallel streams, incremental commits |
| Moving files without updating imports | Always update or shim |
| Extracting shared logic into circular deps | Check dep graph before placing |
| Renaming things mid-refactor | Rename is a separate, dedicated pass |
| Merging two files that do similar-but-not-identical things | Clarify intent first |
