// /reports — Weekly Intelligence Brief builder: window picker (presets +
// custom from/to), section toggles AND ordering (persisted, carried to
// /print/brief via ?sections= / ?order=), an optional "Prepared by" stamp,
// KPI deltas vs the prior window, a live print-styled preview, [Generate PDF]
// via POST /reports/weekly-brief (SmartBrowz when the flag is on; print-CSS
// fallback opens /print/brief and window.print()), copy-to-clipboard share
// summary, Markdown download, per-section CSV downloads, and the flag-gated
// [Email digest] (Catalyst Mail).
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { useWeeklyBrief, apiPost } from '../lib/api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import Tooltip from '../components/Tooltip.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import BriefContent from './reports/BriefContent.jsx';
import BriefPrintStyles from './reports/briefStyles.jsx';
import {
  useBriefData, WINDOWS, DEFAULT_WINDOW, CUSTOM_WINDOW, isValidCustomRange,
} from './reports/useBriefData.js';
import {
  BRIEF_SECTIONS, loadSections, saveSections, sectionsToParam,
  loadOrder, saveOrder, orderToParam,
} from './reports/briefSections.js';
import { buildShareSummary } from './reports/summary.js';
import { buildBriefMarkdown } from './reports/markdown.js';
import { exportSectionCsv } from './reports/exports.js';
import { downloadBlob } from './alerts/csv.js';
import { copyText } from './copilot/clipboard.js';
import { fmtInt } from '../lib/format.js';

const DIGEST_TOOLTIP =
  'Flag-gated: needs Catalyst Mail enabled in the console (FEATURE_MAIL + verified from-address).';

const PREPARED_KEY = 'dappa-brief-prepared-by';
const loadPreparedBy = () => {
  try { return localStorage.getItem(PREPARED_KEY) || ''; } catch { return ''; }
};
const savePreparedBy = (v) => {
  try { localStorage.setItem(PREPARED_KEY, v); } catch { /* private mode */ }
};

// 44px touch targets on mobile, compact on sm+ pointer screens.
const SMALL_BTN = 'btn !px-2.5 !text-xs min-h-[44px] sm:min-h-[30px]';

export default function Reports() {
  const navigate = useNavigate();
  const toast = useToast();
  const [windowKey, setWindowKey] = useState(DEFAULT_WINDOW);
  const [customFrom, setCustomFrom] = useState(() => format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [customTo, setCustomTo] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [sections, setSections] = useState(loadSections);
  const [order, setOrder] = useState(loadOrder);
  const [preparedBy, setPreparedBy] = useState(loadPreparedBy);
  const isCustom = windowKey === CUSTOM_WINDOW;
  const custom = isCustom ? { from: customFrom, to: customTo } : undefined;
  const customOk = !isCustom || isValidCustomRange(custom);
  const brief = useBriefData(windowKey, custom);
  const weekly = useWeeklyBrief();
  const [pdfNote, setPdfNote] = useState(null);

  // No shared hook exists for /notify/test-digest — local mutation on the same
  // API base per the route-filler contract.
  const digest = useMutation({
    mutationFn: () => apiPost('/notify/test-digest', {}),
    onSuccess: () => toast.success('Digest queued — check the configured DIGEST_TO inbox.'),
    onError: (err) => {
      if (err?.status === 403 || /FEATURE|FORBIDDEN|DISABLED|AUTH/i.test(String(err?.code))) {
        toast.info('Email digest is flag-gated — enable Catalyst Mail (FEATURE_MAIL) in the console to send it.');
      } else {
        toast.error(`Digest failed: ${err?.message || 'request failed.'}`);
      }
    },
  });

  const enabledKeys = order.filter((k) => sections[k] !== false);
  const sectionsParam = sectionsToParam(sections);
  const orderParam = orderToParam(order);
  const printQs = new URLSearchParams();
  printQs.set('window', windowKey);
  if (isCustom && customOk) { printQs.set('from', customFrom); printQs.set('to', customTo); }
  if (sectionsParam) printQs.set('sections', sectionsParam);
  if (orderParam) printQs.set('order', orderParam);
  if (preparedBy.trim()) printQs.set('by', preparedBy.trim());
  const printSearch = `?${printQs.toString()}`;

  const toggleSection = (key) => {
    setSections((prev) => {
      const next = { ...prev, [key]: prev[key] === false };
      saveSections(next);
      return next;
    });
  };

  const moveSection = (key, dir) => {
    setOrder((prev) => {
      const next = [...prev];
      const i = next.indexOf(key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      saveOrder(next);
      return next;
    });
  };

  const changePreparedBy = (v) => {
    setPreparedBy(v);
    savePreparedBy(v);
  };

  const generatePdf = async () => {
    setPdfNote(null);
    try {
      const body = { window: windowKey, sections: enabledKeys };
      if (isCustom && customOk) { body.from = customFrom; body.to = customTo; }
      const res = await weekly.mutateAsync(body);
      const d = res?.data || {};
      const url = d.url || d.pdfUrl || d.signedUrl || d.downloadUrl;
      if (url) {
        // window.open happens after an await (outside the user gesture), so
        // popup blockers may swallow it — keep the link visible either way.
        const win = window.open(url, '_blank', 'noopener');
        if (win) {
          setPdfNote({ tone: 'teal', text: 'PDF rendered by SmartBrowz — signed download link opened.', url });
          toast.success('Weekly brief PDF is ready');
        } else {
          setPdfNote({ tone: 'slate', text: 'PDF is ready, but the browser blocked the pop-up — use the Download PDF link.', url });
          toast.info('PDF ready — pop-up blocked, use the Download PDF link below.');
        }
      } else {
        // Fallback mode (data.mode === 'print-css' / flag off): the print route
        // takes over and triggers the browser's print → Save as PDF.
        setPdfNote({ tone: 'slate', text: 'SmartBrowz is off — opening the print view for browser print → Save as PDF.' });
        navigate(`/print/brief${printSearch}&autoprint=1`);
      }
    } catch (err) {
      setPdfNote({
        tone: 'red',
        text: `${err?.message || 'Brief generation failed.'} You can still print from the print view.`,
        fallback: true,
      });
      toast.error('PDF generation failed — the print view still works.');
    }
  };

  const copySummary = async () => {
    const ok = await copyText(buildShareSummary(brief, sections));
    if (ok) toast.success('Share summary copied — paste it into e-mail or WhatsApp.');
    else toast.error('Copy failed in this browser.');
  };

  const exportMarkdown = () => {
    const md = buildBriefMarkdown(brief, sections, { order, preparedBy: preparedBy.trim() });
    downloadBlob(
      `dappa-weekly-brief-${new Date().toISOString().slice(0, 10)}.md`,
      md,
      'text/markdown;charset=utf-8',
    );
    toast.success('Brief downloaded as Markdown');
  };

  const exportCsv = (section, label) => {
    const n = exportSectionCsv(section, brief);
    if (n) toast.success(`Exported ${fmtInt(n)} ${label} row${n === 1 ? '' : 's'} to CSV`);
    else toast.info(`No ${label} data to export for this window.`);
  };

  const weeklySource = weekly.data?.meta?.source;

  return (
    <div className="space-y-4 max-w-[1100px] mx-auto">
      <BriefPrintStyles />
      <div>
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">Weekly Intelligence Brief — build, preview, PDF export, share, e-mail digest</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted">
            Window
            <select
              className="input-dark !py-1.5 pr-7"
              value={windowKey}
              onChange={(e) => setWindowKey(e.target.value)}
              aria-label="Brief window"
            >
              {WINDOWS.map((w) => (
                <option key={w.value} value={w.value}>{w.label}</option>
              ))}
              <option value={CUSTOM_WINDOW}>Custom…</option>
            </select>
          </label>

          {isCustom && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <label className="flex items-center gap-1.5">
                From
                <input
                  type="date"
                  className="input-dark !py-1.5"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  aria-label="Custom window start date"
                />
              </label>
              <label className="flex items-center gap-1.5">
                To
                <input
                  type="date"
                  className="input-dark !py-1.5"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                  aria-label="Custom window end date"
                />
              </label>
              {!customOk && <span className="text-signal">Pick a valid from → to range.</span>}
            </div>
          )}

          <label className="flex flex-1 min-w-[14rem] items-center gap-2 text-xs text-muted">
            Prepared by
            <input
              className="input-dark !py-1.5 flex-1 min-w-0"
              value={preparedBy}
              onChange={(e) => changePreparedBy(e.target.value)}
              placeholder="Officer name & designation (optional)"
              maxLength={80}
              aria-label="Prepared by (stamped into the brief header)"
            />
          </label>

          <div className="ml-auto flex items-center gap-2">
            {weeklySource && (
              weeklySource === 'fallback-local'
                ? <Badge tone="slate">local fallback</Badge>
                : <Badge tone="teal">SmartBrowz</Badge>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-primary min-h-[44px] sm:min-h-0"
            disabled={weekly.isPending || enabledKeys.length === 0 || !customOk}
            onClick={generatePdf}
            title="SmartBrowz renders /print/brief to PDF; with the flag off the print view opens instead"
          >
            {weekly.isPending ? 'Rendering…' : 'Generate PDF'}
          </button>

          <Tooltip label="Copy a plain-text summary of the enabled sections">
            <button
              type="button"
              className="btn min-h-[44px] sm:min-h-0"
              disabled={!brief.ready || enabledKeys.length === 0}
              onClick={copySummary}
            >
              Copy share summary
            </button>
          </Tooltip>

          <Tooltip label="Download the enabled sections as a Markdown file">
            <button
              type="button"
              className="btn min-h-[44px] sm:min-h-0"
              disabled={!brief.ready || enabledKeys.length === 0}
              onClick={exportMarkdown}
            >
              Export .md
            </button>
          </Tooltip>

          <button
            type="button"
            className="btn min-h-[44px] sm:min-h-0"
            disabled={digest.isPending}
            onClick={() => digest.mutate()}
            title={DIGEST_TOOLTIP}
          >
            {digest.isPending ? 'Sending…' : 'Email digest'}
          </button>

          <Link to={`/print/brief${printSearch}`} className="btn min-h-[44px] sm:min-h-0" title="The SmartBrowz PDF target route">
            Open print view →
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Brief sections (toggle and reorder)">
          <span className="text-xs text-muted mr-1">Sections</span>
          {order.map((key, i) => {
            const s = BRIEF_SECTIONS.find((x) => x.key === key);
            if (!s) return null;
            const on = sections[key] !== false;
            return (
              <span
                key={key}
                className={`inline-flex items-center rounded-full border bg-panel text-xs transition-colors ${
                  on ? 'border-primary/60 text-primary' : 'border-grid text-muted opacity-70'
                }`}
              >
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleSection(key)}
                  className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 min-h-[44px] sm:min-h-[26px]"
                >
                  <span aria-hidden="true">{on ? '✓' : '·'}</span> {s.label}
                </button>
                <button
                  type="button"
                  aria-label={`Move ${s.label} earlier in the brief`}
                  disabled={i === 0}
                  onClick={() => moveSection(key, -1)}
                  className="px-1 py-1 min-h-[44px] sm:min-h-[26px] disabled:opacity-30 hover:text-ink"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>
                </button>
                <button
                  type="button"
                  aria-label={`Move ${s.label} later in the brief`}
                  disabled={i === order.length - 1}
                  onClick={() => moveSection(key, 1)}
                  className="pl-1 pr-1.5 py-1 min-h-[44px] sm:min-h-[26px] disabled:opacity-30 hover:text-ink"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg>
                </button>
              </span>
            );
          })}
          {enabledKeys.length === 0 && (
            <span className="text-[11px] text-signal">Enable at least one section to generate the brief.</span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted mr-1">Export data</span>
          <button type="button" className={SMALL_BTN} onClick={() => exportCsv('alerts', 'alert')}>Alerts CSV</button>
          <button type="button" className={SMALL_BTN} onClick={() => exportCsv('hotspots', 'hotspot')}>Hotspots CSV</button>
          <button type="button" className={SMALL_BTN} onClick={() => exportCsv('risk', 'risk-station')}>Risk stations CSV</button>
        </div>

        {pdfNote && (
          <div className="mt-3 text-xs">
            <p className={pdfNote.tone === 'red' ? 'text-signal' : pdfNote.tone === 'teal' ? 'text-teal' : 'text-muted'}>
              {pdfNote.text}
              {pdfNote.url && (
                <>
                  {' '}
                  <a href={pdfNote.url} target="_blank" rel="noreferrer noopener" className="text-amber hover:underline">
                    Download PDF
                  </a>
                </>
              )}
              {pdfNote.fallback && (
                <>
                  {' '}
                  <Link to={`/print/brief${printSearch}`} className="text-amber hover:underline">
                    Open print view →
                  </Link>
                </>
              )}
            </p>
          </div>
        )}
      </Card>

      <div className="brief-scroll rounded-xl border border-grid shadow-2xl bg-white">
        <div className="brief-a4">
          <BriefContent
            data={brief}
            sections={sections}
            order={order}
            preparedBy={preparedBy.trim()}
            style={{ minHeight: 0 }}
          />
        </div>
      </div>

      <p className="text-[11px] text-muted text-center pb-2">
        This preview is the exact markup SmartBrowz captures at <span className="num break-all">/print/brief{printSearch}</span>.
      </p>
    </div>
  );
}
