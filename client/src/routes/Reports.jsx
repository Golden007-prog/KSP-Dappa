// /reports — Weekly Intelligence Brief preview (print-styled paper page inside
// the dark app) + [Generate PDF] via POST /reports/weekly-brief (SmartBrowz when
// the flag is on; print-CSS fallback opens /print/brief and window.print()) +
// flag-gated [Email digest] (Catalyst Mail).
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useWeeklyBrief, apiPost } from '../lib/api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import BriefContent from './reports/BriefContent.jsx';
import { useBriefData, WINDOWS, DEFAULT_WINDOW } from './reports/useBriefData.js';

const DIGEST_TOOLTIP =
  'Flag-gated: needs Catalyst Mail enabled in the console (FEATURE_MAIL + verified from-address).';

export default function Reports() {
  const navigate = useNavigate();
  const [windowKey, setWindowKey] = useState(DEFAULT_WINDOW);
  const brief = useBriefData(windowKey);
  const weekly = useWeeklyBrief();
  const [pdfNote, setPdfNote] = useState(null);

  // No shared hook exists for /notify/test-digest — local mutation on the same
  // API base per the route-filler contract.
  const digest = useMutation({ mutationFn: () => apiPost('/notify/test-digest', {}) });

  const generatePdf = async () => {
    setPdfNote(null);
    try {
      const res = await weekly.mutateAsync({ window: windowKey });
      const d = res?.data || {};
      const url = d.url || d.pdfUrl || d.signedUrl || d.downloadUrl;
      if (url) {
        window.open(url, '_blank', 'noopener');
        setPdfNote({ tone: 'teal', text: 'PDF rendered by SmartBrowz — signed download link opened.', url });
      } else {
        // Fallback mode (data.mode === 'print-css' / flag off): the print route
        // takes over and triggers the browser's print → Save as PDF.
        setPdfNote({ tone: 'slate', text: 'SmartBrowz is off — opening the print view for browser print → Save as PDF.' });
        navigate(`/print/brief?window=${windowKey}&autoprint=1`);
      }
    } catch (err) {
      setPdfNote({
        tone: 'red',
        text: `${err?.message || 'Brief generation failed.'} You can still print from the print view.`,
        fallback: true,
      });
    }
  };

  const digestBlocked =
    digest.error && (digest.error.status === 403 || /FEATURE|FORBIDDEN|DISABLED/i.test(String(digest.error.code)));
  const weeklySource = weekly.data?.meta?.source;

  return (
    <div className="space-y-4 max-w-[1100px] mx-auto">
      <div>
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">Weekly Intelligence Brief — preview, PDF export, e-mail digest</p>
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
            disabled={weekly.isPending}
            onClick={generatePdf}
            title="SmartBrowz renders /print/brief to PDF; with the flag off the print view opens instead"
          >
            {weekly.isPending ? 'Rendering…' : 'Generate PDF'}
          </button>

          <button
            type="button"
            className="btn"
            disabled={digest.isPending}
            onClick={() => digest.mutate()}
            title={DIGEST_TOOLTIP}
          >
            {digest.isPending ? 'Sending…' : 'Email digest'}
          </button>

          <Link to={`/print/brief?window=${windowKey}`} className="btn" title="The SmartBrowz PDF target route">
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

        {(pdfNote || digest.isSuccess || digest.error) && (
          <div className="mt-3 space-y-1.5 text-xs">
            {pdfNote && (
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
                    <Link to={`/print/brief?window=${windowKey}`} className="text-amber hover:underline">
                      Open print view →
                    </Link>
                  </>
                )}
              </p>
            )}
            {digest.isSuccess && (
              <p className="text-teal">Digest queued — check the configured DIGEST_TO inbox.</p>
            )}
            {digest.error && (
              digestBlocked ? (
                <p className="text-muted" title={DIGEST_TOOLTIP}>
                  <Badge tone="slate">enable in console</Badge>
                  <span className="ml-2">
                    Email digest is flag-gated — turn on Catalyst Mail (FEATURE_MAIL) and verify a from-address.
                  </span>
                </p>
              ) : (
                <p className="text-signal">Digest failed: {digest.error.message}</p>
              )
            )}
          </div>
        )}
      </Card>

      <div className="rounded-xl overflow-hidden border border-grid shadow-2xl bg-white">
        <BriefContent data={brief} style={{ minHeight: 0 }} />
      </div>

      <p className="text-[11px] text-muted text-center pb-2">
        This preview is the exact markup SmartBrowz captures at <span className="num">/print/brief?window={windowKey}</span>.
      </p>
    </div>
  );
}
