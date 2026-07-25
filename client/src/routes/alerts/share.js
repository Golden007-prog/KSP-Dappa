// /alerts — plain-text one-liner for the per-card "Copy" action. Meant for the
// clipboard → WhatsApp / e-mail; terse, no protected personal attributes.
// Follows the active UI language when the caller passes its translators.
import { fmtInt, fmtNum, dateLabel } from '../../lib/format.js';
import { translate } from '../../lib/i18n.jsx';

const en = (key, vars) => translate('en', key, vars);
const passThrough = (_kind, _id, fallback) => fallback || '';

/** One alert → a WhatsApp-ready single line. */
export function alertShareText(a, t = en, tName = passThrough) {
  const sevKey = String(a?.severity || '').toLowerCase();
  const sev = (sevKey ? t(`alerts.sevLower.${sevKey}`) : t('alerts.share.alertWord')).toUpperCase();
  const where = tName('districts', a?.districtId, a?.districtName || a?.districtId || '')
    || t('alerts.unknownDistrict');
  const head = tName('crimeHeads', a?.crimeHeadId, a?.headName || '') || t('alerts.anomaly');
  return [
    t('alerts.share.head', { sev, head, where }),
    t('alerts.share.numbers', {
      obs: fmtInt(a?.observed), exp: fmtInt(a?.expected), z: fmtNum(a?.zScore, 1),
    }),
    `${dateLabel(a?.periodStart)} – ${dateLabel(a?.periodEnd)}`,
    t('alerts.share.footer'),
  ].join(' · ');
}
