'use strict';
// Face identification routes (Round 2, Phase 6) — see lib/faces.js for the
// three-step pipeline and the accountability rules they enforce.
//
//   POST /identify                       still image + filters + caseNo + legalBasis → ranked candidates
//   GET  /identify/gallery               paged synthetic gallery (SVG stand-in thumbs)
//   GET  /identify/thumb/:personKey.svg  stand-in thumbnail rendered from the stored Seed
//   GET  /identify/audit                 recent searches (sha256, filters, counts, decisions — no images)
//   POST /identify/audit/:id/decision    confirm / reject a candidate with a rationale
//   GET  /identify/rules                 the accountability rules, legal bases, floor and limits as data
//   GET  /identify/model-card            measured calibration on the synthetic set + limitations
//   POST /admin/faces/upload             (admin, deployed) put one gallery object into Stratus
//   POST /admin/faces/zia-probe          (admin, deployed) exercise analyseFace / compareFace on supplied images

const fs = require('fs');
const os = require('os');
const path = require('path');
const { ok, fail, asyncH, requireAdmin, nocache } = require('../envelope');
const faces = require('../faces');
const { whoami } = require('../auth');
const { withTimeout, AI_TIMEOUT_MS, toNum } = require('../util');

function deps(ctx, identity) {
  return { flags: ctx.flags, ziaClient: ctx.services.ziaClient, identity };
}

function register(router) {
  router.post('/identify', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const identity = await whoami(ctx, req);
    const out = await faces.identify(ctx, req, req.body || {}, deps(ctx, identity));
    if (!out.ok) return fail(res, out.status || 400, out.error.code, out.error.message);
    ok(res, out.data, out.meta);
  }));

  router.get('/identify/gallery', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const page = await faces.galleryPage(ctx, { page: req.query.page, perPage: req.query.perPage, personKey: req.query.personKey });
    ok(res, { items: page.items, disclaimer: 'Synthetic gallery — every face is procedurally generated; no photograph of a real person exists in DAPPA.' }, {
      total: page.total, page: page.page, perPage: page.perPage, source: page.source, synthetic: true, imageOfRecord: 'Stratus object keys under face-gallery/v1/ (bucket STRATUS_BUCKET); thumbnails here are SVG stand-ins rendered from the stored Seed'
    });
  }));

  router.get('/identify/thumb/:personKey.svg', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const key = String(req.params.personKey || '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) return fail(res, 400, 'BAD_ID', 'malformed personKey');
    const t = await faces.thumbSvg(ctx, key, req.query.size);
    if (!t.svg) return fail(res, 404, 'NOT_FOUND', 'no gallery image for this person');
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Face-Source', t.source);
    res.send(t.svg);
  }));

  router.get('/identify/audit', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const audit = await faces.listAudit(ctx, { limit: req.query.limit, personKey: req.query.personKey, decision: req.query.decision });
    ok(res, { items: audit.items, probeStored: false }, { total: audit.total, sources: audit.sources, floor: faces.floorFor() });
  }));

  router.post('/identify/audit/:id/decision', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const id = String(req.params.id || '');
    if (!/^fs-[A-Za-z0-9-]{4,40}$/.test(id)) return fail(res, 400, 'BAD_ID', 'malformed search id');
    const identity = await whoami(ctx, req);
    const out = await faces.recordDecision(ctx, req, id, req.body || {}, identity);
    if (!out.ok) return fail(res, out.code === 'NOT_FOUND' ? 404 : 400, out.code, out.reason);
    ok(res, { searchId: id, decision: out.entry, record: out.record }, { persisted: out.persisted, officer: faces.actorOf(identity) });
  }));

  router.get('/identify/rules', asyncH(async (req, res) => {
    const ctx = req.ctx;
    ok(res, {
      rules: faces.RULES,
      legalBases: faces.LEGAL_BASES,
      floor: faces.floorFor(),
      deadBand: faces.DEAD_BAND,
      limits: { maxShortlist: faces.MAX_SHORTLIST, maxProbeBytes: faces.MAX_PROBE_BYTES, ziaMaxCompares: ctx.flags.faceId ? faces.ziaMaxCompares() : 0, stillImagesOnly: true },
      filters: { riskBands: Object.keys(faces.RISK_BANDS), ageBands: Object.keys(faces.AGE_BANDS), genders: ['male', 'female'] },
      engines: { flag: 'FEATURE_FACE_ID', on: Boolean(ctx.flags.faceId), zia: Boolean(ctx.flags.faceId && ctx.services.ziaClient), fallback: 'local-descriptor' }
    }, { synthetic: true });
  }));

  router.get('/identify/model-card', asyncH(async (req, res) => {
    ok(res, faces.modelCard(), { synthetic: true, source: faces.calibration().available === false ? 'missing-calibration' : 'lib/face_calibration.json' });
  }));

  // --- deployed-only admin helpers -----------------------------------------

  router.post('/admin/faces/upload', asyncH(async (req, res) => {
    const ctx = req.ctx;
    if (!requireAdmin(req, res, ctx.flags)) return;
    const b = req.body || {};
    const key = String(b.objectKey || '').trim();
    if (!/^face-gallery\/[A-Za-z0-9_./-]{1,200}\.(png|jpg|jpeg|webp)$/.test(key)) return fail(res, 400, 'BAD_REQUEST', 'objectKey must live under face-gallery/ and end in .png/.jpg/.webp');
    const decoded = faces.decodeProbe(b.base64 || b.image);
    if (!decoded.ok) return fail(res, 400, decoded.code, decoded.reason);
    let capp = null;
    try { capp = require('zcatalyst-sdk-node').initialize(req); } catch (e) { capp = null; }
    if (!capp) return fail(res, 503, 'UNAVAILABLE', 'catalyst unavailable (deployed only)');
    const bucketName = process.env.STRATUS_BUCKET || 'dappa-import';
    const bucket = capp.stratus().bucket(bucketName);
    const out = await withTimeout(bucket.putObject(key, decoded.buf, { contentType: String(b.contentType || decoded.mime), overwrite: true }), 15000, 'stratus putObject');
    ok(res, { bucket: bucketName, objectKey: key, bytes: decoded.buf.length, contentType: decoded.mime, result: out === undefined ? true : out });
  }));

  router.post('/admin/faces/zia-probe', asyncH(async (req, res) => {
    const ctx = req.ctx;
    if (!requireAdmin(req, res, ctx.flags)) return;
    const b = req.body || {};
    const analyse = Array.isArray(b.analyse) ? b.analyse.slice(0, 4) : [];
    const pairs = Array.isArray(b.pairs) ? b.pairs.slice(0, 4) : [];
    if (!analyse.length && !pairs.length) return fail(res, 400, 'BAD_REQUEST', 'analyse[] (≤4 images) and/or pairs[] (≤4 {a,b}) required');
    const zia = ctx.services.ziaClient;
    if (!zia) return fail(res, 503, 'UNAVAILABLE', 'Zia client unavailable (deployed only)');
    const tmp = (buf, mime, tag) => {
      const p = path.join(os.tmpdir(), `dappa-ziaprobe-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png'}`);
      fs.writeFileSync(p, buf);
      return p;
    };
    const rm = (p) => { try { fs.unlinkSync(p); } catch (e) { /* best effort */ } };
    const results = { analyseFace: [], compareFace: [], flag: Boolean(ctx.flags.faceId), timeoutMs: AI_TIMEOUT_MS };
    for (const [i, img] of analyse.entries()) {
      const d = faces.decodeProbe(typeof img === 'string' ? img : img && img.image);
      const label = (img && img.label) || `analyse-${i}`;
      if (!d.ok) { results.analyseFace.push({ label, error: d.reason }); continue; }
      const p = tmp(d.buf, d.mime, 'a');
      const t0 = Date.now();
      const s = faces.openStream(p);
      try {
        // eslint-disable-next-line no-await-in-loop
        const resp = await withTimeout(zia.analyseFace(s, { mode: String(b.mode || 'moderate') }), Math.max(AI_TIMEOUT_MS, 8000), 'zia analyseFace');
        results.analyseFace.push({ label, bytes: d.buf.length, mime: d.mime, ms: Date.now() - t0, response: resp });
      } catch (e) {
        results.analyseFace.push({ label, bytes: d.buf.length, mime: d.mime, ms: Date.now() - t0, error: String((e && e.message) || e), code: e && e.code, status: e && (e.statusCode || e.status), body: e && e.response && e.response.data ? e.response.data : undefined });
      } finally {
        faces.closeStream(s);
        rm(p);
      }
    }
    for (const [i, pair] of pairs.entries()) {
      const a = faces.decodeProbe(pair && pair.a);
      const c = faces.decodeProbe(pair && pair.b);
      const label = (pair && pair.label) || `pair-${i}`;
      if (!a.ok || !c.ok) { results.compareFace.push({ label, error: (a.ok ? '' : `a: ${a.reason}`) + (c.ok ? '' : ` b: ${c.reason}`) }); continue; }
      const pa = tmp(a.buf, a.mime, 'src');
      const pb = tmp(c.buf, c.mime, 'qry');
      const t0 = Date.now();
      const sa = faces.openStream(pa);
      const sb = faces.openStream(pb);
      try {
        // eslint-disable-next-line no-await-in-loop
        const resp = await withTimeout(zia.compareFace(sa, sb), Math.max(AI_TIMEOUT_MS, 8000), 'zia compareFace');
        results.compareFace.push({ label, bytesA: a.buf.length, bytesB: c.buf.length, ms: Date.now() - t0, response: resp, matchedType: resp && resp.matched !== undefined ? typeof resp.matched : null });
      } catch (e) {
        results.compareFace.push({ label, bytesA: a.buf.length, bytesB: c.buf.length, ms: Date.now() - t0, error: String((e && e.message) || e), code: e && e.code, status: e && (e.statusCode || e.status), body: e && e.response && e.response.data ? e.response.data : undefined });
      } finally {
        faces.closeStream(sa);
        faces.closeStream(sb);
        rm(pa);
        rm(pb);
      }
    }
    ok(res, results, { calls: analyse.length + pairs.length, note: 'each analyse / pair is one billed Zia call from the pooled 100/month free tier' });
  }));

  // Coverage helper for the UI's Zia quota meter: how many Zia calls one search would spend.
  router.get('/identify/cost', asyncH(async (req, res) => {
    const ctx = req.ctx;
    const limit = Math.max(1, Math.min(faces.MAX_SHORTLIST, toNum(req.query.limit, faces.MAX_SHORTLIST) || faces.MAX_SHORTLIST));
    const zia = ctx.flags.faceId ? Math.min(limit, faces.ziaMaxCompares()) + 1 : 0;
    ok(res, { shortlist: limit, ziaCalls: zia, breakdown: ctx.flags.faceId ? { analyseFace: 1, compareFace: Math.min(limit, faces.ziaMaxCompares()) } : { analyseFace: 0, compareFace: 0 }, localCompares: limit, pooledFreeTier: 100 }, { flag: Boolean(ctx.flags.faceId), nocache: nocache(req) });
  }));
}

module.exports = { register };
