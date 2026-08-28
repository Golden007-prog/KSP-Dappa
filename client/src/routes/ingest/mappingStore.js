// Saved mapping templates — localStorage, per ER table. A template is the
// {targetColumn: sourceHeader} object the officer confirmed once for a given
// export format, so the second upload of the month is one click.
const KEY = 'dappa-ingest-mappings';

function readAll() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => x && x.name && x.table && x.mapping) : [];
  } catch { return []; }
}

function writeAll(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 40))); } catch { /* private mode */ }
}

export function loadTemplates(table) {
  return readAll().filter((x) => !table || x.table === table);
}

export function saveTemplate({ name, table, mapping, headers }) {
  const list = readAll().filter((x) => !(x.table === table && x.name === name));
  list.unshift({ name: String(name).slice(0, 60), table, mapping, headers: headers || [], savedAt: new Date().toISOString() });
  writeAll(list);
  return list.filter((x) => x.table === table);
}

export function deleteTemplate(table, name) {
  const list = readAll().filter((x) => !(x.table === table && x.name === name));
  writeAll(list);
  return list.filter((x) => x.table === table);
}
