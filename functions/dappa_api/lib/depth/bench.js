'use strict';
// Offline benchmark artefacts bundled with the function. They are written by
// pipeline/depth_benchmarks.py into BOTH docs/benchmarks/ (the documented copy)
// and lib/depth/bench/ (the copy the function can actually read at runtime —
// the docs folder is outside the deployed bundle). The generator writes the
// same bytes to both places, so the numbers on screen are the documented ones.

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'bench');

function readJson(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8'));
  } catch (e) {
    return null;
  }
}

let memo = null;

/** { forecastMetrics, forecastCoverage, identityMetrics, identitySweep, recovery } — any may be null. */
function loadBench() {
  if (memo) return memo;
  memo = {
    forecastMetrics: readJson('forecast_metrics.json'),
    forecastCoverage: readJson('forecast_coverage.json'),
    identityMetrics: readJson('identity_metrics.json'),
    identitySweep: readJson('identity_sweep.json'),
    recovery: readJson('recovery_metrics.json')
  };
  return memo;
}

/** Test hook. */
function resetBench() {
  memo = null;
}

module.exports = { loadBench, resetBench, DIR };
