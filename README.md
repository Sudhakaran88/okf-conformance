# OKF Conformance Suite

[![conformance](https://github.com/Sudhakaran88/okf-conformance/actions/workflows/conformance.yml/badge.svg)](https://github.com/Sudhakaran88/okf-conformance/actions/workflows/conformance.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

The conformance suite for the **Open Knowledge Format (OKF)** — a written criteria
document and an executable validator that tell you, pass or fail, whether a bundle
really speaks OKF or just claims to.

> AI agents waste half their work re-deriving the same context. The Open Knowledge Format standardizes that knowledge as portable, linked markdown any agent can read. But a format is read-optional; it enforces nothing. What earns the word infrastructure is not that the format enforces anything, it is that it is the thing every enforcer checks against. And portability is only honest if it is tested. A spec without an executable conformance suite is a gentleman's agreement: implementations quietly fork dialects and you are back to lock-in, just distributed.
>
> This is the conformance suite for OKF. Two independent oracles, written criteria and an executable validator, where any disagreement is a spec defect, not an implementation bug. A growing set of fixtures built from real failures. And an honest scope: because OKF is minimally opinionated, conformance certifies the interoperability surface, not semantic agreement. **Conformance buys a shared wire, not a shared mind.**

---

## Quickstart (60 seconds)

No install, no dependencies, no account. You need Node 18+ and a bundle directory.

```bash
node validator/okf-validate.mjs ./your-bundle
```

You get a human summary, a machine-readable `okf-report.json` written next to your
bundle, and an exit code: **0** conformant, **1** nonconformant, **2** usage/IO error.

Try it on the worked example shipped here:

```bash
node validator/okf-validate.mjs ./examples/sample-bundle/knowledge
```

```
OKF conformance — knowledge
  12 concepts, 23 links
  0 error(s), 0 warning(s)

PASS — conformant
```

Pipe the JSON instead of writing a file:

```bash
node validator/okf-validate.mjs ./your-bundle --json | jq .
```

Hold the bundle to the recommendations too, not just the requirements:

```bash
node validator/okf-validate.mjs ./your-bundle --strict
```

## Conformance levels

The criteria live in **[CONFORMANCE.md](CONFORMANCE.md)** (Oracle 1). In short:

- **MUST (M1–M6)** — a violation is an **error** and makes the bundle nonconformant:
  it is a directory of `.md` concept files; each opens with a delimited YAML
  frontmatter block; each has a non-empty `type`; every internal `.md` link
  resolves; path is identity; files only, no runtime.
- **SHOULD (S1–S6)** — a violation is a **warning** (an error under `--strict`):
  a root `index.md`; folder indexes that link their concepts; single-purpose
  concepts; no orphans; ISO-8601 `timestamp`, list `tags`, URI `resource`;
  merged synonyms.
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
9/9 fixtures passed.
```

Conformant fixtures must exit 0. Nonconformant fixtures must fail and name the
exact rule they trip — MUST cases in default mode, SHOULD cases under `--strict`.
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

The Open Knowledge Format is Google Cloud's open spec (June 2026) for representing
knowledge as portable, cross-linked markdown that AI agents read — the formalization
of Andrej Karpathy's "LLM Wiki" pattern. One bundle is a directory; one concept is a
markdown file with a YAML frontmatter block; a markdown link to another concept is a
graph edge. `type` is the only required field.

- OKF announcement: <https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing>
- OKF spec & repo: <https://github.com/GoogleCloudPlatform/knowledge-catalog>

> **Disambiguation:** the **Open Knowledge Format** (Google's file format) is unrelated
> to the **Open Knowledge Foundation** (a non-profit). Both abbreviate to OKF.

## License

[MIT](LICENSE). Use it, fork it, vendor it into your CI. Neutrality is the point.

---

Built by [WitsCode](https://witscode.com), a product engineering studio building websites, stores, and web apps, with deep work in AI search and agent tooling. Background and FAQ: [witscode.com/okf-conformance](https://witscode.com/okf-conformance).
