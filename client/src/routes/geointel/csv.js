// Client-side CSV download for GeoIntel exports (stations / hotspots /
// incidents). No dependencies — builds a Blob and clicks a temp anchor.

function cell(v) {
  if (v === undefined || v === null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * columns: [{key, label}]; rows: array of plain objects.
 * filename gets a .csv suffix appended if missing.
 */
export function downloadCsv(filename, columns, rows) {
  const head = columns.map((c) => cell(c.label)).join(',');
  const body = (rows || []).map((r) => columns.map((c) => cell(r[c.key])).join(','));
  const blob = new Blob([[head, ...body].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 'stations' + {districtId,from,to} + '2026-01' → stable, filter-stamped name. */
export function exportName(kind, apiParams = {}, month = null) {
  const bits = ['geointel', kind];
  if (apiParams.districtId) bits.push(`d${apiParams.districtId}`);
  if (apiParams.crimeHeadId) bits.push(`h${apiParams.crimeHeadId}`);
  if (month) bits.push(month);
  else if (apiParams.from || apiParams.to) bits.push(`${apiParams.from || 'start'}_${apiParams.to || 'now'}`);
  return bits.join('_');
}
