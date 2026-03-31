# Go Refactor Reference

## Package Organization Pattern

```
# Before: monolithic
internal/payments/payments.go   (900 lines)

# After: split within same package (same import path preserved)
internal/payments/
    charge.go
    refund.go
    webhooks.go
    validators.go
    types.go
```

In Go, multiple files in the same directory share the same package — no re-export shim needed. Split freely within a package without changing import paths.

To create a sub-package (changes import path — more disruptive):
```
internal/payments/           ← keep existing public API here
internal/payments/internal/  ← private helpers moved here
```

## Dead Code Detection

```bash
# golang.org/x/tools/cmd/deadcode
go install golang.org/x/tools/cmd/deadcode@latest
deadcode -test ./...
```

## File Size Audit

```bash
find . -name "*.go" ! -name "*_test.go" ! -path "*/vendor/*" \
  | xargs wc -l | sort -rn | head -30
```

## Unused Imports / Variables

```bash
go vet ./...
staticcheck ./...
```

## Test Commands

```bash
# Full test suite with coverage
go test ./... -cover -count=1

# Verbose with race detection
go test -race ./... -v 2>&1 | tail -40

# Specific package
go test ./internal/payments/... -v
```

## Interface Extraction (Dependency Inversion)

When splitting, extract interfaces for testability:
```go
// Before: concrete dependency
type PaymentService struct {
    db *sql.DB
}

// After: interface for testing
type DB interface {
    ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error)
    QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row
}
```

## Commit Convention

```
refactor(payments): split monolith across charge/refund/webhook files
chore(dead-code): remove deadcode-confirmed unused handler
test(payments): add table-driven tests before refactor
```
