#!/usr/bin/env node
// run-suite.mjs — the executable OKF conformance suite.
//
// Runs validator/okf-validate.mjs over every fixture and asserts:
//   • each conformant fixture exits 0 and reports conformant
//   • each nonconformant MUST fixture (level "error") fails in default mode and
//     names its expected rule id in the report's errors
//   • each nonconformant SHOULD fixture (level "warning") is conformant in
//     default mode (warning only) AND fails under --strict, naming its rule id
//
// Fixtures are auto-discovered: any immediate subdirectory of conformant/ or
// nonconformant/ that contains an expected.json is a fixture. Drop in a new
// minimized failure + expected.json and the suite picks it up (the growth loop).
//
// Prints a pass/fail line per fixture and a final tally. Exits nonzero if any
// assertion fails — this is what CI runs to enforce the suite on the repo.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VALIDATOR = path.join(__dirname, "..", "validator", "okf-validate.mjs");

function runValidator(bundleDir, strict) {
  const args = [VALIDATOR, bundleDir, "--json"];
  if (strict) args.push("--strict");
  const res = spawnSync(process.execPath, args, { encoding: "utf8" });
  let report = null;
  try { report = JSON.parse(res.stdout); } catch { /* leave null */ }
  return { code: res.status, report, stderr: res.stderr };
}

function discover(group) {
  const base = path.join(__dirname, group);
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(base, d.name))
    .filter((dir) => fs.existsSync(path.join(dir, "expected.json")))
    .sort();
}

const results = [];
const rel = (p) => path.relative(path.join(__dirname, ".."), p).split(path.sep).join("/");

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

function ruleInList(report, list, rule) {
  return !!report && Array.isArray(report[list]) && report[list].some((x) => x.rule === rule);
}

console.log("\nOKF conformance suite\n");

// ---- conformant: must exit 0 and report conformant -------------------------
console.log("conformant fixtures (must pass):");
for (const dir of discover("conformant")) {
  const name = rel(dir);
  const { code, report } = runValidator(dir, false);
  if (code !== 0) { record(name, false, `expected exit 0, got ${code}`); continue; }
  if (!report || report.conformant !== true) { record(name, false, "report not conformant"); continue; }
  if (report.summary.errors !== 0) { record(name, false, `${report.summary.errors} error(s)`); continue; }
  record(name, true, `${report.summary.concepts} concepts, 0 errors`);
}

// ---- nonconformant: must fail, naming the expected rule --------------------
console.log("\nnonconformant fixtures (must fail):");
for (const dir of discover("nonconformant")) {
  const name = rel(dir);
  const expected = JSON.parse(fs.readFileSync(path.join(dir, "expected.json"), "utf8"));
  const { rule, level } = expected;

  if (level === "error") {
    // MUST violation: fails in default mode, rule id in errors.
    const { code, report } = runValidator(dir, false);
    const ok = code !== 0 && report && report.conformant === false && ruleInList(report, "errors", rule);
    record(name, ok, ok
      ? `${rule} error (exit ${code})`
      : `expected ${rule} error + nonzero exit, got exit ${code}`);
  } else {
    // SHOULD violation: conformant (warning) in default, fatal under --strict.
    const def = runValidator(dir, false);
    const warnsByDefault = def.code === 0 && def.report && def.report.conformant === true
      && ruleInList(def.report, "warnings", rule);
    const str = runValidator(dir, true);
    const failsStrict = str.code !== 0 && str.report && str.report.conformant === false
      && ruleInList(str.report, "warnings", rule);
    const ok = warnsByDefault && failsStrict;
    record(name, ok, ok
      ? `${rule} (warns in default, fails under --strict)`
      : `expected ${rule} warning→strict-fail; default exit ${def.code}, strict exit ${str.code}`);
  }
}

// ---- tally -----------------------------------------------------------------
const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log(`\n${passed}/${results.length} fixtures passed${failed ? `, ${failed} FAILED` : ""}.\n`);
process.exit(failed ? 1 : 0);
