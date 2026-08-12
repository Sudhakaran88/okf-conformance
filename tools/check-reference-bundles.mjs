#!/usr/bin/env node
// check-reference-bundles.mjs — run the validator against Google's published
// OKF reference bundles, so the README's "they all pass" claim is something
// you can reproduce rather than something you have to take on trust.
//
// Usage:
//   node tools/check-reference-bundles.mjs [--strict]
//
// Shallow-clones GoogleCloudPlatform/knowledge-catalog into a temp directory,
// validates every bundle under okf/bundles/, prints a line per bundle plus the
// upstream commit it checked, and exits non-zero if any bundle is
// nonconformant. Needs git and network access, which is why it is not part of
// the offline `fixtures/run-suite.mjs` gate.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = "https://github.com/GoogleCloudPlatform/knowledge-catalog.git";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VALIDATOR = path.join(__dirname, "..", "validator", "okf-validate.mjs");
const strict = process.argv.includes("--strict");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "okf-refbundles-"));
try {
  console.log(`\nCloning ${REPO} …`);
  const clone = spawnSync("git", ["clone", "--depth", "1", "--quiet", REPO, tmp], { encoding: "utf8" });
  if (clone.status !== 0) {
    console.error(`git clone failed: ${clone.stderr || clone.error?.message || "unknown error"}`);
    process.exit(2);
  }
  const commit = spawnSync("git", ["-C", tmp, "rev-parse", "--short", "HEAD"], { encoding: "utf8" })
    .stdout.trim();

  const bundlesDir = path.join(tmp, "okf", "bundles");
  if (!fs.existsSync(bundlesDir)) {
    console.error(`upstream layout changed: no okf/bundles in ${REPO}`);
    process.exit(2);
  }
  const bundles = fs.readdirSync(bundlesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  console.log(`\nGoogle OKF reference bundles @ ${commit}${strict ? " (strict)" : ""}\n`);
  let failed = 0;

  for (const name of bundles) {
    const args = [VALIDATOR, path.join(bundlesDir, name), "--json"];
    if (strict) args.push("--strict");
    const res = spawnSync(process.execPath, args, { encoding: "utf8" });
    let report = null;
    try { report = JSON.parse(res.stdout); } catch { /* leave null */ }

    if (!report) {
      console.log(`  FAIL  ${name} — validator produced no report`);
      failed++;
      continue;
    }
    const { concepts, reserved, errors, warnings } = report.summary;
    const ok = report.pass;
    if (!ok) failed++;
    console.log(
      `  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(16)} ` +
      `${concepts} concepts, ${reserved} reserved · ${errors} error(s), ${warnings} warning(s)` +
      `${report.conformant ? "" : "  ← nonconformant"}`
    );
    for (const e of report.errors) console.log(`          ✗ [${e.rule}] ${e.file}: ${e.message}`);
  }

  console.log(`\n${bundles.length - failed}/${bundles.length} reference bundles passed.\n`);
  process.exit(failed ? 1 : 0);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
