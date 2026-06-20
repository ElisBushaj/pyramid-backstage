#!/usr/bin/env node
// Task-status tooling for the Pyramid Backstage backlog.
//   node .planning/tasks.mjs status            → print counts
//   node .planning/tasks.mjs done F00-T01 ...   → mark tasks done, bump last_updated
//   node .planning/tasks.mjs start F05-T01      → mark in_progress
//   node .planning/tasks.mjs regen              → rewrite STATUS.md per the CLAUDE.md protocol
// Single source of truth = the `### F##-T##` blocks in docs/06-features/*/TASKS.md.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FEAT_DIR = path.join(ROOT, "docs", "06-features");
const TODAY = "2026-06-20";

const FEATURES = fs.readdirSync(FEAT_DIR).filter((d) => /^(F\d\d|A00)/.test(d)).sort();

function featFile(dir) {
  return path.join(FEAT_DIR, dir, "TASKS.md");
}

const PHASE = {
  F00: "Foundation", F01: "Foundation", F09: "Foundation", F11: "Foundation", F14: "Foundation",
  F02: "Domain", F03: "Domain", F04: "Domain",
  F05: "Core", F06: "Core", F07: "Core", F08: "Core", F10: "Core", F15: "Core", F16: "Core",
  F12: "Integration", F13: "Integration", F17: "Integration", F18: "Integration", F19: "Integration", A00: "AI",
};
const PHASE_ORDER = { Foundation: 0, Domain: 1, Core: 2, Integration: 3, AI: 4 };

function parse() {
  const tasks = [];
  for (const dir of FEATURES) {
    const fid = dir.slice(0, 3);
    const text = fs.readFileSync(featFile(dir), "utf8");
    const blocks = text.split(/\n(?=### )/);
    for (const b of blocks) {
      const m = b.match(/^### (F\d\d-T\d\d|A00-T\d\d)\s+—\s+(.+)/m);
      if (!m) continue;
      const id = m[1];
      const title = m[2].trim();
      const status = (b.match(/^- Status:\s*(\w+)/m) || [])[1] || "not_started";
      const dependsRaw = (b.match(/^- Depends on:\s*(.+)/m) || [])[1] || "none";
      const deps = /none/i.test(dependsRaw) ? [] : [...dependsRaw.matchAll(/[FA]\d\d-T\d\d/g)].map((x) => x[0]);
      tasks.push({ id, title, status, deps, feature: fid, phase: PHASE[fid] || "?", isAI: fid === "A00" });
    }
  }
  return tasks;
}

function setStatus(ids, status) {
  const want = new Set(ids);
  for (const dir of FEATURES) {
    const fp = featFile(dir);
    let text = fs.readFileSync(fp, "utf8");
    let changed = false;
    const blocks = text.split(/\n(?=### )/);
    const next = blocks.map((b) => {
      const m = b.match(/^### (F\d\d-T\d\d|A00-T\d\d)\s/m);
      if (m && want.has(m[1])) {
        const upd = b.replace(/^- Status:\s*\w+/m, `- Status: ${status}`);
        if (upd !== b) changed = true;
        return upd;
      }
      return b;
    });
    if (changed) {
      text = next.join("\n");
      text = text.replace(/^last_updated:.*$/m, `last_updated: ${TODAY}`);
      fs.writeFileSync(fp, text);
    }
  }
}

function regen() {
  const tasks = parse();
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const done = (id) => byId.get(id)?.status === "done";
  const counts = { done: 0, in_progress: 0, blocked: 0, not_started: 0 };
  for (const t of tasks) counts[t.status] = (counts[t.status] || 0) + 1;

  const ops = tasks.filter((t) => !t.isAI);
  const opsCounts = { done: 0, in_progress: 0, blocked: 0, not_started: 0 };
  for (const t of ops) opsCounts[t.status] = (opsCounts[t.status] || 0) + 1;

  const eligible = ops
    .filter((t) => t.status === "not_started" && t.deps.every(done))
    .sort((a, b) => (PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase]) || a.feature.localeCompare(b.feature) || a.id.localeCompare(b.id));

  const inprog = tasks.filter((t) => t.status === "in_progress");
  const blocked = tasks.filter((t) => t.status === "blocked");

  // per-feature
  const featRows = FEATURES.map((dir) => {
    const fid = dir.slice(0, 3);
    const ft = tasks.filter((t) => t.feature === fid);
    const d = ft.filter((t) => t.status === "done").length;
    const ns = ft.filter((t) => t.status === "not_started").length;
    const ip = ft.filter((t) => t.status === "in_progress").length;
    return { fid, dir, phase: PHASE[fid], done: d, ns, ip, total: ft.length };
  });

  const fmt = (rows) => rows.map((r) => `| ${r.fid} ${r.dir.slice(4)} | ${r.phase} | ${r.done} | ${r.ns + r.ip} | ${r.total} |`).join("\n");
  const opsRows = featRows.filter((r) => r.fid !== "A00");
  const opsDone = opsRows.reduce((s, r) => s + r.done, 0);
  const opsTotal = opsRows.reduce((s, r) => s + r.total, 0);

  const out = `# Project Status

> **This is a generated dashboard.** Do not hand-edit. Regenerate via \`node .planning/tasks.mjs regen\` (the protocol in \`CLAUDE.md\` § "Status regeneration").

**Last regenerated:** ${TODAY} — Build in progress. ${opsDone}/${opsTotal} ops-core tasks done.

---

## Global counts

| Status | Count |
|--------|-------|
| done | ${counts.done} |
| in_progress | ${counts.in_progress || 0} |
| blocked | ${counts.blocked || 0} |
| not_started | ${counts.not_started || 0} |
| **Total** | **${tasks.length}** |

> ops-core: **${opsCounts.done}/${ops.length} done**. \`A00\` (Alvin's ai-orchestrator lane) is excluded from the eligible set.

---

## In-progress tasks

${inprog.length ? inprog.map((t) => `- **${t.id}** — ${t.title}`).join("\n") : "_(none)_"}

## Blocked tasks

${blocked.length ? blocked.map((t) => `- **${t.id}** — ${t.title}`).join("\n") : "_(none)_"}

---

## Eligible-next tasks

${eligible.length
  ? eligible.slice(0, 3).map((t, i) => `${i + 1}. **${t.id}** — ${t.title} _(deps: ${t.deps.join(", ") || "none"})_`).join("\n")
  : "_(none — backlog complete or all remaining work is blocked.)_"}

${eligible.length > 3 ? `\n…and ${eligible.length - 3} more eligible.` : ""}

---

## Per-feature summary

| Feature | Phase | Done | Remaining | Total |
|---------|-------|------|-----------|-------|
${fmt(opsRows)}
| **ops-core subtotal** | | **${opsDone}** | **${opsTotal - opsDone}** | **${opsTotal}** |
${fmt(featRows.filter((r) => r.fid === "A00"))}
`;
  fs.writeFileSync(path.join(ROOT, "STATUS.md"), out);
  return { counts, opsDone, opsTotal, eligible };
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "done") { setStatus(rest, "done"); console.log(`marked done: ${rest.join(", ")}`); regen(); }
else if (cmd === "start") { setStatus(rest, "in_progress"); regen(); console.log(`in_progress: ${rest.join(", ")}`); }
else if (cmd === "regen") { const r = regen(); console.log(`regen: ${r.opsDone}/${r.opsTotal} ops-core done; next: ${r.eligible.slice(0, 3).map((t) => t.id).join(", ")}`); }
else if (cmd === "status") { const t = parse(); const c = {}; for (const x of t) c[x.status] = (c[x.status] || 0) + 1; console.log(c); }
else console.log("usage: tasks.mjs done|start|regen|status [ids...]");
