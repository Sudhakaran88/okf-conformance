#!/usr/bin/env node
// okf-validate.mjs — Oracle 2 of the OKF conformance suite.
//
// Checks any Open Knowledge Format (OKF) bundle against the normative criteria
// in CONFORMANCE.md (M1..M6 MUST, S1..S6 SHOULD) and returns pass/fail.
// Aligned to the OKF v0.2 specification (knowledge-catalog/okf/SPEC.md §11):
// conformance is deliberately permissive. Unknown types, unknown keys, and
// missing optional fields are accepted silently; broken links are reported as
// an S3 quality warning. None of them affect conformance. --strict adds a
// quality bar on top of conformance; it never redefines it.
//
// Usage:
//   node validator/okf-validate.mjs ./path/to/bundle [--strict] [--json]
//
//   default   human-readable summary + a JSON report inside the bundle, at
//             <bundle>/okf-report.json
//   --strict  SHOULD violations (warnings) are treated as errors (stricter CI)
//   --json    print only the JSON report to stdout (for piping); writes no file
//
// Exit codes:  0 pass · 1 fail · 2 usage/IO error
//   Default mode passes when the bundle is conformant (zero errors). --strict
//   additionally requires zero warnings. A bundle that clears §11 but trips a
//   SHOULD is still reported `conformant: true` — it just fails the strict bar.
//
// The frontmatter-parsing and link-resolution core is shared with the graph
// companion (validator/okf-graph.mjs). This file maps each finding to a rule id
// in CONFORMANCE.md, emits a stable JSON report, and sets exit codes. A finding
// with no matching criterion — or a criterion with no check — is a spec defect,
// reconciled in CONFORMANCE.md, never silently patched here.
//
// Pure Node built-ins. No dependencies. No data leaves your machine.

import fs from "node:fs";
import path from "node:path";

const OKF_VERSION = "0.2";

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
// ENGINE — walk, frontmatter parsing, link resolution. Shared with
// okf-graph.mjs so the two tools parse identically. parseFrontmatter surfaces
// the raw detail the rules need: delimiter status, the top-level key set, the
// v0.2 trust/lifecycle families (§5), and the legacy v0.1 scalars.
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

// Strip quoted spans and trailing comments so bracket counting is not fooled
// by punctuation inside strings.
function stripQuotedAndComments(line) {
  let out = "";
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) break; // comment
    out += ch;
  }
  return out;
}

// A conservative structural check for M2's "parseable" requirement (§11.1).
// It is deliberately narrow — it only reports frontmatter that no YAML parser
// could accept — so that unusual but valid YAML is never failed. Returns a
// message, or null when the block is structurally sound.
function yamlDefect(blockLines) {
  let flowDepth = 0;           // >0 only inside an actual flow collection
  let blockScalarIndent = null; // inside a `|` / `>` block scalar
  let lastStructIndent = -1;    // indent of the last key or list item seen

  const countFlow = (s) => {
    for (const ch of s) {
      if (ch === "[" || ch === "{") flowDepth++;
      else if (ch === "]" || ch === "}") flowDepth--;
      if (flowDepth < 0) return false;
    }
    return true;
  };

  for (const raw of blockLines) {
    if (raw.trim() === "") continue;
    const indent = raw.match(/^\s*/)[0].length;

    // Inside a block scalar, more-indented lines are literal content.
    if (blockScalarIndent !== null) {
      if (indent > blockScalarIndent) continue;
      blockScalarIndent = null;
    }

    // Inside a flow collection, lines are collection content until it closes.
    if (flowDepth > 0) {
      if (!countFlow(stripQuotedAndComments(raw))) return "unbalanced `]` or `}` in frontmatter";
      continue;
    }

    if (/^\s*#/.test(raw)) continue;
    if (/\t/.test(raw.match(/^\s*/)[0])) {
      return "tab character used for indentation (YAML forbids tabs in indentation)";
    }

    const key = raw.match(/^(\s*)([^\s#:][^:]*):(\s|$)/);
    const item = raw.match(/^(\s*)-(\s|$)/);
    if (!key && !item) {
      // A more-indented bare line continues the previous plain scalar, which is
      // ordinary multi-line YAML. Anything else cannot parse.
      if (indent > lastStructIndent) continue;
      return `line is neither a key, a list item, nor a comment: \`${raw.trim().slice(0, 60)}\``;
    }
    lastStructIndent = indent;

    // A `[` or `{` only opens a collection when the VALUE starts with it;
    // elsewhere it is just a character in a plain scalar.
    const value = stripQuotedAndComments(raw)
      .replace(/^\s*-\s*/, "")
      .replace(/^[^:]*:\s*/, "")
      .trim();
    if (/^[|>][-+]?\d*$/.test(value)) { blockScalarIndent = indent; continue; }
    if (value.startsWith("[") || value.startsWith("{")) {
      if (!countFlow(value)) return "unbalanced `]` or `}` in frontmatter";
    }
  }

  if (flowDepth > 0) return "unterminated `[` or `{` in frontmatter";
  return null;
}

// Parse an inline YAML mapping like `{ by: x, at: 2026-06-25T09:00:00Z }`.
// Values may contain colons (datetimes); the key is everything before the
// first colon of each comma-separated piece.
function parseInlineMapping(s) {
  const out = {};
  const inner = s.trim().replace(/^\{|\}$/g, "");
  for (const piece of inner.split(",")) {
    const i = piece.indexOf(":");
    if (i === -1) continue;
    const key = piece.slice(0, i).trim().toLowerCase();
    const val = stripQuotes(piece.slice(i + 1).trim());
    if (key) out[key] = val;
  }
  return out;
}

// A list of mappings, in any of the forms YAML and §5.2 allow: an inline
// `{ ... }`, a dash list of inline mappings, a dash list with indented keys,
// or a bare block mapping (which §5.2 says consumers MUST read as a
// one-element list).
function parseMappingList(entry) {
  const list = [];
  if (entry.val.startsWith("{")) return [parseInlineMapping(entry.val)];

  let current = null;
  let sawDash = false;
  for (const c of entry.children) {
    const dash = c.match(/^\s*-\s*(.*)$/);
    if (dash) {
      sawDash = true;
      const item = dash[1].trim();
      if (item.startsWith("{")) { list.push(parseInlineMapping(item)); current = null; continue; }
      current = {};
      list.push(current);
      const i = item.indexOf(":");
      if (i > 0) current[item.slice(0, i).trim().toLowerCase()] = stripQuotes(item.slice(i + 1).trim());
    } else if (current) {
      const m = c.match(/^\s+([A-Za-z0-9_]+):\s*(.*)$/);
      if (m) current[m[1].toLowerCase()] = stripQuotes(m[2].trim());
    }
  }

  if (!sawDash) {
    const bare = {};
    for (const c of entry.children) {
      const m = c.match(/^\s+([A-Za-z0-9_]+):\s*(.*)$/);
      if (m) bare[m[1].toLowerCase()] = stripQuotes(m[2].trim());
    }
    if (Object.keys(bare).length) list.push(bare);
  }
  return list;
}

// Frontmatter delimiter status + field extraction.
// status: "none" (no leading ---), "unterminated" (--- with no closing ---),
//         or "ok" (well-formed block).
function parseFrontmatter(text) {
  const fm = {
    status: "none",
    defect: null,           // M2: structural YAML defect, when the block is unparseable
    keys: new Set(),        // top-level frontmatter keys, lowercased
    type: null, title: null, description: null,
    tags: [], tagsIsList: null,
    timestamp: null, resource: null,
    okfVersionDeclared: null,
    status_field: null, staleAfter: null, runtime: null,
    generated: null,        // { by?, at? } when present
    verified: null,         // array of { by?, at? } when present
    sources: null,          // array of source entries when present
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
  fm.defect = yamlDefect(block); // M2 — "parseable", not merely delimited

  // First pass: group the block into top-level entries. A top-level entry is a
  // non-indented `key: value` line; every following indented or non-matching
  // line belongs to it as a child line (nested mappings, list items).
  const entries = [];
  for (const raw of block) {
    const line = raw.replace(/\s+$/, "");
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/); // top level: no indent
    if (kv) entries.push({ key: kv[1].toLowerCase(), val: kv[2].trim(), children: [] });
    else if (entries.length) entries[entries.length - 1].children.push(line);
  }

  // Second pass: interpret the entries the rules care about.
  const childScalar = (children, key) => {
    for (const c of children) {
      const m = c.match(new RegExp(`^\\s+${key}:\\s*(.*)$`, "i"));
      if (m) return stripQuotes(m[1].trim());
    }
    return null;
  };

  for (const e of entries) {
    fm.keys.add(e.key);
    switch (e.key) {
      case "type": case "title": case "description":
        fm[e.key] = stripQuotes(e.val) || null;
        break;
      case "tags":
        if (e.val.startsWith("[")) {
          fm.tags = e.val.replace(/^\[|\]$/g, "").split(",").map((s) => stripQuotes(s.trim())).filter(Boolean);
          fm.tagsIsList = true;
        } else if (e.val === "") {
          fm.tags = e.children
            .map((c) => c.match(/^\s*-\s+(.*)$/))
            .filter(Boolean)
            .map((m) => stripQuotes(m[1].trim()));
          fm.tagsIsList = true;
        } else {
          fm.tags = [stripQuotes(e.val)];
          fm.tagsIsList = false; // bare scalar where a list is expected -> S5
        }
        break;
      case "timestamp": fm.timestamp = stripQuotes(e.val) || null; break;
      case "resource": fm.resource = stripQuotes(e.val) || null; break;
      case "okf_version": fm.okfVersionDeclared = stripQuotes(e.val) || null; break;
      case "status": fm.status_field = stripQuotes(e.val) || null; break;
      case "stale_after": fm.staleAfter = stripQuotes(e.val) || null; break;
      case "runtime": fm.runtime = stripQuotes(e.val) || null; break;
      case "generated": // inline mapping, or block children `by:` / `at:`
        if (e.val.startsWith("{")) fm.generated = parseInlineMapping(e.val);
        else fm.generated = {
          by: childScalar(e.children, "by") ?? undefined,
          at: childScalar(e.children, "at") ?? undefined,
        };
        break;
      // §5.2 — a bare mapping is a one-element list, in inline or block form.
      case "verified": fm.verified = parseMappingList(e); break;
      case "sources": fm.sources = parseMappingList(e); break;
    }
  }
  return { fm, body };
}

// Internal concept links (a markdown link whose target ends in .md = an edge).
// v0.2 §6.1: two forms — absolute bundle-relative (leading `/`, resolved
// against the bundle root; the recommended form) and relative (resolved
// against the linking file's directory). External URLs and images skipped.
function extractLinks(body, fileDir, bundleRoot) {
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
    const resolved = target.startsWith("/")
      ? path.join(bundleRoot, target.slice(1))     // bundle-relative (§6.1)
      : path.resolve(fileDir, target);             // relative
    if (fs.existsSync(resolved)) edges.push(resolved);
    else unresolved.push(target);
  }
  return { edges, unresolved };
}

// ===========================================================================
// RULE LAYER — every finding carries a rule id from CONFORMANCE.md.
// ===========================================================================

// ISO 8601: date, or date+time with optional seconds/fraction and optional zone.
const ISO8601 = /^(\d{4})-(\d{2})-(\d{2})([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const ISO_DATE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;
const STATUS_VALUES = new Set(["draft", "stable", "deprecated"]); // §5.4

// ISO 8601 constrains the calendar, not just the shape: 2026-13-99 is not a date.
function realDate(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}
function isIso8601(s) {
  const m = ISO8601.exec(s);
  return !!m && realDate(+m[1], +m[2], +m[3]);
}
function isIsoDate(s) {
  const m = ISO_DATE_SHAPE.exec(s);
  return !!m && realDate(+m[1], +m[2], +m[3]);
}

// The `##` date headings of a log.md (§9), ignoring fenced code blocks — a
// `##` line inside a fence is code, not a heading — and allowing the up-to-3
// spaces of indentation markdown permits before an ATX heading.
function logDateHeadings(text) {
  const found = [];
  let fence = null;
  for (const line of text.split(/\r?\n/)) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (fence === null) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const h = line.match(/^ {0,3}##\s+(.+?)\s*$/);
    if (h) found.push(h[1]);
  }
  return found;
}

const RESERVED = new Set(["index.md", "log.md"]); // §3.1 — not concept documents

function validate(bundleDir) {
  const errors = [];
  const warnings = [];
  const err = (rule, file, message) => errors.push({ rule, file, message });
  const warn = (rule, file, message) => warnings.push({ rule, file, message });

  const files = walk(bundleDir);
  const idOf = (full) => path.relative(bundleDir, full).split(path.sep).join("/");
  const isReserved = (full) => RESERVED.has(path.basename(full).toLowerCase());

  // M1 — a bundle is a directory containing one or more .md files.
  if (files.length === 0) {
    err("M1", ".", "bundle contains no .md files");
  }

  const degree = new Map();
  const bump = (id) => degree.set(id, (degree.get(id) || 0) + 1);
  const parsed = new Map();     // id -> { fm, body, dir }
  const linksByDir = new Map(); // dir -> Set of linked sibling basenames (from index.md)
  let declaredVersion = null;

  let conceptCount = 0;
  let reservedCount = 0;
  let linkCount = 0;

  for (const full of files) {
    const id = idOf(full);
    const dir = path.dirname(full);
    const base = path.basename(full).toLowerCase();
    const reserved = isReserved(full);
    const text = fs.readFileSync(full, "utf8");
    const { fm, body } = parseFrontmatter(text);
    parsed.set(id, { fm, body, dir, reserved });
    if (!degree.has(id)) degree.set(id, 0);
    if (reserved) reservedCount++; else conceptCount++;

    if (!reserved) {
      // M2 — a concept document's frontmatter must be a delimited block (§11.1).
      if (fm.status === "none") {
        err("M2", id, "missing YAML frontmatter block (no leading `---`)");
        continue; // cannot read type/fields; reporting M3/S5/S6 here would be noise
      }
      if (fm.status === "unterminated") {
        err("M2", id, "unterminated YAML frontmatter (no closing `---`)");
        continue;
      }
      if (fm.defect) {
        err("M2", id, `frontmatter is not parseable YAML: ${fm.defect}`);
        continue; // field values cannot be trusted
      }

      // M3 — non-empty `type` string (§11.2).
      if (!fm.type) {
        err("M3", id, "missing required `type`");
      }

      // S5 — recommended scalar fields, if present, use the conventional form.
      if (fm.timestamp !== null && !isIso8601(fm.timestamp)) {
        warn("S5", id, "legacy `timestamp` is not ISO 8601 (superseded by `generated.at` in v0.2)");
      }
      if (fm.tagsIsList === false) {
        warn("S5", id, "`tags` should be a list");
      }

      // S6 — trust/lifecycle/provenance/computation families, if present,
      // follow §5–§10.
      if (fm.generated) {
        if (!fm.generated.by) warn("S6", id, "`generated` is missing required `by` (§5.2)");
        if (fm.generated.at && !isIso8601(fm.generated.at)) warn("S6", id, "`generated.at` is not ISO 8601");
      }
      if (fm.verified) {
        fm.verified.forEach((v, i) => {
          if (!v.by || !v.at) warn("S6", id, `\`verified[${i}]\` should carry both \`by\` and \`at\` (§5.2)`);
          else if (!isIso8601(v.at)) warn("S6", id, `\`verified[${i}].at\` is not ISO 8601`);
        });
      }
      if (fm.sources) {
        fm.sources.forEach((s, i) => {
          if (!s.resource) warn("S6", id, `\`sources[${i}]\` is missing required \`resource\` (§5.1)`);
          if (s.last_modified && !isIso8601(s.last_modified)) warn("S6", id, `\`sources[${i}].last_modified\` is not ISO 8601`);
        });
      }
      if (fm.status_field && !STATUS_VALUES.has(fm.status_field)) {
        warn("S6", id, `\`status\` should be one of draft | stable | deprecated (§5.4), got \`${fm.status_field}\``);
      }
      if (fm.staleAfter && !isIsoDate(fm.staleAfter)) {
        warn("S6", id, "`stale_after` should be an absolute `YYYY-MM-DD` date (§5.5)");
      }
      if (fm.type === "Attested Computation" && !fm.runtime) {
        warn("S6", id, "`Attested Computation` concept is missing required `runtime` (§10.2)");
      }
    } else {
      // M4 — reserved files follow their documented structure (§11.3).
      if (fm.status === "unterminated") {
        err("M4", id, "unterminated YAML frontmatter in a reserved file");
        continue;
      }
      if (base === "index.md" && fm.status === "ok") {
        if (id === "index.md") {
          // Bundle root: only `okf_version` is permitted (§8, §12).
          const extra = [...fm.keys].filter((k) => k !== "okf_version");
          if (extra.length) {
            err("M4", id, `bundle-root index.md frontmatter may carry only \`okf_version\` (§8); found: ${extra.join(", ")}`);
          }
          if (fm.okfVersionDeclared) declaredVersion = fm.okfVersionDeclared;
        } else {
          err("M4", id, "index.md must not carry frontmatter (§8); indexes are listings, not concepts");
        }
      }
      if (base === "log.md") {
        // §9 — a log is date-grouped entries; date headings are ISO `YYYY-MM-DD`.
        // (log.md frontmatter is tolerated; Google's reference bundles use `type: Log`.)
        for (const heading of logDateHeadings(fm.status === "ok" ? body : text)) {
          if (!isIsoDate(heading)) {
            err("M4", id, `log.md date heading must be ISO 8601 \`YYYY-MM-DD\` (§9), got \`## ${heading}\``);
          }
        }
      }
    }
  }

  // Second pass for links, so absolute (`/…`) targets and sibling maps see the
  // whole tree regardless of walk order.
  for (const [id, { fm, body, dir, reserved }] of parsed) {
    if (fm.status === "unterminated") continue; // body unreadable
    // `body` excludes the frontmatter when a block parsed, and is the whole
    // text when there was none — either way it is the linkable text.
    const { edges, unresolved } = extractLinks(body, dir, bundleDir);
    const linkedSiblings = new Set();
    for (const t of edges) {
      const targetId = idOf(t);
      if (targetId === id) continue;
      linkCount++;
      bump(id);
      bump(targetId);
      if (path.dirname(t) === dir) linkedSiblings.add(path.basename(t));
    }
    if (reserved && path.basename(id).toLowerCase() === "index.md") linksByDir.set(dir, linkedSiblings);
    // S3 — internal links SHOULD resolve. Never an error: §6.1 makes broken
    // links explicitly tolerated (they may be not-yet-written knowledge).
    for (const u of unresolved) {
      warn("S3", id, `internal link does not resolve: ${u}`);
    }
  }

  // S1 — a bundle SHOULD have a root index.md entry point (§8).
  if (files.length > 0 && !parsed.has("index.md")) {
    warn("S1", ".", "no root `index.md` entry point");
  }

  // S2 — an index.md SHOULD enumerate the concept documents in its directory.
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

  // S4 — every concept document SHOULD be reachable (no orphans). Reserved
  // files are not subjects; links from an index.md grant reachability.
  for (const [id, { reserved }] of parsed) {
    if (reserved) continue;
    if ((degree.get(id) || 0) === 0) {
      warn("S4", id, "orphan concept (no links in or out)");
    }
  }

  // §11 defines conformance as the absence of MUST violations, full stop.
  // --strict layers a quality bar on top (zero warnings) and decides the exit
  // code; it never redefines `conformant`, because a bundle with a broken link
  // or no index.md is conformant per §11 and this suite says so either way.
  const conformant = errors.length === 0;
  const strictClean = conformant && warnings.length === 0;
  const pass = strict ? strictClean : conformant;

  return {
    okfVersion: OKF_VERSION,
    declaredVersion,
    bundle: path.basename(bundleDir),
    strict,
    conformant,
    strictClean,
    pass,
    summary: {
      concepts: conceptCount,
      reserved: reservedCount,
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
  console.log(`  ${summary.concepts} concept(s), ${summary.reserved} reserved file(s), ${summary.links} links`);
  console.log(`  ${summary.errors} error(s), ${summary.warnings} warning(s)`);

  if (report.errors.length) {
    console.log(`\nerrors (MUST):`);
    for (const e of report.errors) console.log(`  ✗ [${e.rule}] ${e.file}: ${e.message}`);
  }
  if (report.warnings.length) {
    console.log(`\nwarnings (SHOULD)${report.strict ? " — fatal under --strict" : ""}:`);
    for (const w of report.warnings) console.log(`  ! [${w.rule}] ${w.file}: ${w.message}`);
  }

  if (!report.conformant) {
    console.log(`\nFAIL — nonconformant`);
  } else if (report.strict && !report.strictClean) {
    console.log(`\nFAIL — conformant per §11, but did not clear the --strict quality bar`);
  } else {
    console.log(`\nPASS — conformant${report.strict ? ", strict-clean" : ""}`);
  }
  console.log(`  wrote ${path.relative(process.cwd(), reportPath)}\n`);
}

process.exit(report.pass ? 0 : 1);
