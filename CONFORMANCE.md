# OKF Conformance Criteria

**Oracle 1 of the OKF conformance suite — the written, normative criteria.**
OKF spec version: **0.2** · Status: aligned to the [OKF v0.2 specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) (§ references below are to it) · Keywords: MUST / SHOULD / MAY per [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

This document and the executable validator (`validator/okf-validate.mjs`, Oracle 2)
are **two independent oracles**. When the prose here and the validator disagree,
that is a **spec defect** — reconciled in this file, never silently patched in the
implementation. See [CONTRIBUTING.md](CONTRIBUTING.md). When the upstream spec
revs, both oracles move together in one change (see "Changes from the v0.1-era
criteria" below for the v0.1 → v0.2 alignment).

---

**Scope.** OKF conformance covers the interoperability surface only: bundle
structure, frontmatter parseability, `type` presence, and reserved-file
structure. OKF v0.2 is **deliberately permissive** (§11): broken links, unknown
types, unknown keys, and missing optional fields are tolerated and never affect
conformance. Of those, this suite reports only broken links (as an `S3` quality
warning) and a missing root `index.md` (`S1`); unknown types, unknown keys, and
missing optional fields are accepted silently. Conformance does not certify
semantic agreement between producers, nor the correctness of the knowledge.
Conformance buys a shared wire, not a shared mind.

**Conformance vs the strict quality bar.** `conformant` is the §11 verdict: no
MUST violations. `--strict` layers a *separate* quality bar on top (no warnings
either) and decides the exit code, so CI can hold a repo to the
recommendations. It never redefines conformance — a bundle with a broken link
and no `index.md` is conformant under §11, and this suite reports
`conformant: true` for it in both modes. Under `--strict` such a bundle exits
non-zero and is reported as *conformant, but not strict-clean*.

**Reserved filenames (§3.1).** `index.md` (directory listing, §8) and `log.md`
(update history, §9) have defined meaning at any level of the hierarchy and are
not concept documents. All other `.md` files are concept documents.

## MUST (a violation makes a bundle nonconformant → validator error)

1. **M1** A bundle is a directory containing one or more `.md` files. This is a
   **precondition, not a spec criterion**: §3 defines a bundle as "a directory
   tree of markdown files" without an RFC 2119 keyword, and §11's criteria are
   per-file, so an empty directory satisfies them vacuously. The validator
   errors on a directory with no `.md` files because such a directory is not a
   bundle to judge, rather than because the spec makes it nonconformant.
2. **M2** Every concept document (non-reserved `.md` file) begins with a
   parseable YAML frontmatter block delimited by a leading `---` line and a
   closing `---` line (§4.1, §11.1).
3. **M3** Every concept document's frontmatter contains a non-empty `type`
   field (a string). A concept carrying just `type` is fully conformant
   (§4.1, §11.2).
4. **M4** Reserved files, when present, follow their documented structure
   (§11.3): an `index.md` carries **no frontmatter**, with one exception — a
   bundle-root `index.md` MAY carry a frontmatter block holding only an
   `okf_version` key (§8, §12); `log.md` date headings use ISO 8601
   `## YYYY-MM-DD` form (§9). (`log.md` frontmatter is tolerated: §9 does not
   forbid it and Google's reference bundles carry `type: Log` there.)
5. **M5** A concept's identity is its path within the bundle. §2 defines the
   *Concept ID* as that path **with the `.md` suffix removed**; the validator
   keys concepts by the full relative path including the suffix, which is an
   equivalent identity for collision purposes and is what its reports emit.
   Tooling that exchanges spec-form Concept IDs should strip the suffix.
6. **M6** A bundle is readable with no SDK, runtime, database, or network
   access. It is text and files only (§1).

## SHOULD (a violation is a warning; an error only under `--strict`)

1. **S1** A bundle SHOULD contain a root `index.md` as its entry point for
   progressive disclosure (§8). (A missing `index.md` never fails a bundle:
   §11.)
2. **S2** An `index.md` SHOULD enumerate the concept documents in its
   directory (§8).
3. **S3** Internal links SHOULD resolve. A broken link never makes a bundle
   nonconformant — consumers MUST tolerate it; it may represent
   not-yet-written knowledge (§6.1, §11) — but a finished bundle SHOULD not
   ship dead links. Both link forms resolve: absolute bundle-relative
   (`/tables/customers.md`, the recommended form) and relative
   (`./other.md`) (§6.1).
4. **S4** No concept document SHOULD be isolated: each one SHOULD have at least
   one link in or out, so it is connected to the bundle's graph. Links from an
   `index.md` count — that is what progressive disclosure is for. **This rule
   has no basis in the spec** (§11 makes all such constraints soft guidance);
   it is this suite's own quality recommendation, which is why it is a warning
   and only bites under `--strict`.
5. **S5** Recommended scalar fields, when present, use the conventional form:
   `tags` is a list; a legacy `timestamp` is ISO 8601. (v0.2 supersedes
   `timestamp` with `generated.at`; per §13.1 consumers MAY fall back to a
   legacy `timestamp` **when `generated` is absent**. The ISO 8601 expectation
   for `timestamp` is inherited v0.1 practice — v0.2 states no format
   requirement for it.)
6. **S6** The trust, lifecycle, provenance, and computation families, when
   present, follow §5–§10: `generated` carries `by` (§5.2) and an ISO 8601
   `at` when given; each `verified` entry carries `by` and an ISO 8601 `at` —
   a bare `{ by, at }` mapping is read as a one-element list (§5.2); each
   `sources` entry carries `resource`, which is REQUIRED within an entry, and
   an ISO 8601 `last_modified` when given (§5.1); `status` is one of `draft` |
   `stable` | `deprecated` (§5.4); `stale_after` is an absolute `YYYY-MM-DD`
   date (§5.5); a `type: Attested Computation` concept carries `runtime`
   (§10.2).

## MAY

1. Any additional frontmatter fields beyond `type` (`title`, `description`,
   `resource`, `tags`, or custom keys). Consumers MUST NOT reject unknown
   keys and SHOULD preserve them when round-tripping (§4.1).
2. `log.md` files at any level of the hierarchy (§9).
3. Any body structure, headings, tables, or sections (§4.2).
4. A `references/` subdirectory mirroring external material as first-class
   concepts (§6.3).
5. An `okf_version` declaration in the bundle-root `index.md` (§12).
6. `resource` and other path-valued fields hold an absolute URL, a
   `/`-prefixed bundle-relative path, or a relative path (§6.2). A
   `sources[].resource` may instead be a scope descriptor rather than a path
   at all (§5.1, e.g. "all queries in BigQuery project X"). All these forms are
   valid; no format check applies.

## Tolerances (never conformance failures, per §11)

None of these affects the conformance verdict; a validator MUST NOT report a
bundle nonconformant for any of them. Two are surfaced as quality warnings
(which bite only under `--strict`), the rest are accepted silently:

- Broken cross-links — surfaced as an `S3` warning.
- Missing `index.md` files — surfaced as an `S1` warning, at the bundle root only.
- Missing optional frontmatter fields — silent.
- Unknown `type` values — silent.
- Unknown additional frontmatter keys — silent.

---

## Validator mapping (informative)

Every validator finding references a rule id above, and every mechanically
checkable rule has a check. This table is the tie between the two oracles; a
finding with no matching criterion — or a criterion with no check — is a spec
defect, not an implementation detail.

| Rule | Validator behavior |
|------|--------------------|
| M1 | Error if the bundle directory holds zero `.md` files (a precondition — see the rule text). |
| M2 | Error per concept document with no leading `---`, an opened block with no closing `---`, or a delimited block that is not parseable YAML. Parseability is checked structurally and conservatively — unterminated `[`/`{` collections, tabs used for indentation, and lines that are neither key, list item, comment, nor a continuation of a plain scalar. Unusual-but-valid YAML is never failed; a deliberately narrow check is the right trade for a conformance oracle. Reserved files are exempt from M2 (see M4). |
| M3 | Error per concept document whose parseable frontmatter has no non-empty `type`. |
| M4 | Error per non-root `index.md` with a frontmatter block; per bundle-root `index.md` frontmatter holding any key besides `okf_version`; per unterminated frontmatter in a reserved file; per `log.md` `##` heading not in ISO 8601 `YYYY-MM-DD` form. Heading detection follows markdown: `##` lines inside fenced code blocks are code, not headings, and up to three leading spaces still form a heading. Dates are checked against the calendar, not just the shape — `2026-13-99` is not ISO 8601. |
| M5 | **Structural invariant.** The validator uses each file's bundle-relative path as its id; identity collisions are impossible by construction, so there is nothing to fail. |
| M6 | **Structural invariant.** The validator reads only text files with Node built-ins — no SDK, runtime, database, or network. A bundle that needs any of those is not a bundle. |
| S1 | Warning if there is no root `index.md`. |
| S2 | Warning per `index.md` that does not link a sibling concept document in its directory. |
| S3 | Warning per internal `.md` link (absolute or relative form) that does not resolve to an existing file. |
| S4 | Warning per concept document with no links in or out. Reserved files are not subjects, but they are sources: links from an `index.md` count. |
| S5 | Warning if `tags` is a bare scalar instead of a list, or a present legacy `timestamp` is not ISO 8601. |
| S6 | Warning per malformed trust/lifecycle/provenance/computation field: `generated` without `by`; a non-ISO `generated.at`; a `verified` entry missing `by` or `at`, or with a non-ISO `at`; a `sources` entry without `resource`, or with a non-ISO `last_modified`; a `status` outside `draft`/`stable`/`deprecated`; a non-`YYYY-MM-DD` `stale_after`; an `Attested Computation` without `runtime`. All mapping-valued families are read in every form YAML allows — inline `{ … }`, a dash list, or a bare block mapping (§5.2). Deeper §10 contract validation (`parameters`, `executor`, `attester` shapes) is out of scope for now. |

Under `--strict`, any SHOULD warning fails the run (non-zero exit) and the
report sets `strictClean: false`. The `conformant` verdict is unchanged — see
"Conformance vs the strict quality bar" above. This is the bar CI uses to hold
a repo to the recommendations, not just the requirements.

**Advisory (not mechanically checked).** Single-purpose concepts (one real
thing per file); merging synonymous concepts into one canonical file; absolute
bundle-relative links over relative ones (§6.1 recommends them as
move-stable); index entries carrying the linked concept's description;
structural markdown bodies. These are reviewer judgement, not validator
findings.

## Changes from the v0.1-era criteria

This suite originally shipped against the June 2026 one-page spec. OKF v0.2
(§13) superseded it; the criteria above are the realignment. What moved:

| v0.1-era rule | Now |
|---|---|
| M2/M3 applied to every `.md` including `index.md` | Scoped to concept documents; frontmatter on a non-root `index.md` is now an M4 error, and on the bundle root only `okf_version` is permitted (§8) |
| M2 checked delimiters only | Also checks that the delimited block is parseable YAML, as §11.1 requires |
| M4: a dead internal link is an error | **S3 warning** — §6.1 makes broken links explicitly tolerated |
| S5: `resource` must be a URI | Dropped — §6.2 accepts URLs and bundle paths alike |
| S3 single-purpose / S6 merged synonyms | Advisory prose (unchanged in spirit; never mechanically checked) |
| `--strict` reported a warning-only bundle as nonconformant | `conformant` always means the §11 verdict; `--strict` sets `strictClean` and the exit code instead |
| — | New M4: reserved-file structure (§8, §9, §11.3) |
| — | New S6: trust/lifecycle/provenance/computation shapes (§5, §10) |
| Report `okfVersion: "0.1"` | `okfVersion: "0.2"`, plus `declaredVersion`, `strictClean`, `pass`, and `summary.reserved` |

The honest ceiling: because OKF is minimally opinionated, this suite certifies
the **interoperability surface** and nothing past it. It cannot certify that two
producers mean the same thing by `type: Metric`, nor that the knowledge is
correct. Those semantic dialects are not the failure mode; they are the design.
