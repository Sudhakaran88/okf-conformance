---
type: Attested Computation
title: Revenue for fiscal year
description: Recognized revenue for a fiscal year, per the revenue recognition policy.
status: stable
runtime: bigquery
parameters:
  - { name: year, type: integer, required: true }
executor:
  resource: https://example.com/skills/run-on-bq
  receipt: [job_id, executed_sql, result]
attester:
  resource: https://example.com/attesters/revenue.py
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-08-01T10:00:00Z }
verified: { by: human:sudhakar, at: 2026-08-02T09:00:00Z }
stale_after: 2026-12-31
---

# Computation

```sql
SELECT SUM(net_amount) AS revenue
FROM orders
WHERE order_status = 'delivered' AND EXTRACT(YEAR FROM order_ts) = @year
```

Defined for the [Revenue](../metrics/revenue.md) metric — a relative link, the
other valid v0.2 form.
