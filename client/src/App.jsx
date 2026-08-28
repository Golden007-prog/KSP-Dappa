// Route registry. Every route is lazy() code-split and wrapped in an
// ErrorBoundary keyed by pathname so a crash in one view never white-screens
// the app and resets on navigation; Suspense shows a page skeleton while a
// route chunk loads. Providers: ThemeProvider (class-strategy dark mode) and
// ToastProvider (useToast) wrap everything — including /print/brief, which
// renders OUTSIDE Layout (bare print page for SmartBrowz).
import { lazy, Suspense } from 'react';
import { Routes, Route, useLocation, Link } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import EmptyState from './components/EmptyState.jsx';
import LoadingSkeleton from './components/LoadingSkeleton.jsx';
import { ThemeProvider } from './components/ThemeProvider.jsx';
import { ToastProvider } from './components/ToastProvider.jsx';
import { LanguageProvider } from './lib/i18n.jsx';

const Dashboard = lazy(() => import('./routes/Dashboard.jsx'));
const GeoIntel = lazy(() => import('./routes/GeoIntel.jsx'));
const Trends = lazy(() => import('./routes/Trends.jsx'));
const Alerts = lazy(() => import('./routes/Alerts.jsx'));
const Network = lazy(() => import('./routes/Network.jsx'));
const Offenders = lazy(() => import('./routes/Offenders.jsx'));
const Offender360 = lazy(() => import('./routes/Offender360.jsx'));
const Identify = lazy(() => import('./routes/Identify.jsx'));
const Predict = lazy(() => import('./routes/Predict.jsx'));
const Copilot = lazy(() => import('./routes/Copilot.jsx'));
const Cases = lazy(() => import('./routes/Cases.jsx'));
const CaseDetail = lazy(() => import('./routes/CaseDetail.jsx'));
const Reports = lazy(() => import('./routes/Reports.jsx'));
const PrintBrief = lazy(() => import('./routes/PrintBrief.jsx'));
const About = lazy(() => import('./routes/About.jsx'));
const Ingest = lazy(() => import('./routes/Ingest.jsx'));
const Beat = lazy(() => import('./routes/Beat.jsx'));
const Station = lazy(() => import('./routes/Station.jsx'));
const StateHome = lazy(() => import('./routes/StateHome.jsx'));
const Glossary = lazy(() => import('./routes/Glossary.jsx'));
const Styleguide = lazy(() => import('./routes/Styleguide.jsx'));
const Ocr = lazy(() => import('./routes/Ocr.jsx'));
const AlertsDigest = lazy(() => import('./routes/AlertsDigest.jsx'));

/** Which skeleton shape fits the destination while its chunk downloads. */
function fallbackKindFor(pathname) {
  if (pathname === '/map') return 'map';
  if (pathname === '/copilot') return 'chat';
  if (pathname === '/cases' || pathname === '/offenders' || pathname === '/alerts') return 'table';
  if (/^\/(cases|offenders)\/./.test(pathname)) return 'detail';
  return 'page';
}

/** Route-shaped skeleton shown while a route chunk downloads — the placeholder
 * mirrors the destination's real footprint (map canvas, table rows, chat
 * bubbles…) so the swap to live content doesn't jump the layout. */
function RouteFallback({ kind = 'page' }) {
  if (kind === 'map') {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading map view">
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <LoadingSkeleton key={i} height={36} className="max-w-[8rem]" />
          ))}
        </div>
        <LoadingSkeleton height="min(62vh, 560px)" className="rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <LoadingSkeleton key={i} height={64} />
          ))}
        </div>
      </div>
    );
  }
  if (kind === 'table') {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading records">
        <LoadingSkeleton height={24} className="max-w-[16rem]" />
        <LoadingSkeleton height={52} className="rounded-xl" />
        <div className="space-y-2">
          <LoadingSkeleton height={30} />
          {Array.from({ length: 8 }).map((_, i) => (
            <LoadingSkeleton key={i} height={38} />
          ))}
        </div>
      </div>
    );
  }
  if (kind === 'chat') {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading Ask DAPPA">
        <LoadingSkeleton height={24} className="max-w-[16rem]" />
        <LoadingSkeleton height={72} className="max-w-[75%] rounded-2xl" />
        <div className="flex justify-end">
          <LoadingSkeleton height={48} className="max-w-[60%] rounded-2xl" />
        </div>
        <LoadingSkeleton height={110} className="max-w-[75%] rounded-2xl" />
        <LoadingSkeleton height={52} className="rounded-xl" />
      </div>
    );
  }
  if (kind === 'detail') {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading record detail">
        <div className="space-y-2">
          <LoadingSkeleton height={14} className="max-w-[10rem]" />
          <LoadingSkeleton height={26} className="max-w-[22rem]" />
        </div>
        <div className="grid lg:grid-cols-3 gap-4">
          <LoadingSkeleton height={220} className="lg:col-span-2" />
          <LoadingSkeleton height={220} />
        </div>
        <LoadingSkeleton height={180} />
      </div>
    );
  }
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading view">
      <div className="space-y-2">
        <LoadingSkeleton height={24} className="max-w-[16rem]" />
        <LoadingSkeleton height={14} className="max-w-[24rem]" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <LoadingSkeleton key={i} height={92} />
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <LoadingSkeleton height={280} />
        <LoadingSkeleton height={280} />
      </div>
    </div>
  );
}

function Boundary({ label, children }) {
  const location = useLocation();
  return (
    <ErrorBoundary key={location.pathname} label={label}>
      <Suspense fallback={<RouteFallback kind={fallbackKindFor(location.pathname)} />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

function NotFound() {
  return (
    <EmptyState
      title="Route not found"
      message="This page does not exist in the DAPPA prototype."
      action={<Link to="/" className="btn">← Back to dashboard</Link>}
    />
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <ToastProvider>
        <Routes>
          <Route
            path="/print/brief"
            element={<Boundary label="the print brief"><PrintBrief /></Boundary>}
          />
          <Route element={<Layout />}>
            <Route path="/" element={<Boundary label="the dashboard"><Dashboard /></Boundary>} />
            <Route path="/map" element={<Boundary label="GeoIntel"><GeoIntel /></Boundary>} />
            <Route path="/trends" element={<Boundary label="Trends"><Trends /></Boundary>} />
            <Route path="/alerts" element={<Boundary label="Alerts"><Alerts /></Boundary>} />
            <Route path="/alerts/digest" element={<Boundary label="the alert digest"><AlertsDigest /></Boundary>} />
            <Route path="/network" element={<Boundary label="the Network explorer"><Network /></Boundary>} />
            <Route path="/offenders" element={<Boundary label="Offenders"><Offenders /></Boundary>} />
            <Route path="/offenders/:personKey" element={<Boundary label="Offender 360"><Offender360 /></Boundary>} />
            <Route path="/identify" element={<Boundary label="Identify"><Identify /></Boundary>} />
            <Route path="/predict" element={<Boundary label="Predict"><Predict /></Boundary>} />
            <Route path="/copilot" element={<Boundary label="Ask DAPPA"><Copilot /></Boundary>} />
            <Route path="/cases" element={<Boundary label="the Case explorer"><Cases /></Boundary>} />
            <Route path="/cases/:id" element={<Boundary label="the FIR detail"><CaseDetail /></Boundary>} />
            <Route path="/reports" element={<Boundary label="Reports"><Reports /></Boundary>} />
            <Route path="/about" element={<Boundary label="About"><About /></Boundary>} />
            <Route path="/ingest" element={<Boundary label="Data ingest"><Ingest /></Boundary>} />
            <Route path="/beat" element={<Boundary label="My Beat"><Beat /></Boundary>} />
            <Route path="/station" element={<Boundary label="the Station console"><Station /></Boundary>} />
            <Route path="/state" element={<Boundary label="the State rollup"><StateHome /></Boundary>} />
            <Route path="/glossary" element={<Boundary label="the Glossary"><Glossary /></Boundary>} />
            <Route path="/styleguide" element={<Boundary label="the style guide"><Styleguide /></Boundary>} />
            <Route path="/ocr" element={<Boundary label="the FIR scanner"><Ocr /></Boundary>} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
        </ToastProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
