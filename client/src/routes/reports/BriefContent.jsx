// Weekly Intelligence Brief body — print-styled (black on white) so the same
// markup serves the /reports preview AND the /print/brief SmartBrowz target.
// Deliberately no ECharts here: tables print crisply and render identically in
// headless PDF capture. Styles are inline (print-exact, independent of the dark
// app theme). Optional props (absent → old behavior, so callers are unchanged):
//   order      — section key order from the builder (?order= on /print/brief)
//   density    — 'compact' adds the .brief-compact class (see briefStyles.jsx)
//   preparedBy — officer name/designation stamped into the header
import { fmtInt, fmtNum, fmtPct, dateLabel, monthLabel } from '../../lib/format.js';
import { useLookups } from '../../lib/api.js';
import {
  sevRank, selectOpenAlerts, selectTopHotspots, selectCommunities,
  selectForecastRows, selectRiskRows,
} from './select.js';
import { DEFAULT_ORDER, normalizeOrder } from './briefSections.js';

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

function SectionBody({ query, empty, children }) {
  if (query.isLoading) return <Note>Loading…</Note>;
  if (query.error) return <Note>Section unavailable — {query.error.message}</Note>;
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

export default function BriefContent({ data, sections, style, order, density, preparedBy }) {
  const { win, kpis, prevKpis, alerts, hotspots, network, forecast, risk } = data;
  const lookups = useLookups();
  // Section toggles from the /reports builder (and ?sections= on /print/brief).
  // Absent prop / absent key → section on, so existing callers are unchanged.
  const show = (k) => !sections || sections[k] !== false;
  const sectionOrder = order ? normalizeOrder(order) : DEFAULT_ORDER;
  const noneOn = DEFAULT_ORDER.every((k) => !show(k));
  const k = kpis.data || {};
  const pk = prevKpis?.data || {};
  const asPct = (v) => Number(v); // server contract: detectionRate is a PERCENT (0-100)
  const detectionPct = asPct(k.detectionRate);

  const districtName = (id) => {
    if (!id) return '—';
    const hit = (lookups.data?.districts || []).find((d) => String(d.districtId) === String(id));
    return hit?.districtName || String(id);
  };

  const openAlerts = selectOpenAlerts(data, 8);
  const topHotspots = selectTopHotspots(data, 6);
  const communities = selectCommunities(data, 5);
  const forecastRows = selectForecastRows(data, 3);
  const riskRows = selectRiskRows(data, 5);

  const priorLabel = `vs prior ${win.days}d`;

  const SECTION_RENDERERS = {
    kpis: () => (
      <Section title="Headline indicators" key="kpis">
        <SectionBody query={kpis}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <StatBox
              label="Total FIRs"
              value={fmtInt(k.totalFirs)}
              sub={<>registered this window{' '}<Delta cur={k.totalFirs} prev={pk.totalFirs} /> {Number.isFinite(Number(pk.totalFirs)) ? priorLabel : ''}</>}
            />
            <StatBox
              label="MoM change"
              value={Number.isFinite(Number(k.momPct)) ? fmtPct(Number(k.momPct), { sign: true, fraction: false }) : '—'}
              color={Number(k.momPct) > 0 ? RED : TEAL}
              sub="vs previous month"
            />
            <StatBox
              label="Heinous cases"
              value={fmtInt(k.heinousCount)}
              color={RED}
              sub={<>gravity: heinous{' '}<Delta cur={k.heinousCount} prev={pk.heinousCount} /> {Number.isFinite(Number(pk.heinousCount)) ? priorLabel : ''}</>}
            />
            <StatBox
              label="Detection rate"
              value={Number.isFinite(detectionPct) ? `${detectionPct.toFixed(1)}%` : '—'}
              color={TEAL}
              sub={<>chargesheet A / (A + C){' '}<Delta cur={asPct(k.detectionRate)} prev={asPct(pk.detectionRate)} goodDown={false} /></>}
            />
            <StatBox label="Active alerts" value={fmtInt(k.activeAlerts)} color={Number(k.activeAlerts) > 0 ? RED : INK} sub="unacknowledged anomalies" />
          </div>
        </SectionBody>
      </Section>
    ),
    alerts: () => (
      <Section title="New anomaly alerts" key="alerts">
        <SectionBody query={alerts} empty={openAlerts.length ? '' : 'No open anomaly alerts in this window.'}>
          <table style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>District</th>
                <th style={th}>Crime head</th>
                <th style={th}>Narrative</th>
                <th style={{ ...th, textAlign: 'right' }}>Obs / Exp</th>
                <th style={{ ...th, textAlign: 'right' }}>z</th>
                <th style={th}>Severity</th>
              </tr>
            </thead>
            <tbody>
              {openAlerts.map((a) => (
                <tr key={a.alertId}>
                  <td style={td}>{a.districtName || districtName(a.districtId)}</td>
                  <td style={td}>{a.headName || '—'}</td>
                  <td style={{ ...td, maxWidth: 260 }}>{a.narrative || '—'}</td>
                  <td style={tdNum}>{fmtInt(a.observed)} / {fmtInt(a.expected)}</td>
                  <td style={tdNum}>{fmtNum(a.zScore, 1)}</td>
                  <td style={{ ...td, color: sevRank(a.severity) >= 3 ? RED : INK, fontWeight: 600 }}>
                    {String(a.severity || '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionBody>
      </Section>
    ),
    hotspots: () => (
      <Section title="Top hotspots" key="hotspots">
        <SectionBody query={hotspots} empty={topHotspots.length ? '' : 'No hotspot clusters for this window.'}>
          <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Hotspot</th>
                <th style={th}>Crime subhead</th>
                <th style={th}>District unit</th>
                <th style={th}>Hour band</th>
                <th style={{ ...th, textAlign: 'right' }}>Cases</th>
                <th style={{ ...th, textAlign: 'right' }}>Intensity</th>
              </tr>
            </thead>
            <tbody>
              {topHotspots.map((h) => (
                <tr key={h.clusterId}>
                  <td style={{ ...td, fontWeight: 600 }}>{h.label || `Cluster ${h.clusterId}`}</td>
                  <td style={td}>{h.subHeadName || '—'}</td>
                  <td style={td}>{h.districtName || districtName(h.districtId)}</td>
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
      <Section title="Network changes — largest co-offending clusters" key="network">
        <SectionBody query={network} empty={communities.length ? '' : 'No network communities resolved.'}>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {communities.map((g) => (
              <li key={g.id} style={{ fontSize: 12, color: INK, margin: '3px 0' }}>
                <strong>Group #{g.id}</strong> — {fmtInt(g.members)} members · {fmtInt(g.cases)} linked cases
                {g.top?.label ? <> · key node: {g.top.label}</> : null}
              </li>
            ))}
          </ul>
          <Note>Communities from the identity-resolved co-accused graph (shared-case edges).</Note>
        </SectionBody>
      </Section>
    ),
    forecast: () => (
      <Section title="Forecast risks — next quarter" key="forecast">
        <SectionBody query={forecast} empty={forecastRows.length ? '' : 'No forecast available.'}>
          <table style={{ width: '55%', minWidth: 280, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Month</th>
                <th style={{ ...th, textAlign: 'right' }}>Predicted FIRs</th>
                <th style={{ ...th, textAlign: 'right' }}>Interval</th>
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
            Model: {forecast.data?.model || '—'}
            {forecast.data?.mape !== null && forecast.data?.mape !== undefined
              ? ` · backtest MAPE ${fmtNum(forecast.data.mape, 1)}%` : ''}
          </Note>
        </SectionBody>
        <div style={{ marginTop: 10 }}>
          <SectionBody query={risk} empty={riskRows.length ? '' : 'No station-risk scores available.'}>
            <p style={{ fontSize: 11, color: MUTED, margin: '0 0 4px' }}>Highest-risk stations (30-day horizon):</p>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {riskRows.map((s) => (
                <li key={s.unitId} style={{ fontSize: 12, color: INK, margin: '3px 0' }}>
                  <strong>{s.unitName || s.unitId}</strong> — risk {fmtNum(s.riskScore, 2)}
                  {Array.isArray(s.drivers) && s.drivers.length ? <> · drivers: {s.drivers.slice(0, 3).join(', ')}</> : null}
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
      <header>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', color: '#0b1220' }}>
              Weekly Intelligence Brief
            </h1>
            <p style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>
              Karnataka State Police · DAPPA decision-support prototype
            </p>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: MUTED }}>
            <div>Period: <span style={{ color: INK }}>{dateLabel(win.from)} – {dateLabel(win.to)}</span></div>
            <div>Window: {win.label}</div>
            <div>Generated: {dateLabel(new Date().toISOString().slice(0, 10))}</div>
            {preparedBy ? <div>Prepared by: <span style={{ color: INK }}>{preparedBy}</span></div> : null}
          </div>
        </div>
        <p style={{ fontSize: 10, color: RED, marginTop: 6 }}>
          Synthetic demonstration data — KSP Datathon 2026 prototype. Not real crime records.
        </p>
        <hr style={{ margin: '12px 0 0', border: 0, borderTop: `2px solid #0b1220` }} />
      </header>

      {noneOn && (
        <Note>Every section is toggled off — enable at least one section in the brief builder.</Note>
      )}

      {sectionOrder.filter(show).map((key) => SECTION_RENDERERS[key]?.())}

      <footer style={{ marginTop: 24, paddingTop: 8, borderTop: `1px solid ${BORDER}`, fontSize: 10, color: MUTED, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span>Generated by DAPPA — Data Analytics &amp; Predictive Policing Assistant (Zoho Catalyst)</span>
        <span>All figures derive from synthetic data · caste/religion are never used in analytics</span>
      </footer>
    </div>
  );
}
