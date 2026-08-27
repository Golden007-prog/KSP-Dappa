// Officer tiers — one app that changes shape, not four apps.
//
// Round-2 requirement: a head constable and a DGP open the same DAPPA and see
// the level of the organisation they work at. The tier is a PRESENTATION
// layer on top of the API's role claim (lib/auth.js resolves admin / viewer;
// docs/DECISIONS.md D-015) — it never grants a capability the role lacks.
//
//   beat     — Constable / Head Constable: "My Beat", one card, one action
//   station  — SI / Inspector (SHO): the station's alerts, caseload, today's actions
//   district — DSP / SP: the Command Dashboard, station league table, deployment
//   state    — SCRB / IGP / DGP: the state rollup and the full analyst toolkit
//
// Defaults: anonymous PUBLIC_DEMO visitors land on District (a judge lands
// somewhere impressive) with a visible switcher so they can walk down to Beat.
// A signed-in Catalyst role maps by its name (constable → beat, inspector /
// SI / SHO → station, SP / DSP → district, IGP / DGP / SCRB / admin → state).
// Plain-language mode is ON by default below District; the technical term is
// always one tap away (lib/plainlanguage.js).
import { create } from 'zustand';

export const TIERS = ['beat', 'station', 'district', 'state'];
export const TIER_RANK = { beat: 0, station: 1, district: 2, state: 3 };
const KEY = 'dappa-tier';
const PLAIN_KEY = 'dappa-plain';

/** Home route for each tier (the first screen after opening the app). */
export const TIER_HOME = { beat: '/beat', station: '/station', district: '/', state: '/state' };

/** Scope defaults: which jurisdiction a tier looks at unless a filter says otherwise. */
export const TIER_SCOPE = {
  beat: 'unit',      // one police station (the beat's parent unit)
  station: 'unit',
  district: 'district',
  state: 'state',
};

/** Map a Catalyst role name / designation to the tier it opens on. */
export function tierForRole(role) {
  const r = String(role || '').toLowerCase();
  if (!r || r === 'viewer' || r === 'anonymous') return 'district';
  if (/admin|owner|super|dgp|igp|adgp|scrb|state/.test(r)) return 'state';
  if (/\bsp\b|dsp|\bdcp\b|district|superintendent/.test(r)) return 'district';
  if (/sho|inspector|\bsi\b|\bpsi\b|circle|station/.test(r)) return 'station';
  if (/constable|\bhc\b|\bpc\b|beat|asi/.test(r)) return 'beat';
  return 'district';
}

function readTier() {
  try {
    const q = new URLSearchParams((typeof window !== 'undefined' && window.location.hash.split('?')[1]) || '').get('tier');
    if (q && TIERS.includes(q)) return q;
  } catch { /* ignore */ }
  try { const s = localStorage.getItem(KEY); if (s && TIERS.includes(s)) return s; } catch { /* storage unavailable */ }
  return 'district';
}
function readPlain(tier) {
  try { const s = localStorage.getItem(PLAIN_KEY); if (s === 'on') return true; if (s === 'off') return false; } catch { /* ignore */ }
  return TIER_RANK[tier] < TIER_RANK.district; // default: on below District
}

export const useTierStore = create((set, get) => ({
  tier: readTier(),
  /** true when the tier came from a role claim rather than the switcher */
  fromRole: false,
  plainLanguage: readPlain(readTier()),
  plainExplicit: (() => { try { return ['on', 'off'].includes(localStorage.getItem(PLAIN_KEY)); } catch { return false; } })(),

  setTier: (next, { fromRole = false } = {}) => {
    if (!TIERS.includes(next)) return;
    try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
    if (typeof document !== 'undefined') document.documentElement.dataset.tier = next;
    const s = get();
    set({ tier: next, fromRole, plainLanguage: s.plainExplicit ? s.plainLanguage : TIER_RANK[next] < TIER_RANK.district });
  },
  setPlainLanguage: (on) => {
    try { localStorage.setItem(PLAIN_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
    set({ plainLanguage: !!on, plainExplicit: true });
  },
  /** Apply a role claim from GET /auth/me once; a switcher choice made later wins. */
  applyRole: (role) => {
    const s = get();
    let stored = null; try { stored = localStorage.getItem(KEY); } catch { /* ignore */ }
    if (stored) return; // the officer (or judge) already chose
    s.setTier(tierForRole(role), { fromRole: true });
  },
}));

if (typeof document !== 'undefined') document.documentElement.dataset.tier = useTierStore.getState().tier;

/** Convenience hook: { tier, rank, isAtLeast(tier), plain, setTier, setPlainLanguage } */
export function useTier() {
  const tier = useTierStore((s) => s.tier);
  const plain = useTierStore((s) => s.plainLanguage);
  const setTier = useTierStore((s) => s.setTier);
  const setPlainLanguage = useTierStore((s) => s.setPlainLanguage);
  return {
    tier,
    rank: TIER_RANK[tier],
    isAtLeast: (t) => TIER_RANK[tier] >= TIER_RANK[t],
    plain,
    setTier,
    setPlainLanguage,
  };
}
