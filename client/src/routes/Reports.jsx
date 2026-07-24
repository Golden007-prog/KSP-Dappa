// /reports — Weekly Intelligence Brief builder: window picker + section
// toggles (persisted, carried to /print/brief via ?sections=) over a live
// print-styled preview, [Generate PDF] via POST /reports/weekly-brief
// (SmartBrowz when the flag is on; print-CSS fallback opens /print/brief and
// window.print()), a copy-to-clipboard share summary, and the flag-gated
// [Email digest] (Catalyst Mail).
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useWeeklyBrief, apiPost } from '../lib/api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import Tooltip from '../components/Tooltip.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import BriefContent from './reports/BriefContent.jsx';
import { useBriefData, WINDOWS, DEFAULT_WINDOW } from './reports/useBriefData.js';
import { BRIEF_SECTIONS, loadSections, saveSections, sectionsToParam } from './reports/briefSections.js';
import { buildShareSummary } from './reports/summary.js';
import { copyText } from './copilot/clipboard.js';

const DIGEST_TOOLTIP =
  'Flag-gated: needs Catalyst Mail enabled in the console (FEATURE_MAIL + verified from-address).';

export default function Reports() {
  const navigate = useNavigate();
  const toast = useToast();
  const [windowKey, setWindowKey] = useState(DEFAULT_WINDOW);
  const [sections, setSections] = useState(loadSections);
  const brief = useBriefData(windowKey);
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

  const enabledKeys = BRIEF_SECTIONS.filter((s) => sections[s.key] !== false).map((s) => s.key);
  const sectionsParam = sectionsToParam(sections);
  const printSearch = `?window=${windowKey}${sectionsParam ? `&sections=${sectionsParam}` : ''}`;

  const toggleSection = (key) => {
    setSections((prev) => {
      const next = { ...prev, [key]: prev[key] === false };
      saveSections(next);
      return next;
    });
  };

  const generatePdf = async () => {
    setPdfNote(null);
    try {
      const res = await weekly.mutateAsync({ window: windowKey, sections: enabledKeys });
      const d = res?.data || {};
      const url = d.url || d.pdfUrl || d.signedUrl || d.downloadUrl;
      if (url) {
        window.open(url, '_blank', 'noopener');
        setPdfNote({ tone: 'teal', text: 'PDF rendered by SmartBrowz — signed download link opened.', url });
        toast.success('Weekly brief PDF is ready');
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

  const weeklySource = weekly.data?.meta?.source;

  return (
    <div className="space-y-4 max-w-[1100px] mx-auto">
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
            </select>
          </label>

          <button
            type="button"
            className="btn-primary"
            disabled={weekly.isPending || enabledKeys.length === 0}
            onClick={generatePdf}
            title="SmartBrowz renders /print/brief to PDF; with the flag off the print view opens instead"
          >
            {weekly.isPending ? 'Rendering…' : 'Generate PDF'}
          </button>

          <Tooltip label="Copy a plain-text summary of the enabled sections">
            <button
              type="button"
              className="btn"
              disabled={!brief.ready || enabledKeys.length === 0}
              onClick={copySummary}
            >
              Copy share summary
            </button>
          </Tooltip>

          <button
            type="button"
            className="btn"
            disabled={digest.isPending}
            onClick={() => digest.mutate()}
            title={DIGEST_TOOLTIP}
          >
            {digest.isPending ? 'Sending…' : 'Email digest'}
          </button>

          <Link to={`/print/brief${printSearch}`} className="btn" title="The SmartBrowz PDF target route">
            Open print view →
          </Link>

          <div className="ml-auto flex items-center gap-2">
            {weeklySource && (
              weeklySource === 'fallback-local'
                ? <Badge tone="slate">local fallback</Badge>
                : <Badge tone="teal">SmartBrowz</Badge>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Brief sections">
          <span className="text-xs text-muted mr-1">Sections</span>
          {BRIEF_SECTIONS.map((s) => {
            const on = sections[s.key] !== false;
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggleSection(s.key)}
                className={`chip !py-1 transition-colors ${on ? '!border-primary/60 !text-primary' : 'opacity-60 hover:opacity-100'}`}
              >
                <span aria-hidden="true">{on ? '✓' : '·'}</span> {s.label}
              </button>
            );
          })}
          {enabledKeys.length === 0 && (
            <span className="text-[11px] text-signal">Enable at least one section to generate the brief.</span>
          )}
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

      <div className="rounded-xl overflow-hidden border border-grid shadow-2xl bg-white">
        <BriefContent data={brief} sections={sections} style={{ minHeight: 0 }} />
      </div>

      <p className="text-[11px] text-muted text-center pb-2">
        This preview is the exact markup SmartBrowz captures at <span className="num">/print/brief{printSearch}</span>.
      </p>
    </div>
  );
}
