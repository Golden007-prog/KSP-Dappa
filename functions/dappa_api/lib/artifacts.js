'use strict';
// Generated-brief artefact store with a three-link fallback chain:
//
//   1. Catalyst File Store — capp.filestore().folder(FILESTORE_FOLDER_ID)
//      .uploadFile({code: ReadStream, name}). Needs a console-created folder id
//      in env FILESTORE_FOLDER_ID; without it the link is skipped, not failed.
//   2. Catalyst Stratus     — bucket('dappa').putObject(key, body) (already the
//      network-snapshot backing store, so the bucket exists).
//   3. In-process memory    — a bounded Map, so a demo can always produce and
//      re-open an artefact even with no object storage reachable.
//
// The artefact INDEX is mirrored into Catalyst Cache so a listing survives the
// container that wrote it whenever the payload lives in File Store/Stratus.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { hash32, logJson } = require('./util');

const INDEX_KEY = 'v1:artifacts:index';
const INDEX_TTL_SEC = 24 * 3600;
const MEM_LIMIT = 25;
const MAX_BYTES = 2 * 1024 * 1024;

const memory = new Map(); // artifactId -> { meta, body }

function newId(name) {
  return `art-${Date.now().toString(36)}-${hash32(`${name}|${Math.random()}`).toString(36)}`;
}

function stratusKey(id, name) {
  return `briefs/${id}-${String(name || 'artifact').replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

async function readIndex(ctx) {
  const hit = await ctx.cache.get(INDEX_KEY).catch(() => undefined);
  const list = hit && Array.isArray(hit.value) ? hit.value : [];
  // Memory-only artefacts belong to this container; merge them in so a listing
  // is complete even when the cache round-trip lost them.
  const byId = new Map(list.map((m) => [m.artifactId, m]));
  for (const [id, rec] of memory) if (!byId.has(id)) byId.set(id, rec.meta);
  return [...byId.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function writeIndex(ctx, meta) {
  const list = await readIndex(ctx);
  const next = [meta].concat(list.filter((m) => m.artifactId !== meta.artifactId)).slice(0, 100);
  await ctx.cache.put(INDEX_KEY, next, INDEX_TTL_SEC).catch(() => {});
  return next;
}

function rememberInMemory(meta, body) {
  memory.set(meta.artifactId, { meta, body });
  while (memory.size > MEM_LIMIT) {
    const oldest = memory.keys().next().value;
    memory.delete(oldest);
  }
}

async function tryFileStore(ctx, id, name, buffer) {
  if (!ctx.flags.filestore || !ctx.services.filestore) return null;
  let tmp = null;
  try {
    tmp = path.join(os.tmpdir(), `${id}-${name}`.replace(/[^A-Za-z0-9._-]/g, '_'));
    fs.writeFileSync(tmp, buffer);
    const out = await ctx.services.filestore.upload({ name, filePath: tmp });
    const fileId = out && (out.id || out.file_id || (out.file_details && out.file_details.id));
    if (!fileId) return null;
    return { storage: 'filestore', fileId: String(fileId), folderId: ctx.services.filestore.folderId || null };
  } catch (e) {
    logJson('warn', 'artifact_filestore_failed', { message: String((e && e.message) || e) });
    return null;
  } finally {
    if (tmp) { try { fs.unlinkSync(tmp); } catch (e) { /* best effort */ } }
  }
}

async function tryStratus(ctx, id, name, buffer, contentType) {
  if (!ctx.services.artifactBucket) return null;
  try {
    const key = stratusKey(id, name);
    await ctx.services.artifactBucket.put(key, buffer, contentType);
    let url = null;
    try { url = await ctx.services.artifactBucket.signedUrl(key); } catch (e) { url = null; }
    return { storage: 'stratus', key, url };
  } catch (e) {
    logJson('warn', 'artifact_stratus_failed', { message: String((e && e.message) || e) });
    return null;
  }
}

/**
 * Persist an artefact. `body` is a string or Buffer. Always succeeds — the
 * final link of the chain is process memory.
 */
async function putArtifact(ctx, opts) {
  const o = opts || {};
  const name = String(o.name || 'brief.json');
  const contentType = String(o.contentType || 'application/json');
  const buffer = Buffer.isBuffer(o.body) ? o.body : Buffer.from(String(o.body === undefined ? '' : o.body), 'utf8');
  if (buffer.length > MAX_BYTES) {
    return { ok: false, reason: `artifact too large (${buffer.length} bytes, max ${MAX_BYTES})` };
  }
  const id = newId(name);
  const placed = (await tryFileStore(ctx, id, name, buffer))
    || (await tryStratus(ctx, id, name, buffer, contentType))
    || { storage: 'memory' };
  const meta = Object.assign({
    artifactId: id,
    name,
    contentType,
    bytes: buffer.length,
    kind: String(o.kind || 'brief'),
    createdAt: new Date().toISOString()
  }, placed);
  // Memory copy always kept: it is what serves GET /reports/artifacts/:id
  // without a second round trip, and it is the last-resort read path.
  rememberInMemory(meta, buffer.toString('utf8'));
  await writeIndex(ctx, meta);
  return { ok: true, meta };
}

async function listArtifacts(ctx) {
  return readIndex(ctx);
}

async function getArtifact(ctx, id) {
  const key = String(id || '');
  const local = memory.get(key);
  if (local) return { ok: true, meta: local.meta, body: local.body, source: 'memory' };
  const index = await readIndex(ctx);
  const meta = index.find((m) => m.artifactId === key);
  if (!meta) return { ok: false, reason: 'not found' };
  if (meta.storage === 'filestore' && ctx.services.filestore && meta.fileId) {
    try {
      const buf = await ctx.services.filestore.download(meta.fileId);
      return { ok: true, meta, body: buf ? buf.toString('utf8') : '', source: 'filestore' };
    } catch (e) { /* fall through */ }
  }
  if (meta.storage === 'stratus' && ctx.services.artifactBucket && meta.key) {
    try {
      const text = await ctx.services.artifactBucket.get(meta.key);
      if (text !== null && text !== undefined) return { ok: true, meta, body: String(text), source: 'stratus' };
    } catch (e) { /* fall through */ }
  }
  return { ok: false, reason: 'artifact metadata found but body is unreachable', meta };
}

/** Test hook. */
function resetArtifacts() {
  memory.clear();
}

// ---------------------------------------------------------------------------
// SmartBrowz screenshot of the hotspot map for the Weekly Brief (row 157).
//
//   Real path : ctx.services.smartbrowz.screenshot(url, options) ->
//               smartbrowz().takeScreenshot(url, { page_options:{viewport},
//               screenshot_options:{type:'png'}, navigation_options:{wait_until} })
//               (3.4.0 utils/pojo/smartbrowz.d.ts ICatalystSmartbrowzScrShot),
//               stored in Stratus under briefs/map-<district>-<ts>.png.
//   Fallback  : the static map the client already ships
//               (client/public/media/command-dashboard.jpg), labelled as such.
// Options are top-level request-body keys, so ONLY documented ones are sent;
// a pre-signed URL needs a user context an anonymous call lacks, so a signing
// failure keeps the stored key and returns url:null.
// ---------------------------------------------------------------------------

const STATIC_MAP = 'media/command-dashboard.jpg';
const SNAPSHOT_VIEWPORT = { width: 1280, height: 800 };

async function readAll(stream) {
  if (Buffer.isBuffer(stream)) return stream;
  if (typeof stream === 'string') return Buffer.from(stream, 'binary');
  const chunks = [];
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

async function captureMapSnapshot(ctx, opts) {
  const o = opts || {};
  const districtId = String(o.districtId || '').trim();
  const base = (process.env.APP_BASE_URL || '').replace(/\/+$/, '');
  const target = `${base}/index.html#/map${districtId ? `?district=${encodeURIComponent(districtId)}` : ''}`;
  const fallback = {
    mode: 'static', districtId: districtId || null, targetUrl: target, imagePath: STATIC_MAP, key: null, url: null, bytes: null, source: 'fallback-local'
  };
  if (!ctx.flags.smartbrowz) return Object.assign(fallback, { note: 'FEATURE_SMARTBROWZ off' });
  if (!ctx.services.smartbrowz || !ctx.services.smartbrowz.screenshot) return Object.assign(fallback, { note: 'SmartBrowz handle unavailable in this runtime' });
  if (!base) return Object.assign(fallback, { note: 'APP_BASE_URL unset' });
  const t0 = Date.now();
  try {
    const options = o.noOptions ? undefined : {
      page_options: { viewport: SNAPSHOT_VIEWPORT },
      screenshot_options: { type: 'png', full_page: false },
      navigation_options: { wait_until: 'networkidle2' }
    };
    const png = await readAll(await ctx.services.smartbrowz.screenshot(target, options));
    if (!png || !png.length) throw new Error('empty screenshot');
    const key = `briefs/map-${districtId || 'state'}-${Date.now()}.png`;
    let stored = false;
    let url = null;
    if (ctx.services.artifactBucket && ctx.services.artifactBucket.putBinary) {
      try {
        await ctx.services.artifactBucket.putBinary(key, png, 'image/png');
        stored = true;
        try { url = await ctx.services.artifactBucket.signedUrl(key, 3600); } catch (e) { url = null; }
      } catch (e) {
        logJson('warn', 'map_snapshot_store_failed', { message: String((e && e.message) || e) });
      }
    }
    return {
      mode: 'screenshot', districtId: districtId || null, targetUrl: target, viewport: SNAPSHOT_VIEWPORT,
      key: stored ? key : null, url, bytes: png.length, renderMs: Date.now() - t0,
      imagePath: stored ? null : STATIC_MAP, source: 'catalyst-smartbrowz',
      note: stored ? null : 'screenshot rendered but Stratus put failed; static map used in the brief'
    };
  } catch (e) {
    return Object.assign(fallback, { renderMs: Date.now() - t0, note: `SmartBrowz screenshot failed (${String((e && e.message) || e).slice(0, 160)})` });
  }
}

module.exports = { putArtifact, listArtifacts, getArtifact, resetArtifacts, captureMapSnapshot, INDEX_KEY, MAX_BYTES, STATIC_MAP };
