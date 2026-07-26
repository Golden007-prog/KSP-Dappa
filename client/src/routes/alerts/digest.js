// /alerts — plain-text intelligence digest for a hand-picked set of alerts.
//
// The per-card Copy action produces one WhatsApp line. This produces the thing
// a duty officer actually sends at shift change: a headline count, a severity
// roll-up, the districts carrying the load, then the alerts themselves in
// severity order with their numbers, their triage note, and their owner.
// Plain text on purpose — it has to survive a paste into WhatsApp, an SMS
// gateway or an e-mail body without losing anything.
import { fmtInt, fmtNum, dateLabel } from '../../lib/format.js';
import { translate } from '../../lib/i18n.jsx';
import { sevKey, sevRank, SEV_KEYS, direction } from './severity.js';

const en = (key, vars) => translate('en', key, vars);
const passThrough = (_kind, _id, fallback) => fallback || '';

/**
 * Build the digest text.
 * opts: { t, tName, metaFor?, title?, preparedBy? } — metaFor(alertId) supplies
 * the local note/owner when the caller has the triage store in scope.
 */
export function buildDigest(alerts, opts = {}) {
  const { t = en, tName = passThrough, metaFor, preparedBy } = opts;
  const rows = [...(alerts || [])].sort(
    (a, b) => sevRank(b.severity) - sevRank(a.severity)
      || Math.abs(Number(b.zScore) || 0) - Math.abs(Number(a.zScore) || 0),
  );
  if (!rows.length) return '';

  const counts = {};
  const districts = new Map();
  let surges = 0;
  let drops = 0;
  for (const a of rows) {
    const k = sevKey(a.severity) || 'unrated';
    counts[k] = (counts[k] || 0) + 1;
    const dn = tName('districts', a.districtId, a.districtName || a.districtId) || String(a.districtId || '');
    if (dn) districts.set(dn, (districts.get(dn) || 0) + 1);
    if (direction(a) === 'down') drops += 1; else surges += 1;
  }
  const sevLine = SEV_KEYS
    .filter((k) => counts[k])
    .map((k) => `${t(`alerts.sev.${k}`)} ${counts[k]}`)
    .join(' · ');
  const topDistricts = [...districts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, n]) => `${name} (${n})`)
    .join(', ');

  const lines = [
    t('alerts.digest.heading', { date: dateLabel(new Date().toISOString().slice(0, 10)) }),
    t('alerts.digest.headline', { n: fmtInt(rows.length), split: sevLine || '—' }),
    t('alerts.digest.direction', { up: fmtInt(surges), down: fmtInt(drops) }),
  ];
  if (topDistricts) lines.push(t('alerts.digest.districts', { list: topDistricts }));
  if (preparedBy) lines.push(t('alerts.digest.preparedBy', { who: preparedBy }));
  lines.push('');

  rows.forEach((a, i) => {
    const key = sevKey(a.severity);
    const sev = (key ? t(`alerts.sev.${key}`) : t('alerts.share.alertWord')).toUpperCase();
    const head = tName('crimeHeads', a.crimeHeadId, a.headName) || t('alerts.anomaly');
    const where = tName('districts', a.districtId, a.districtName || a.districtId) || t('alerts.unknownDistrict');
    lines.push(t('alerts.digest.item', {
      i: i + 1,
      sev,
      head,
      district: where,
      obs: fmtInt(a.observed),
      exp: fmtInt(a.expected),
      z: fmtNum(a.zScore, 1),
    }));
    lines.push(`   ${dateLabel(a.periodStart)} – ${dateLabel(a.periodEnd)}${a.narrative ? ` · ${a.narrative}` : ''}`);
    const m = metaFor ? metaFor(a.alertId) : null;
    if (m?.owner) lines.push(`   ${t('alerts.digest.owner', { who: m.owner })}`);
    // itemNote, not digest.note — the latter is the composer's footer copy.
    if (m?.note) lines.push(`   ${t('alerts.digest.itemNote', { text: m.note })}`);
  });

  lines.push('', t('alerts.digest.footer'));
  return lines.join('\n');
}

/** Suggested filename for the .txt download. */
export const digestFilename = () => `dappa-alert-digest-${new Date().toISOString().slice(0, 10)}.txt`;
