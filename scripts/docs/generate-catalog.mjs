#!/usr/bin/env node
/**
 * ReDom documentation catalog generator.
 * Scans tracked source trees at build time; never reads env files or secret values.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const out = path.join(root, "artifacts/redom-docs/catalog.json");
const ignored = new Set(["node_modules", ".git", ".next", ".expo", "dist", "build", "coverage", ".turbo", ".vercel", ".cache"]);
const sensitive = /(^|\/)(\.env(?:\.|$)|secrets?\/|credentials?\/|private[_-]?keys?\/)/i;
const allowedRoots = ["artifacts", "lib", "scripts"];
const readme = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };
const rel = (p) => path.relative(root, p).split(path.sep).join("/");
const walk = (dir, files = []) => {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return files; }
  for (const e of entries) {
    if (ignored.has(e.name) || e.name.startsWith(".") && e.name !== ".github") continue;
    const full = path.join(dir, e.name);
    if (sensitive.test(rel(full))) continue;
    if (e.isDirectory()) walk(full, files);
    else if (e.isFile() && !/\.(png|jpe?g|gif|webp|ico|pdf|zip|tgz|gz|woff2?|ttf|mp4|mov|db|sqlite)$/i.test(e.name)) files.push(full);
  }
  return files;
};
const files = allowedRoots.flatMap((r) => walk(path.join(root, r))).filter((p) => !rel(p).startsWith("artifacts/redom-docs/") && !rel(p).includes("/node_modules/"));
const textFiles = files.filter((p) => /\.(ts|tsx|js|jsx|mjs|cjs|json|md|mdx|sql|yaml|yml|toml|css|html)$/i.test(p));
const apps = new Map();
for (const f of files) {
  const p = rel(f);
  const m = p.match(/^artifacts\/([^/]+)/);
  if (m) {
    const name = m[1];
    const item = apps.get(name) || { id: name, name: name.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()), files: 0, sourceFiles: 0, routes: 0, screens: 0, schemas: 0, paths: [] };
    item.files++;
    if (/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(f)) item.sourceFiles++;
    if (item.paths.length < 8) item.paths.push(p);
    apps.set(name, item);
  }
}
const routes = [];
const screens = [];
const schemas = [];
const modules = [];
const readmeFiles = [];
const methodPattern = /\b(?:router|app|apiRouter|publicRouter|adminRouter)\.(get|post|put|patch|delete|options|head)\s*\(\s*(['"`])([^'"`]+)\2/g;
for (const f of textFiles) {
  const p = rel(f);
  const content = readme(f);
  if (/README\.md$/i.test(p)) readmeFiles.push({ path: p, title: content.match(/^#\s+(.+)$/m)?.[1] || path.basename(path.dirname(f)) });
  if (/\/routes?\//i.test(p) || /\.routes\./i.test(p)) {
    let m;
    while ((m = methodPattern.exec(content))) {
      routes.push({ method: m[1].toUpperCase(), path: m[3], source: p, line: content.slice(0, m.index).split("\n").length });
    }
  }
  if (/\b(?:pgTable|mysqlTable|sqliteTable)\s*\(/.test(content)) {
    const re = /\b(?:pgTable|mysqlTable|sqliteTable)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let m; while ((m = re.exec(content))) schemas.push({ name: m[1], source: p, line: content.slice(0,m.index).split("\n").length });
  }
  if (/\b(?:Screen|Page|View)\.(?:tsx|jsx)$/.test(p) || /(?:screens?|pages?)\//i.test(p) && /\.(tsx|jsx)$/.test(p)) {
    screens.push({ name: path.basename(p).replace(/\.(tsx|jsx)$/,"").replace(/([a-z0-9])([A-Z])/g,"$1 $2"), source: p });
  }
  if (/\.(ts|tsx|js|jsx|mjs)$/.test(p) && !/\.d\.ts$/.test(p)) modules.push({ name: path.basename(p), source: p });
}
for (const a of apps.values()) {
  a.routes = routes.filter(x => x.source.startsWith("artifacts/"+a.id+"/")).length;
  a.screens = screens.filter(x => x.source.startsWith("artifacts/"+a.id+"/")).length;
  a.schemas = schemas.filter(x => x.source.startsWith("artifacts/"+a.id+"/")).length;
}
const packageFiles = textFiles.filter(p => path.basename(p) === "package.json").map(p => {
  let j={}; try { j=JSON.parse(readme(p)); } catch {}
  return { name:j.name || path.dirname(rel(p)), path:rel(p), scripts:j.scripts || {}, dependencies:Object.keys(j.dependencies || {}) };
});
const git = (args) => { try { return execFileSync("git", args, { cwd:root, encoding:"utf8" }).trim(); } catch { return ""; } };
const catalog = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA || git(["rev-parse","HEAD"]),
  branch: process.env.GITHUB_REF_NAME || git(["branch","--show-current"]),
  totals: { files: files.length, sourceFiles: textFiles.length, products: apps.size, routes: routes.length, screens: screens.length, schemas: schemas.length, packages: packageFiles.length },
  products: [...apps.values()].sort((a,b)=>a.name.localeCompare(b.name)),
  routes: routes.sort((a,b)=>a.source.localeCompare(b.source)||a.line-b.line),
  screens: screens.sort((a,b)=>a.name.localeCompare(b.name)),
  schemas: schemas.sort((a,b)=>a.name.localeCompare(b.name)),
  modules: modules.sort((a,b)=>a.source.localeCompare(b.source)),
  readmes: readmeFiles.sort((a,b)=>a.path.localeCompare(b.path)),
  packages: packageFiles.sort((a,b)=>a.path.localeCompare(b.path))
};
fs.mkdirSync(path.dirname(out), { recursive:true });
fs.writeFileSync(out, JSON.stringify(catalog, null, 2) + "\n");
console.log("ReDom docs catalog generated", JSON.stringify(catalog.totals));
