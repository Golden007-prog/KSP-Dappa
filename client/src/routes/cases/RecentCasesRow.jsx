// Recently viewed cases — one-tap return chips in the explorer toolbar area.
// CaseDetail writes the list (recent.js); this row reads it at mount, so
// navigating back from a case always shows it at the head of the row.
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { readRecent, clearRecent } from './recent.js';
import { useT } from '../../lib/i18n.jsx';

/** 18-digit CrimeNos are too wide for a chip — show the 9-digit CaseNo tail. */
function shortNo(item) {
  const digits = String(item.crimeNo || '').replace(/\D/g, '');
  if (digits.length === 18) return `…${digits.slice(-9)}`;
  return item.crimeNo || `#${item.id}`;
}

export default function RecentCasesRow() {
  const t = useT();
  const location = useLocation();
  const [items, setItems] = useState(readRecent);

  if (!items.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label={t('cases.recent.aria')}>
      <span className="eyebrow">{t('cases.recent.label')}</span>
      {items.map((it) => (
        <Link
          key={it.id}
          to={{ pathname: `/cases/${it.id}`, search: location.search }}
          className="chip num !py-1.5 hover:border-primary/60 hover:text-primary transition-colors"
          title={t('cases.recent.open', { no: it.crimeNo || it.id })}
        >
          {shortNo(it)}
        </Link>
      ))}
      <button
        type="button"
        className="btn-ghost !py-1 !px-2 text-xs"
        onClick={() => { clearRecent(); setItems([]); }}
      >
        {t('common.action.clear')}
      </button>
    </div>
  );
}
