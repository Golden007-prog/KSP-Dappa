// /reports — Weekly Intelligence Brief builder: window picker (presets +
// custom from/to), section toggles AND ordering (persisted, carried to
// /print/brief via ?sections= / ?order=), an optional "Prepared by" stamp,
// a classification stamp (?class= → banner/footer/watermark), an editable
// auto-composed executive summary (?exec= override), live section row counts,
// KPI deltas vs the prior window, a live print-styled preview, [Generate PDF]
// via POST /reports/weekly-brief (SmartBrowz when the flag is on; print-CSS
// fallback opens /print/brief and window.print()), copy-to-clipboard share
// summary, copy-print-link, Markdown download, per-section CSV downloads, the
// flag-gated [Email digest] (Catalyst Mail), and a visual-only scheduling card.
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
import ScheduleCard from './reports/ScheduleCard.jsx';
import {
  useBriefData, WINDOWS, DEFAULT_WINDOW, CUSTOM_WINDOW, isValidCustomRange,
} from './reports/useBriefData.js';
import {
  loadSections, saveSections, sectionsToParam,
  loadOrder, saveOrder, orderToParam, DEFAULT_ORDER,
} from './reports/briefSections.js';
import { buildShareSummary } from './reports/summary.js';
import { buildBriefMarkdown } from './reports/markdown.js';
import { exportSectionCsv } from './reports/exports.js';
import { selectOpenAlerts } from './reports/select.js';
import {
  composeExecutiveSummary, loadExecOverride, saveExecOverride, wordCount,
} from './reports/exec.js';
import { CLASS_LEVELS, loadClassification, saveClassification } from './reports/classification.js';
import { downloadBlob } from './alerts/csv.js';
import { copyText } from './copilot/clipboard.js';
import { fmtInt } from '../lib/format.js';
import { useT, useNames } from '../lib/i18n.jsx';

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
  const t = useT();
  const tName = useNames();
  const [windowKey, setWindowKey] = useState(DEFAULT_WINDOW);
  const [customFrom, setCustomFrom] = useState(() => format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [customTo, setCustomTo] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [sections, setSections] = useState(loadSections);
  const [order, setOrder] = useState(loadOrder);
  const [preparedBy, setPreparedBy] = useState(loadPreparedBy);
  const [classification, setClassification] = useState(loadClassification);
  const [execDraft, setExecDraft] = useState(loadExecOverride);
  const [execCustom, setExecCustom] = useState(() => !!loadExecOverride());
  const [execOpen, setExecOpen] = useState(false);
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
    onSuccess: () => toast.success(t('alerts.reports.toast.digestQueued')),
    onError: (err) => {
      if (err?.status === 403 || /FEATURE|FORBIDDEN|DISABLED|AUTH/i.test(String(err?.code))) {
        toast.info(t('alerts.reports.toast.digestGated'));
      } else {
        toast.error(t('alerts.reports.toast.digestFailed', { msg: err?.message || t('alerts.toast.ackFailedDefault') }));
      }
    },
  });

  const enabledKeys = order.filter((k) => sections[k] !== false);
  const sectionsParam = sectionsToParam(sections);
  const orderParam = orderToParam(order);
  // The composed summary tracks live data; a hand-edited override wins and is
  // persisted + carried to the print view (?exec=) so PDFs match the preview.
  const composedExec = brief.ready ? composeExecutiveSummary(brief, t, tName) : '';
  const execText = execCustom ? execDraft : composedExec;
  const printQs = new URLSearchParams();
  printQs.set('window', windowKey);
  if (isCustom && customOk) { printQs.set('from', customFrom); printQs.set('to', customTo); }
  if (sectionsParam) printQs.set('sections', sectionsParam);
  if (orderParam) printQs.set('order', orderParam);
  if (preparedBy.trim()) printQs.set('by', preparedBy.trim());
  if (classification !== 'unclassified') printQs.set('class', classification);
  if (execCustom && execDraft.trim()) printQs.set('exec', execDraft.trim().slice(0, 1600));
  const printSearch = `?${printQs.toString()}`;

  // Live row counts shown on the section chips once the data settles.
  const chipCounts = brief.ready ? {
    alerts: selectOpenAlerts(brief, Infinity).length,
    hotspots: (brief.hotspots.data || []).length,
    network: new Set((brief.network.data?.nodes || []).map((n) => n.communityId ?? '—')).size,
    forecast: (brief.risk.data || []).length,
  } : {};

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

  const changeClassification = (v) => {
    setClassification(v);
    saveClassification(v);
  };

  const editExec = (v) => {
    setExecDraft(v);
    setExecCustom(true);
    saveExecOverride(v);
  };

  const resetExec = () => {
    setExecDraft('');
    setExecCustom(false);
    saveExecOverride(null);
    toast.info(t('alerts.reports.toast.execReset'));
  };

  const copyPrintLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/print/brief${printSearch}`;
    const ok = await copyText(url);
    if (ok) toast.success(t('alerts.reports.toast.printLinkCopied'));
    else toast.error(t('alerts.toast.copyFailed'));
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
          setPdfNote({ tone: 'teal', text: t('alerts.reports.pdf.rendered'), url });
          toast.success(t('alerts.reports.toast.pdfReady'));
        } else {
          setPdfNote({ tone: 'slate', text: t('alerts.reports.pdf.blocked'), url });
          toast.info(t('alerts.reports.toast.pdfBlocked'));
        }
      } else {
        // Fallback mode (data.mode === 'print-css' / flag off): the print route
        // takes over and triggers the browser's print → Save as PDF.
        setPdfNote({ tone: 'slate', text: t('alerts.reports.pdf.flagOff') });
        navigate(`/print/brief${printSearch}&autoprint=1`);
      }
    } catch (err) {
      setPdfNote({
        tone: 'red',
        text: t('alerts.reports.pdf.failed', { msg: err?.message || t('alerts.reports.pdf.failedDefault') }),
        fallback: true,
      });
      toast.error(t('alerts.reports.toast.pdfFailed'));
    }
  };

  const copySummary = async () => {
    const ok = await copyText(buildShareSummary(brief, sections, {
      execText: execCustom ? execDraft : undefined,
      classification,
      t,
      tName,
    }));
    if (ok) toast.success(t('alerts.reports.toast.summaryCopied'));
    else toast.error(t('alerts.toast.copyFailed'));
  };

  const exportMarkdown = () => {
    const md = buildBriefMarkdown(brief, sections, {
      order,
      preparedBy: preparedBy.trim(),
      execText: execCustom ? execDraft : undefined,
      classification,
      t,
      tName,
    });
    downloadBlob(
      `dappa-weekly-brief-${new Date().toISOString().slice(0, 10)}.md`,
      md,
      'text/markdown;charset=utf-8',
    );
    toast.success(t('alerts.reports.toast.mdDownloaded'));
  };

  const exportCsv = (section) => {
    const label = t(`alerts.reports.csvLabel.${section}`);
    const n = exportSectionCsv(section, brief, t, tName);
    if (n) toast.success(t(n === 1 ? 'alerts.reports.toast.csvExported.one' : 'alerts.reports.toast.csvExported.other', { n: fmtInt(n), label }));
    else toast.info(t('alerts.reports.toast.csvEmpty', { label }));
  };

  const weeklySource = weekly.data?.meta?.source;

  return (
    <div className="space-y-4 max-w-[1100px] mx-auto">
      <BriefPrintStyles />
      <div>
        <h1 className="page-title">{t('alerts.reports.title')}</h1>
        <p className="page-subtitle">{t('alerts.reports.subtitle')}</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted">
            {t('alerts.reports.window')}
            <select
              className="input-dark !py-1.5 pr-7"
              value={windowKey}
              onChange={(e) => setWindowKey(e.target.value)}
              aria-label={t('alerts.reports.windowAria')}
            >
              {WINDOWS.map((w) => (
                <option key={w.value} value={w.value}>{t(`alerts.reports.win.${w.key}`)}</option>
              ))}
              <option value={CUSTOM_WINDOW}>{t('alerts.reports.custom')}</option>
            </select>
          </label>

          {isCustom && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <label className="flex items-center gap-1.5">
                {t('alerts.reports.from')}
                <input
                  type="date"
                  className="input-dark !py-1.5"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  aria-label={t('alerts.reports.fromAria')}
                />
              </label>
              <label className="flex items-center gap-1.5">
                {t('alerts.reports.to')}
                <input
                  type="date"
                  className="input-dark !py-1.5"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                  aria-label={t('alerts.reports.toAria')}
                />
              </label>
              {!customOk && <span className="text-signal">{t('alerts.reports.invalidRange')}</span>}
            </div>
          )}

          <label className="flex flex-1 min-w-[14rem] items-center gap-2 text-xs text-muted">
            {t('alerts.reports.preparedBy')}
            <input
              className="input-dark !py-1.5 flex-1 min-w-0"
              value={preparedBy}
              onChange={(e) => changePreparedBy(e.target.value)}
              placeholder={t('alerts.reports.preparedByPlaceholder')}
              maxLength={80}
              aria-label={t('alerts.reports.preparedByAria')}
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-muted">
            {t('alerts.reports.classification')}
            <select
              className="input-dark !py-1.5 pr-7"
              value={classification}
              onChange={(e) => changeClassification(e.target.value)}
              aria-label={t('alerts.reports.classificationAria')}
              title={t('alerts.reports.classificationTip')}
            >
              {CLASS_LEVELS.map((c) => (
                <option key={c} value={c}>{t(`alerts.class.${c}.label`)}</option>
              ))}
            </select>
          </label>

          <div className="ml-auto flex items-center gap-2">
            {weeklySource && (
              weeklySource === 'fallback-local'
                ? <Badge tone="slate">{t('alerts.reports.localFallback')}</Badge>
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
            title={t('alerts.reports.generatePdfTip')}
          >
            {weekly.isPending ? t('alerts.reports.rendering') : t('alerts.reports.generatePdf')}
          </button>

          <Tooltip label={t('alerts.reports.copySummaryTip')}>
            <button
              type="button"
              className="btn min-h-[44px] sm:min-h-0"
              disabled={!brief.ready || enabledKeys.length === 0}
              onClick={copySummary}
            >
              {t('alerts.reports.copySummary')}
            </button>
          </Tooltip>

          <Tooltip label={t('alerts.reports.exportMdTip')}>
            <button
              type="button"
              className="btn min-h-[44px] sm:min-h-0"
              disabled={!brief.ready || enabledKeys.length === 0}
              onClick={exportMarkdown}
            >
              {t('alerts.reports.exportMd')}
            </button>
          </Tooltip>

          <button
            type="button"
            className="btn min-h-[44px] sm:min-h-0"
            disabled={digest.isPending}
            onClick={() => digest.mutate()}
            title={t('alerts.reports.digestTip')}
          >
            {digest.isPending ? t('alerts.reports.sending') : t('alerts.reports.emailDigest')}
          </button>

          <Link to={`/print/brief${printSearch}`} className="btn min-h-[44px] sm:min-h-0" title={t('alerts.reports.openPrintViewTip')}>
            {t('alerts.reports.openPrintView')}
          </Link>

          <Tooltip label={t('alerts.reports.copyPrintLinkTip')}>
            <button type="button" className="btn min-h-[44px] sm:min-h-0" onClick={copyPrintLink}>
              {t('alerts.reports.copyPrintLink')}
            </button>
          </Tooltip>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label={t('alerts.reports.sectionsAria')}>
          <span className="text-xs text-muted mr-1">{t('alerts.reports.sections')}</span>
          {order.map((key, i) => {
            if (!DEFAULT_ORDER.includes(key)) return null;
            const label = t(`alerts.section.${key}`);
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
                  <span aria-hidden="true">{on ? '✓' : '·'}</span> {label}
                  {chipCounts[key] !== undefined && (
                    <span className="num text-muted">{fmtInt(chipCounts[key])}</span>
                  )}
                </button>
                <button
                  type="button"
                  aria-label={t('alerts.reports.moveEarlier', { label })}
                  disabled={i === 0}
                  onClick={() => moveSection(key, -1)}
                  className="px-1 py-1 min-h-[44px] sm:min-h-[26px] disabled:opacity-30 hover:text-ink"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>
                </button>
                <button
                  type="button"
                  aria-label={t('alerts.reports.moveLater', { label })}
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
            <span className="text-[11px] text-signal">{t('alerts.reports.enableOne')}</span>
          )}
        </div>

        <div className="mt-3 border-t border-grid/60 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-expanded={execOpen}
              onClick={() => setExecOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-ink min-h-[44px] sm:min-h-0 hover:text-primary transition-colors"
            >
              <svg
                width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                className={`transition-transform ${execOpen ? 'rotate-90' : ''}`}
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
              {t('alerts.reports.execToggle')}
            </button>
            <Badge tone={execCustom ? 'amber' : 'slate'}>{execCustom ? t('alerts.reports.execCustom') : t('alerts.reports.execAuto')}</Badge>
            <span className="num text-[11px] text-muted">{t('alerts.reports.execWords', { n: fmtInt(wordCount(execText)) })}</span>
          </div>
          {execOpen && (
            <div className="mt-2 space-y-2">
              <textarea
                className="input-dark w-full !text-xs leading-relaxed"
                rows={5}
                value={execText}
                onChange={(e) => editExec(e.target.value)}
                placeholder={brief.ready ? t('alerts.reports.execPlaceholderReady') : t('alerts.reports.execPlaceholderWaiting')}
                aria-label={t('alerts.reports.execAria')}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={SMALL_BTN} disabled={!execCustom} onClick={resetExec}>
                  {t('alerts.reports.execReset')}
                </button>
                <p className="text-[11px] text-muted">
                  {t('alerts.reports.execNote')}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted mr-1">{t('alerts.reports.exportData')}</span>
          <button type="button" className={SMALL_BTN} onClick={() => exportCsv('alerts')}>{t('alerts.reports.alertsCsv')}</button>
          <button type="button" className={SMALL_BTN} onClick={() => exportCsv('hotspots')}>{t('alerts.reports.hotspotsCsv')}</button>
          <button type="button" className={SMALL_BTN} onClick={() => exportCsv('risk')}>{t('alerts.reports.riskCsv')}</button>
        </div>

        {pdfNote && (
          <div className="mt-3 text-xs">
            <p className={pdfNote.tone === 'red' ? 'text-signal' : pdfNote.tone === 'teal' ? 'text-teal' : 'text-muted'}>
              {pdfNote.text}
              {pdfNote.url && (
                <>
                  {' '}
                  <a href={pdfNote.url} target="_blank" rel="noreferrer noopener" className="text-amber hover:underline">
                    {t('alerts.reports.pdf.download')}
                  </a>
                </>
              )}
              {pdfNote.fallback && (
                <>
                  {' '}
                  <Link to={`/print/brief${printSearch}`} className="text-amber hover:underline">
                    {t('alerts.reports.openPrintView')}
                  </Link>
                </>
              )}
            </p>
          </div>
        )}
      </Card>

      <ScheduleCard onTest={() => digest.mutate()} testing={digest.isPending} />

      <div className="brief-scroll rounded-xl border border-grid shadow-2xl bg-white">
        <div className="brief-a4">
          <BriefContent
            data={brief}
            sections={sections}
            order={order}
            preparedBy={preparedBy.trim()}
            execText={execCustom ? execDraft : undefined}
            classification={classification}
            style={{ minHeight: 0 }}
          />
        </div>
      </div>

      <p className="text-[11px] text-muted text-center pb-2">
        {t('alerts.reports.previewNote')} <span className="num break-all">/print/brief{printSearch}</span>
      </p>
    </div>
  );
}
