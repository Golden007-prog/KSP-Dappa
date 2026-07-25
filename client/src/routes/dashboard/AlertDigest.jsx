// Alert digest strip — open-alert counts by severity as clickable badges
// above the live feed; each deep-links to /alerts with the filters carried.
import { Link } from 'react-router-dom';
import Badge from '../../components/Badge.jsx';
import { fmtInt } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';

const SEVS = [
  { key: 'critical', tone: 'red', pulse: true },
  { key: 'high', tone: 'red', pulse: false },
  { key: 'medium', tone: 'amber', pulse: false },
  { key: 'low', tone: 'neutral', pulse: false },
];

export default function AlertDigest({ alerts = [], linkSearch = '' }) {
  const t = useT();
  const counts = {};
  for (const a of alerts) {
    const sev = String(a.severity || 'medium').toLowerCase();
    counts[sev] = (counts[sev] || 0) + 1;
  }
  const shown = SEVS.filter((s) => counts[s.key] > 0);
  if (!shown.length) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label={t('dashboard.alerts.digestAria')}>
      {shown.map((s) => {
        const sev = t(`dashboard.sev.${s.key}`);
        return (
          <Link
            key={s.key}
            to={`/alerts${linkSearch}`}
            title={t('dashboard.alerts.digestTitle', { n: counts[s.key], sev })}
            className="inline-flex min-h-[40px] items-center rounded-lg px-0.5 transition-opacity hover:opacity-80"
          >
            <Badge tone={s.tone} pulse={s.pulse}>{sev} {fmtInt(counts[s.key])}</Badge>
          </Link>
        );
      })}
    </div>
  );
}
