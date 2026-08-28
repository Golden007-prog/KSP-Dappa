'use strict';
// Catalyst Authentication (User Management).
//
// Real path : ctx.services.auth.currentUser() -> capp.userManagement()
//             .getCurrentUser(), which resolves the Catalyst session attached
//             to the request. ctx.services.auth.allUsers() -> getAllUsers().
// Flag      : FEATURE_AUTH (on by default — a miss costs one failed round trip
//             and degrades to the anonymous demo identity).
// Fallback  : the anonymous PUBLIC_DEMO identity. GET /auth/me is ALWAYS a 200
//             with authenticated:false rather than a 401, because anonymous
//             read-only browsing is the judged demo mode and the client keys
//             its UI off `capabilities`, not off an error.
//
// Role claim resolution order:
//   1. Catalyst user role (role_details.role_name) when a session exists,
//   2. 'admin' when the request carries the matching admin token,
//   3. 'viewer' otherwise.

const { isAuthed, DEMO_ADMIN_TOKEN } = require('./envelope');

const ADMIN_ROLE_RE = /admin|owner|super/i;

// Officer tiers (Round 2): a Catalyst role_details.role_name maps to the tier
// the app opens on. Mirrors client/src/lib/tier.js tierForRole so the server
// claim and the client switcher agree; the tier is presentation, never a
// capability (docs/DECISIONS.md D-015).
const TIERS = ['beat', 'station', 'district', 'state'];
const ROLE_TIER_RULES = [
  { tier: 'state', pattern: 'admin|owner|super|dgp|igp|adgp|scrb|state', examples: ['App Administrator', 'DGP', 'SCRB'] },
  { tier: 'district', pattern: '\\bsp\\b|dsp|\\bdcp\\b|district|superintendent', examples: ['SP', 'DSP', 'District'] },
  { tier: 'station', pattern: 'sho|inspector|\\bsi\\b|\\bpsi\\b|circle|station', examples: ['SHO', 'Inspector', 'PSI'] },
  { tier: 'beat', pattern: 'constable|\\bhc\\b|\\bpc\\b|beat|asi', examples: ['Constable', 'HC', 'Beat'] }
];
const ROLE_TIER_RE = ROLE_TIER_RULES.map((r) => ({ tier: r.tier, re: new RegExp(r.pattern, 'i') }));

function tierForRole(role) {
  const r = String(role || '').toLowerCase();
  if (!r || r === 'viewer' || r === 'anonymous') return 'district';
  for (const rule of ROLE_TIER_RE) if (rule.re.test(r)) return rule.tier;
  return 'district';
}

function capabilitiesFor(role) {
  const admin = ADMIN_ROLE_RE.test(String(role || ''));
  return {
    read: true,
    exportCsv: true,
    acknowledgeAlerts: admin,
    sendDigest: admin,
    manageWatchlist: admin,
    runRefresh: admin,
    bulkInsert: admin
  };
}

function anonymousIdentity(ctx, req) {
  const tokenAdmin = isAuthed(req);
  const role = tokenAdmin ? 'admin' : 'viewer';
  return {
    authenticated: tokenAdmin,
    anonymous: !tokenAdmin,
    user: tokenAdmin
      ? { userId: 'demo-admin', email: null, firstName: 'Demo', lastName: 'Administrator', status: 'ACTIVE' }
      : null,
    role,
    tier: tierForRole(role),
    roleSource: tokenAdmin ? 'admin-token' : 'anonymous',
    capabilities: capabilitiesFor(role),
    publicDemo: Boolean(ctx.flags.publicDemo),
    source: 'fallback-local'
  };
}

function mapCatalystUser(u) {
  const user = u || {};
  const roleName = (user.role_details && user.role_details.role_name) || user.role_name || null;
  return {
    userId: String(user.user_id || user.zuid || ''),
    zuid: user.zuid ? String(user.zuid) : null,
    email: user.email_id || null,
    firstName: user.first_name || null,
    lastName: user.last_name || null,
    status: user.status || null,
    orgId: user.org_id || null,
    roleName
  };
}

/**
 * Resolve the caller's identity. Never throws, never 401s — an unreachable
 * User Management service degrades to the anonymous demo identity.
 */
async function whoami(ctx, req) {
  if (!ctx.flags.auth || !ctx.services.auth) return anonymousIdentity(ctx, req);
  try {
    const raw = await ctx.services.auth.currentUser();
    if (!raw || (!raw.user_id && !raw.zuid)) return anonymousIdentity(ctx, req);
    const user = mapCatalystUser(raw);
    // A console admin role wins; otherwise the admin token can still elevate a
    // signed-in viewer for the demo's write actions.
    const role = ADMIN_ROLE_RE.test(String(user.roleName || '')) ? 'admin'
      : isAuthed(req) ? 'admin' : (user.roleName || 'viewer');
    return {
      authenticated: true,
      anonymous: false,
      user,
      role,
      tier: tierForRole(user.roleName || role),
      roleSource: ADMIN_ROLE_RE.test(String(user.roleName || '')) ? 'catalyst-role' : (isAuthed(req) ? 'admin-token' : 'catalyst-role'),
      capabilities: capabilitiesFor(role),
      publicDemo: Boolean(ctx.flags.publicDemo),
      source: 'catalyst-auth'
    };
  } catch (e) {
    return anonymousIdentity(ctx, req);
  }
}

/**
 * Sign-in. Catalyst's own sign-in is a hosted flow driven by the Auth JS SDK in
 * the browser, so the server side of it is "tell me who the session says you
 * are". The token path is the documented demo fallback that unlocks the same
 * admin capabilities without a console user.
 */
async function signIn(ctx, req, body) {
  const b = body || {};
  const token = String(b.token || b.adminToken || '').trim();
  const expected = process.env.ADMIN_TOKEN || DEMO_ADMIN_TOKEN;
  const identity = await whoami(ctx, req);
  if (identity.authenticated && identity.source === 'catalyst-auth') {
    return { ok: true, mode: 'catalyst-session', identity, note: 'A Catalyst Authentication session is already attached to this request.' };
  }
  if (token && token === expected) {
    return {
      ok: true,
      mode: 'demo-token',
      identity: Object.assign({}, anonymousIdentity(ctx, { headers: { 'x-admin-token': token } }), { source: 'fallback-local' }),
      header: 'X-Admin-Token',
      note: 'Send this token as the X-Admin-Token header (or Authorization: Bearer) on write actions.'
    };
  }
  return { ok: false, mode: token ? 'invalid-token' : 'no-credentials', identity };
}

/** Sign-out. The Catalyst session itself is cleared browser-side by the Auth
 * SDK; the server can only confirm and tell the client which header to drop. */
async function signOut(ctx, req) {
  const identity = await whoami(ctx, req);
  return {
    ok: true,
    signedOut: true,
    mode: identity.source === 'catalyst-auth' ? 'catalyst-session' : 'demo-token',
    clearHeaders: ['X-Admin-Token', 'Authorization'],
    note: identity.source === 'catalyst-auth'
      ? 'Call catalyst.auth.signOut() in the client to end the hosted Catalyst session.'
      : 'Drop the demo admin header; anonymous read access continues to work.'
  };
}

/** Project user directory (admin only). Empty list when unreachable. */
async function listUsers(ctx) {
  if (!ctx.flags.auth || !ctx.services.auth || !ctx.services.auth.allUsers) {
    return { users: [], source: 'fallback-local', note: 'Catalyst User Management not reachable from this runtime.' };
  }
  try {
    const raw = await ctx.services.auth.allUsers();
    return { users: (raw || []).map(mapCatalystUser), source: 'catalyst-auth' };
  } catch (e) {
    return { users: [], source: 'fallback-local', error: String((e && e.message) || e) };
  }
}

/**
 * Invite an officer with the console role for a tier (backlog row 160).
 * Real path: userManagement().registerUser({platform_type:'web', redirect_url,
 * template_details}, {first_name, last_name, email_id, role_id}); the role_id
 * comes from the console (AUTH_ROLE_ID_<TIER>). Development projects cap
 * registrations at 25 users. Never throws; reports console-pending when the
 * role id or the service is missing.
 */
async function inviteUser(ctx, opts) {
  const o = opts || {};
  const tier = String(o.tier || 'station');
  const roleId = String(process.env[`AUTH_ROLE_ID_${tier.toUpperCase()}`] || '').trim();
  const base = { email: o.email, tier, roleIdSet: Boolean(roleId) };
  if (!ctx.flags.auth) return Object.assign(base, { invited: false, mode: 'disabled', source: 'fallback-local', note: 'FEATURE_AUTH off' });
  if (!ctx.services.auth || !ctx.services.auth.register) return Object.assign(base, { invited: false, mode: 'console-pending', source: 'fallback-local', note: 'User Management not reachable from this runtime (deployed only)' });
  if (!roleId) return Object.assign(base, { invited: false, mode: 'console-pending', source: 'fallback-local', note: `Create the ${tier} role under Authentication > Roles and set AUTH_ROLE_ID_${tier.toUpperCase()}` });
  try {
    const out = await ctx.services.auth.register(
      { platform_type: 'web', redirect_url: process.env.APP_BASE_URL || undefined },
      { first_name: String(o.firstName || 'Officer'), last_name: String(o.lastName || tier), email_id: String(o.email), role_id: roleId }
    );
    const user = out && out.user_details ? mapCatalystUser(out.user_details) : null;
    return Object.assign(base, { invited: true, mode: 'catalyst-register', user, source: 'catalyst-auth' });
  } catch (e) {
    return Object.assign(base, { invited: false, mode: 'error-fallback', error: String((e && e.message) || e).slice(0, 200), source: 'fallback-local' });
  }
}

module.exports = { whoami, signIn, signOut, listUsers, inviteUser, capabilitiesFor, mapCatalystUser, tierForRole, TIERS, ROLE_TIER_RULES };
