#!/usr/bin/env node
// okf-graph.mjs — scan an Open Knowledge Format (OKF) bundle and emit:
//   <bundle>/graph.json     a portable node/edge graph of the bundle
//   <bundle>/visualize.html  a self-contained interactive graph (no server, no install)
//
// Usage:
//   node okf-graph.mjs ./knowledge
//
// Works on ANY OKF bundle. It parses YAML frontmatter (type, title, description, tags)
// and the internal markdown links in each file (a link to another .md file = a graph edge).
// It also lints the bundle: missing `type`, links that point nowhere, and orphan concepts.
// Pure Node built-ins. No dependencies. No data leaves your machine.

import fs from "node:fs";
import path from "node:path";

const bundleArg = process.argv[2] || "./knowledge";
const bundleDir = path.resolve(process.cwd(), bundleArg);

if (!fs.existsSync(bundleDir) || !fs.statSync(bundleDir).isDirectory()) {
  console.error(`OKF: bundle directory not found: ${bundleDir}`);
  console.error(`Usage: node okf-graph.mjs ./knowledge`);
  process.exit(1);
}

// ---- walk the bundle for markdown files ------------------------------------
function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) acc.push(full);
  }
  return acc;
}

// ---- minimal YAML frontmatter parser (no dependency) -----------------------
function parseFrontmatter(text) {
  const fm = { type: null, title: null, description: null, tags: [] };
  if (!text.startsWith("---")) return { fm, body: text };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { fm, body: text };
  const block = text.slice(3, end).replace(/^\r?\n/, "");
  const body = text.slice(end + 4);
  const lines = block.split(/\r?\n/);
  let pendingListKey = null;
  for (const raw of lines) {
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
      } else if (val === "") {
        pendingListKey = "tags";
      } else {
        fm.tags = [stripQuotes(val)];
      }
    } else if (key === "type" || key === "title" || key === "description") {
      fm[key] = stripQuotes(val) || null;
    }
  }
  return { fm, body };
}
function stripQuotes(s) {
  return s.replace(/^["']|["']$/g, "");
}

// ---- extract internal concept links from a markdown body -------------------
function extractLinks(body, fileDir) {
  const edges = [];
  const unresolved = [];
  const re = /\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    // skip image embeds ![alt](src)
    if (m.index > 0 && body[m.index - 1] === "!") continue;
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

// ---- build the graph -------------------------------------------------------
const files = walk(bundleDir);
const idOf = (full) => path.relative(bundleDir, full).split(path.sep).join("/");

const nodes = [];
const links = [];
const lint = { missingType: [], unresolved: [], orphans: [] };
const degree = new Map();
const bump = (id) => degree.set(id, (degree.get(id) || 0) + 1);

for (const full of files) {
  const id = idOf(full);
  const text = fs.readFileSync(full, "utf8");
  const { fm, body } = parseFrontmatter(text);
  if (!fm.type) lint.missingType.push(id);
  nodes.push({
    id,
    type: fm.type || "Untyped",
    title: fm.title || path.basename(id, ".md"),
    description: fm.description || "",
    tags: fm.tags || [],
  });
  const { edges, unresolved } = extractLinks(body, path.dirname(full));
  for (const t of edges) {
    const targetId = idOf(t);
    if (targetId === id) continue;
    links.push({ source: id, target: targetId });
    bump(id); bump(targetId);
  }
  for (const u of unresolved) lint.unresolved.push({ from: id, link: u });
}

for (const n of nodes) if (!degree.get(n.id)) lint.orphans.push(n.id);

const types = [...new Set(nodes.map((n) => n.type))].sort();
const graph = {
  bundle: path.basename(bundleDir),
  generated: new Date().toISOString(),
  counts: { concepts: nodes.length, links: links.length, types: types.length },
  types,
  nodes,
  links,
};

// ---- write graph.json ------------------------------------------------------
const jsonPath = path.join(bundleDir, "graph.json");
fs.writeFileSync(jsonPath, JSON.stringify(graph, null, 2));

// ---- the browser visualizer (real function, serialized into the HTML) ------
function vizMain() {
  const DATA = window.__OKF_DATA__;
  const palette = ["#6ea8fe","#ffd166","#06d6a0","#ef476f","#c792ea","#f78c6b","#7fdbca","#bb80ff","#ff9e64","#9ece6a","#e0af68","#7dcfff"];
  const colorOf = {};
  DATA.types.forEach((t, i) => { colorOf[t] = palette[i % palette.length]; });

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.getElementById("graph");
  const viewport = document.getElementById("viewport");
  const W = () => svg.clientWidth, H = () => svg.clientHeight;

  const nodes = DATA.nodes.map((n) => ({ ...n, x: 0, y: 0, vx: 0, vy: 0 }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links = DATA.links
    .map((l) => ({ source: byId.get(l.source), target: byId.get(l.target) }))
    .filter((l) => l.source && l.target);

  const neighbors = new Map(nodes.map((n) => [n.id, new Set()]));
  links.forEach((l) => { neighbors.get(l.source.id).add(l.target.id); neighbors.get(l.target.id).add(l.source.id); });

  // seed positions on a circle
  const R0 = Math.min(W(), H()) / 3 || 250;
  nodes.forEach((n, i) => {
    const a = (i / nodes.length) * Math.PI * 2;
    n.x = Math.cos(a) * R0 + (Math.random() - 0.5) * 40;
    n.y = Math.sin(a) * R0 + (Math.random() - 0.5) * 40;
  });

  // draw edges
  const linkEls = links.map((l) => {
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("class", "edge");
    viewport.appendChild(line);
    l.el = line; return l;
  });

  // draw nodes
  const radius = (n) => 7 + Math.min(14, (neighbors.get(n.id).size) * 1.6);
  const nodeEls = nodes.map((n) => {
    const g = document.createElementNS(svgNS, "g");
    g.setAttribute("class", "node");
    const c = document.createElementNS(svgNS, "circle");
    c.setAttribute("r", radius(n));
    c.setAttribute("fill", colorOf[n.type] || "#9aa5b1");
    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("class", "label");
    label.setAttribute("dy", radius(n) + 13);
    label.textContent = n.title.length > 28 ? n.title.slice(0, 27) + "\u2026" : n.title;
    g.appendChild(c); g.appendChild(label);
    viewport.appendChild(g);
    n.el = g; n.circle = c;
    g.addEventListener("mousedown", (e) => startDrag(e, n));
    g.addEventListener("click", (e) => { e.stopPropagation(); select(n); });
    return n;
  });

  // ---- force simulation ----
  let alpha = 1;
  function tick() {
    const kRepel = 5200, kSpring = 0.02, rest = 90, center = 0.012;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy || 0.01;
        const f = (kRepel / d2) * alpha;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      }
    }
    for (const l of linkEls) {
      let dx = l.target.x - l.source.x, dy = l.target.y - l.source.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d - rest) * kSpring * alpha;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      l.source.vx += fx; l.source.vy += fy; l.target.vx -= fx; l.target.vy -= fy;
    }
    for (const n of nodes) {
      if (n.fixed) { n.vx = 0; n.vy = 0; continue; }
      n.vx -= n.x * center * alpha; n.vy -= n.y * center * alpha;
      n.vx *= 0.85; n.vy *= 0.85;
      n.x += Math.max(-30, Math.min(30, n.vx));
      n.y += Math.max(-30, Math.min(30, n.vy));
    }
    if (alpha > 0.03) alpha *= 0.985;
    render();
    requestAnimationFrame(tick);
  }
  function render() {
    for (const l of linkEls) {
      l.el.setAttribute("x1", l.source.x); l.el.setAttribute("y1", l.source.y);
      l.el.setAttribute("x2", l.target.x); l.el.setAttribute("y2", l.target.y);
    }
    for (const n of nodes) n.el.setAttribute("transform", `translate(${n.x},${n.y})`);
  }

  // ---- pan + zoom ----
  let tx = 0, ty = 0, scale = 1;
  function applyView() { viewport.setAttribute("transform", `translate(${tx},${ty}) scale(${scale})`); }
  applyView();
  let panning = false, panStart = null;
  svg.addEventListener("mousedown", (e) => { if (e.target === svg || e.target === viewport) { panning = true; panStart = { x: e.clientX - tx, y: e.clientY - ty }; } });
  window.addEventListener("mousemove", (e) => { if (panning) { tx = e.clientX - panStart.x; ty = e.clientY - panStart.y; applyView(); } });
  window.addEventListener("mouseup", () => { panning = false; });
  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    tx = mx - (mx - tx) * factor; ty = my - (my - ty) * factor; scale *= factor; applyView();
  }, { passive: false });

  // ---- drag a node ----
  let dragNode = null, dragOff = null;
  function startDrag(e, n) {
    e.stopPropagation(); dragNode = n; n.fixed = true;
    const p = toLocal(e); dragOff = { x: p.x - n.x, y: p.y - n.y };
  }
  function toLocal(e) {
    const rect = svg.getBoundingClientRect();
    return { x: (e.clientX - rect.left - tx) / scale, y: (e.clientY - rect.top - ty) / scale };
  }
  window.addEventListener("mousemove", (e) => { if (dragNode) { const p = toLocal(e); dragNode.x = p.x - dragOff.x; dragNode.y = p.y - dragOff.y; alpha = Math.max(alpha, 0.4); } });
  window.addEventListener("mouseup", () => { if (dragNode) { dragNode.fixed = false; dragNode = null; } });

  // ---- selection + detail panel ----
  const panel = document.getElementById("panel");
  function select(n) {
    const nb = neighbors.get(n.id);
    nodeEls.forEach((m) => { m.el.classList.toggle("dim", m.id !== n.id && !nb.has(m.id)); m.el.classList.toggle("hl", m.id === n.id); });
    linkEls.forEach((l) => l.el.classList.toggle("edge-hl", l.source.id === n.id || l.target.id === n.id));
    const out = links.filter((l) => l.source.id === n.id).map((l) => l.target);
    const inc = links.filter((l) => l.target.id === n.id).map((l) => l.source);
    const linkList = (arr) => arr.length ? arr.map((t) => `<button class="lk" data-id="${esc(t.id)}">${esc(t.title)}</button>`).join("") : '<span class="muted">none</span>';
    panel.innerHTML =
      `<div class="ptype" style="color:${colorOf[n.type] || "#9aa5b1"}">${esc(n.type)}</div>` +
      `<h2>${esc(n.title)}</h2>` +
      `<div class="pid">${esc(n.id)}</div>` +
      (n.description ? `<p>${esc(n.description)}</p>` : "") +
      (n.tags.length ? `<div class="tags">${n.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : "") +
      `<h3>Links to</h3><div class="links">${linkList(out)}</div>` +
      `<h3>Linked from</h3><div class="links">${linkList(inc)}</div>`;
    panel.classList.add("open");
    panel.querySelectorAll(".lk").forEach((b) => b.addEventListener("click", () => { const t = byId.get(b.dataset.id); if (t) select(t); }));
  }
  function clearSel() { nodeEls.forEach((m) => m.el.classList.remove("dim", "hl")); linkEls.forEach((l) => l.el.classList.remove("edge-hl")); panel.classList.remove("open"); }
  svg.addEventListener("click", (e) => { if (e.target === svg || e.target === viewport) clearSel(); });
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  // ---- legend + search + counts ----
  const legend = document.getElementById("legend");
  legend.innerHTML = DATA.types.map((t) => `<span class="lg"><i style="background:${colorOf[t]}"></i>${esc(t)}</span>`).join("");
  document.getElementById("counts").textContent = `${DATA.counts.concepts} concepts \u00b7 ${DATA.counts.links} links \u00b7 ${DATA.counts.types} types`;
  const search = document.getElementById("search");
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    nodeEls.forEach((n) => { const hit = !q || n.title.toLowerCase().includes(q) || n.type.toLowerCase().includes(q) || n.tags.join(" ").toLowerCase().includes(q); n.el.classList.toggle("dim", !!q && !hit); n.el.classList.toggle("hit", !!q && hit); });
  });

  requestAnimationFrame(tick);
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OKF \u2014 ${graph.bundle}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html,body { margin:0; height:100%; background:#0b0f17; color:#e6edf3; font:14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; }
  #app { position:fixed; inset:0; }
  header { position:absolute; top:0; left:0; right:0; z-index:5; display:flex; gap:14px; align-items:center; padding:12px 16px; background:linear-gradient(#0b0f17ee,#0b0f1700); pointer-events:none; flex-wrap:wrap; }
  header .pointer { pointer-events:auto; }
  h1 { font-size:15px; margin:0; font-weight:650; letter-spacing:.2px; }
  h1 small { color:#8b98a9; font-weight:400; }
  #counts { color:#8b98a9; font-size:12px; }
  #search { pointer-events:auto; background:#121826; border:1px solid #243044; color:#e6edf3; border-radius:8px; padding:6px 10px; width:200px; outline:none; }
  #search:focus { border-color:#3b5bdb; }
  #legend { display:flex; gap:12px; flex-wrap:wrap; pointer-events:auto; }
  .lg { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:#aeb9c7; }
  .lg i { width:10px; height:10px; border-radius:50%; display:inline-block; }
  svg { width:100%; height:100%; display:block; cursor:grab; }
  svg:active { cursor:grabbing; }
  .edge { stroke:#27324a; stroke-width:1; }
  .edge-hl { stroke:#5b7cff; stroke-width:1.8; }
  .node { cursor:pointer; }
  .node circle { stroke:#0b0f17; stroke-width:1.5; transition:opacity .15s; }
  .node .label { fill:#c4cdd9; font-size:10px; text-anchor:middle; paint-order:stroke; stroke:#0b0f17; stroke-width:3px; pointer-events:none; }
  .node.dim { opacity:.12; }
  .node.hl circle { stroke:#fff; stroke-width:2.5; }
  .node.hit circle { stroke:#ffd166; stroke-width:2.5; }
  #panel { position:absolute; top:0; right:0; bottom:0; width:330px; background:#0e1422f2; border-left:1px solid #1d2638; padding:64px 20px 20px; overflow:auto; transform:translateX(110%); transition:transform .2s; z-index:6; }
  #panel.open { transform:none; }
  #panel .ptype { font-size:12px; text-transform:uppercase; letter-spacing:.6px; font-weight:600; }
  #panel h2 { margin:4px 0 2px; font-size:18px; }
  #panel .pid { color:#6b7689; font-size:11px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; margin-bottom:10px; word-break:break-all; }
  #panel p { color:#c4cdd9; }
  #panel h3 { font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:#8b98a9; margin:16px 0 6px; }
  .tags { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
  .tag { background:#172033; border:1px solid #243044; color:#aeb9c7; border-radius:999px; padding:2px 9px; font-size:11px; }
  .links { display:flex; flex-direction:column; gap:5px; }
  .lk { text-align:left; background:#141c2c; border:1px solid #233044; color:#cdd6e2; border-radius:7px; padding:6px 9px; cursor:pointer; font-size:12.5px; }
  .lk:hover { border-color:#3b5bdb; background:#18233a; }
  .muted { color:#6b7689; }
  footer { position:absolute; bottom:8px; left:14px; color:#56627a; font-size:11px; z-index:5; }
</style></head>
<body><div id="app">
  <header>
    <div class="pointer"><h1>OKF <small>\u00b7 ${graph.bundle}</small></h1><div id="counts"></div></div>
    <input id="search" class="pointer" placeholder="Search concepts\u2026" />
    <div id="legend"></div>
  </header>
  <svg id="graph"><g id="viewport"></g></svg>
  <aside id="panel"></aside>
  <footer>Open Knowledge Format \u00b7 drag to pan \u00b7 scroll to zoom \u00b7 click a concept</footer>
</div>
<script>window.__OKF_DATA__ = ${JSON.stringify(graph)};
(${vizMain.toString()})();</script>
</body></html>`;

const htmlPath = path.join(bundleDir, "visualize.html");
fs.writeFileSync(htmlPath, html);

// ---- console summary + lint ------------------------------------------------
console.log(`\nOKF bundle: ${graph.bundle}`);
console.log(`  ${graph.counts.concepts} concepts, ${graph.counts.links} links, ${graph.counts.types} types`);
console.log(`  types: ${types.join(", ") || "(none)"}`);
console.log(`  wrote ${path.relative(process.cwd(), jsonPath)}`);
console.log(`  wrote ${path.relative(process.cwd(), htmlPath)}  (double-click to open)`);

const warn = [];
if (lint.missingType.length) warn.push(`  ! ${lint.missingType.length} concept(s) missing required \`type\`: ${lint.missingType.slice(0, 5).join(", ")}${lint.missingType.length > 5 ? " \u2026" : ""}`);
if (lint.unresolved.length) warn.push(`  ! ${lint.unresolved.length} link(s) point to a missing file, e.g. ${lint.unresolved.slice(0, 3).map((u) => `${u.link} (in ${u.from})`).join("; ")}`);
if (lint.orphans.length) warn.push(`  ! ${lint.orphans.length} orphan concept(s) (no links in or out): ${lint.orphans.slice(0, 5).join(", ")}${lint.orphans.length > 5 ? " \u2026" : ""}`);
if (warn.length) { console.log(`\nlint:`); warn.forEach((w) => console.log(w)); }
else console.log(`\nlint: clean \u2014 every concept typed, every link resolves, no orphans.`);
console.log("");
