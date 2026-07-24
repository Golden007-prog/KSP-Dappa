'use strict';
// Env-driven feature flags. Everything defaults to the fallback path;
// PUBLIC_DEMO defaults to true (anonymous read-only demo for judges).

const TRUTHY = new Set(['on', 'true', '1', 'yes', 'enabled']);

function flagOn(name, dflt) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return Boolean(dflt);
  return TRUTHY.has(String(raw).trim().toLowerCase());
}

function getFlags() {
  return {
    quickml: flagOn('FEATURE_QUICKML', false),
    quickmlLlm: flagOn('FEATURE_QUICKML_LLM', false),
    zia: flagOn('FEATURE_ZIA', false),
    smartbrowz: flagOn('FEATURE_SMARTBROWZ', false),
    mail: flagOn('FEATURE_MAIL', false),
    publicDemo: flagOn('PUBLIC_DEMO', true)
  };
}

module.exports = { flagOn, getFlags };
