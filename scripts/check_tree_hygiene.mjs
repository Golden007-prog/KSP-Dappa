#!/usr/bin/env node
// check_tree_hygiene.mjs — guard against shell-artefact files.
//
// Agent and PowerShell sessions on Windows occasionally turn a `>` or `<`
// inside a quoted one-liner into a redirect, leaving zero-byte files named
// after code fragments ("(r.Actual", "{const", "0.95", "r.districtId") at the
// repo root and inside client/ and functions/<fn>/. Two purge commits removed
// 309 of them and they came back, because a gitignore pattern is not a check.
//
// This script FAILS when any entry at a guarded directory level is not on the
// explicit allowlist below. It runs as the pre-commit hook (scripts/hooks) and
// as a CI step, and the contract suite calls it too.
//
//   node scripts/check_tree_hygiene.mjs            # exit 1 on any stray entry
//   node scripts/check_tree_hygiene.mjs --fix      # delete stray files (never dirs)
//   node scripts/check_tree_hygiene.mjs --staged   # only check what git has staged
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const FIX = process.argv.includes('--fix');
const STAGED = process.argv.includes('--staged');

/** Guarded directory → allowed entry names (files and directories). */
const ALLOW = {
  '.': [
    '.catalystrc', '.claude', '.env', '.env.example', '.git', '.github', '.gitignore', '.mcp.json',
    'AGENTS.md', 'CAPABILITIES.md', 'CLAUDE.md', 'FEATURES.md', 'LICENSE', 'README.md',
    'catalyst.json', 'client', 'data', 'docs', 'functions', 'node_modules', 'pipeline', 'scripts', 'video',
  ],
  client: [
    '.gitignore', '.vite', 'CONTRACT.md', 'dist', 'index.html', 'node_modules', 'package-lock.json', 'package.json',
    'postcss.config.js', 'public', 'src', 'tailwind.config.js', 'vite.config.js',
  ],
  'functions/dappa_api': [
    '.env', '.env.deploy', '.gitignore', 'assets', 'catalyst-config.json', 'index.js', 'lib', 'node_modules', 'package-lock.json', 'package.json', 'test',
  ],
  'functions/dappa_event': ['catalyst-config.json', 'index.js', 'node_modules', 'package-lock.json', 'package.json'],
  'functions/dappa_nightly': [
    'README.md', '__pycache__', 'catalyst-config.json', 'main.py', 'nightly_core.py', 'notify.py',
    'requirements.txt', 'store_catalyst.py', 'store_local.py', 'test_fixture',
  ],
  scripts: null, // pattern-checked only (see SANE)
  docs: null,
  'docs/screenshots': null,
  video: ['broll', 'cards', 'logs', 'music', 'out', 'package.json', 'package-lock.json', 'node_modules', 'screen', 'script', 'tmp', 'vo'],
};

/** Any tracked path must look like a real file name: no code characters,
 *  and — outside data folders — an extension or a known extensionless name. */
const SANE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const EXTENSIONLESS_OK = new Set(['LICENSE', 'Dockerfile', 'Makefile', '.gitignore', '.env', '.catalystrc', '.claude', 'pre-commit', 'pre-push', 'commit-msg']);

function listDir(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs);
}

function looksSane(name) {
  if (!SANE.test(name) && !name.startsWith('.')) return false;
  if (name.startsWith('.')) return /^\.[A-Za-z0-9._-]+$/.test(name);
  if (EXTENSIONLESS_OK.has(name)) return true;
  // a bare number, a bare word without extension, or a "x.y" code fragment is not a file we ship
  if (!name.includes('.')) return false;
  if (/^\d+(\.\d+)?$/.test(name)) return false;
  return true;
}

const problems = [];
if (STAGED) {
  const staged = execSync('git diff --cached --name-only --diff-filter=A', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  for (const p of staged) {
    const parts = p.split('/');
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
    const name = parts[parts.length - 1];
    const allow = ALLOW[dir];
    if (Array.isArray(allow) && !allow.includes(name)) problems.push({ dir, name, why: 'not on the allowlist for ' + dir });
    else if (!looksSane(name) && !fs.statSync(path.join(ROOT, p)).isDirectory()) problems.push({ dir, name, why: 'name is not a plausible file name' });
  }
} else {
  for (const [dir, allow] of Object.entries(ALLOW)) {
    for (const name of listDir(dir)) {
      const abs = path.join(ROOT, dir, name);
      const isDir = fs.statSync(abs).isDirectory();
      if (Array.isArray(allow)) {
        if (!allow.includes(name)) problems.push({ dir, name, isDir, why: 'not on the allowlist for ' + dir });
      } else if (!isDir && !looksSane(name)) {
        problems.push({ dir, name, isDir, why: 'name is not a plausible file name' });
      }
    }
  }
}

if (!problems.length) {
  console.log('tree hygiene OK — no stray entries at guarded levels');
  process.exit(0);
}
let removed = 0;
for (const p of problems) {
  const abs = path.join(ROOT, p.dir, p.name);
  const size = p.isDir ? 'dir' : `${fs.statSync(abs).size} B`;
  if (FIX && !p.isDir) {
    fs.rmSync(abs);
    try { execSync(`git rm -q --cached -- "${path.join(p.dir, p.name).replace(/\\/g, '/')}"`, { cwd: ROOT, stdio: 'ignore' }); } catch { /* untracked */ }
    removed += 1;
    console.log(`removed  ${p.dir}/${p.name} (${size})`);
  } else {
    console.error(`STRAY    ${p.dir}/${p.name} (${size}) — ${p.why}`);
  }
}
if (FIX) {
  console.log(`tree hygiene: removed ${removed} stray file(s)` + (problems.length > removed ? `; ${problems.length - removed} directory entr(y/ies) left for a human` : ''));
  process.exit(problems.length > removed ? 1 : 0);
}
console.error(`tree hygiene FAILED — ${problems.length} stray entr(y/ies). Run with --fix to delete stray files.`);
process.exit(1);
