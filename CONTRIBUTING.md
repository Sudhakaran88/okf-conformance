# Contributing to the OKF Conformance Suite

This suite has one job: tell you, honestly and repeatably, whether an OKF bundle
conforms. Two principles keep it honest. Please hold to them.

## 1. Two independent oracles

There are two definitions of "conformant," kept deliberately separate:

1. **Oracle 1 — the written criteria:** [`CONFORMANCE.md`](CONFORMANCE.md).
   Normative prose with MUST / SHOULD / MAY.
2. **Oracle 2 — the executable validator:** [`validator/okf-validate.mjs`](validator/okf-validate.mjs).

A single reference validator quietly *becomes* the spec: any bug in it is
"conformant" by definition, and every implementation that trusts it inherits the
same blind spot. Two oracles guard against that.

**The rule:** when the prose and the validator disagree, that is a **spec
defect**, not an implementation bug.

- Do **not** silently change the validator to match a bundle you think should pass.
- Do **not** silently change the prose to match what the validator happens to do.
- Open an issue describing the disagreement. Decide what the *correct* behavior is,
  fix **`CONFORMANCE.md` first**, then bring the validator into line with it, then
  add a fixture that pins the resolved behavior.

Every validator finding must reference a rule id from `CONFORMANCE.md`
(`M1`..`M6`, `S1`..`S6`). A finding with no matching criterion, or a criterion
with no check, is itself a spec defect — reconcile it, don't paper over it.
The mapping table at the bottom of `CONFORMANCE.md` must stay accurate.

## 2. The growth loop — fixtures from real failures

The suite grows from real failures, not only the dialects someone thought to
write down a priori. When a bundle slips through as "conformant" but should not
have (or fails when it should have passed), that escape becomes a regression test.

To add a fixture:

1. **Minimize it.** Reduce the bundle to the smallest set of files that still
   reproduces the behavior. Isolate exactly one rule where you can — incidental
   warnings make the fixture's intent ambiguous.
2. **Place it.**
   - A bundle that *must pass* → `fixtures/conformant/<name>/`
   - A bundle that *must fail* → `fixtures/nonconformant/<name>/`
3. **Add `expected.json`** in the fixture directory:

   Conformant fixture:
   ```json
   { "conformant": true, "note": "why this is a valid bundle" }
   ```

   Nonconformant fixture (MUST violation — fails in default mode):
   ```json
   { "conformant": false, "rule": "M4", "level": "error", "violation": "what is wrong" }
   ```

   Nonconformant fixture (SHOULD violation — warns by default, fails under `--strict`):
   ```json
   { "conformant": false, "rule": "S5", "level": "warning", "violation": "what is wrong" }
   ```

   `expected.json` is not markdown, so the validator ignores it when it walks the
   bundle. The runner reads it to know what to assert.
4. **Run the suite.** It auto-discovers any subdirectory of `conformant/` or
   `nonconformant/` that contains an `expected.json`:

   ```bash
   node fixtures/run-suite.mjs
   ```

   The runner asserts: conformant fixtures exit 0; MUST fixtures fail in default
   mode and name their rule in `errors`; SHOULD fixtures are conformant (warning
   only) in default mode and fail under `--strict`, naming their rule in `warnings`.

## What the suite does not certify

Be honest in issues and PRs about the ceiling. Because OKF is minimally
opinionated, this suite certifies the **interoperability surface** —
frontmatter parsing, link resolution, reserved files, `type` presence — and
nothing past it. It cannot certify that two producers mean the same thing by
`type: Metric`, nor that the knowledge is correct. Rules `S3` (single-purpose)
and `S6` (merged synonyms) are advisory for exactly this reason: they are
semantic judgements, not mechanical checks. Proposals to "check semantics" are
out of scope by design — say so kindly and close them.

## Scope guardrails

This is an authority and interoperability asset, not a product. No server, no
accounts, no hosting, no paywall, no UI. Pull requests that add any of those
will be declined. Keep it pure Node, zero dependencies, and runnable by
double-clicking or one `node` command.

## Pull request checklist

- [ ] `node fixtures/run-suite.mjs` passes.
- [ ] Any new rule behavior is described in `CONFORMANCE.md` **before** the validator implements it.
- [ ] Every validator finding references a rule id; the mapping table is current.
- [ ] New fixtures are minimized and carry an `expected.json`.
- [ ] No new dependencies, servers, accounts, or build steps.
