# Python Refactor Reference

## Package Structure Pattern

```
# Before: monolithic
services/payments.py   (800 lines)

# After: package
services/payments/
    __init__.py        (re-exports for backward compat)
    core.py            (charge, refund, capture)
    webhooks.py        (event handlers)
    validators.py      (amount, currency checks)
    types.py           (dataclasses, TypedDicts)
```

```python
# services/payments/__init__.py  ← shim for backward compat
from .core import charge, refund, capture
from .webhooks import handle_webhook
from .types import PaymentIntent, ChargeResult

__all__ = ["charge", "refund", "capture", "handle_webhook", "PaymentIntent", "ChargeResult"]
```

## Dead Code Detection

```bash
# vulture: finds unused code
pip install vulture
vulture src/ --min-confidence 80

# pylint dead code
pylint src/ --disable=all --enable=W0611,W0612,W0613
```

## File Size Audit

```bash
find . -name "*.py" ! -path "*/migrations/*" ! -path "*/__pycache__/*" \
  | xargs wc -l | sort -rn | head -30
```

## Duplication Detection

```bash
pip install pylint
pylint src/ --disable=all --enable=duplicate-code --min-similarity-lines=10
```

## Test Commands

```bash
# pytest with coverage
pytest --cov=src --cov-report=term-missing --tb=short

# Confirm baseline passes
pytest -x --tb=short 2>&1 | tail -20
```

## Import Audit

```bash
# Find potentially orphaned modules (no inbound imports)
for f in $(find src -name "*.py" ! -name "__init__.py" ! -name "test_*"); do
  module=$(echo $f | sed 's|/|.|g' | sed 's|.py$||' | sed 's|^src.||')
  if ! grep -r "import $module\|from $module" src/ --include="*.py" -l | grep -v "$f" > /dev/null 2>&1; then
    echo "Possibly orphaned: $f"
  fi
done
```

## Commit Convention

```
refactor(payments): split monolith into core/webhooks/validators packages
chore(dead-code): remove vulture-confirmed unused helpers
test(payments): add characterization tests before refactor
```
