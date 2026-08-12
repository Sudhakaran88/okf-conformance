---
type: Metric
title: Revenue
description: Recognized revenue for a period. Exercises the v0.2 trust, lifecycle, and provenance families.
tags: [finance, revenue]
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-08-01T10:00:00Z }
verified:
  - { by: human:sudhakar, at: 2026-08-02T09:00:00Z }
  - { by: process:nightly-check, at: 2026-08-03T02:00:00Z }
status: stable
stale_after: 2026-12-31
sources:
  - id: revenue-policy
    resource: https://example.com/finance/revenue-recognition
    title: Revenue recognition policy
---

# Definition

Revenue for a period is the sum of recognized order amounts in that period.
The sanctioned computation is [Revenue YTD](/computations/revenue-ytd.md) — an
absolute bundle-relative link, the v0.2-recommended form (§6.1).
