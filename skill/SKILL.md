---
name: open-knowledge-format
description: Set up, consume, and maintain an Open Knowledge Format (OKF) bundle in any repo so AI agents and humans share internal knowledge as portable, cross-linked markdown plus an auto-generated graph. Use this whenever a team's working knowledge (schemas, metric definitions, naming conventions, runbooks, join paths, glossaries, product/catalog facts, pipeline or agent knowledge) is scattered across wikis, code comments, and people's heads and every tool or agent keeps re-deriving the same context. Trigger it when someone says OKF, "agent-readable knowledge base," "knowledge bundle," "make my repo agent-readable," "single source of truth for agents," "LLM wiki," "AGENTS.md/CLAUDE.md but structured," or wants portable, version-controlled context their agents can read. Works in any language or stack. It is just markdown files.
---

# Open Knowledge Format (OKF) — portable knowledge your agents can read

OKF (an open standard from Google Cloud, 2026) represents knowledge as **a directory of markdown files with YAML frontmatter**, cross-linked with normal markdown links so the whole thing is a graph. One required field (`type`). No SDK, no platform, no database. It is *just files*: readable in any editor, renderable on GitHub, diffable in git, parseable by any agent.

The point is not a clever data structure. It is an agreement. Once knowledge is written this way, whoever **produces** it no longer has to match whoever **consumes** it. A human can hand-write a bundle an agent reads. A script can generate a bundle a human browses. One LLM can write what another queries. The format is the contract; swap the tooling on either end.

Spec and repo: https://github.com/GoogleCloudPlatform/knowledge-catalog · Why it exists: https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing

This skill does three jobs. Do not stop at the first one.

1. **Produce** a bundle from the team's real knowledge.
2. **Consume** it correctly so agents stop re-deriving context.
3. **Maintain** it so it does not rot. This is the job everyone skips, and skipping it is why wikis die.

---

## The format (the entire spec fits on a page)

A **bundle** is a folder (commonly `knowledge/`). Each **concept** is one markdown file:

```markdown
---
type: Table            # the ONLY required field
title: Orders
description: One row per completed order.
resource: https://link/to/the/thing   # optional pointer to the real artifact
tags: [sales, revenue]                 # optional
timestamp: 2026-06-16T00:00:00Z        # optional
---

# Schema
| Column | Type | Description |
|--------|------|-------------|
| order_id | STRING | Unique order id. |
| customer_id | STRING | FK to [customers](customers.md). |   <- a link = a graph edge
```

Rules that matter:

1. `type` is the only mandatory field. Everything else is up to the producer. OKF is minimally opinionated by design, so do not invent a heavy schema.
2. Links are the graph. A markdown link to another concept file (`[customers](customers.md)`) is a directed edge. The file path is the concept's identity.
3. `index.md` in any folder is a section landing page (progressive disclosure as an agent walks the hierarchy). `log.md` is an optional chronological history of changes.
4. Relative links only, pointing at real files. The bundled tool flags links that resolve to nothing.

---

## Job 1 — Produce a bundle (6 steps)

1. **List the knowledge domains** the team's agents and tools keep re-deriving (e.g. data models, conventions, runbooks, glossary, product facts, the pipeline itself). Each becomes a folder under `knowledge/`.
2. **Create `knowledge/index.md`** as the root concept (`type: Knowledge Bundle`) linking to each section's `index.md`.
3. **Write one file per concept** with the frontmatter above. Keep each file small and single-purpose. Cross-link related concepts with relative markdown links. Those links are what make it a graph, and link density is where the value is.
4. **Canonicalize.** One concept per real thing. If two files describe the same entity under different names, merge them. The graph tool surfaces duplicates and orphans.
5. **Automate the volatile parts.** Hand-author the durable concepts (conventions, runbooks, glossary). For anything derived from live data (tables, services, content items), write a small generator that emits those concept files from the source of truth and run it in the build or CI so the bundle never drifts. Generated and hand-authored concepts live in the same bundle.
6. **Generate the graph + lint** with the bundled tool (below) and commit `knowledge/` to version control next to the code it describes.

### Guardrails while producing (read before drafting concepts)

The failure mode of an agent producing OKF is confidently inventing structure. Hold to these:

1. **A concept is a noun the team refers to by name** that has stable properties (a table, a metric, a client, a service, a runbook). If you cannot name it the way the team names it, it is probably not its own concept.
2. **Do not invent relationships.** Only draw a link (an edge) when the connection is real and you can point to where it comes from. A guessed join path is worse than a missing one.
3. **When the source is ambiguous, ask the user; do not fill the gap.** Better a smaller true bundle than a large fictional one. The spec assumes a human curates.
4. **Prefer many small concepts over a few big ones.** Split first, link generously.
5. **Resolve synonyms to one canonical concept.** Never ship two files for the same real thing.

---

## Job 2 — Consume a bundle (point your agents at it)

Tell the agent (in its system prompt, project instructions, or task prompt) to use the bundle instead of re-deriving context:

> Before doing work on this project, read `knowledge/index.md`, then follow the links to the specific concepts you need. Treat the bundle as the source of truth for schemas, definitions, conventions, and runbooks. If the bundle and your assumptions disagree, the bundle wins. If the bundle is missing or wrong, say so.

The `index.md` files give progressive disclosure: the agent reads the root, walks to the relevant section, and pulls only the concepts it needs rather than loading everything. For large bundles, that hierarchy is what keeps context windows sane.

---

## Job 3 — Maintain the bundle (the part everyone skips)

A bundle that is not maintained becomes lies an agent reads confidently. Karpathy's insight behind the LLM-wiki pattern is that LLMs are good at exactly the bookkeeping humans abandon: touching many files in one pass, fixing cross-references, never forgetting. But that only happens if something **triggers** the agent to do it. A skill file alone does not guarantee maintenance. You have to wire the trigger.

Two layers of maintenance:

1. **Knowledge content** (the concept bodies). When code, data, or process changes, the affected concepts must be updated. Wire this with one of:
   - A line in the repo's `CLAUDE.md` / `AGENTS.md` so every agent session honors it (snippet below).
   - A pre-commit hook or CI check that fails when a changed source has a stale concept.
   - A slash command or scheduled task that runs a reconcile pass.
2. **The graph + lint** (the derived view). Re-run `okf-graph.mjs` after edits, or in CI, so `graph.json` and `visualize.html` stay current and lint catches missing types, dead links, and orphans.

Paste this into the repo's `CLAUDE.md` or `AGENTS.md` so maintenance is not optional:

```markdown
## Knowledge bundle (OKF)
This repo has an OKF knowledge bundle in `knowledge/`.
- Before non-trivial work, read `knowledge/index.md` and follow links to the concepts you need.
- After any change that affects a documented thing (schema, metric, convention, runbook, API),
  update the matching concept file in the same change, and append a line to the nearest `log.md`.
- When unsure whether a concept exists, search `knowledge/` before creating a new file; do not duplicate.
- Run `node knowledge/tools/okf-graph.mjs knowledge` (or your tool path) and fix any lint warnings before opening a PR.
```

Without a trigger like this, you have rebuilt the drift problem with extra steps.

---

## The graph + lint tool (bundled, generic, free, local)

`references/okf-graph.mjs` scans any OKF bundle and emits `graph.json` plus a self-contained interactive `visualize.html` (force-directed graph, color-coded by `type`, search, click a concept for its frontmatter and its inbound/outbound links). No server, no install, no dependencies, opens by double-click, and no data leaves the page. It also **lints** the bundle: concepts missing the required `type`, links that point to a missing file, and orphan concepts with no links in or out.

```
node references/okf-graph.mjs ./knowledge
# writes knowledge/graph.json + knowledge/visualize.html, prints counts + lint
```

It parses the YAML frontmatter (`type`, `title`, `description`, `tags`) and the internal markdown links in each file, so it works on ANY OKF bundle regardless of how the markdown was authored. Re-run it after editing the bundle, or in CI, to keep the graph current and the lint honest. Copy `okf-graph.mjs` somewhere stable in the target repo (e.g. `knowledge/tools/`) and reference that path.

---

## Conventions and best practices

1. **One required field (`type`); stay minimally opinionated.** Let producers add fields as needed; do not impose a schema.
2. **Small files, many links.** Density of true links is the value.
3. **Canonical names.** Resolve synonyms to one concept; the visualizer makes drift obvious.
4. **Generate from the source of truth** for anything that changes; hand-author the durable rest.
5. **Version-control it** next to the code. Treat the bundle as docs-as-code and review it in PRs.
6. **No lock-in, ever.** Never make a concept require a proprietary account, SDK, or runtime to read.
7. **Lint before you ship.** Green lint (every concept typed, every link resolving, no orphans) is the bar for a healthy bundle.

---

## How to use this skill

When invoked:

1. **Explain OKF briefly** to the user in plain terms (a folder of linked markdown both agents and people read).
2. **Propose the bundle layout for THEIR repo** (the folders from Job 1, step 1), based on what their agents actually keep re-deriving.
3. **Scaffold `knowledge/`** with an `index.md` and a few seed concepts. Hand-author the durable ones; for live-data concepts, write a small generator from their source of truth. Follow the producing guardrails so you do not invent structure.
4. **Wire consumption and maintenance**: add the `CLAUDE.md` / `AGENTS.md` block above so agents read the bundle and keep it current, and place `okf-graph.mjs` at a stable path.
5. **Run `okf-graph.mjs`** to produce the graph and visualizer and to lint, then show the user the counts and any warnings.
6. **Tell them how to regenerate it** and how to point their agents at it.

Keep everything free, local, and in version control.
