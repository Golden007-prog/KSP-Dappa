// Round 2, Phase 6 — face identification contract suite.
// Runs against the harness's stub-backed app (flags off → local engine,
// advisory gate) and boots its own apps for the flag-on path with a fake Zia
// client, a fake gallery bucket and a fake ActionLog writer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const faces = require('../../lib/faces.js');
const { decodePng, imageSize, sniffMime } = require('../../lib/png.js');
const spec = require('../../lib/faces_spec.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const png = (name) => fs.readFileSync(path.join(here, 'fixtures', name));
const b64 = (name) => png(name).toString('base64');

// Rule R6 already binds every search to a case number, and the two-signal rule
// now reads THAT record for its corroboration (faces.js "Step 2b"), so the
// suite binds to a real fixture FIR: CaseMaster row 20 is registered in
// Bengaluru City (0101) with a two-wheeler / gold-mangalsutra / knife
// narrative. The year moves with the fixture clock, so it is read, not typed.
let CASE = { caseNo: '202600020', legalBasis: 'investigation-fir' };
let FIR_CRIME_NO = null;

async function withApp(h, options, fn) {
  const app = h.createApp(Object.assign({ clientFactory: () => h.createStubClient(h.buildFixtureTables()) }, options));
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const get = async (p) => { const r = await fetch(base + p); let j = null; try { j = await r.json(); } catch { /* ignore */ } return { status: r.status, json: j }; };
  const post = async (p, body, headers) => {
    const r = await fetch(base + p, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}), body: JSON.stringify(body || {}) });
    let j = null; try { j = await r.json(); } catch { /* ignore */ }
    return { status: r.status, json: j };
  };
  try { await fn({ get, post, base }); } finally { server.close(); }
}

export async function run(h) {
  const { check, hasKeys } = h;

  const fir = (h.tables.CaseMaster || []).find((c) => Number(c.CaseMasterID) === 20);
  CASE = { caseNo: fir ? String(fir.CaseNo) : '202600020', legalBasis: 'investigation-fir' };
  FIR_CRIME_NO = fir ? String(fir.CrimeNo) : null;
  // A ds that answers equality WHEREs out of the fixture tables, for the pure
  // resolveCase() checks below (no HTTP, no app).
  const fixtureCtx = {
    ds: {
      query: async (q) => (h.tables[q.table] || [])
        .filter((r) => (q.where || []).every((w) => String(r[w.col]) === String(w.val)))
        .slice(0, (q.limit && q.limit.count) || 50)
        .map((r) => Object.assign({}, r))
    }
  };

  // --- pure engine -----------------------------------------------------------
  {
    const probe = png('probe_P001_160.png');
    check('png decoder reads a generated probe', (() => { const p = decodePng(probe); return p && p.width === 160 && p.height === 160 && p.rgb.length === 160 * 160 * 3; })());
    check('image sniffing + dimensions', sniffMime(probe) === 'image/png' && imageSize(probe).width === 160);
    const d = faces.pixelDescriptor(decodePng(probe));
    check('pixel descriptor measures skin, hair and aspect', d && Array.isArray(d.skin) && d.skin.length === 3 && Number.isFinite(d.aspect) && d.measured.length === 4, JSON.stringify(d));
    check('a flat image yields no descriptor (nothing to measure)', faces.pixelDescriptor(decodePng(png('flat_160.png'))) === null);
    const s1 = faces.specDescriptor('v1:2026:P001');
    check('spec descriptor matches the generator (P001 skin tone)', s1.skin.join(',') === '255,224,196' && s1.hairMass === 0);
    const same = faces.similarity(s1, s1);
    check('same spec scores 1.0 on all twelve dimensions', same.confidence === 1 && same.dims === 12);
    const other = faces.similarity(s1, faces.specDescriptor('v1:2026:P004'));
    check('a different spec scores below the floor', other.confidence !== null && other.confidence < 0.7, String(other.confidence));
    const mixed = faces.similarity(d, s1);
    check('pixel vs spec compares only shared dimensions (6)', mixed.dims === 6 && mixed.confidence !== null, JSON.stringify(mixed));
    check('similarity refuses an empty side', faces.similarity(null, s1).confidence === null);
    check('floor default 0.7 and bands', faces.floorFor() === 0.7 && faces.bandFor(0.75, 0.7) === 'lead' && faces.bandFor(0.65, 0.7) === 'borderline' && faces.bandFor(0.5, 0.7) === 'below' && faces.bandFor(null, 0.7) === 'unscored');
    const dec = faces.decodeProbe(`data:image/png;base64,${b64('flat_160.png')}`);
    check('decodeProbe accepts a data URI and hashes it', dec.ok && dec.mime === 'image/png' && /^[a-f0-9]{64}$/.test(dec.sha256));
    check('decodeProbe rejects a video data URI (still images only, R9)', faces.decodeProbe('data:video/mp4;base64,AAAA').code === 'STILL_IMAGE_ONLY');
    check('decodeProbe rejects garbage', faces.decodeProbe(Buffer.from('not an image at all, really').toString('base64')).code === 'BAD_IMAGE');
    const big = Buffer.alloc(faces.MAX_PROBE_BYTES + 16, 1).toString('base64');
    check('decodeProbe rejects > 4 MB', faces.decodeProbe(big).code === 'PAYLOAD_TOO_LARGE');
    check('rules and legal bases are data', faces.RULES.length === 9 && faces.RULES.every((r) => r.id && r.title && r.statement && r.enforcedBy) && faces.LEGAL_BASES.length === 5);
    const r3 = faces.RULES.find((r) => r.id === 'R3');
    check('R3 says what the API really does with limit > 25 — refused, not silently clamped', /BAD_REQUEST for limit > 25/.test(r3.enforcedBy) && !/clamped to 25/.test(r3.enforcedBy), r3.enforcedBy);
    check('MO tags match on whole tokens: two-wheeler corroborates "two-wheeler without plate", gold-chain does not corroborate a gold mangalsutra',
      faces.tagOverlap('two-wheeler', 'vehicle:two-wheeler-without-plate') === true
      && faces.tagOverlap('otp-fraud', 'approach:otp') === true
      && faces.tagOverlap('gold-chain', 'item:gold-mangalsutra') === false
      && faces.normTag('Two Wheeler') === 'two-wheeler');
    const rc = await faces.resolveCase(fixtureCtx, CASE.caseNo, null);
    check('resolveCase reads the FIR behind the case number — district and MO words come from the record, not from the officer\'s filter',
      rc.resolved === true && rc.crimeNo === FIR_CRIME_NO && rc.districtId === '0101'
      && rc.moTags.includes('two-wheeler-without-plate') && rc.moTags.includes('gold-mangalsutra'), JSON.stringify(rc));
    const rcMissing = await faces.resolveCase(fixtureCtx, '999900001', null);
    check('an unknown case number resolves to nothing rather than to a guess', rcMissing.resolved === false && rcMissing.reason === 'not-found' && rcMissing.matches === 0);
    const twoRows = [{ CaseMasterID: 1, CrimeNo: 'a', CaseNo: 'x', PoliceStationID: '1011' }, { CaseMasterID: 2, CrimeNo: 'b', CaseNo: 'x', PoliceStationID: '1031' }];
    const rcAmbiguous = await faces.resolveCase({ ds: { query: async () => twoRows } }, '202600020', null);
    check('a case number matching several registrations is reported ambiguous, never averaged into one district', rcAmbiguous.resolved === false && rcAmbiguous.reason === 'ambiguous' && rcAmbiguous.matches === 2, JSON.stringify(rcAmbiguous));
    const rcDown = await faces.resolveCase({ ds: { query: async () => { throw new Error('ZCQL down'); } } }, '202600020', null);
    check('an unreachable case register degrades to "could not check", not to a false negative', rcDown.resolved === false && rcDown.reason === 'lookup-failed');
    const cf = faces.cleanFilters({ districtId: '101', moTag: 'Two-Wheeler', riskBand: 'high', yearFrom: 2019, yearTo: 2026 });
    check('filters normalise (district padded, tag lower-cased)', cf.any && cf.filters.districtId === '0101' && cf.filters.moTag === 'two-wheeler' && cf.errors.length === 0, JSON.stringify(cf));
    check('filters reject a bad band', faces.cleanFilters({ riskBand: 'extreme' }).errors.length === 1);
    const card = faces.modelCard();
    check('model card carries measured calibration', card.calibration && card.calibration.faces >= 40 && card.calibration.paths.length === 3
      && typeof card.calibration.paths[0].atFloor.falseAccept === 'number' && card.calibration.rankTest['pixel/pixel'].top1 > 0.5, JSON.stringify(card.calibration && card.calibration.paths && card.calibration.paths[0] && card.calibration.paths[0].atFloor));
    check('model card says a match is a lead, not identity', card.statements.some((s) => /investigative lead, not evidence of identity/.test(s)) && card.statements.some((s) => /demographic/.test(s)));
    // The 28 Aug live probe is a measured model output and belongs on the card
    // (docs/benchmarks/face_zia_probe.json). ModelCardView renders this block.
    const zo = card.ziaObserved;
    check('model card carries what Zia actually returned: the failed detection and both comparison pairs with the floor between them',
      zo && zo.measuredAt === '2026-08-28' && zo.calls === 3
      && zo.analyseFace.ok === false && zo.analyseFace.status === 400
      && Array.isArray(zo.compareFace) && zo.compareFace.length === 2
      && zo.compareFace[0].confidence === 0.8407 && zo.compareFace[0].confidence >= faces.floorFor()
      && zo.compareFace[1].confidence === 0.6171 && zo.compareFace[1].confidence < faces.floorFor()
      && zo.compareFace[1].matched === 'true' && /1 of 5/.test(zo.availability), JSON.stringify(zo));
    check('SVG stand-in renders from a seed', /^<svg /.test(spec.renderSvg(spec.specFromSeed('v1:2026:P001'), 96)));
  }

  // --- flag OFF (default harness app): local engine, advisory gate ---------
  {
    const probe = b64('probe_P001_160.png');
    const r = await h.post('/identify', Object.assign({ image: probe, filters: { districtId: '0101' } }, CASE));
    check('POST /identify -> 200', r.status === 200 && r.json.ok === true, JSON.stringify(r.json).slice(0, 300));
    const d = (r.json && r.json.data) || {};
    check('identify shape', hasKeys(d, ['searchId', 'decision', 'gate', 'floor', 'deadBand', 'candidates', 'shortlist', 'probe', 'noReliableMatch']));
    check('gate is advisory with the flag off and says so', d.gate.mode === 'advisory' && d.gate.passed === true && /FEATURE_FACE_ID off/.test(d.gate.note));
    check('shortlist is bounded and described', d.shortlist.count === 2 && d.shortlist.cap === 25 && d.shortlist.description === '2 candidates from Bengaluru City', JSON.stringify(d.shortlist));
    check('candidates ranked, each with a confidence and engine', d.candidates.length === 2 && d.candidates[0].rank === 1
      && d.candidates.every((c) => typeof c.confidence === 'number' && c.engine === 'local-descriptor' && Array.isArray(c.reasonCodes) && hasKeys(c.corroboration, ['districtHit', 'moHit', 'twoSignals']) && typeof c.matched === 'boolean'));
    check('the true person (P001 probe) ranks first above the floor', d.candidates[0].personKey === 'P001' && d.candidates[0].confidence >= 0.7 && d.candidates[0].band === 'lead' && d.decision === 'candidates', JSON.stringify(d.candidates.map((c) => [c.personKey, c.confidence])));
    check('pixel/pixel path used (gallery QualityJson.pixel)', d.candidates[0].reasonCodes.includes('gallery-pixel') && d.probe.descriptor === 'pixel-descriptor');
    // The second signal must come from evidence the shortlist did NOT consume.
    // Here the officer filtered on district 0101 and the FIR is registered in
    // 0101, so the district hit is true but flagged as their own filter and
    // does not count; the MO words shared with the FIR narrative are what earn
    // the "independent" verdict.
    const corr0 = d.candidates[0].corroboration;
    check('two-signal rule is read off the FIR, and a hit that only restates the officer\'s filter is flagged, not counted',
      corr0.basis === 'case-record'
      && corr0.districtHit === true && corr0.fromFilter.district === true
      && corr0.moHit === true && corr0.fromFilter.mo === false && corr0.moMatches.includes('two-wheeler')
      && corr0.independent === true && corr0.twoSignals === true
      && d.candidates[0].reasonCodes.includes('district-hit-from-filter') && d.candidates[0].reasonCodes.includes('mo-hit') && d.candidates[0].reasonCodes.includes('two-signals'),
      JSON.stringify(corr0));
    check('the corroboration varies per candidate instead of being constant across the shortlist',
      d.candidates[1].corroboration.moHit === false && d.candidates[1].corroboration.independent === false
      && d.candidates[0].corroboration.moHit === true,
      JSON.stringify(d.candidates.map((c) => [c.personKey, c.corroboration.districtHit, c.corroboration.moHit])));
    check('the response names the record the second signal was checked against',
      d.case && d.case.resolved === true && d.case.crimeNo === FIR_CRIME_NO && d.case.districtName === 'Bengaluru City' && d.case.moTags.length >= 2, JSON.stringify(d.case));
    check('the wrong person is below the floor', d.candidates[1].personKey === 'P002' && d.candidates[1].band === 'below' && d.candidates[1].matched === false);
    check('meta names the real engine and the synthetic gallery', r.json.meta.engine === 'local-descriptor' && r.json.meta.synthetic === true && r.json.meta.accountability.probeStored === false && r.json.meta.floor === 0.7);
    check('no probe image in the response', !JSON.stringify(r.json).includes(probe.slice(0, 40)));
    check('no caste/religion anywhere', !/caste|religion/i.test(JSON.stringify(r.json)));

    // Mirror image of the check above: with only the MO filter set, the MO hit
    // is the officer's own filter and the FIR's district is what corroborates.
    const moOnly = await h.post('/identify', Object.assign({ image: probe, filters: { moTag: 'two-wheeler' } }, CASE));
    const corrMo = moOnly.json.data.candidates[0].corroboration;
    check('which signal counts follows what the filter consumed, not which chip is prettier',
      corrMo.moHit === true && corrMo.fromFilter.mo === true
      && corrMo.districtHit === true && corrMo.fromFilter.district === false
      && corrMo.independent === true && corrMo.twoSignals === true, JSON.stringify(corrMo));

    // The UI never sends probeSeed (D-phase6-16): a sample capture is scored
    // from its pixels like any upload. Same bytes, both paths, one check.
    const sample = await h.post('/identify', Object.assign({ image: probe, samplePerson: 'P001', filters: { districtId: '0101' } }, CASE));
    const seedRun = await h.post('/identify', Object.assign({ image: probe, probeSeed: 'v1:2026:P001', filters: { districtId: '0101', moTag: 'two-wheeler' } }, CASE));
    check('a sample capture is measured from its pixels — it does NOT score 1.0 by construction',
      sample.status === 200 && sample.json.data.probe.source === 'sample-capture' && sample.json.data.probe.samplePerson === 'P001'
      && sample.json.data.probe.descriptor === 'pixel-descriptor' && sample.json.data.probe.exactParameterMatch === false
      && sample.json.data.candidates[0].personKey === 'P001' && sample.json.data.candidates[0].confidence < 1 && sample.json.data.candidates[0].confidence >= 0.7,
      JSON.stringify(sample.json.data && [sample.json.data.probe, sample.json.data.candidates.map((c) => [c.personKey, c.confidence])]));
    check('the same bytes score exactly 1.0 only on the debug probeSeed path, and that answer is labelled an exact parameter match rather than a similarity',
      seedRun.status === 200 && seedRun.json.data.candidates[0].confidence === 1
      && seedRun.json.data.probe.exactParameterMatch === true
      && seedRun.json.data.candidates[0].reasonCodes.includes('spec-descriptor')
      && seedRun.json.data.candidates[0].reasonCodes.includes('exact-parameter-match')
      && seedRun.json.data.candidates[0].reasonCodes.includes('mo-hit-from-filter'),
      JSON.stringify(seedRun.json.data && seedRun.json.data.candidates));
    check('MO filter narrows and the description says so', seedRun.json.data.shortlist.description === '1 candidate from Bengaluru City, two-wheeler cases', seedRun.json.data.shortlist.description);

    const noFir = await h.post('/identify', { image: probe, filters: { districtId: '0101' }, caseNo: '999900001', legalBasis: 'investigation-fir' });
    check('a case number that is not in the register claims no second signal at all — the chips say "not checked", never ✕',
      noFir.status === 200 && noFir.json.data.case.resolved === false && noFir.json.data.case.reason === 'not-found'
      && noFir.json.data.candidates.length > 0
      && noFir.json.data.candidates.every((c) => c.corroboration.basis === 'unresolved' && c.corroboration.districtHit === null && c.corroboration.moHit === null && c.corroboration.independent === false && c.corroboration.twoSignals === false && c.reasonCodes.includes('corroboration-not-found')),
      JSON.stringify(noFir.json.data && noFir.json.data.candidates.map((c) => c.corroboration)));

    const wrong = await h.post('/identify', Object.assign({ image: b64('probe_P004_160.png'), filters: { districtId: '0101' } }, CASE));
    check('a different person\'s probe is "no reliable match", never a weak best guess', wrong.status === 200 && wrong.json.data.decision === 'no-reliable-match' && wrong.json.data.noReliableMatch && typeof wrong.json.data.noReliableMatch.topConfidence === 'number' && wrong.json.data.candidates.every((c) => c.matched === false), JSON.stringify(wrong.json.data && wrong.json.data.candidates.map((c) => [c.personKey, c.confidence, c.band])));

    const inactive = await h.post('/identify', Object.assign({ image: probe, filters: { districtId: '0107' } }, CASE));
    check('an inactive gallery row is skipped and reported', inactive.status === 200 && inactive.json.data.shortlist.withoutGallery === 1 && inactive.json.data.candidates.length === 0 && inactive.json.data.decision === 'no-reliable-match');

    const risk = await h.post('/identify', Object.assign({ image: probe, filters: { riskBand: 'high' } }, CASE));
    check('risk-band filter narrows to the high-risk profile', risk.status === 200 && risk.json.data.shortlist.count === 1 && risk.json.data.candidates[0].personKey === 'P001');
    const years = await h.post('/identify', Object.assign({ image: probe, filters: { yearFrom: 2025, yearTo: 2026, gender: 'male' } }, CASE));
    check('year + gender filters resolve through Accused rows', years.status === 200 && years.json.data.shortlist.applied.gender === 'male' && years.json.data.shortlist.count >= 1, JSON.stringify(years.json.data && years.json.data.shortlist));
    const limited = await h.post('/identify', Object.assign({ image: probe, filters: { districtId: '0101' }, limit: 1 }, CASE));
    check('limit caps the shortlist', limited.json.data.shortlist.count === 1 && limited.json.data.candidates.length === 1);

    // --- validation (400s) ---------------------------------------------------
    const noImg = await h.post('/identify', Object.assign({ filters: { districtId: '0101' } }, CASE));
    check('missing image -> 400 IMAGE_REQUIRED', noImg.status === 400 && noImg.json.error.code === 'IMAGE_REQUIRED');
    const bad = await h.post('/identify', Object.assign({ image: 'bm90IGFuIGltYWdl', filters: { districtId: '0101' } }, CASE));
    check('bad image -> 400 BAD_IMAGE', bad.status === 400 && bad.json.error.code === 'BAD_IMAGE');
    const huge = await h.post('/identify', Object.assign({ image: Buffer.alloc(faces.MAX_PROBE_BYTES + 64, 7).toString('base64'), filters: { districtId: '0101' } }, CASE));
    check('> 4 MB image -> 400 PAYLOAD_TOO_LARGE (through the 6 MB JSON limit)', huge.status === 400 && huge.json.error.code === 'PAYLOAD_TOO_LARGE', `${huge.status} ${JSON.stringify(huge.json && huge.json.error)}`);
    const video = await h.post('/identify', Object.assign({ image: 'data:video/mp4;base64,AAAA', filters: { districtId: '0101' } }, CASE));
    check('video input -> 400 STILL_IMAGE_ONLY (R9)', video.status === 400 && video.json.error.code === 'STILL_IMAGE_ONLY');
    const noCase = await h.post('/identify', { image: probe, filters: { districtId: '0101' }, legalBasis: 'investigation-fir' });
    check('missing caseNo -> 400 CASE_REQUIRED (R6)', noCase.status === 400 && noCase.json.error.code === 'CASE_REQUIRED');
    const noBasis = await h.post('/identify', { image: probe, filters: { districtId: '0101' }, caseNo: '202600017' });
    check('missing legalBasis -> 400 LEGAL_BASIS_REQUIRED (R6)', noBasis.status === 400 && noBasis.json.error.code === 'LEGAL_BASIS_REQUIRED');
    const badBasis = await h.post('/identify', { image: probe, filters: { districtId: '0101' }, caseNo: '202600017', legalBasis: 'because' });
    check('unknown legalBasis -> 400', badBasis.status === 400 && badBasis.json.error.code === 'BAD_REQUEST');
    const sweep = await h.post('/identify', Object.assign({ image: probe, filters: {} }, CASE));
    check('no filter -> 400 FILTER_REQUIRED (R3, never a gallery sweep)', sweep.status === 400 && sweep.json.error.code === 'FILTER_REQUIRED');
    const over = await h.post('/identify', Object.assign({ image: probe, filters: { districtId: '0101' }, limit: 26 }, CASE));
    check('limit > 25 -> 400 BAD_REQUEST (refused, exactly as R3 now says — not silently clamped)', over.status === 400 && over.json.error.code === 'BAD_REQUEST' && /between 1 and 25/.test(over.json.error.message), JSON.stringify(over.json.error));
    const badFilter = await h.post('/identify', Object.assign({ image: probe, filters: { riskBand: 'extreme' } }, CASE));
    check('bad filter value -> 400', badFilter.status === 400 && /riskBand/.test(badFilter.json.error.message));

    // --- audit + decision ----------------------------------------------------
    const audit = await h.get('/identify/audit');
    check('GET /identify/audit -> 200', audit.status === 200 && audit.json.ok === true);
    const items = audit.json.data.items;
    check('audit lists this session\'s searches newest first with no images', items.length >= 7 && items[0].searchId && items.every((it) => hasKeys(it, ['searchId', 'ts', 'probeSha256', 'caseNo', 'legalBasis', 'officer', 'filters', 'candidates', 'topConfidence', 'decision'])) && audit.json.data.probeStored === false && !JSON.stringify(audit.json).includes('base64'), String(items.length));
    check('audit merges the fixture ActionLog rows (demo searches with a confirm decision)', items.some((it) => it.searchId === 'fs-demo01-a3f2c9d1' && ['datastore', 'fixture'].includes(it.source) && it.decisions.some((x) => x.decision === 'confirm' && x.personKey === 'P001')), JSON.stringify(items.filter((it) => /demo/.test(it.searchId)).map((it) => [it.searchId, it.source, it.decisions.length])));
    check('audit records the officer identity (anonymous in public demo)', items[0].officer.actor === 'anonymous (public demo)' && items[0].officer.role === 'viewer');
    const before = items.length;
    const sid = d.searchId;
    const noRationale = await h.post(`/identify/audit/${sid}/decision`, { personKey: 'P001', decision: 'confirm', rationale: 'short' });
    check('decision without a rationale -> 400 RATIONALE_REQUIRED (R2)', noRationale.status === 400 && noRationale.json.error.code === 'RATIONALE_REQUIRED');
    const badDecision = await h.post(`/identify/audit/${sid}/decision`, { personKey: 'P001', decision: 'maybe', rationale: 'a long enough rationale here' });
    check('decision must be confirm or reject', badDecision.status === 400);
    const unknown = await h.post('/identify/audit/fs-nope-00000000/decision', { personKey: 'P001', decision: 'confirm', rationale: 'a long enough rationale here' });
    check('decision on an unknown search -> 404', unknown.status === 404);
    const confirm = await h.post(`/identify/audit/${sid}/decision`, { personKey: 'P001', decision: 'confirm', rationale: 'Scar on the left cheek and the two-wheeler MO agree with the FIR', confidence: d.candidates[0].confidence, engine: 'local-descriptor' });
    check('confirm records the decision with actor + rationale', confirm.status === 200 && confirm.json.data.decision.decision === 'confirm' && confirm.json.data.decision.actor === 'anonymous (public demo)' && confirm.json.data.record.decisions.length === 1, JSON.stringify(confirm.json).slice(0, 300));
    check('decision meta reports where it was persisted (phase-7 action log or own row)', confirm.json.meta && confirm.json.meta.persisted && ['lib/actionlog.js', 'sdk', null].includes(confirm.json.meta.persisted.via), JSON.stringify(confirm.json.meta && confirm.json.meta.persisted));
    const after = await h.get('/identify/audit');
    check('audit grows and carries the decision', after.json.data.items.length === before && after.json.data.items.find((it) => it.searchId === sid).decisions.length === 1);
    const confirmed = await h.get('/identify/audit?decision=confirm');
    check('audit filters to confirmed searches', confirmed.json.data.items.length >= 2 && confirmed.json.data.items.every((it) => it.decisions.some((x) => x.decision === 'confirm')));
    const byPerson = await h.get('/identify/audit?personKey=P001');
    check('audit filters by person', byPerson.json.data.items.length >= 2 && byPerson.json.data.items.every((it) => it.topPersonKey === 'P001' || (it.shortlistKeys || []).includes('P001') || it.decisions.some((x) => x.personKey === 'P001')));
    // Offender 360 shows "searches that shortlisted this person": that has to
    // survive the container, so the key list lives in the ActionLog Payload
    // and is read back by parseAuditRow — not only the top-ranked person.
    const shortlisted = await h.get('/identify/audit?personKey=P002');
    check('the audit finds a search that SHORTLISTED a person and not only the one it ranked first (shortlistKeys round-trip through the ActionLog payload)',
      shortlisted.json.data.items.some((it) => it.searchId === 'fs-demo01-a3f2c9d1' && ['datastore', 'fixture'].includes(it.source) && (it.shortlistKeys || []).includes('P002') && it.topPersonKey !== 'P002'),
      JSON.stringify(shortlisted.json.data.items.map((it) => [it.searchId, it.source, it.topPersonKey, it.shortlistKeys])));
    const sampleAudited = await h.get('/identify/audit?limit=100');
    check('the audit records that a probe was a built-in sample capture, not a case photo',
      sampleAudited.json.data.items.some((it) => it.probeSource === 'sample-capture' && it.samplePerson === 'P001'),
      JSON.stringify(sampleAudited.json.data.items.slice(0, 3).map((it) => [it.searchId, it.probeSource, it.samplePerson])));

    // --- gallery, thumbs, rules, model card, cost ----------------------------
    const gal = await h.get('/identify/gallery?perPage=4');
    check('GET /identify/gallery -> paged with the synthetic disclaimer', gal.status === 200 && gal.json.data.items.length === 4 && gal.json.meta.total === 6 && gal.json.meta.synthetic === true && /Synthetic gallery/.test(gal.json.data.disclaimer)
      && gal.json.data.items.every((it) => hasKeys(it, ['personKey', 'name', 'thumbUrl', 'seed', 'quality', 'active', 'traits'])), JSON.stringify(gal.json).slice(0, 300));
    const gal2 = await h.get('/identify/gallery?perPage=4&page=2');
    check('gallery page 2', gal2.json.data.items.length === 2 && gal2.json.data.items.some((it) => it.personKey === 'P006' && it.active === false));
    const thumb = await h.getRaw('/identify/thumb/P001.svg');
    check('thumb is an SVG stand-in rendered from the seed', thumb.status === 200 && /image\/svg\+xml/.test(thumb.contentType) && /^<svg /.test(thumb.text));
    const noThumb = await h.getRaw('/identify/thumb/NOPE.svg');
    check('thumb 404s an unknown person', noThumb.status === 404);
    const badThumb = await h.getRaw('/identify/thumb/not%20a%20key.svg');
    check('thumb rejects a malformed key', badThumb.status === 400);
    const rules = await h.get('/identify/rules');
    check('GET /identify/rules returns the rules as data', rules.status === 200 && rules.json.data.rules.length === 9 && rules.json.data.legalBases.length === 5 && rules.json.data.floor === 0.7 && rules.json.data.limits.maxShortlist === 25 && rules.json.data.limits.stillImagesOnly === true && rules.json.data.engines.on === false);
    const card = await h.get('/identify/model-card');
    check('GET /identify/model-card serves the calibration', card.status === 200 && card.json.data.calibration.faces === 200 && card.json.data.calibration.paths.length === 3 && card.json.data.limitations.length >= 3);
    const cost = await h.get('/identify/cost?limit=10');
    check('GET /identify/cost with the flag off spends no Zia calls', cost.status === 200 && cost.json.data.ziaCalls === 0 && cost.json.data.localCompares === 10);
    const admin = await h.post('/admin/faces/upload', { objectKey: 'face-gallery/v1/P001.png', base64: probe });
    check('admin upload needs the admin token', admin.status === 403);
    const adminLocal = await h.post('/admin/faces/upload', { objectKey: 'face-gallery/v1/P001.png', base64: probe }, { 'x-admin-token': 'demo-admin' });
    check('admin upload is deployed-only (503 locally)', adminLocal.status === 503);
    const adminBadKey = await h.post('/admin/faces/upload', { objectKey: '../etc/passwd', base64: probe }, { 'x-admin-token': 'demo-admin' });
    check('admin upload refuses a key outside face-gallery/', adminBadKey.status === 400);
    const probeAdmin = await h.post('/admin/faces/zia-probe', { analyse: [probe] }, { 'x-admin-token': 'demo-admin' });
    check('zia-probe reports the missing Zia client locally', probeAdmin.status === 503);
  }

  // --- flag ON with a fake Zia client: gate + compare through Zia, cached --
  {
    const calls = { analyse: 0, compare: 0 };
    const ziaClient = {
      analyseFace: async () => { calls.analyse += 1; return { faces_count: 1, faces: [{ id: 'f1', confidence: 0.98, co_ordinates: [40, 30, 130, 140], landmarks: { left_eye: [60, 70], right_eye: [110, 70], nose: [85, 95], mouth_left: [65, 120], mouth_right: [105, 120] } }] }; },
      compareFace: async (src, qry) => {
        calls.compare += 1;
        // The stream name carries the gallery tmp path; P001 is the "same" person.
        const p = String(src && src.path || '');
        return { confidence: 0.9464, matched: 'true', tmp: p.length > 0 };
      }
    };
    const galleryHits = [];
    const faceBucket = { get: async (key) => { galleryHits.push(key); return png('probe_P001_160.png'); } };
    const inserted = [];
    const actionWriter = { insert: async (row) => { inserted.push(row); return { ROWID: 123456 }; } };
    process.env.FEATURE_FACE_ID = 'on';
    process.env.FACE_ZIA_MAX_COMPARES = '1';
    try {
      await withApp(h, { servicesFactory: () => ({ ziaClient, faceBucket, actionWriter }) }, async (a) => {
        const probe = b64('probe_P001_160.png');
        const r = await a.post('/identify', Object.assign({ image: probe, filters: { districtId: '0101' } }, CASE));
        check('flag on: POST /identify -> 200', r.status === 200 && r.json.ok === true, JSON.stringify(r.json).slice(0, 300));
        const d = r.json.data;
        check('flag on: gate ran through Zia Face Analytics with box + landmarks + pose', d.gate.mode === 'zia' && d.gate.passed === true && d.gate.facesCount === 1 && d.gate.confidence === 0.98 && Array.isArray(d.gate.box) && d.gate.landmarks && typeof d.gate.pose === 'number', JSON.stringify(d.gate));
        check('flag on: exactly one analyseFace call', calls.analyse === 1);
        check('flag on: top candidate compared through the Identity Scanner, matched kept as the string Zia sent', d.candidates[0].engine === 'zia-identity-scanner' && d.candidates[0].confidence === 0.9464 && d.candidates[0].zia.matched === 'true' && d.candidates[0].reasonCodes.includes('zia-compare'), JSON.stringify(d.candidates[0]));
        check('flag on: Zia compares capped at FACE_ZIA_MAX_COMPARES=1, the rest local', calls.compare === 1 && d.candidates[1].engine === 'local-descriptor' && r.json.meta.engines.zia === 1 && r.json.meta.engines.local === 1);
        check('flag on: gallery image of record fetched from the bucket by object key', galleryHits.length === 1 && galleryHits[0] === 'face-gallery/v1/P001.png');
        // One Zia comparison plus one local one is a MIXED answer, and saying
        // so is the point: a single successful Zia call must never label a
        // ranked list the local engine mostly produced (28 Aug live measurement
        // in docs/benchmarks/face_zia_probe.json — 1 of 5 compares succeeded).
        check('flag on: meta.engine says mixed when Zia scored some candidates and the local engine the rest',
          r.json.meta.engine === 'mixed' && r.json.meta.engines.zia === 1 && r.json.meta.engines.local === 1 && r.json.meta.ziaMaxCompares === 1,
          JSON.stringify({ engine: r.json.meta.engine, engines: r.json.meta.engines }));
        check('flag on: search persisted as an ActionLog row through the writer (face-search, sha only)', inserted.length === 1 && inserted[0].ActionType === 'face-search' && inserted[0].AlertKey === `face:${d.searchId}` && /probeSha256/.test(inserted[0].Payload) && !inserted[0].Payload.includes(probe.slice(0, 30)), JSON.stringify(inserted[0] || {}).slice(0, 200));
        check('flag on: the persisted row carries the whole shortlist, so Offender 360 still finds the search after a restart',
          (JSON.parse(inserted[0].Payload).shortlistKeys || []).join(',') === d.candidates.map((c) => c.personKey).join(','),
          inserted[0].Payload.slice(0, 300));
        const again = await a.post('/identify', Object.assign({ image: probe, filters: { districtId: '0101' } }, CASE));
        check('flag on: a repeat search re-uses the cached comparison (no second compareFace)', calls.compare === 1 && again.json.data.candidates[0].zia.cached === true && again.json.meta.engines.ziaCached === 1, JSON.stringify(again.json.meta.engines));
        const cost = await a.get('/identify/cost?limit=10');
        check('flag on: cost meter counts analyse + capped compares', cost.json.data.ziaCalls === 2 && cost.json.data.breakdown.compareFace === 1);
        const rules = await a.get('/identify/rules');
        check('flag on: rules report the Zia engine as on', rules.json.data.engines.on === true && rules.json.data.engines.zia === true);
        const svc = await a.get('/meta/services');
        const rows = svc.json.data.services;
        check('service map: face analytics + identity scanner rows active with the flag on', rows.some((s) => s.key === 'zia-face-analytics' && s.status === 'active') && rows.some((s) => s.key === 'zia-identity-scanner' && s.status === 'active' && s.flag === 'FEATURE_FACE_ID'));
        const dec = await a.post(`/identify/audit/${d.searchId}/decision`, { personKey: 'P001', decision: 'reject', rationale: 'The mole is on the wrong side compared with the FIR description' });
        check('flag on: a reject is persisted through the phase-7 action log (outcome false_alarm) or the own row', dec.status === 200 && dec.json.meta.persisted && (dec.json.meta.persisted.via === 'lib/actionlog.js' || inserted.some((row) => row.ActionType === 'face-decision')), JSON.stringify(dec.json.meta));
      });
    } finally {
      delete process.env.FEATURE_FACE_ID;
      delete process.env.FACE_ZIA_MAX_COMPARES;
    }
  }

  // --- flag ON but Zia sees no face in a procedural probe / rejects a real one
  {
    const ziaClient = {
      analyseFace: async () => ({ faces_count: 0, faces: [] }),
      compareFace: async () => { throw new Error('should not be called'); }
    };
    process.env.FEATURE_FACE_ID = 'on';
    try {
      await withApp(h, { servicesFactory: () => ({ ziaClient }) }, async (a) => {
        const probe = b64('probe_P001_160.png');
        const rejected = await a.post('/identify', Object.assign({ image: probe, filters: { districtId: '0101' } }, CASE));
        check('no face detected on an arbitrary upload -> rejected by the quality gate, no comparison', rejected.status === 200 && rejected.json.data.decision === 'rejected-by-quality-gate' && rejected.json.data.gate.reasons.includes('no-face-detected') && rejected.json.data.candidates.length === 0, JSON.stringify(rejected.json.data && rejected.json.data.gate));
        const ours = await a.post('/identify', Object.assign({ image: probe, probeSeed: 'v1:2026:P001', filters: { districtId: '0101' } }, CASE));
        check('no face detected on a procedural probe -> advisory gate, local engine answers honestly', ours.status === 200 && ours.json.data.gate.mode === 'advisory' && /procedural/.test(ours.json.data.gate.note) && ours.json.data.candidates[0].engine === 'local-descriptor' && ours.json.meta.engine === 'local-descriptor', JSON.stringify(ours.json.data && ours.json.data.gate));
        const audit = await a.get('/identify/audit');
        check('a gate rejection is still audited', audit.json.data.items.some((it) => it.decision === 'rejected-by-quality-gate'));
      });
      // Zia unreachable (throws): the gate degrades to advisory and the compare falls back.
      await withApp(h, { servicesFactory: () => ({ ziaClient: { analyseFace: async () => { throw new Error('ECONNRESET'); }, compareFace: async () => { throw new Error('ECONNRESET'); } } }) }, async (a) => {
        const r = await a.post('/identify', Object.assign({ image: b64('probe_P001_160.png'), filters: { districtId: '0101' } }, CASE));
        check('Zia failure -> advisory gate + local engine with the failure named', r.status === 200 && r.json.data.gate.mode === 'advisory' && /failed/.test(r.json.data.gate.note) && r.json.data.candidates[0].engine === 'local-descriptor' && r.json.data.candidates[0].reasonCodes.includes('zia-unavailable') && r.json.meta.engines.ziaFailed >= 1, JSON.stringify(r.json.data && r.json.data.gate) + JSON.stringify(r.json.meta && r.json.meta.engines));
      });
    } finally {
      delete process.env.FEATURE_FACE_ID;
    }
  }

  // --- configurable floor -------------------------------------------------
  {
    process.env.FACE_MATCH_FLOOR = '0.99';
    try {
      await withApp(h, {}, async (a) => {
        const r = await a.post('/identify', Object.assign({ image: b64('probe_P001_160.png'), filters: { districtId: '0101' } }, CASE));
        check('a stricter floor turns the same search into "no reliable match" with the figure visible', r.json.data.floor === 0.99 && r.json.data.decision === 'no-reliable-match' && r.json.data.candidates[0].band !== 'lead' && r.json.data.noReliableMatch.topConfidence === r.json.data.candidates[0].confidence, JSON.stringify([r.json.data.floor, r.json.data.decision, r.json.data.candidates[0].confidence, r.json.data.candidates[0].band]));
      });
    } finally {
      delete process.env.FACE_MATCH_FLOOR;
    }
  }
}
