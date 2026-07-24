// /alerts — plain-text one-liner for the per-card "Copy" action. Meant for the
// clipboard → WhatsApp / e-mail; terse, ASCII-safe, no caste/religion fields.
import { fmtInt, fmtNum, dateLabel } from '../../lib/format.js';

/** One alert → a WhatsApp-ready single line. */
export function alertShareText(a) {
  const sev = String(a?.severity || 'alert').toUpperCase();
  const where = a?.districtName || a?.districtId || 'Unknown district';
  return [
    `[${sev}] ${a?.headName || 'Anomaly'} — ${where}`,
    `observed ${fmtInt(a?.observed)} vs expected ${fmtInt(a?.expected)} (z ${fmtNum(a?.zScore, 1)})`,
    `${dateLabel(a?.periodStart)} – ${dateLabel(a?.periodEnd)}`,
    'DAPPA anomaly alert (synthetic demo data)',
  ].join(' · ');
}
