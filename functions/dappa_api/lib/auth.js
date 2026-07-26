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

module.exports = { whoami, signIn, signOut, listUsers, capabilitiesFor, mapCatalystUser };
