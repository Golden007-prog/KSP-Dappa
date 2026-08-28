// Officer-tier chrome mounted by Layout (Round 2, Phase 4):
//   <TierSwitcher />         Beat / Station / District / State segmented control —
//                            the judges' demo asset (docs/DECISIONS.md D-015).
//                            Framed in the primary blue so it reads as a demo
//                            control, 44 px segments on mobile, ?tier= deep link,
//                            navigates to the tier's home on change.
//   <PlainLanguageToggle />  role="switch" bound to useTierStore.plainLanguage
//                            (default on below District).
//   <TierEyebrow />          the District tier's chrome on the dashboard route
//                            ("Commissionerate · DCP (Crime)" for Bengaluru
//                            City, "District · SP" elsewhere) plus the one-time
//                            /auth/me read that maps a signed-in Catalyst role
//                            to a tier (useAuthTier → applyRole).
// The switcher never grants a capability — it changes what is shown first and
// how it is worded (lib/tier.js).
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TIERS, TIER_HOME, useTierStore } from '../lib/tier.js';
import { useAuthTier } from '../lib/tierApi.js';
import { useLookups } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import Tooltip from './Tooltip.jsx';

// Bengaluru City is a Commissionerate: the DCP (Crime) wording is correct
// there and wrong everywhere else (design correction 4).
const COMMISSIONERATE_IDS = new Set(['0101', '101']);

export function TierSwitcher({ className = '', size = 'sm' }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tier = useTierStore((s) => s.tier);
  const setTier = useTierStore((s) => s.setTier);
  const fromRole = useTierStore((s) => s.fromRole);

  // ?tier= deep link (a judge pastes /#/beat?tier=beat) wins over storage.
  useEffect(() => {
    const q = searchParams.get('tier');
    if (q && TIERS.includes(q) && q !== tier) setTier(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const choose = (next) => {
    if (next === tier) return;
    setTier(next);
    navigate(`${TIER_HOME[next]}?tier=${next}`);
  };
  const onKeyDown = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    choose(TIERS[(i + dir + TIERS.length) % TIERS.length]);
  };
  // Desktop topbar (size 'sm') is compact at xl and grows at 2xl; the More
  // sheet (size 'md') keeps 44 px segments.
  const seg = size === 'md' ? 'min-h-[44px] px-3 text-sm' : 'min-h-[44px] xl:min-h-[36px] px-2 2xl:px-2.5 text-[11px] 2xl:text-xs';
  const eyebrow = size === 'md' ? 'inline-flex' : 'hidden 2xl:inline-flex';

  return (
    <Tooltip label={fromRole ? t('tier.switcher.roleFrom', { role: t(`tier.role.${tier}`) }) : t('tier.switcher.hint')} position="bottom" className={className}>
      <div
        role="radiogroup"
        aria-label={t('tier.switcher.aria')}
        className="inline-flex items-center gap-0.5 rounded-lg border border-primary bg-panel p-0.5"
        data-tier-switcher=""
      >
        <span className={`${eyebrow} px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary select-none`} aria-hidden="true">
          {t('tier.switcher.label')}
        </span>
        {TIERS.map((k, i) => {
          const on = k === tier;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => choose(k)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${seg} ${
                on ? 'bg-primary/15 text-primary font-semibold' : 'text-muted hover:text-ink hover:bg-grid/30'
              }`}
            >
              {t(`tier.name.${k}`)}
            </button>
          );
        })}
      </div>
    </Tooltip>
  );
}

export function PlainLanguageToggle({ className = '', size = 'sm' }) {
  const { t } = useI18n();
  const plain = useTierStore((s) => s.plainLanguage);
  const setPlain = useTierStore((s) => s.setPlainLanguage);
  const dims = size === 'md' ? 'min-h-[44px] px-3 text-sm' : 'min-h-[44px] xl:min-h-[36px] px-2.5 text-xs';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={plain}
      aria-label={t('tier.plain.aria')}
      onClick={() => setPlain(!plain)}
      className={`inline-flex items-center gap-2 rounded-lg border border-grid bg-panel text-muted hover:text-ink transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${dims} ${className}`}
    >
      {size === 'md' ? <span>{t('tier.plain.label')}</span> : (
        <>
          <span className="hidden 2xl:inline">{t('tier.plain.label')}</span>
          <span className="2xl:hidden">{t('tier.plain.short')}</span>
        </>
      )}
      <span
        aria-hidden="true"
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${plain ? 'bg-teal' : 'bg-grid'}`}
      >
        <span className={`h-4 w-4 rounded-full bg-white shadow-card transition-transform ${plain ? 'translate-x-4' : 'translate-x-0'}`} />
      </span>
      <span className="sr-only">{plain ? t('tier.plain.on') : t('tier.plain.off')}</span>
    </button>
  );
}

/** Dashboard-only tier chrome: shows the District tier's role eyebrow above
 * the command dashboard; also performs the once-per-session role → tier read. */
export function TierEyebrow({ pathname = '/' }) {
  const { t, tName } = useI18n();
  const [searchParams] = useSearchParams();
  const tier = useTierStore((s) => s.tier);
  const lookups = useLookups();
  useAuthTier();
  if (pathname !== '/' || tier !== 'district') return null;
  const districtId = searchParams.get('districtId') || '';
  const row = (lookups.data?.districts || []).find((d) => String(d.districtId) === String(districtId));
  const isCommissionerate = !districtId || COMMISSIONERATE_IDS.has(String(districtId));
  const name = districtId ? tName('districts', districtId, row?.districtName || districtId) : '';
  return (
    <p className="eyebrow mb-2 flex flex-wrap items-center gap-x-2" data-tier-eyebrow="">
      <span>{t(isCommissionerate ? 'tier.eyebrow.district' : 'tier.eyebrow.districtGeneric')}</span>
      {name && <span className="normal-case tracking-normal text-ink font-medium">· {name}</span>}
    </p>
  );
}
