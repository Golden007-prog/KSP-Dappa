// /ocr — route-local data hooks (lib/api.js is not edited by route fillers).
//
//   GET  /ocr/samples          → { samples:[{sampleId,file,title,truthText,kannadaLine,language}], baseUrl }
//   POST /zia/moderate         → { verdict, format, bytes, probability{}, confidence, prediction, hits[] }  meta.source
//   POST /zia/ocr              → { ok, ocrAvailable, text, confidence, language, entities[], keywords[], sentiment, moTags[] }  meta.source
//   POST /ocr/attach (admin)   → { recorded, storage, row, rowid? }  meta.source
//   GET  /ocr/attachments      → { caseId, rows:[{rowid, actor, clientTs, payload{kind,text,confidence,moTags}}] }
//
// The admin token for the attach write is kept in sessionStorage for this
// tab only (the public demo is read-only; docs/CONTRACTS.md DEMO_ADMIN_TOKEN).
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiGet, apiPost, API_BASE, ApiError } from '../../lib/api.js';

const TOKEN_KEY = 'dappa-demo-token';
const arr = (v) => (Array.isArray(v) ? v : []);

export function readToken() {
  try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
export function writeToken(v) {
  try { if (v) sessionStorage.setItem(TOKEN_KEY, v); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
}

/** Read a File as a bare base64 string (no data: prefix). */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('could not read the file'));
    r.onload = () => resolve(String(r.result || '').replace(/^data:[^,]*,/, ''));
    r.readAsDataURL(file);
  });
}

/** Fetch a sample image from public/ and return it as base64. */
export async function sampleToBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sample ${url} not found`);
  const blob = await res.blob();
  return fileToBase64(blob);
}

export function useOcrSamples() {
  return useQuery({
    queryKey: ['ocr-samples'],
    queryFn: ({ signal }) => apiGet('/ocr/samples', {}, { signal }).then((r) => ({
      samples: arr(r.data && r.data.samples),
      baseUrl: (r.data && r.data.baseUrl) || 'samples/ocr/',
    })),
    staleTime: 60 * 60 * 1000,
    retry: 0,
  });
}

export function useModerate() {
  return useMutation({ mutationFn: (imageBase64) => apiPost('/zia/moderate', { imageBase64 }) });
}

export function useOcrScan() {
  return useMutation({ mutationFn: (body) => apiPost('/zia/ocr', body) });
}

/** Admin write with the X-Admin-Token header (apiPost cannot send headers). */
export function useAttach() {
  return useMutation({
    mutationFn: async ({ body, token }) => {
      const res = await fetch(`${API_BASE}/ocr/attach`, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { 'X-Admin-Token': token } : {}),
        body: JSON.stringify(body || {}),
      });
      let json = null;
      try { json = await res.json(); } catch { json = null; }
      if (!res.ok || !json || json.ok === false) {
        const e = (json && json.error) || {};
        throw new ApiError(e.code || 'HTTP_ERROR', e.message || `HTTP ${res.status}`, res.status);
      }
      return json;
    },
  });
}

export function useAttachments(caseId) {
  return useQuery({
    queryKey: ['ocr-attachments', String(caseId || '')],
    queryFn: ({ signal }) => apiGet('/ocr/attachments', { caseId }, { signal }).then((r) => ({
      rows: arr(r.data && r.data.rows),
      source: (r.meta && r.meta.source) || '',
    })),
    enabled: /^\d{1,10}$/.test(String(caseId || '')),
    retry: 0,
  });
}
