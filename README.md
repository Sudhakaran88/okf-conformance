# OKF Conformance Suite

[![conformance](https://github.com/Sudhakaran88/okf-conformance/actions/workflows/conformance.yml/badge.svg)](https://github.com/Sudhakaran88/okf-conformance/actions/workflows/conformance.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

The conformance suite for the **Open Knowledge Format (OKF)** — a written criteria
document and an executable validator that tell you, pass or fail, whether a bundle
really speaks OKF or just claims to. Aligned to **OKF spec v0.2** and validated
against Google's four published reference bundles — `acme_retail`,
`crypto_bitcoin`, `ga4`, `stackoverflow` all pass. Reproduce that yourself:

```bash
node tools/check-reference-bundles.mjs
```

> AI agents waste half their work re-deriving the same context. The Open Knowledge Format standardizes that knowledge as portable, linked markdown any agent can read. But a format is read-optional; it enforces nothing. What earns the word infrastructure is not that the format enforces anything, it is that it is the thing every enforcer checks against. And portability is only honest if it is tested. A spec without an executable conformance suite is a gentleman's agreement: implementations quietly fork dialects and you are back to lock-in, just distributed.
>
> This is the conformance suite for OKF. Two independent oracles, written criteria and an executable validator, where any disagreement is a spec defect, not an implementation bug. A growing set of fixtures built from real failures. And an honest scope: because OKF is minimally opinionated, conformance certifies the interoperability surface, not semantic agreement. **Conformance buys a shared wire, not a shared mind.**

---

## Quickstart (60 seconds)

No install, no dependencies, no account. You need Node 18+ and a bundle directory.

```bash
node validator/okf-validate.mjs ./your-bundle
```

You get a human summary, a machine-readable `okf-report.json` written inside the
bundle directory (`<bundle>/okf-report.json`), and an exit code: **0** pass,
**1** fail, **2** usage/IO error.

Try it on the worked example shipped here:

```bash
node validator/okf-validate.mjs ./examples/sample-bundle/knowledge
```

```
OKF conformance — knowledge
  7 concept(s), 5 reserved file(s), 23 links
  0 error(s), 0 warning(s)

PASS — conformant
  wrote examples/sample-bundle/knowledge/okf-report.json
```

Pipe the JSON instead of writing a file:

```bash
node validator/okf-validate.mjs ./your-bundle --json | jq .
```

Hold the bundle to the recommendations too, not just the requirements:

```bash
node validator/okf-validate.mjs ./your-bundle --strict
```

`--strict` is a **quality bar layered on top of conformance, not a stricter
definition of it**. OKF v0.2 is deliberately permissive, so a bundle with a
broken link is conformant — the report says `conformant: true` in both modes.
Under `--strict` that bundle exits non-zero with `strictClean: false`, which is
what makes it useful as a CI gate without misrepresenting the spec.

## Conformance levels

The criteria live in **[CONFORMANCE.md](CONFORMANCE.md)** (Oracle 1), aligned to
the [OKF v0.2 spec](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) (§11). In short:

- **MUST (M1–M6)** — a violation is an **error** and makes the bundle
  nonconformant: it is a directory of `.md` files; every concept document
  (non-reserved `.md`) opens with a parseable YAML frontmatter block and
  carries a non-empty `type`; reserved files follow their structure —
  `index.md` carries no frontmatter (a bundle-root `index.md` may declare
  `okf_version` only) and `log.md` date headings are ISO 8601; path is
  identity; files only, no runtime.
- **SHOULD (S1–S6)** — a violation is a **warning**, which fails only the
  `--strict` bar: a root `index.md`; indexes that enumerate their directory's
  concepts; internal links that resolve; no isolated concepts; list `tags` and
  ISO 8601 legacy `timestamp`; well-formed `generated` / `verified` / `sources`
  / `status` / `stale_after` fields.
- **Tolerated** — never conformance failures, per spec §11: broken cross-links,
  unknown `type` values, unknown frontmatter keys, missing optional fields,
  missing `index.md` files. OKF is deliberately permissive; the validator
  surfaces these as quality warnings, not errors.
- **MAY** — any extra frontmatter fields, `log.md` history, any body structure.

Every validator finding names the rule id it tripped (e.g. `M3`, `S4`), so a
report ties straight back to the prose criterion.

## Run the suite

The suite is a set of golden (must-pass) and deliberately-broken (must-fail)
fixtures, plus a runner that asserts each one behaves as expected:

```bash
node fixtures/run-suite.mjs
```

```
14/14 fixtures passed.
```

Conformant fixtures must exit 0. Violation fixtures must name the exact rule
they trip — MUST cases fail in default mode, SHOULD cases stay conformant and
fail only `--strict`.
CI runs this on every push and pull request (see
[`.github/workflows/conformance.yml`](.github/workflows/conformance.yml)), so the
repo enforces its own rules. That is the credibility the whole project rests on.

## See your bundle

The kit's graph + visualizer is bundled too. It writes a portable `graph.json` and
a self-contained `visualize.html` (force-directed graph, color-coded by `type`,
search, click a concept for its frontmatter and links). No server, no install,
opens by double-click, no data leaves the page.

```bash
node validator/okf-graph.mjs ./examples/sample-bundle/knowledge
```

## Adopting OKF: the skill

Validating a bundle assumes you have one. [`skill/SKILL.md`](skill/SKILL.md) is the
other half: the skill you feed your coding agent (Claude Code, Cursor, Codex) to
set up, consume, and maintain an OKF knowledge bundle in your own project. It walks
the agent through producing a bundle from your real knowledge, pointing your agents
at it instead of re-deriving context, and wiring the trigger that keeps it from
rotting. Drop it in, then validate the result with the suite above.

## The two-oracle design

A single reference validator quietly **becomes** the spec: any bug in it is
"conformant" by definition, and every implementation inherits the same blind spot.
So this suite keeps two independent oracles — the written criteria
([CONFORMANCE.md](CONFORMANCE.md)) and the executable validator
(`validator/okf-validate.mjs`) — and treats any disagreement between them as a
**spec defect**, reconciled in the prose, not silently patched in code. And every
escaped nonconformance found in the wild becomes a new fixture, so the suite grows
from real failures. See [CONTRIBUTING.md](CONTRIBUTING.md).

Pull-quotes from the argument this came out of:

> A spec without an executable oracle is a gentleman's agreement. The suite is what makes it binding.

> Prose describes. A suite certifies.

## What this is not

Not a SaaS, not hosted, no accounts, no paywall, no "pro tier." The value of a
conformance checker is that it is free and neutral — a public sizer anyone can
drop a bundle into. Charging for it, or hardcoding it to one team's schema, would
make it the lock-in it exists to prevent. It is open source on purpose.

## About OKF

The Open Knowledge Format is Google Cloud's open spec (v0.1 June 2026, now
**v0.2**) for representing knowledge as portable, cross-linked markdown that AI
agents read — the formalization of Andrej Karpathy's "LLM Wiki" pattern. One
bundle is a directory; one concept is a markdown file with a YAML frontmatter
block; a markdown link to another concept is a graph edge. `type` is the only
always-required field. v0.2 added the trust and provenance families
(`generated`, `verified`, `sources`, `status`, `stale_after`) and Attested
Computations; this suite tracks it.

- OKF announcement: <https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing>
- OKF spec & repo: <https://github.com/GoogleCloudPlatform/knowledge-catalog>
- A plain-language guide: <https://witscode.com/open-knowledge-format>

## Ecosystem

Open-source tools built by the community around OKF (a fuller index is proposed
for the spec repo itself):

- [OWOX Model Canvas](https://github.com/OWOX/owox-model-canvas) — visual canvas / ERD editor that imports and exports OKF.
- [OnyxWriter](https://github.com/activetwist/OnyxWriter) — local-first desktop editor for OKF bundles.
- [okf-knowledge](https://github.com/sniperunder123/okf-knowledge) and [okf-skills](https://github.com/scaccogatto/okf-skills) — agent skills to create, maintain, and visualize bundles.
- [openknowledge](https://github.com/openknowledge-sh/openknowledge) — a Go CLI to create, inspect, and publish bundles.
- [OKFy](https://github.com/0dust/OKFy), [KnowHub](https://github.com/smgam29/knowhub), [kiso](https://github.com/oak-invest/kiso) — converters and publishers into and out of OKF.
- [okf-lint](https://github.com/thisismydesign/okf-lint) — another linter for OKF bundles. More checkers are good for the format; neutrality is the point.

> **Disambiguation:** the **Open Knowledge Format** (Google's file format) is unrelated
> to the **Open Knowledge Foundation** (a non-profit). Both abbreviate to OKF.

## License

[MIT](LICENSE). Use it, fork it, vendor it into your CI. Neutrality is the point.

---

Built by [WitsCode](https://witscode.com), a product engineering studio building websites, stores, and web apps, with deep work in AI search and agent tooling. Background and FAQ: [witscode.com/okf-conformance](https://witscode.com/okf-conformance).
