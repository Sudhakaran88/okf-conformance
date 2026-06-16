#!/usr/bin/env node
// okf-validate.mjs — Oracle 2 of the OKF conformance suite.
//
// Checks any Open Knowledge Format (OKF) bundle against the normative criteria
// in CONFORMANCE.md (M1..M6 MUST, S1..S6 SHOULD) and returns pass/fail.
//
// Usage:
//   node validator/okf-validate.mjs ./path/to/bundle [--strict] [--json]
//
//   default   human-readable summary + a JSON report at <bundle>/okf-report.json
//   --strict  SHOULD violations (warnings) are treated as errors (stricter CI)
//   --json    print only the JSON report to stdout (for piping); writes no file
//
// Exit codes:  0 conformant · 1 nonconformant · 2 usage/IO error
//
// The frontmatter-parsing and link-resolution core is reused verbatim from the
// kit's tested okf-graph.mjs (see validator/okf-graph.mjs). This file is the
// formalization of okf-graph's lint half: it maps each finding to a rule id in
// CONFORMANCE.md, emits a stable JSON report, and sets exit codes. A finding
// with no matching criterion — or a criterion with no check — is a spec defect,
// reconciled in CONFORMANCE.md, never silently patched here.
//
// Pure Node built-ins. No dependencies. No data leaves your machine.

import fs from "node:fs";
import path from "node:path";

const OKF_VERSION = "0.1";

// ---- CLI parsing -----------------------------------------------------------
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const positional = argv.filter((a) => !a.startsWith("--"));
const strict = flags.has("--strict");
const jsonOnly = flags.has("--json");
const bundleArg = positional[0] || "./knowledge";
const bundleDir = path.resolve(process.cwd(), bundleArg);

if (!fs.existsSync(bundleDir) || !fs.statSync(bundleDir).isDirectory()) {
  console.error(`OKF: bundle directory not found: ${bundleDir}`);
  console.error(`Usage: node validator/okf-validate.mjs ./path/to/bundle [--strict] [--json]`);
  process.exit(2); // usage/IO error
}

// ===========================================================================
// ENGINE — reused verbatim from okf-graph.mjs (walk, stripQuotes, link
// resolution). parseFrontmatter is extended only to surface the raw detail the
// SHOULD rules need (frontmatter delimiter status, tags-is-a-list, timestamp,
// resource); the type/title/description/tags scanning is byte-for-byte the
// engine's logic so the two tools parse identically.
// ===========================================================================

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) acc.push(full);
  }
  return acc;
}

function stripQuotes(s) {
  return s.replace(/^["']|["']$/g, "");
}

// Frontmatter delimiter status (M2) + field extraction.
// status: "none" (no leading ---), "unterminated" (--- with no closing ---),
//         or "ok" (well-formed block).
function parseFrontmatter(text) {
  const fm = {
    status: "none",
    type: null, title: null, description: null,
    tags: [], tagsIsList: null,
    timestamp: null, resource: null,
  };
  const t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // tolerate BOM
  const lines = t.split(/\r?\n/);
  if ((lines[0] ?? "").trim() !== "---") {
    return { fm, body: t };
  }
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") { close = i; break; }
  }
  if (close === -1) {
    fm.status = "unterminated";
    return { fm, body: "" };
  }
  fm.status = "ok";
  const block = lines.slice(1, close);
  const body = lines.slice(close + 1).join("\n");

  let pendingListKey = null;
  for (const raw of block) {
    const line = raw.replace(/\s+$/, "");
    if (pendingListKey) {
      const m = line.match(/^\s*-\s+(.*)$/);
      if (m) { fm[pendingListKey].push(stripQuotes(m[1].trim())); continue; }
      pendingListKey = null;
    }
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const val = kv[2].trim();
    if (key === "tags") {
      if (val.startsWith("[")) {
        fm.tags = val.replace(/^\[|\]$/g, "").split(",").map((s) => stripQuotes(s.trim())).filter(Boolean);
        fm.tagsIsList = true;
      } else if (val === "") {
        pendingListKey = "tags";
        fm.tagsIsList = true;
      } else {
        fm.tags = [stripQuotes(val)];
        fm.tagsIsList = false; // bare scalar where a list is expected -> S5
      }
    } else if (key === "type" || key === "title" || key === "description") {
      fm[key] = stripQuotes(val) || null;
    } else if (key === "timestamp") {
      fm.timestamp = stripQuotes(val) || null;
    } else if (key === "resource") {
      fm.resource = stripQuotes(val) || null;
    }
  }
  return { fm, body };
}

// Internal concept links (a markdown link whose target ends in .md = an edge).
// Resolution and external/image skipping are the engine's exact behavior.
function extractLinks(body, fileDir) {
  const edges = [];
  const unresolved = [];
  const re = /\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    if (m.index > 0 && body[m.index - 1] === "!") continue; // image embed
    let target = m[1].split("#")[0].split("?")[0].trim();
    if (!target) continue;
    if (/^[a-z]+:\/\//i.test(target) || target.startsWith("mailto:")) continue; // external
    if (!target.toLowerCase().endsWith(".md")) continue; // concept edges are .md links
    const resolved = path.resolve(fileDir, target);
    if (fs.existsSync(resolved)) edges.push(resolved);
    else unresolved.push(target);
  }
  return { edges, unresolved };
}

// ===========================================================================
// RULE LAYER — every finding carries a rule id from CONFORMANCE.md.
// ===========================================================================

// ISO-8601: date, or date+time with optional seconds/fraction and optional zone.
const ISO8601 = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const URI_LIKE = /^[a-zA-Z][a-zA-Z0-9+.\-]*:\S/; // scheme:something

const RESERVED = new Set(["index.md", "log.md"]);

function validate(bundleDir) {
  const errors = [];
  const warnings = [];
  const err = (rule, file, message) => errors.push({ rule, file, message });
  const warn = (rule, file, message) => warnings.push({ rule, file, message });

  const files = walk(bundleDir);
  const idOf = (full) => path.relative(bundleDir, full).split(path.sep).join("/");

  // M1 — a bundle is a directory containing one or more .md concept files.
  if (files.length === 0) {
    err("M1", ".", "bundle contains no concept (.md) files");
  }

  const degree = new Map();
  const bump = (id) => degree.set(id, (degree.get(id) || 0) + 1);
  const parsed = new Map();     // id -> { fm, body, dir }
  const linksByDir = new Map(); // dir -> Set of linked sibling basenames

  let linkCount = 0;

  for (const full of files) {
    const id = idOf(full);
    const dir = path.dirname(full);
    const text = fs.readFileSync(full, "utf8");
    const { fm, body } = parseFrontmatter(text);
    parsed.set(id, { fm, body, dir });
    if (!degree.has(id)) degree.set(id, 0);

    // M2 — frontmatter must be a delimited block.
    if (fm.status === "none") {
      err("M2", id, "missing YAML frontmatter block (no leading `---`)");
      continue; // cannot read type/fields; reporting M3/S5 here would be noise
    }
    if (fm.status === "unterminated") {
      err("M2", id, "unterminated YAML frontmatter (no closing `---`)");
      continue;
    }

    // M3 — non-empty `type` string.
    if (!fm.type) {
      err("M3", id, "missing required `type`");
    }

    // S5 — optional fields, if present, SHOULD use the conventional form.
    if (fm.timestamp !== null && !ISO8601.test(fm.timestamp)) {
      warn("S5", id, "`timestamp` is not ISO-8601");
    }
    if (fm.tagsIsList === false) {
      warn("S5", id, "`tags` should be a list");
    }
    if (fm.resource !== null && !URI_LIKE.test(fm.resource)) {
      warn("S5", id, "`resource` should be a URI");
    }

    // links / M4 / graph degree
    const { edges, unresolved } = extractLinks(body, dir);
    const linkedSiblings = new Set();
    for (const t of edges) {
      const targetId = idOf(t);
      if (targetId === id) continue;
      linkCount++;
      bump(id);
      bump(targetId);
      if (path.dirname(t) === dir) linkedSiblings.add(path.basename(t));
    }
    if (RESERVED.has(path.basename(id))) linksByDir.set(dir, linkedSiblings);
    for (const u of unresolved) {
      err("M4", id, `internal link to a missing file: ${u}`);
    }
  }

  // S1 — a bundle SHOULD have a root index.md entry point.
  if (files.length > 0 && !parsed.has("index.md")) {
    warn("S1", ".", "no root `index.md` entry point");
  }

  // S2 — a folder's index.md SHOULD link to the concepts in that folder.
  for (const full of files) {
    if (path.basename(full).toLowerCase() !== "index.md") continue;
    const dir = path.dirname(full);
    const linked = linksByDir.get(dir) || new Set();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const name = entry.name;
      if (!name.toLowerCase().endsWith(".md")) continue;
      if (RESERVED.has(name.toLowerCase())) continue; // skip index.md / log.md
      if (!linked.has(name)) {
        warn("S2", idOf(full), `index does not link sibling concept \`${name}\``);
      }
    }
  }

  // S4 — every concept SHOULD be reachable by at least one link (no orphans).
  for (const id of parsed.keys()) {
    if ((degree.get(id) || 0) === 0) {
      warn("S4", id, "orphan concept (no links in or out)");
    }
  }

  const conformant = strict ? (errors.length === 0 && warnings.length === 0)
                            : (errors.length === 0);

  return {
    okfVersion: OKF_VERSION,
    bundle: path.basename(bundleDir),
    strict,
    conformant,
    summary: {
      concepts: files.length,
      links: linkCount,
      errors: errors.length,
      warnings: warnings.length,
    },
    errors,
    warnings,
  };
}

// ===========================================================================
// OUTPUT
// ===========================================================================

const report = validate(bundleDir);

if (jsonOnly) {
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
} else {
  const reportPath = path.join(bundleDir, "okf-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const { summary } = report;
  console.log(`\nOKF conformance — ${report.bundle}${report.strict ? " (strict)" : ""}`);
  console.log(`  ${summary.concepts} concepts, ${summary.links} links`);
  console.log(`  ${summary.errors} error(s), ${summary.warnings} warning(s)`);

  if (report.errors.length) {
    console.log(`\nerrors (MUST):`);
    for (const e of report.errors) console.log(`  ✗ [${e.rule}] ${e.file}: ${e.message}`);
  }
  if (report.warnings.length) {
    console.log(`\nwarnings (SHOULD)${report.strict ? " — fatal under --strict" : ""}:`);
    for (const w of report.warnings) console.log(`  ! [${w.rule}] ${w.file}: ${w.message}`);
  }

  console.log(`\n${report.conformant ? "PASS — conformant" : "FAIL — nonconformant"}`);
  console.log(`  wrote ${path.relative(process.cwd(), reportPath)}\n`);
}

process.exit(report.conformant ? 0 : 1);
