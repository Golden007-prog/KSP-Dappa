// Plain-text case brief — the paste-into-a-message form of a FIR detail.
//
// The JSON export is for machines and the print stylesheet is for paper; this is
// the third shape an investigator actually asks for: a few lines they can drop
// into a WhatsApp group, a case diary entry or an e-mail. Whitelisted fields
// only, exactly like exportCaseJson — party COUNTS rather than party records, so
// nothing sensitive rides along in a copy-paste.
import { dateLabel } from '../../lib/format.js';

const line = (label, value) => (value === undefined || value === null || value === '' ? null : `${label}: ${value}`);

/**
 * buildCaseBrief(caseData, t) → multi-line string.
 * `t` is the translator so the brief comes out in the UI language.
 */
export function buildCaseBrief(d, t) {
  const c = d || {};
  const sections = Array.isArray(c.sections) ? c.sections : [];
  const count = (v) => (Array.isArray(v) ? v.length : 0);
  const incident = c.incidentFrom
    ? `${dateLabel(c.incidentFrom)}${c.incidentTo && c.incidentTo !== c.incidentFrom ? ` → ${dateLabel(c.incidentTo)}` : ''}`
    : '';
  const io = c.io && typeof c.io === 'object'
    ? [c.io.name, c.io.rankName].filter(Boolean).join(', ')
    : '';
  const rows = [
    `${t('cases.brief.heading')} ${c.crimeNo || c.caseMasterId || ''}`.trim(),
    line(t('cases.brief.caseNo'), c.caseNo),
    line(t('cases.brief.registered'), c.registeredDate ? dateLabel(c.registeredDate) : ''),
    line(t('cases.brief.station'), [c.unitName, c.districtName].filter(Boolean).join(', ')),
    line(t('cases.brief.offence'), [c.headName, c.subHeadName].filter(Boolean).join(' / ')),
    line(t('cases.brief.status'), [c.statusName, c.gravityName].filter(Boolean).join(' · ')),
    line(t('cases.brief.incident'), incident),
    line(t('cases.brief.sections'), sections.length
      ? sections.map((s) => `${s.actCode || ''} §${s.sectionCode || ''}`.trim()).join('; ')
      : ''),
    line(t('cases.brief.parties'), t('cases.brief.partiesValue', {
      c: count(c.complainants), v: count(c.victims), a: count(c.accused), ar: count(c.arrests),
    })),
    line(t('cases.brief.io'), io),
    line(t('cases.brief.court'), c.court && typeof c.court === 'object' ? c.court.courtName : ''),
    line(t('cases.brief.chargesheet'), c.chargesheet && typeof c.chargesheet === 'object' && c.chargesheet.date
      ? dateLabel(c.chargesheet.date) : ''),
    c.anomalyFlag ? `${t('cases.brief.anomaly')}` : null,
    line(t('cases.brief.coords'), Number.isFinite(Number(c.latitude)) && Number.isFinite(Number(c.longitude))
      && (Number(c.latitude) !== 0 || Number(c.longitude) !== 0)
      ? `${Number(c.latitude).toFixed(4)}, ${Number(c.longitude).toFixed(4)}`
      : ''),
    c.briefFacts ? `\n${t('cases.brief.facts')}:\n${String(c.briefFacts).trim()}` : null,
  ];
  return rows.filter(Boolean).join('\n');
}
