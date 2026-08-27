#!/usr/bin/env node
// deploy.mjs — `catalyst deploy` with secrets injected from an untracked file.
//
// functions/dappa_api/catalyst-config.json is TRACKED and must keep empty
// strings for every credential (endpoint keys, API keys, verified mail
// addresses). But `catalyst deploy` ships exactly that file's env_variables,
// so a plain deploy would blank whatever the console holds. This wrapper:
//   1. reads functions/dappa_api/.env.deploy (gitignored; KEY=value lines),
//   2. writes those values into a temporary copy of catalyst-config.json,
//   3. runs `catalyst deploy <args>`,
//   4. restores the tracked file byte-for-byte, even if the deploy fails.
//
//   node scripts/deploy.mjs                    # everything
//   node scripts/deploy.mjs --only client      # pass-through of catalyst deploy flags
//   node scripts/deploy.mjs --dry-run          # show which keys would be injected, deploy nothing
//
// Keys present in .env.deploy but absent from catalyst-config.json are added;
// values are never printed.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const CONFIG = path.join(ROOT, 'functions/dappa_api/catalyst-config.json');
const ENV_FILE = path.join(ROOT, 'functions/dappa_api/.env.deploy');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const passthrough = args.filter((a) => a !== '--dry-run');

function readEnvFile(p) {
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

const original = fs.readFileSync(CONFIG, 'utf8');
const config = JSON.parse(original);
const env = config.deployment.env_variables;
const secrets = readEnvFile(ENV_FILE);
const injected = Object.keys(secrets).filter((k) => secrets[k] !== '');
const missing = Object.keys(env).filter((k) => env[k] === '' && !injected.includes(k));

console.log(`deploy: ${injected.length} value(s) injected from .env.deploy: ${injected.join(', ') || '(none)'}`);
if (missing.length) console.log(`deploy: still empty after injection (console-pending unless set there): ${missing.join(', ')}`);
if (dryRun) process.exit(0);

for (const k of injected) env[k] = secrets[k];
fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2) + '\n');
let status = 1;
try {
  const r = spawnSync('catalyst', ['deploy', ...passthrough], { cwd: ROOT, stdio: 'inherit', shell: true });
  status = r.status == null ? 1 : r.status;
} finally {
  fs.writeFileSync(CONFIG, original);
  const check = fs.readFileSync(CONFIG, 'utf8');
  if (check !== original) { console.error('deploy: FAILED to restore catalyst-config.json — do not commit it'); process.exit(2); }
  console.log('deploy: tracked catalyst-config.json restored (secrets never touch git)');
}
process.exit(status);
