// /alerts — collapsible analytics drawer above the feed.
//
// Four read-outs that only make sense over the whole corpus rather than one
// card: the deviation profile, the district × severity pressure matrix, the SLA
// ageing profile, and the emerging-category watchlist. Collapsed by default so
// the feed stays the hero; the open/closed state and the active tab persist, so
// an officer who lives in the matrix gets it back on every visit.
import { useState } from 'react';
import Card from '../../components/Card.jsx';
import Tabs from '../../components/Tabs.jsx';
import Badge from '../../components/Badge.jsx';
import { fmtInt } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import ZDistribution from './ZDistribution.jsx';
import SeverityMatrix from './SeverityMatrix.jsx';
import AgeingBuckets from './AgeingBuckets.jsx';
import EmergingWatch from './EmergingWatch.jsx';

const OPEN_KEY = 'dappa-alerts-intel-open';
const TAB_KEY = 'dappa-alerts-intel-tab';
const TABS = ['deviation', 'pressure', 'ageing', 'emerging'];

const loadPref = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
};
const savePref = (key, value) => {
  try { localStorage.setItem(key, String(value)); } catch { /* private mode */ }
};

export default function IntelPanel({
  alerts, firstSeen, now, emerging,
  minAbsZ, onZ, activeDistrictId, activeSev, onCell, activeBucket, onBucket, onEmerging,
  breachedCount,
}) {
  const t = useT();
  const [open, setOpen] = useState(() => loadPref(OPEN_KEY, '0') === '1');
  const [tab, setTab] = useState(() => {
    const v = loadPref(TAB_KEY, 'deviation');
    return TABS.includes(v) ? v : 'deviation';
  });

  const toggle = () => {
    setOpen((v) => {
      savePref(OPEN_KEY, v ? '0' : '1');
      return !v;
    });
  };
  const changeTab = (v) => {
    setTab(v);
    savePref(TAB_KEY, v);
  };

  const tabs = [
    { value: 'deviation', label: t('alerts.intel.tab.deviation') },
    { value: 'pressure', label: t('alerts.intel.tab.pressure') },
    { value: 'ageing', label: t('alerts.intel.tab.ageing'), badge: breachedCount || undefined },
    { value: 'emerging', label: t('alerts.intel.tab.emerging') },
  ];

  return (
    <Card padded={false} className="!py-0">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={toggle}
          className="flex min-h-[44px] items-center gap-2 text-sm font-semibold text-ink transition-colors hover:text-primary sm:min-h-[32px]"
        >
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            className={`transition-transform ${open ? 'rotate-90' : ''}`}
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
          {t('alerts.intel.title')}
        </button>
        <Badge tone="slate" className="num">{fmtInt(alerts.length)}</Badge>
        {!open && (
          <span className="text-[11px] text-muted">{t('alerts.intel.collapsedHint')}</span>
        )}
      </div>

      {open && (
        <div className="border-t border-grid/60">
          <Tabs tabs={tabs} value={tab} onChange={changeTab} ariaLabel={t('alerts.intel.tabsAria')} className="px-3" />
          <div className="p-3">
            {tab === 'deviation' && <ZDistribution alerts={alerts} minAbsZ={minAbsZ} onPick={onZ} />}
            {tab === 'pressure' && (
              <SeverityMatrix
                alerts={alerts}
                activeDistrictId={activeDistrictId}
                activeSev={activeSev}
                onPick={onCell}
              />
            )}
            {tab === 'ageing' && (
              <AgeingBuckets
                alerts={alerts}
                firstSeen={firstSeen}
                now={now}
                activeBucket={activeBucket}
                onPick={onBucket}
              />
            )}
            {tab === 'emerging' && <EmergingWatch query={emerging} onPick={onEmerging} />}
          </div>
        </div>
      )}
    </Card>
  );
}
