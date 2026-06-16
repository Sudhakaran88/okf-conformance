# OKF Conformance Criteria

**Oracle 1 of the OKF conformance suite — the written, normative criteria.**
OKF version: 0.1 · Status: draft · Keywords: MUST / SHOULD / MAY per [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

This document and the executable validator (`validator/okf-validate.mjs`, Oracle 2)
are **two independent oracles**. When the prose here and the validator disagree,
that is a **spec defect** — reconciled in this file, never silently patched in the
implementation. See [CONTRIBUTING.md](CONTRIBUTING.md).

---

**Scope.** OKF conformance covers the interoperability surface only: bundle structure, frontmatter, link resolution, reserved files, and `type` presence. It does not certify semantic agreement between producers, nor the correctness of the knowledge. Conformance buys a shared wire, not a shared mind.

**MUST (a violation makes a bundle nonconformant → validator error):**

1. **M1** A bundle is a directory containing one or more concept files with the `.md` extension.
2. **M2** Each concept file begins with a YAML frontmatter block delimited by a leading `---` line and a closing `---` line.
3. **M3** Each concept's frontmatter contains a non-empty `type` field (a string).
4. **M4** Every internal link (a markdown link whose target ends in `.md`) resolves, via its relative path, to a file that exists within the bundle.
5. **M5** A concept's identity is its path relative to the bundle root; the validator treats path as identity.
6. **M6** A bundle is readable with no SDK, runtime, database, or network access. It is text and files only.

**SHOULD (a violation is a warning, not a failure, unless `--strict`):**

1. **S1** A bundle SHOULD contain a root `index.md` as its entry point (e.g. `type: Knowledge Bundle`).
2. **S2** An `index.md` in a folder SHOULD link to the concepts in that folder (progressive disclosure).
3. **S3** Each concept SHOULD be single-purpose (one real thing per file).
4. **S4** Every concept SHOULD be reachable by at least one link (no orphans).
5. **S5** If present: `timestamp` SHOULD be ISO-8601; `tags` SHOULD be a list; `resource` SHOULD be a URI.
6. **S6** Synonymous concepts SHOULD be merged into one canonical file.

**MAY:**

1. Any additional frontmatter fields beyond `type` (e.g. `title`, `description`, `resource`, `tags`, `timestamp`, or custom fields).
2. `log.md` files for chronological history.
3. Any body structure, headings, tables, or sections.

**Reserved filenames.** `index.md` (section landing page) and `log.md` (chronological history). The validator recognizes these and applies S1 and S2 to `index.md`.

---

## Validator mapping (informative)

Every validator finding references a rule id above, and every mechanically
checkable rule has a check. This table is the tie between the two oracles; a
finding with no matching criterion — or a criterion with no check — is a spec
defect, not an implementation detail.

| Rule | Validator behavior |
|------|--------------------|
| M1 | Error if the bundle directory holds zero `.md` files. |
| M2 | Error if a file has no leading `---`, or opens one with no closing `---`. |
| M3 | Error if a well-formed frontmatter block has no non-empty `type`. |
| M4 | Error per internal `.md` link that does not resolve to an existing file. |
| M5 | **Structural invariant.** The validator uses each file's bundle-relative path as its concept id; identity collisions are impossible by construction, so there is nothing to fail. |
| M6 | **Structural invariant.** The validator reads only text files with Node built-ins — no SDK, runtime, database, or network. A bundle that needs any of those is not a bundle. |
| S1 | Warning if there is no root `index.md`. |
| S2 | Warning per folder `index.md` that does not link a sibling concept in its folder. |
| S3 | **Advisory.** "One real thing per file" is a semantic judgement; it is not mechanically checkable and is not enforced. Reviewers apply it by hand. |
| S4 | Warning per concept with no links in or out (orphan). |
| S5 | Warning if a present `timestamp` is not ISO-8601, `tags` is a bare scalar instead of a list, or a present `resource` is not a URI. |
| S6 | **Advisory.** Detecting synonymous concepts is a semantic judgement; it is not mechanically checkable and is not enforced. |

Under `--strict`, every SHOULD warning is treated as an error and a bundle with
any warning is reported nonconformant. This is the bar CI uses to hold a repo to
the recommendations, not just the requirements.

The honest ceiling: because OKF is minimally opinionated, this suite certifies
the **interoperability surface** and nothing past it. It cannot certify that two
producers mean the same thing by `type: Metric`, nor that the knowledge is
correct. Those semantic dialects are not the failure mode; they are the design.
