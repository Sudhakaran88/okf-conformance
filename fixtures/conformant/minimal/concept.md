---
type: Note
---

# Minimal concept

The smallest valid OKF bundle: one folder, one concept file carrying the only
required field, `type`. It has no links, so the validator emits an S4 (orphan)
and S1 (no root index.md) warning — both SHOULD-level. It is conformant: zero
MUST violations, so it passes in default mode (and would only fail under
`--strict`, which is the point of `--strict`).
