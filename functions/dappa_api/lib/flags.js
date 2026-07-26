'use strict';
// Env-driven feature flags. PUBLIC_DEMO defaults to true (anonymous read-only
// demo for judges).
//
// Default-ON vs default-OFF is a cost/blast-radius call, not a confidence one:
//   * ON  — services whose failure is free and instantly recoverable in-process
//           (Search -> ZCQL LIKE, File Store -> Stratus -> memory, Auth ->
//           anonymous demo identity). Attempting them is what makes the
//           coverage claim in /meta/services honest.
//   * OFF — services with a side effect or a billed call (Mail, Push, Circuits,
//           Connections, QuickML, Zia, SmartBrowz). These need a console step
//           anyway, so they stay dark until an operator turns them on.
// Every flag path has a documented fallback; nothing here can break a demo.

const TRUTHY = new Set(['on', 'true', '1', 'yes', 'enabled']);

function flagOn(name, dflt) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return Boolean(dflt);
  return TRUTHY.has(String(raw).trim().toLowerCase());
}

function getFlags() {
  const zia = flagOn('FEATURE_ZIA', false);
  return {
    quickml: flagOn('FEATURE_QUICKML', false),
    quickmlLlm: flagOn('FEATURE_QUICKML_LLM', false),
    zia,
    // Zia sub-surfaces inherit FEATURE_ZIA unless individually overridden.
    ziaOcr: flagOn('FEATURE_ZIA_OCR', zia),
    ziaTranslate: flagOn('FEATURE_ZIA_TRANSLATE', false),
    ziaAutoml: flagOn('FEATURE_ZIA_AUTOML', false),
    smartbrowz: flagOn('FEATURE_SMARTBROWZ', false),
    mail: flagOn('FEATURE_MAIL', false),
    push: flagOn('FEATURE_PUSH', false),
    search: flagOn('FEATURE_SEARCH', true),
    filestore: flagOn('FEATURE_FILESTORE', true),
    auth: flagOn('FEATURE_AUTH', true),
    connections: flagOn('FEATURE_CONNECTIONS', false),
    circuit: flagOn('FEATURE_CIRCUIT', false),
    publicDemo: flagOn('PUBLIC_DEMO', true)
  };
}

module.exports = { flagOn, getFlags };
