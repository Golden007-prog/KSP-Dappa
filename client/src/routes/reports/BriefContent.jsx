// Weekly Intelligence Brief body — print-styled (black on white) so the same
// markup serves the /reports preview AND the /print/brief SmartBrowz target.
// Deliberately no ECharts here: tables print crisply and render identically in
// headless PDF capture. Styles are inline (print-exact, independent of the dark
// app theme). Optional props (absent → old behavior, so callers are unchanged):
//   order      — section key order from the builder (?order= on /print/brief)
//   density    — 'compact' adds the .brief-compact class (see briefStyles.jsx)
//   preparedBy — officer name/designation stamped into the header
//   execText   — officer-edited executive summary (absent → auto-composed)
//   classification — 'unclassified'|'internal'|'confidential': header banner,
//                repeating print footer text, and (confidential) a diagonal
//                print watermark
// Every heading, column and note is translated: the brief is an official
// document, so a Kannada or Hindi reader gets a fully native page.
import { fmtInt, fmtNum, fmtPct, dateLabel, monthLabel } from '../../lib/format.js';
import { useLookups } from '../../lib/api.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import {
  sevRank, selectOpenAlerts, selectTopHotspots, selectCommunities,
  selectForecastRows, selectRiskRows, hotspotLabel,
} from './select.js';
import { DEFAULT_ORDER, normalizeOrder } from './briefSections.js';
import { composeExecutiveSummary } from './exec.js';
import { annexNotes } from './annex.js';
import { classMeta, normalizeClass } from './classification.js';

const INK = '#111827';
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';
const RED = '#b91c1c';
const TEAL = '#0f766e';
const AMBER = '#b45309';

const hourFmt = (h) => (Number.isFinite(Number(h)) ? `${String(Number(h)).padStart(2, '0')}:00` : '—');

function Section({ title, children }) {
  return (
    <section style={{ marginTop: 18, breakInside: 'avoid' }}>
      <h2 style={{
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
        color: AMBER, borderBottom: `1px solid ${BORDER}`, paddingBottom: 4, marginBottom: 8,
      }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Note({ children }) {
  return <p style={{ fontSize: 12, color: MUTED, margin: '2px 0' }}>{children}</p>;
}

/** Loading / error / empty gate around one section's body. `t` is passed in so
 * this stays a stable module-level component (defining it inside BriefContent
 * would remount every table on each render). */
function SectionBody({ query, empty, t, children }) {
  if (query.isLoading) return <Note>{t('common.state.loading')}</Note>;
  if (query.error) return <Note>{t('alerts.brief.sectionUnavailable', { msg: query.error.message })}</Note>;
  if (empty) return <Note>{empty}</Note>;
  return children;
}

const th = {
  textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em',
  color: MUTED, fontWeight: 600, padding: '4px 8px', borderBottom: `1px solid ${BORDER}`,
};
const td = { fontSize: 12, color: INK, padding: '5px 8px', borderBottom: `1px solid ${BORDER}`, verticalAlign: 'top' };
const tdNum = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

function StatBox({ label, value, sub, color = INK }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 10px', flex: 1, minWidth: 110 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** Inline ▲/▼ percent change vs the prior window (print-safe inline styles).
 * goodDown=true means a fall is good (crime counts); detection rate passes
 * false. Renders nothing when either side is missing. */
function Delta({ cur, prev, goodDown = true }) {
  const c = Number(cur);
  const p = Number(prev);
  if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return null;
  const pct = ((c - p) / Math.abs(p)) * 100;
  const flat = Math.abs(pct) < 0.05;
  const up = pct >= 0;
  const good = goodDown ? !up : up;
  const color = flat ? MUTED : good ? TEAL : RED;
  return (
    <span style={{ color, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {flat ? '▪' : up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export default function BriefContent({
  data, sections, style, order, density, preparedBy, execText, classification,
}) {
  const t = useT();
  const tName = useNames();
  const { win, kpis, prevKpis, alerts, hotspots, network, forecast, risk } = data;
  const lookups = useLookups();
  const cls = normalizeClass(classification);
  const meta = classMeta(cls, t);

  // Section toggles from the /reports builder (and ?sections= on /print/brief).
  // Absent prop / absent key → section on, so existing callers are unchanged.
  const show = (key) => !sections || sections[key] !== false;
  const sectionOrder = order ? normalizeOrder(order) : DEFAULT_ORDER;
  const noneOn = DEFAULT_ORDER.every((key) => !show(key));
  const k = kpis.data || {};
  const pk = prevKpis?.data || {};
  const asPct = (v) => Number(v); // server contract: detectionRate is a PERCENT (0-100)
  const detectionPct = asPct(k.detectionRate);

  const districtName = (id, apiName) => {
    if (!id && !apiName) return '—';
    const hit = (lookups.data?.districts || []).find((d) => String(d.districtId) === String(id));
    return tName('districts', id, apiName || hit?.districtName || String(id || '')) || String(id || '—');
  };

  const openAlerts = selectOpenAlerts(data, 8);
  const topHotspots = selectTopHotspots(data, 6);
  const communities = selectCommunities(data, 5);
  const forecastRows = selectForecastRows(data, 3);
  const riskRows = selectRiskRows(data, 5);

  const priorLabel = t('alerts.brief.priorLabel', { n: win.days });

  // Coverage line: what this brief actually spans, computed from loaded data.
  const coveredDistricts = new Set([
    ...(alerts.data || []).map((a) => String(a.districtId || '')).filter(Boolean),
    ...(hotspots.data || []).map((h) => String(h.districtId || '')).filter(Boolean),
  ]).size;
  const openAlertCount = selectOpenAlerts(data, Infinity).length;
  const coverage = [
    coveredDistricts ? t('alerts.brief.cov.districts', { n: fmtInt(coveredDistricts) }) : null,
    alerts.data ? t('alerts.brief.cov.openAlerts', { n: fmtInt(openAlertCount) }) : null,
    hotspots.data ? t('alerts.brief.cov.hotspots', { n: fmtInt((hotspots.data || []).length) }) : null,
    risk.data ? t('alerts.brief.cov.stations', { n: fmtInt((risk.data || []).length) }) : null,
  ].filter(Boolean);

  const enabledLabels = sectionOrder.filter(show).map((key) => t(`alerts.section.${key}`));

  const SECTION_RENDERERS = {
    exec: () => {
      const text = (execText && String(execText).trim()) || composeExecutiveSummary(data, t, tName);
      return (
        <Section title={t('alerts.brief.h.exec')} key="exec">
          {text ? (
            <>
              {text.split(/\n{2,}/).map((para, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <p key={i} style={{ fontSize: 12.5, color: INK, lineHeight: 1.55, margin: '0 0 6px' }}>{para}</p>
              ))}
              <Note>
                {execText && String(execText).trim()
                  ? t('alerts.brief.execEdited')
                  : t('alerts.brief.execAuto')}
              </Note>
            </>
          ) : (
            <Note>{t('alerts.brief.execNotEnough')}</Note>
          )}
        </Section>
      );
    },
    annex: () => (
      <Section title={t('alerts.brief.h.annex')} key="annex">
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          {annexNotes(data, t).map((n) => (
            <li key={n.key} style={{ fontSize: 11.5, color: INK, margin: '0 0 5px', lineHeight: 1.5 }}>
              <strong>{n.title}.</strong> <span style={{ color: '#374151' }}>{n.body}</span>
            </li>
          ))}
        </ol>
      </Section>
    ),
    kpis: () => (
      <Section title={t('alerts.brief.h.kpis')} key="kpis">
        <SectionBody query={kpis} t={t}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <StatBox
              label={t('alerts.brief.kpi.totalFirs')}
              value={fmtInt(k.totalFirs)}
              sub={<>{t('alerts.brief.kpi.totalFirsSub')}{' '}<Delta cur={k.totalFirs} prev={pk.totalFirs} /> {Number.isFinite(Number(pk.totalFirs)) ? priorLabel : ''}</>}
            />
            <StatBox
              label={t('alerts.brief.kpi.mom')}
              value={Number.isFinite(Number(k.momPct)) ? fmtPct(Number(k.momPct), { sign: true, fraction: false }) : '—'}
              color={Number(k.momPct) > 0 ? RED : TEAL}
              sub={t('alerts.brief.kpi.momSub')}
            />
            <StatBox
              label={t('alerts.brief.kpi.heinous')}
              value={fmtInt(k.heinousCount)}
              color={RED}
              sub={<>{t('alerts.brief.kpi.heinousSub')}{' '}<Delta cur={k.heinousCount} prev={pk.heinousCount} /> {Number.isFinite(Number(pk.heinousCount)) ? priorLabel : ''}</>}
            />
            <StatBox
              label={t('alerts.brief.kpi.detection')}
              value={Number.isFinite(detectionPct) ? `${detectionPct.toFixed(1)}%` : '—'}
              color={TEAL}
              sub={<>{t('alerts.brief.kpi.detectionSub')}{' '}<Delta cur={asPct(k.detectionRate)} prev={asPct(pk.detectionRate)} goodDown={false} /></>}
            />
            <StatBox
              label={t('alerts.brief.kpi.activeAlerts')}
              value={fmtInt(k.activeAlerts)}
              color={Number(k.activeAlerts) > 0 ? RED : INK}
              sub={t('alerts.brief.kpi.activeAlertsSub')}
            />
          </div>
        </SectionBody>
      </Section>
    ),
    alerts: () => (
      <Section title={t('alerts.brief.h.alerts')} key="alerts">
        <SectionBody query={alerts} t={t} empty={openAlerts.length ? '' : t('alerts.brief.empty.alerts')}>
          <table style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>{t('alerts.brief.col.district')}</th>
                <th style={th}>{t('alerts.brief.col.crimeHead')}</th>
                <th style={th}>{t('alerts.brief.col.narrative')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t('alerts.brief.col.obsExp')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t('alerts.brief.col.z')}</th>
                <th style={th}>{t('alerts.brief.col.severity')}</th>
              </tr>
            </thead>
            <tbody>
              {openAlerts.map((a) => {
                const sevKey = String(a.severity || '').toLowerCase();
                return (
                  <tr key={a.alertId}>
                    <td style={td}>{districtName(a.districtId, a.districtName)}</td>
                    <td style={td}>{tName('crimeHeads', a.crimeHeadId, a.headName) || '—'}</td>
                    <td style={{ ...td, maxWidth: 260 }}>{a.narrative || '—'}</td>
                    <td style={tdNum}>{fmtInt(a.observed)} / {fmtInt(a.expected)}</td>
                    <td style={tdNum}>{fmtNum(a.zScore, 1)}</td>
                    <td style={{ ...td, color: sevRank(a.severity) >= 3 ? RED : INK, fontWeight: 600 }}>
                      {sevKey ? t(`alerts.sevLower.${sevKey}`) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </SectionBody>
      </Section>
    ),
    hotspots: () => (
      <Section title={t('alerts.brief.h.hotspots')} key="hotspots">
        <SectionBody query={hotspots} t={t} empty={topHotspots.length ? '' : t('alerts.brief.empty.hotspots')}>
          <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>{t('alerts.brief.col.hotspot')}</th>
                <th style={th}>{t('alerts.brief.col.crimeSubhead')}</th>
                <th style={th}>{t('alerts.brief.col.districtUnit')}</th>
                <th style={th}>{t('alerts.brief.col.hourBand')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t('alerts.brief.col.cases')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t('alerts.brief.col.intensity')}</th>
              </tr>
            </thead>
            <tbody>
              {topHotspots.map((h) => (
                <tr key={h.clusterId}>
                  <td style={{ ...td, fontWeight: 600 }}>{hotspotLabel(h, t, tName)}</td>
                  <td style={td}>{tName('crimeHeads', h.crimeHeadId, h.subHeadName) || '—'}</td>
                  <td style={td}>{districtName(h.districtId, h.districtName)}</td>
                  <td style={td}>{hourFmt(h.hourBandStart)}–{hourFmt(h.hourBandEnd)}</td>
                  <td style={tdNum}>{fmtInt(h.caseCount)}</td>
                  <td style={tdNum}>{fmtNum(h.intensity, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionBody>
      </Section>
    ),
    network: () => (
      <Section title={t('alerts.brief.h.network')} key="network">
        <SectionBody query={network} t={t} empty={communities.length ? '' : t('alerts.brief.empty.network')}>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {communities.map((g) => (
              <li key={g.id} style={{ fontSize: 12, color: INK, margin: '3px 0' }}>
                <strong>{t('alerts.brief.group', { id: g.id })}</strong>
                {' — '}{t('alerts.brief.members', { n: fmtInt(g.members) })}
                {' · '}{t('alerts.brief.linkedCases', { n: fmtInt(g.cases) })}
                {g.top?.label ? <> · {t('alerts.brief.keyNode', { label: g.top.label })}</> : null}
              </li>
            ))}
          </ul>
          <Note>{t('alerts.brief.networkNote')}</Note>
        </SectionBody>
      </Section>
    ),
    forecast: () => (
      <Section title={t('alerts.brief.h.forecast')} key="forecast">
        <SectionBody query={forecast} t={t} empty={forecastRows.length ? '' : t('alerts.brief.empty.forecast')}>
          <table style={{ width: '55%', minWidth: 280, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>{t('alerts.brief.col.month')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t('alerts.brief.col.predicted')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t('alerts.brief.col.interval')}</th>
              </tr>
            </thead>
            <tbody>
              {forecastRows.map((f) => (
                <tr key={f.ym}>
                  <td style={td}>{monthLabel(f.ym)}</td>
                  <td style={tdNum}>{fmtInt(f.predicted)}</td>
                  <td style={tdNum}>{fmtInt(f.lo)} – {fmtInt(f.hi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Note>
            {t('alerts.brief.model', { model: forecast.data?.model || '—' })}
            {forecast.data?.mape !== null && forecast.data?.mape !== undefined
              ? t('alerts.brief.mape', { v: fmtNum(forecast.data.mape, 1) }) : ''}
          </Note>
        </SectionBody>
        <div style={{ marginTop: 10 }}>
          <SectionBody query={risk} t={t} empty={riskRows.length ? '' : t('alerts.brief.empty.risk')}>
            <p style={{ fontSize: 11, color: MUTED, margin: '0 0 4px' }}>{t('alerts.brief.riskHeading')}</p>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {riskRows.map((s) => (
                <li key={s.unitId} style={{ fontSize: 12, color: INK, margin: '3px 0' }}>
                  <strong>{s.unitName || s.unitId}</strong>
                  {' — '}{t('alerts.brief.riskScore', { v: fmtNum(s.riskScore, 2) })}
                  {Array.isArray(s.drivers) && s.drivers.length
                    ? <> · {t('alerts.brief.drivers', { list: s.drivers.slice(0, 3).join(', ') })}</>
                    : null}
                </li>
              ))}
            </ul>
          </SectionBody>
        </div>
      </Section>
    ),
  };

  return (
    <div className={`print-page${density === 'compact' ? ' brief-compact' : ''}`} style={style}>
      {cls === 'confidential' && (
        <div className="brief-watermark" aria-hidden="true">{t('alerts.class.watermark')}</div>
      )}
      <header>
        {meta.banner && (
          <p style={{
            textAlign: 'center', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', margin: '0 0 8px',
            color: cls === 'confidential' ? RED : AMBER,
          }}
          >
            {meta.banner}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', color: '#0b1220' }}>
              {t('alerts.brief.title')}
            </h1>
            <p style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>
              {t('alerts.brief.org')}
            </p>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: MUTED }}>
            <div>{t('alerts.brief.period')}: <span style={{ color: INK }}>{dateLabel(win.from)} – {dateLabel(win.to)}</span></div>
            <div>{t('alerts.brief.window')}: {win.label}</div>
            <div>{t('alerts.brief.generated')}: {dateLabel(new Date().toISOString().slice(0, 10))}</div>
            {preparedBy ? <div>{t('alerts.brief.preparedBy')}: <span style={{ color: INK }}>{preparedBy}</span></div> : null}
          </div>
        </div>
        <p style={{ fontSize: 10, color: RED, marginTop: 6 }}>
          {t('alerts.brief.disclaimer')}
        </p>
        {coverage.length > 0 && (
          <p style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>
            {t('alerts.brief.coverage')}: {coverage.join(' · ')}
          </p>
        )}
        {enabledLabels.length > 1 && (
          <p style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
            {t('alerts.brief.contents')}: {enabledLabels.join(' · ')}
          </p>
        )}
        <hr style={{ margin: '12px 0 0', border: 0, borderTop: '2px solid #0b1220' }} />
      </header>

      {noneOn && <Note>{t('alerts.brief.noneOn')}</Note>}

      {sectionOrder.filter(show).map((key) => SECTION_RENDERERS[key]?.())}

      <footer style={{ marginTop: 24, paddingTop: 8, borderTop: `1px solid ${BORDER}`, fontSize: 10, color: MUTED, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span>{t('alerts.brief.footerLeft')}</span>
        <span>{t('alerts.brief.footerRight')}</span>
      </footer>

      {/* Repeats on every printed page (position:fixed in print — briefStyles.jsx). */}
      <div className="brief-print-footer" aria-hidden="true">
        <span style={{
          fontWeight: 700,
          color: cls === 'confidential' ? RED : MUTED,
        }}
        >
          {meta.footer}
        </span>
        <span>{t('alerts.brief.printFooterMiddle')}</span>
        <span>{t('alerts.brief.printFooterRight', { date: dateLabel(new Date().toISOString().slice(0, 10)) })}</span>
      </div>
    </div>
  );
}
