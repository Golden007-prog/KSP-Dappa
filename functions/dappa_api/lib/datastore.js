'use strict';
// ZCQL wrapper. Routes describe queries as structured objects; buildZCQL turns
// them into ZCQL strings for the real Catalyst client, while the injectable
// stub client evaluates the same structured query against canned tables so
// tests exercise identical code paths.
//
// Query object shape:
//   { table, columns:[ 'Col' | 'SUM(Col)' | 'COUNT(Col)' | 'AVG(Col)' ... ],
//     where:[{col, op:'='|'!='|'>'|'>='|'<'|'<='|'like'|'in', val}],
//     groupBy:['Col'], orderBy:{col, desc}, limit:{offset, count} }

const AGG_RE = /^(SUM|COUNT|AVG|MIN|MAX)\(\s*([A-Za-z0-9_*]+)\s*\)$/i;

function esc(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  return `'${String(val).replace(/'/g, "''")}'`;
}

function buildZCQL(q) {
  const cols = (q.columns && q.columns.length ? q.columns : ['*']).join(', ');
  let sql = `SELECT ${cols} FROM ${q.table}`;
  if (q.where && q.where.length) {
    const parts = q.where.map((c) => {
      if (c.op === 'in') {
        const vals = (c.val || []).map(esc).join(', ');
        return `${c.col} IN (${vals || 'NULL'})`;
      }
      if (c.op === 'like') return `${c.col} LIKE ${esc(`%${c.val}%`)}`;
      return `${c.col} ${c.op} ${esc(c.val)}`;
    });
    sql += ` WHERE ${parts.join(' AND ')}`;
  }
  if (q.groupBy && q.groupBy.length) sql += ` GROUP BY ${q.groupBy.join(', ')}`;
  if (q.orderBy && q.orderBy.col) sql += ` ORDER BY ${q.orderBy.col} ${q.orderBy.desc ? 'DESC' : 'ASC'}`;
  if (q.limit && q.limit.count) {
    // ZCQL LIMIT [offset],value uses MySQL skip semantics: "LIMIT 1,3" returns
    // three records starting at the SECOND record, i.e. offset = rows to skip
    // (docs.catalyst.zoho.com/en/cloud-scale/help/zcql/limit). Omit the offset
    // for the first page. Keep in sync with dappa_nightly/store_catalyst.py.
    const off = Math.max(0, q.limit.offset || 0);
    sql += off > 0 ? ` LIMIT ${off},${q.limit.count}` : ` LIMIT ${q.limit.count}`;
  }
  return sql;
}

/** ZCQL returns rows keyed by table name ({Table:{...}} or {A:{..},B:{..}} for joins) — merge to flat objects. */
function flattenRow(row) {
  if (!row || typeof row !== 'object') return {};
  const keys = Object.keys(row);
  const nested = keys.every((k) => row[k] && typeof row[k] === 'object' && !Array.isArray(row[k]));
  if (!nested) return row;
  const flat = {};
  for (const k of keys) Object.assign(flat, row[k]);
  return flat;
}

function createDatastore(client) {
  return {
    /** Structured select. Returns flat plain-object rows. */
    async query(q) {
      const sql = buildZCQL(q);
      const rows = await client.execute(sql, q);
      return (rows || []).map(flattenRow);
    },
    /** Raw ZCQL (UPDATE/INSERT/special selects). */
    async raw(sql) {
      const rows = await client.execute(sql, null);
      return (rows || []).map(flattenRow);
    },
    buildZCQL
  };
}

/** Real client backed by the Catalyst SDK (per-request app instance). */
function createCatalystClient(getApp) {
  return {
    async execute(sql) {
      const app = getApp();
      if (!app) throw new Error('catalyst app unavailable');
      return app.zcql().executeZCQLQuery(sql);
    }
  };
}

// ---------------------------------------------------------------------------
// Stub client: evaluates structured queries against in-memory canned tables.
// ---------------------------------------------------------------------------

function cmp(rowVal, op, val) {
  if (op === 'in') return (val || []).some((v) => String(rowVal) === String(v));
  if (op === 'like') return String(rowVal === undefined ? '' : rowVal).toLowerCase().includes(String(val).toLowerCase());
  const bothNum = rowVal !== null && rowVal !== '' && !isNaN(Number(rowVal)) && !isNaN(Number(val));
  const a = bothNum ? Number(rowVal) : String(rowVal === undefined || rowVal === null ? '' : rowVal);
  const b = bothNum ? Number(val) : String(val === undefined || val === null ? '' : val);
  switch (op) {
    case '=': return a === b;
    case '!=': return a !== b;
    case '>': return a > b;
    case '>=': return a >= b;
    case '<': return a < b;
    case '<=': return a <= b;
    default: throw new Error(`stub: unsupported op ${op}`);
  }
}

function aggregate(fn, colVals) {
  const present = colVals.filter((v) => v !== undefined && v !== null && v !== '');
  const nums = present.map(Number).filter((n) => Number.isFinite(n));
  const allNumeric = present.length > 0 && nums.length === present.length;
  switch (fn) {
    case 'COUNT': return present.length;
    case 'SUM': return nums.reduce((s, n) => s + n, 0);
    case 'AVG': return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
    case 'MIN':
      if (!present.length) return null;
      return allNumeric ? Math.min(...nums) : present.map(String).sort()[0];
    case 'MAX':
      if (!present.length) return null;
      return allNumeric ? Math.max(...nums) : present.map(String).sort()[present.length - 1];
    default: throw new Error(`stub: unsupported aggregate ${fn}`);
  }
}

function evalQuery(q, tables) {
  let rows = (tables[q.table] || []).map((r) => Object.assign({}, r));
  if (q.where && q.where.length) {
    rows = rows.filter((r) => q.where.every((c) => cmp(r[c.col], c.op, c.val)));
  }
  const cols = q.columns && q.columns.length ? q.columns : null;
  const aggCols = (cols || []).filter((c) => AGG_RE.test(c));
  const plainCols = (cols || []).filter((c) => !AGG_RE.test(c));

  if (aggCols.length) {
    const groupCols = q.groupBy && q.groupBy.length ? q.groupBy : [];
    const groups = new Map();
    for (const r of rows) {
      const key = groupCols.map((c) => String(r[c])).join('');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    rows = [...groups.values()].map((members) => {
      const out = {};
      for (const c of groupCols.concat(plainCols)) out[c] = members[0][c];
      for (const expr of aggCols) {
        const m = expr.match(AGG_RE);
        const fn = m[1].toUpperCase();
        const col = m[2];
        const vals = col === '*' ? members.map(() => 1) : members.map((r) => r[col]);
        out[expr] = aggregate(fn, vals);
      }
      return out;
    });
  } else if (cols) {
    rows = rows.map((r) => {
      const out = {};
      for (const c of plainCols) out[c] = r[c];
      return out;
    });
  }

  if (q.orderBy && q.orderBy.col) {
    const { col, desc } = q.orderBy;
    rows.sort((a, b) => {
      const av = a[col];
      const bv = b[col];
      const bothNum = !isNaN(Number(av)) && !isNaN(Number(bv));
      const r = bothNum ? Number(av) - Number(bv) : String(av).localeCompare(String(bv));
      return desc ? -r : r;
    });
  }
  if (q.limit && q.limit.count) {
    const off = Math.max(0, q.limit.offset || 0);
    rows = rows.slice(off, off + q.limit.count);
  }
  return rows;
}

/** Split on commas that sit outside single-quoted literals. */
function splitTopLevel(s) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (const ch of String(s)) {
    if (ch === "'") { inQ = !inQ; cur += ch; } else if (ch === ',' && !inQ) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

function unquote(v) {
  const t = String(v).trim();
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
  const n = Number(t);
  return Number.isFinite(n) ? n : t;
}

/**
 * Apply a simple raw `UPDATE <table> SET Col='v'[, ...] WHERE Col='v' [AND ...]`
 * to the in-memory tables (only literal assignments + AND-ed equality — the
 * grammar the API's own writes use, e.g. alert ack/status). Anything fancier is
 * ignored. Returns the number of mutated rows. This is what makes PUBLIC_DEMO
 * writes (fixture fallback) actually stick across refetches instead of
 * silently no-oping.
 */
function applyRawWrite(sql, tables) {
  const m = String(sql).match(/^\s*UPDATE\s+([A-Za-z0-9_]+)\s+SET\s+(.+?)\s+WHERE\s+(.+?)\s*$/i);
  if (!m) return 0;
  const rows = tables[m[1]];
  if (!Array.isArray(rows)) return 0;
  const sets = [];
  for (const part of splitTopLevel(m[2])) {
    const kv = part.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (!kv) return 0;
    sets.push([kv[1], unquote(kv[2])]);
  }
  const conds = [];
  for (const part of m[3].split(/\s+AND\s+/i)) {
    const kv = part.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (!kv) return 0;
    conds.push([kv[1], unquote(kv[2])]);
  }
  let touched = 0;
  for (const r of rows) {
    if (conds.every(([c, v]) => String(r[c]) === String(v))) {
      for (const [c, v] of sets) r[c] = v;
      touched += 1;
    }
  }
  return touched;
}

/**
 * Injectable stub for tests and the PUBLIC_DEMO fixture fallback.
 * `tables` = { TableName: [flat rows...] }. Raw statements are recorded on
 * rawLog; simple UPDATEs are also applied to the tables so a write followed by
 * a re-read behaves like the real Data Store.
 */
function createStubClient(tables) {
  const rawLog = [];
  return {
    rawLog,
    async execute(sql, q) {
      if (q) return evalQuery(q, tables);
      rawLog.push(sql);
      if (/^\s*SELECT/i.test(sql)) {
        const m = sql.match(/FROM\s+([A-Za-z0-9_]+)/i);
        const table = m ? m[1] : null;
        return table && tables[table] ? tables[table].slice(0, 200) : [];
      }
      applyRawWrite(sql, tables);
      return [];
    }
  };
}

module.exports = { buildZCQL, createDatastore, createCatalystClient, createStubClient, applyRawWrite, flattenRow };
