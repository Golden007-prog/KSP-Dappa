// Round-2 phase 8 — new Catalyst service surfaces (lib/routes/surfaces.js).
// Every endpoint: happy path, validation 400, and the flag-off fallback on the
// harness app; flag-ON paths boot a private app with stubbed service handles.
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const composer = require('../../lib/composer.js');
const moderation = require('../../lib/moderation.js');
const objects = require('../../lib/objects.js');
const olap = require('../../lib/olap.js');
const jobs = require('../../lib/jobs.js');
const observability = require('../../lib/observability.js');
const { buildServiceMap } = require('../../lib/servicemap.js');
const { tierForRole } = require('../../lib/auth.js');
const artifacts = require('../../lib/artifacts.js');
const tiercache = require('../../lib/tiercache.js');
const { buildRow } = require('../../lib/ocr_attach.js');
const surfaces = require('../../lib/routes/surfaces.js');

const ADMIN = { 'x-admin-token': 'demo-admin' };
// 1x1 PNG (67 bytes) — a real image header for the moderation sniff.
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function withApp(h, env, services, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; process.env[k] = v; }
  const app = h.createApp({ clientFactory: () => h.createStubClient(h.buildFixtureTables()), servicesFactory: () => services });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const get = async (p, headers) => { const r = await fetch(base + p, { headers }); return { status: r.status, json: await r.json().catch(() => null) }; };
  const post = async (p, body, headers) => {
    const r = await fetch(base + p, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}), body: JSON.stringify(body || {}) });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  try {
    await fn({ get, post, base });
  } finally {
    server.close();
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

export async function run(h) {
  const { get, post, check, hasKeys } = h;

  // --- pure helpers ----------------------------------------------------------
  {
    const fw = composer.firewall('Chain snatching rose to 42 cases, up 127% from 18.5.', { answer: 'Observed 42 vs expected 18.5 (+127%)' });
    check('firewall passes numbers present in the facts', fw.passed === true && fw.checked === 3, JSON.stringify(fw));
    const bad = composer.firewall('There were 57 cases and 3 arrests.', { answer: 'Observed 42 cases' });
    check('firewall rejects a fabricated number AND the small integer beside it', bad.passed === false && bad.rejected.length === 2
      && bad.rejected[0].value === 57 && bad.rejected[1].value === 3, JSON.stringify(bad));
    // The exact live fabrication that got through: both counts sit in 0..12,
    // which is precisely the police-relevant range (arrests, chargesheets).
    const invented = composer.firewall('There were 7 arrests and 11 chargesheets this month.', { answer: 'Chain snatching rose to 42 cases in Bengaluru City.' });
    check('firewall rejects invented small counts (arrests / chargesheets)', invented.passed === false && invented.checked === 2
      && invented.rejected.map((r) => r.value).join(',') === '7,11', JSON.stringify(invented));
    check('firewall tolerates small prose integers only in an ordering phrase', composer.firewall('the top 5 districts over the last 3 months', { answer: 'nothing numeric' }).passed === true);
    check('firewall allows "2 of the 3" style counts adjacent to of', composer.firewall('2 of the districts', { answer: 'nothing numeric' }).passed === true);
    check('firewall rejects a bare small integer with no ordering word', composer.firewall('there were 4 murders', { answer: 'nothing numeric' }).passed === false);
    check('firewall does not let a count be restated as a percentage', composer.firewall('a 42% share', { answer: '42 cases' }).passed === false, JSON.stringify(composer.firewall('a 42% share', { answer: '42 cases' })));
    check('firewall passes a percentage that IS in the facts', composer.firewall('a 42% share', { answer: 'the share is 42%' }).passed === true);
    check('firewall canonicalises thousands separators', composer.firewall('1,245 FIRs', { answer: 'total 1245' }).passed === true);
    check('firewall rejects a changed decimal', composer.firewall('z of 4.3', { answer: 'z = 4.2' }).passed === false);
    check('collectNumbers walks nested chart payloads', composer.collectNumbers({ chart: { series: [{ data: [7, 19] }] } }).has('19'));

    const v = moderation.verdictFor({ weapons: '0.91', nudity: '0.02' }, 'unsafe');
    check('moderation: weapons route to review, never block', v.verdict === 'review' && v.hits[0].category === 'weapons', JSON.stringify(v));
    check('moderation: explicit nudity blocks', moderation.verdictFor({ nudity: '0.95' }, 'unsafe').verdict === 'block');
    check('moderation: safe prediction allows', moderation.verdictFor({ racy: '0.05' }, 'safe_to_use').verdict === 'allow');
    check('moderation: sniff recognises png', moderation.sniffFormat(Buffer.from(PNG_B64, 'base64')) === 'png');
    check('moderation: sniff rejects text', moderation.sniffFormat(Buffer.from('hello world!!')) === null);

    check('object class maps to MO family tokens', objects.moTokensFor('knife').join(',') === 'object:knife,weapon:knife');
    check('unknown object class still yields an object token', objects.moTokensFor('umbrella').join(',') === 'object:umbrella');
    check('scene manifest lists three synthetic scenes', objects.listScenes().length === 3 && objects.listScenes().every((s) => s.drawn.length >= 1));

    check('tier from role: constable -> beat', tierForRole('Constable') === 'beat');
    check('tier from role: SHO -> station', tierForRole('SHO') === 'station');
    check('tier from role: SP -> district', tierForRole('SP') === 'district');
    check('tier from role: App Administrator -> state', tierForRole('App Administrator') === 'state');
    check('tier from role: anonymous -> district', tierForRole('viewer') === 'district');

    check('tier cache key is stable and prefixed', tiercache.keyFor({ tier: 'station', unitId: '1031' }) === 'v1:tiers:station:1031');
    const row = buildRow({ caseId: '7', text: 'x'.repeat(5000), moTags: ['a'], confidence: 0.5 }, { role: 'admin', user: { userId: 'demo-admin' } });
    check('ocr attach row uses phase-7 vocabulary and clips the payload', row.AlertKey === 'case:7' && row.ActionType === 'note' && row.Note.length <= 500 && JSON.parse(row.Payload).text.length === 4000 && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(row.ClientTs), row.ClientTs);

    const rows = buildServiceMap({ flags: { olap: true, jobs: true, ziaObjects: true, quickmlAutoml: true }, services: {} });
    check('service map gains olap / jobs / vision / automl / apm rows', ['data-store-olap', 'job-scheduling', 'zia-vision', 'quickml-automl', 'apm-logs'].every((k) => rows.some((r) => r.key === k)));
    check('olap and jobs read console-pending with the flag on and no attestation', rows.find((r) => r.key === 'data-store-olap').status === 'console-pending' && rows.find((r) => r.key === 'job-scheduling').status === 'console-pending');
    check('circuits fallback names Job Scheduling', /Job Scheduling/.test(rows.find((r) => r.key === 'circuits').fallback));
  }

  // --- OLAP ------------------------------------------------------------------
  {
    olap.resetOlapHealth();
    const b = await get('/meta/olap-benchmark?nocache=1');
    check('olap benchmark answers on the stub', b.status === 200 && hasKeys(b.json.data, ['window', 'sql', 'legs', 'speedup', 'recommendedEngine']) && b.json.data.legs.zcql.ok === true && b.json.data.legs.zcql.rows > 0, JSON.stringify(b.json).slice(0, 300));
    check('olap benchmark reports the skipped leg honestly', b.json.data.legs.olap.skipped === true && b.json.data.recommendedEngine === 'zcql' && b.json.meta.source === 'fallback-local');
    const bad = await get('/meta/olap-benchmark?from=2026-09&to=2026-01');
    check('olap benchmark 400 on an inverted window', bad.status === 400);
    const cube = await get('/olap/cube');
    check('olap cube shape', cube.status === 200 && hasKeys(cube.json.data, ['fromYm', 'toYm', 'districts', 'heads', 'months', 'cells', 'total', 'engine']) && cube.json.data.cells.length > 0 && cube.json.data.months.length === 12 && cube.json.data.engine === 'zcql' && cube.json.meta.engine === 'zcql', JSON.stringify(cube.json.meta));
    check('olap cube totals agree with cells', cube.json.data.total === cube.json.data.cells.reduce((s, c) => s + c.caseCount, 0));
    check('olap cube 400 on a bad window', (await get('/olap/cube?from=2026-09&to=2026-01')).status === 400);

    const calls = [];
    await withApp(h, { FEATURE_OLAP: 'on', OLAP_ENABLED: 'yes' }, {
      olap: { execute: async (sql) => { calls.push(sql); return [{ AggMonthly: { DistrictID: '0101', CrimeHeadID: 3, Ym: '2026-08', 'SUM(CaseCount)': 12, 'SUM(HeinousCount)': 1 } }]; } }
    }, async (a) => {
      olap.resetOlapHealth();
      const c = await a.get('/olap/cube?nocache=1');
      check('FLAG-ON olap cube uses the OLAP engine', c.status === 200 && c.json.data.engine === 'olap' && c.json.meta.source === 'catalyst-olap' && c.json.data.cells.length === 1, JSON.stringify(c.json.meta));
      check('FLAG-ON olap sql has no LIMIT and groups by the cube dims', calls.length === 1 && /GROUP BY DistrictID, CrimeHeadID, Ym/.test(calls[0]) && !/LIMIT/.test(calls[0]), calls[0]);
      const bm = await a.get('/meta/olap-benchmark?nocache=1');
      check('FLAG-ON benchmark runs both legs and compares rows', bm.json.data.legs.olap.ok === true && typeof bm.json.data.speedup === 'number' && bm.json.data.rowsAgree === false && bm.json.data.attested === true, JSON.stringify(bm.json.data.legs));
    });
    await withApp(h, { FEATURE_OLAP: 'on', OLAP_ENABLED: 'yes' }, {
      olap: { execute: async () => { throw new Error('OLAP database not enabled'); } }
    }, async (a) => {
      olap.resetOlapHealth();
      const c = await a.get('/olap/cube?nocache=1');
      check('FLAG-ON olap failure falls back to ZCQL with the reason', c.status === 200 && c.json.data.engine === 'zcql' && /OLAP call failed/.test(String(c.json.data.note)), String(c.json.data.note));
      check('olap marks itself unhealthy after a failure', olap.olapState().healthy === false);
    });
    olap.resetOlapHealth();
  }

  // --- Zia moderation + object recognition ------------------------------------
  {
    const m = await post('/zia/moderate', { imageBase64: PNG_B64 });
    check('moderate fallback is unscreened, never allow', m.status === 200 && m.json.data.verdict === 'unscreened' && m.json.data.format === 'png' && m.json.meta.source === 'fallback-local', JSON.stringify(m.json).slice(0, 200));
    check('moderate 400 without an image', (await post('/zia/moderate', {})).status === 400);
    check('moderate 400 on non-image bytes', (await post('/zia/moderate', { imageBase64: Buffer.from('not an image at all').toString('base64') })).status === 400);

    const samples = await get('/zia/objects/samples');
    check('object samples list the three scenes', samples.status === 200 && samples.json.data.scenes.length === 3 && samples.json.meta.source === 'fixture');
    check('normaliseObjects keeps a null confidence null (Number(null) is 0)', objects.normaliseObjects([{ label: 'knife', confidence: null, box: [1, 2, 3, 4] }])[0].confidence === null
      && objects.normaliseObjects([{ label: 'knife', confidence: undefined }])[0].confidence === null
      && objects.normaliseObjects([{ label: 'knife', confidence: '' }])[0].confidence === null
      && objects.normaliseObjects([{ label: 'knife', confidence: '99.82' }])[0].confidence === 0.9982);
    const sc = await post('/zia/objects', { sceneId: 'scene_03', caseId: '1' });
    check('objects fixture path tags the knife scene and merges narrative MO tags', sc.status === 200 && sc.json.meta.source === 'fixture' && sc.json.data.objects[0].label === 'knife'
      && sc.json.data.moTags.includes('weapon:knife') && sc.json.data.narrativeTags.length > 0 && sc.json.data.mergedMoTags.length >= sc.json.data.moTags.length, JSON.stringify(sc.json.data).slice(0, 300));
    check('a drawn (manifest) box carries no confidence, never 0 out of 100', sc.json.data.objects.every((o) => o.confidence === null), JSON.stringify(sc.json.data.objects));
    check('objects 400 without input', (await post('/zia/objects', {})).status === 400);
    check('objects 404 on an unknown scene', (await post('/zia/objects', { sceneId: 'scene_99' })).status === 404);
    const raw = await post('/zia/objects', { imageBase64: PNG_B64 });
    check('objects flag-off with a raw upload reports no detector honestly', raw.status === 200 && raw.json.data.objects.length === 0 && raw.json.meta.source === 'fallback-local' && raw.json.data.moderation && raw.json.data.moderation.verdict === 'unscreened');

    // p8-2: the scene PNGs ship WITH the function, so the only client call
    // shape ({sceneId} and no bytes) can actually reach Zia.
    check('every manifest scene has its PNG bundled with the function', objects.listScenes().every((sc2) => {
      const buf = objects.sceneBuffer(objects.sceneById(sc2.sceneId));
      return Buffer.isBuffer(buf) && buf.length > 1000 && buf.toString('ascii', 1, 4) === 'PNG';
    }), JSON.stringify(objects.listScenes().map((x) => x.sceneId)));

    const ziaCalls = { detect: 0, moderate: 0 };
    await withApp(h, { FEATURE_ZIA: 'on' }, {
      ziaClient: {
        detectObject: async () => { ziaCalls.detect += 1; return { objects: [{ co_ordinates: [10, 20, 300, 400], object_type: 'motorcycle', confidence: '97.5' }, { co_ordinates: [1, 1, 5, 5], object_type: 'person', confidence: '80' }] }; },
        moderateImage: async () => { ziaCalls.moderate += 1; return { probability: { weapons: '0.82', nudity: '0.01' }, confidence: 0.9, prediction: 'unsafe' }; }
      }
    }, async (a) => {
      const r = await a.post('/zia/objects', { imageBase64: PNG_B64 });
      check('FLAG-ON objects calls Zia and maps boxes + confidence', r.status === 200 && r.json.meta.source === 'zia-objects' && r.json.data.objects.length === 2 && r.json.data.objects[0].confidence === 0.975 && r.json.data.objects[0].box[2] === 300 && r.json.data.moTags.includes('vehicle:motorcycle'), JSON.stringify(r.json.data).slice(0, 300));
      check('FLAG-ON upload passed through the moderation guard as review', r.json.data.moderation.verdict === 'review' && r.json.data.moderation.source === 'zia-moderation' && ziaCalls.moderate === 1 && ziaCalls.detect === 1);
      const m2 = await a.post('/zia/moderate', { imageBase64: PNG_B64, mode: 'basic' });
      check('FLAG-ON moderate reports probabilities and the mode', m2.json.data.probability.weapons === 0.82 && m2.json.data.mode === 'basic' && m2.json.meta.source === 'zia-moderation');
    });
    await withApp(h, { FEATURE_ZIA: 'on' }, {
      ziaClient: { moderateImage: async () => ({ probability: { nudity: '0.96' }, confidence: 0.9, prediction: 'unsafe' }), detectObject: async () => ({ objects: [] }) }
    }, async (a) => {
      const r = await a.post('/zia/objects', { imageBase64: PNG_B64 });
      check('FLAG-ON blocked upload is refused with 400 BLOCKED', r.status === 400 && r.json.error.code === 'BLOCKED');
    });
    await withApp(h, { FEATURE_ZIA: 'on' }, {
      ziaClient: { moderateImage: async () => { throw new Error('quota'); }, detectObject: async () => { throw new Error('quota'); } }
    }, async (a) => {
      const r = await a.post('/zia/objects', { imageBase64: PNG_B64, sceneId: 'scene_01' });
      check('FLAG-ON Zia failure with a known scene falls back to the manifest', r.status === 200 && r.json.meta.source === 'fixture' && r.json.data.objects[0].label === 'handbag' && /failed/.test(r.json.data.note));
    });
    // The client posts {sceneId, caseId} with no image. The bundled PNG is what
    // it sends, so the Zia leg is reachable from the shipped call shape.
    {
      const sent = [];
      await withApp(h, { FEATURE_ZIA: 'on' }, {
        ziaClient: {
          moderateImage: async () => ({ probability: {}, confidence: 0.9, prediction: 'safe_to_use' }),
          detectObject: async (stream) => {
            const chunks = [];
            for await (const c of stream) chunks.push(c);
            sent.push(Buffer.concat(chunks).length);
            return { objects: [{ co_ordinates: [160, 250, 810, 370], object_type: 'knife', confidence: '91.5' }] };
          }
        }
      }, async (a) => {
        const r = await a.post('/zia/objects', { sceneId: 'scene_03', caseId: '1' });
        check('FLAG-ON a sceneId with no image bytes still reaches Zia', r.status === 200 && r.json.meta.source === 'zia-objects'
          && r.json.data.ziaRan === true && r.json.data.objects[0].confidence === 0.915 && sent[0] > 1000, JSON.stringify({ src: r.json.meta.source, sent: sent[0] }));
      });
      // The FIR-detail card asks for the same scene on every page view; without
      // a cache that is one metered Zia call per view, per judge.
      const calls = [];
      surfaces.resetAiBudget();
      await withApp(h, { FEATURE_ZIA: 'on' }, {
        ziaClient: {
          moderateImage: async () => ({ probability: {}, prediction: 'safe_to_use' }),
          detectObject: async () => { calls.push(1); return { objects: [{ co_ordinates: [1, 2, 3, 4], object_type: 'knife', confidence: '90' }] }; }
        }
      }, async (a) => {
        const first = await a.post('/zia/objects', { sceneId: 'scene_03', caseId: '1' });
        const second = await a.post('/zia/objects', { sceneId: 'scene_03', caseId: '1' });
        check('the scene path is cached, so a second FIR view spends no Zia call', calls.length === 1
          && first.json.meta.cached === false && second.json.meta.cached === true
          && second.json.data.objects[0].label === 'knife', `calls=${calls.length} cached=${second.json.meta.cached}`);
      });
      // A per-IP hourly budget stands in for the guard that /zia/objects and
      // /zia/moderate cannot have (both are called anonymously by the client).
      surfaces.resetAiBudget();
      await withApp(h, { FEATURE_ZIA: 'on', AI_BUDGET_PER_HOUR: '2' }, {
        ziaClient: { moderateImage: async () => ({ probability: {}, prediction: 'safe_to_use' }), detectObject: async () => ({ objects: [] }) }
      }, async (a) => {
        const codes = [];
        for (let i = 0; i < 4; i += 1) codes.push((await a.post('/zia/moderate', { imageBase64: PNG_B64 })).status);
        check('the anonymous Zia budget 429s past its hourly ceiling', codes.join(',') === '200,200,429,429', codes.join(','));
      });
      surfaces.resetAiBudget();
      await withApp(h, { FEATURE_ZIA: 'on' }, {
        ziaClient: { moderateImage: async () => ({ probability: {}, prediction: 'safe_to_use' }), detectObject: async () => ({ objects: [] }) }
      }, async (a) => {
        const r = await a.post('/zia/objects', { sceneId: 'scene_02' });
        check('FLAG-ON an empty Zia answer on a demo scene shows the DRAWN boxes, labelled fixture', r.status === 200 && r.json.meta.source === 'fixture'
          && r.json.data.ziaRan === true && r.json.data.ziaObjects === 0 && r.json.data.objects[0].label === 'motorcycle'
          && r.json.data.objects[0].confidence === null && /recognised nothing/.test(r.json.data.note), JSON.stringify(r.json.data).slice(0, 300));
      });
    }
  }

  // --- OCR surface -------------------------------------------------------------
  {
    const s = await get('/ocr/samples');
    check('ocr samples list three synthetic scans with ground truth', s.status === 200 && s.json.data.samples.length === 3 && s.json.data.samples.every((x) => x.truthText && x.kannadaLine && x.file));
    const anon = await post('/ocr/attach', { caseId: '1', text: 'hello' });
    check('ocr attach is 403 for anonymous PUBLIC_DEMO', anon.status === 403 && anon.json.error.code === 'AUTH_REQUIRED');
    check('ocr attach 400 without a case id', (await post('/ocr/attach', { text: 'x' }, ADMIN)).status === 400);
    check('ocr attach 400 without text', (await post('/ocr/attach', { caseId: '2' }, ADMIN)).status === 400);
    const at = await post('/ocr/attach', { caseId: '2', text: 'gold chain snatched on a two-wheeler', moTags: ['vehicle:two-wheeler'], confidence: 0.88, language: 'eng', sampleId: 'fir_01' }, ADMIN);
    check('ocr attach records an audit row off-Catalyst', at.status === 200 && at.json.data.recorded === true && at.json.data.storage === 'memory' && at.json.data.row.AlertKey === 'case:2' && at.json.data.row.ActionType === 'note' && at.json.meta.source === 'fallback-local', JSON.stringify(at.json).slice(0, 300));
    const list = await get('/ocr/attachments?caseId=2');
    check('ocr attachments read back the memory row', list.status === 200 && list.json.data.rows.length >= 1 && list.json.data.rows[0].payload.kind === 'ocr' && list.json.data.rows[0].payload.moTags[0] === 'vehicle:two-wheeler');
    const fx = await get('/ocr/attachments?caseId=1');
    check('ocr attachments read the fixture ActionLog row for case 1', fx.status === 200 && fx.json.data.rows.some((r) => r.payload && r.payload.sampleId === 'fir_01'), JSON.stringify(fx.json).slice(0, 200));
    check('ocr attachments 400 without caseId', (await get('/ocr/attachments')).status === 400);
  }

  // --- Job Scheduling ---------------------------------------------------------
  {
    jobs.resetJobs();
    check('jobs endpoints are admin-only', (await post('/admin/jobs/nightly-refresh', {})).status === 403 && (await get('/admin/jobs/pools')).status === 403);
    const j = await post('/admin/jobs/nightly-refresh', { trigger: 'test' }, ADMIN);
    check('jobs flag-off runs the nightly steps inline in the job shape', j.status === 200 && j.json.data.mode === 'inline' && j.json.data.status === 'successful' && j.json.data.steps.length === 3 && /FEATURE_JOBS off/.test(j.json.data.note) && j.json.meta.source === 'fallback-local', JSON.stringify(j.json).slice(0, 300));
    const st = await get(`/admin/jobs/${j.json.data.jobId}`, ADMIN);
    const stOk = await fetch(`${h.BASE}/admin/jobs/${j.json.data.jobId}`, { headers: ADMIN }).then((r) => r.json());
    check('jobs status reads the stored record', stOk.ok === true && stOk.data.jobId === j.json.data.jobId && stOk.data.mode === 'inline', JSON.stringify(st.json || stOk).slice(0, 200));
    const miss = await fetch(`${h.BASE}/admin/jobs/job-nope`, { headers: ADMIN }).then((r) => r.status);
    check('jobs status 404 for an unknown id', miss === 404);
    const pools = await fetch(`${h.BASE}/admin/jobs/pools`, { headers: ADMIN }).then((r) => r.json());
    check('jobs pools report the flag-off state', pools.ok === true && pools.data.pools.length === 0 && pools.data.configuredPool === null);
    const n = await get('/meta/nightly');
    check('meta/nightly shape (public)', n.status === 200 && hasKeys(n.json.data, ['nightly', 'ageHours', 'lastJob', 'scheduler', 'dataMode']) && n.json.data.nightly.refreshedAt && n.json.data.scheduler.mode === 'cron-only', JSON.stringify(n.json.data).slice(0, 300));

    const submitted = [];
    await withApp(h, { FEATURE_JOBS: 'on', JOB_POOL_NAME: 'dappa_pool' }, {
      jobs: {
        submit: async (meta) => { submitted.push(meta); return { job_id: '9001', job_status: 'Submitted', capacity: {}, job_meta_details: { jobpool_name: 'dappa_pool' } }; },
        get: async (id) => ({ job_id: id, job_status: 'Successful', start_time: '2026-08-28 02:00:00', end_time: '2026-08-28 02:03:10', execution_time: '190000', retried_count: 1 }),
        pools: async () => [{ id: '77', name: 'dappa_pool', type: 'Function', capacity: { memory: 256, number: 1 } }]
      }
    }, async (a) => {
      const r = await a.post('/admin/jobs/nightly-refresh', { trigger: 'test' }, ADMIN);
      check('FLAG-ON jobs submits a Function job to the pool with retries', r.status === 200 && r.json.data.mode === 'job' && r.json.data.jobId === '9001' && r.json.meta.source === 'catalyst-jobs'
        && submitted[0].target_type === 'Function' && submitted[0].target_name === 'dappa_nightly' && submitted[0].jobpool_name === 'dappa_pool' && submitted[0].job_config.number_of_retries === 2, JSON.stringify(submitted[0]));
      const s2 = await a.get('/admin/jobs/9001', ADMIN);
      check('FLAG-ON job status is read live and mapped', s2.json.data.status === 'successful' && s2.json.data.retriedCount === 1 && s2.json.data.executionMs === 190000, JSON.stringify(s2.json.data).slice(0, 200));
      const p = await a.get('/admin/jobs/pools', ADMIN);
      check('FLAG-ON pools list the console pool', p.json.data.pools[0].name === 'dappa_pool' && p.json.meta.source === 'catalyst-jobs');
      const n2 = await a.get('/meta/nightly');
      check('FLAG-ON meta/nightly surfaces the job and job-scheduling mode', n2.json.data.lastJob.mode === 'job' && n2.json.data.scheduler.mode === 'job-scheduling' && n2.json.meta.source === 'catalyst-jobs');
    });
    await withApp(h, { FEATURE_JOBS: 'on', JOB_POOL_NAME: 'dappa_pool' }, {
      jobs: { submit: async () => { throw new Error('no such jobpool'); } }
    }, async (a) => {
      const r = await a.post('/admin/jobs/nightly-refresh', {}, ADMIN);
      check('FLAG-ON job submission failure runs inline with the reason', r.json.data.mode === 'inline' && /no such jobpool/.test(r.json.data.note));
    });
    jobs.resetJobs();
  }

  // --- observability -----------------------------------------------------------
  {
    const o = await get('/meta/observability');
    check('observability summary shape', o.status === 200 && hasKeys(o.json.data, ['window', 'requests', 'errors5xx', 'errorRatePct', 'p50Ms', 'p95Ms', 'routes', 'apm', 'logs', 'uptimeSec']) && o.json.data.requests > 0 && o.json.data.apm.available === false && o.json.meta.source === 'in-process', JSON.stringify(o.json.data).slice(0, 200));
    check('observability ranks routes by count', o.json.data.routes.length > 0 && o.json.data.routes.every((r) => hasKeys(r, ['route', 'count', 'avgMs', 'maxMs', 'errors'])));
    check('observability window is bounded', observability.WINDOW === 500);
  }

  // --- Stratus pre-signed URL + map snapshot -------------------------------------
  {
    artifacts.resetArtifacts();
    const arch = await post('/reports/archive', { window: 'last7' });
    const u = await get(`/reports/artifacts/${arch.json.data.artifactId}/url`);
    check('artifact url falls back to the API proxy for a memory artefact', u.status === 200 && u.json.data.mode === 'api-proxy' && /\/reports\/artifacts\//.test(u.json.data.url) && u.json.meta.source === 'fallback-local', JSON.stringify(u.json).slice(0, 200));
    check('artifact url 404 for an unknown id', (await get('/reports/artifacts/art-nope/url')).status === 404);
    check('artifact url 400 for a bad id', (await get('/reports/artifacts/%3Cbad%3E/url')).status === 400);
    await withApp(h, {}, {
      artifactBucket: { put: async () => true, get: async () => null, signedUrl: async (key, exp) => `https://stratus.example.invalid/${key}?exp=${exp}` }
    }, async (a) => {
      const ar = await a.post('/reports/archive', { window: 'last30' });
      const url = await a.get(`/reports/artifacts/${ar.json.data.artifactId}/url?expiresIn=120`);
      check('artifact url is pre-signed for a Stratus artefact', ar.json.data.storage === 'stratus' && url.json.data.mode === 'pre-signed' && url.json.data.expiresInSec === 120 && /exp=120/.test(url.json.data.url) && url.json.meta.source === 'catalyst-stratus', JSON.stringify(url.json).slice(0, 200));
    });
    artifacts.resetArtifacts();

    // p8-6: this route spends a metered SmartBrowz render AND writes a Stratus
    // object, so it is guarded like the other write-ish routes.
    check('map snapshot is admin-only (it spends a render and mints an object)', (await post('/reports/map-snapshot', { districtId: '0101' })).status === 403);
    const snap = await post('/reports/map-snapshot', { districtId: '0101' }, ADMIN);
    check('map snapshot flag-off returns the static map', snap.status === 200 && snap.json.data.mode === 'static' && snap.json.data.imagePath === artifacts.STATIC_MAP && snap.json.meta.source === 'fallback-local', JSON.stringify(snap.json).slice(0, 200));
    check('map snapshot 400 on a bad district id', (await post('/reports/map-snapshot', { districtId: 'xx' }, ADMIN)).status === 400);
    check('map snapshot reports that ?nocache is not honoured', snap.json.meta.nocacheHonoured === false);
    check('the Stratus map key is an IST hour bucket, not a millisecond stamp', /^\d{10}$/.test(artifacts.istHourStamp(new Date('2026-08-29T04:30:00Z')))
      && artifacts.istHourStamp(new Date('2026-08-29T04:30:00Z')) === artifacts.istHourStamp(new Date('2026-08-29T04:59:00Z')), artifacts.istHourStamp(new Date('2026-08-29T04:30:00Z')));
    const shots = [];
    await withApp(h, { FEATURE_SMARTBROWZ: 'on', APP_BASE_URL: 'https://example.invalid/app' }, {
      smartbrowz: { screenshot: async (url, opts) => { shots.push({ url, opts }); return Buffer.from('PNGBYTES'); } },
      artifactBucket: { putBinary: async () => true, signedUrl: async (key) => `https://stratus.example.invalid/${key}` }
    }, async (a) => {
      const r = await a.post('/reports/map-snapshot', { districtId: '0103' }, ADMIN);
      check('FLAG-ON map snapshot screenshots the hash route and stores the PNG', r.status === 200 && r.json.data.mode === 'screenshot' && /index\.html#\/map\?district=0103$/.test(shots[0].url) && shots[0].opts.page_options.viewport.width === 1280 && /^briefs\/map-0103-\d{10}\.png$/.test(r.json.data.key) && r.json.data.url && r.json.meta.source === 'catalyst-smartbrowz', JSON.stringify(r.json.data).slice(0, 300));
      // Five anonymous ?nocache=1 calls used to mean five renders and five objects.
      for (let i = 0; i < 4; i += 1) await a.post('/reports/map-snapshot?nocache=1', { districtId: '0103' }, ADMIN);
      check('?nocache cannot force a second render on the map snapshot', shots.length === 1, `renders=${shots.length}`);
    });
    await withApp(h, { FEATURE_SMARTBROWZ: 'on', APP_BASE_URL: 'https://example.invalid/app' }, {
      smartbrowz: { screenshot: async () => { throw new Error('either the request body or parameters is in wrong format'); } }
    }, async (a) => {
      const r = await a.post('/reports/map-snapshot', {}, ADMIN);
      check('FLAG-ON screenshot failure falls back to the static map with the reason', r.json.data.mode === 'static' && /wrong format/.test(r.json.data.note));
    });
    // p8-5: the snapshot rides on the weekly brief in BOTH modes — it used to
    // be taken only after a successful PDF render, i.e. never in the mode the
    // live deployment actually takes.
    await withApp(h, { FEATURE_SMARTBROWZ: 'on', APP_BASE_URL: 'https://example.invalid/app' }, {
      smartbrowz: {
        renderBrief: async () => { throw new Error('No such User with the given id exists'); },
        screenshot: async () => Buffer.from('PNGBYTES')
      }
    }, async (a) => {
      const r = await a.post('/reports/weekly-brief', { window: 'last7' });
      check('weekly brief carries mapSnapshot even when the PDF render fails', r.status === 200 && r.json.data.mode === 'print-css'
        && /No such User/.test(r.json.data.fallbackReason) && r.json.data.mapSnapshot && r.json.data.mapSnapshot.mode === 'screenshot', JSON.stringify(r.json.data).slice(0, 300));
    });
    await withApp(h, { FEATURE_SMARTBROWZ: 'on', APP_BASE_URL: 'https://example.invalid/app' }, {
      smartbrowz: {
        renderBrief: async () => { throw new Error('No such User with the given id exists'); },
        screenshot: async () => { throw new Error('No such User with the given id exists'); }
      }
    }, async (a) => {
      const r = await a.post('/reports/weekly-brief', {});
      check('with both SmartBrowz legs failing the brief still names the static stand-in', r.json.data.mapSnapshot
        && r.json.data.mapSnapshot.mode === 'static' && r.json.data.mapSnapshot.imagePath === artifacts.STATIC_MAP
        && r.json.data.mapSnapshot.source === 'fallback-local', JSON.stringify(r.json.data.mapSnapshot).slice(0, 200));
    });
  }

  // --- auth roles / tier + invite ----------------------------------------------
  {
    const me = await get('/auth/me');
    check('auth/me carries the officer tier', me.status === 200 && me.json.data.tier === 'district' && me.json.data.role === 'viewer');
    const meAdmin = await fetch(`${h.BASE}/auth/me`, { headers: ADMIN }).then((r) => r.json());
    check('auth/me maps the admin token to the state tier', meAdmin.data.tier === 'state' && meAdmin.data.role === 'admin');
    const roles = await get('/auth/roles');
    check('auth/roles lists the tier mapping and unset role ids', roles.status === 200 && roles.json.data.mapping.length === 4 && roles.json.data.roleIds.beat === null && roles.json.data.embedEnabled === false && roles.json.data.you.tier === 'district');
    check('auth/invite is admin-only', (await post('/auth/invite', { email: 'a@b.in' })).status === 403);
    check('auth/invite 400 on a bad email', (await post('/auth/invite', { email: 'nope' }, ADMIN)).status === 400);
    check('auth/invite 400 on a bad tier', (await post('/auth/invite', { email: 'a@b.in', tier: 'king' }, ADMIN)).status === 400);
    const inv = await post('/auth/invite', { email: 'sho@example.in', tier: 'station' }, ADMIN);
    check('auth/invite reports console-pending off-Catalyst', inv.status === 200 && inv.json.data.invited === false && inv.json.data.mode === 'console-pending');
    const registered = [];
    await withApp(h, { AUTH_ROLE_ID_STATION: '12345' }, {
      auth: {
        currentUser: async () => ({ user_id: '1', zuid: '1', email_id: 'sho@example.in', first_name: 'S', last_name: 'H', status: 'ACTIVE', role_details: { role_id: '12345', role_name: 'SHO' } }),
        register: async (cfg, user) => { registered.push({ cfg, user }); return { user_details: { user_id: '2', email_id: user.email_id, role_details: { role_name: 'SHO' } } }; }
      }
    }, async (a) => {
      const m = await a.get('/auth/me');
      check('FLAG-ON auth/me maps a Catalyst SHO role to the station tier', m.json.data.tier === 'station' && m.json.data.roleSource === 'catalyst-role' && m.json.meta.source === 'catalyst-auth');
      const r = await a.post('/auth/invite', { email: 'new@example.in', tier: 'station' }, ADMIN);
      check('FLAG-ON auth/invite registers with the console role id', r.json.data.invited === true && registered[0].user.role_id === '12345' && registered[0].cfg.platform_type === 'web' && r.json.meta.source === 'catalyst-auth', JSON.stringify(r.json).slice(0, 200));
    });
  }

  // --- QuickML challenger + LLM composer ----------------------------------------
  {
    const c = await post('/predict/outcome/challenger', { districtId: '0101', crimeSubHeadId: 303, hour: 23 });
    check('challenger flag-off serves the champion only', c.status === 200 && c.json.data.status === 'disabled' && c.json.data.challenger === null && typeof c.json.data.champion.probability === 'number' && c.json.meta.source === 'fallback-local');
    await withApp(h, { FEATURE_QUICKML_AUTOML: 'on' }, {}, async (a) => {
      const r = await a.post('/predict/outcome/challenger', {});
      check('FLAG-ON challenger without an endpoint key is console-pending', r.json.data.status === 'console-pending' && r.json.data.challenger === null);
    });
    await withApp(h, { FEATURE_QUICKML_AUTOML: 'on', QUICKML_AUTOML_ENDPOINT_KEY: 'k1', QUICKML_AUTOML_AUC: '0.81' }, {
      quickmlClient: { predict: async () => ({ status: 'success', result: ['0.66'] }) }
    }, async (a) => {
      const r = await a.post('/predict/outcome/challenger', { districtId: '0101' });
      check('FLAG-ON challenger serves beside the champion with the console AUC', r.json.data.status === 'serving' && r.json.data.challenger.probability === 0.66 && r.json.data.challenger.auc === 0.81 && r.json.data.agreement && typeof r.json.data.agreement.sameClass === 'boolean' && r.json.meta.source === 'quickml-sdk', JSON.stringify(r.json.data).slice(0, 300));
    });

    check('compose 400 without a question', (await post('/copilot/compose', {})).status === 400);
    const d = await post('/copilot/compose', { q: 'total FIRs last month', tier: 'beat' });
    check('compose flag-off returns the deterministic answer with the firewall not invoked', d.status === 200 && d.json.data.engine === 'deterministic' && d.json.data.firewall.mode === 'not-invoked' && d.json.data.answer && d.json.data.tier === 'beat' && d.json.meta.source === 'fallback-local', JSON.stringify(d.json.data).slice(0, 200));
    await withApp(h, { FEATURE_QUICKML_LLM: 'on', QUICKML_LLM_URL: 'https://llm.example.invalid/v1' }, {
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: { answer: 'Roughly 999 FIRs came in, a 250% jump.' } }) })
    }, async (a) => {
      const r = await a.post('/copilot/compose', { q: 'total FIRs last month' });
      check('FLAG-ON composer rejects an LLM answer with invented numbers', r.json.data.engine === 'deterministic' && r.json.data.firewall.mode === 'rejected' && r.json.data.firewall.rejected.some((x) => x.value === 999) && r.json.data.llmAnswer && r.json.meta.source === 'fallback-local', JSON.stringify(r.json.data.firewall));
    });
    await withApp(h, { FEATURE_QUICKML_LLM: 'on', QUICKML_LLM_URL: 'https://llm.example.invalid/v1' }, {
      fetchImpl: async (url, init) => {
        const prompt = JSON.parse(init.body).question;
        const facts = JSON.parse(prompt.split('FACTS: ')[1].split('\n')[0]);
        return { ok: true, status: 200, json: async () => ({ answer: `For your beat: ${facts.answer}` }) };
      }
    }, async (a) => {
      const r = await a.post('/copilot/compose', { q: 'total FIRs last month', tier: 'beat' });
      check('FLAG-ON composer accepts an answer whose numbers all come from the facts', r.json.data.engine === 'quickml-llm' && r.json.data.firewall.mode === 'checked' && r.json.data.firewall.passed === true && /^For your beat:/.test(r.json.data.answer) && r.json.meta.source === 'quickml-llm', JSON.stringify(r.json.data).slice(0, 200));
    });
    await withApp(h, { FEATURE_QUICKML_LLM: 'on', QUICKML_LLM_URL: 'https://llm.example.invalid/v1' }, {
      fetchImpl: async () => { throw new Error('ECONNREFUSED'); }
    }, async (a) => {
      const r = await a.post('/copilot/compose', { q: 'total FIRs last month' });
      check('FLAG-ON composer LLM failure keeps the deterministic answer', r.json.data.engine === 'deterministic' && /ECONNREFUSED/.test(r.json.data.note));
    });
  }
}
