// Route registry. Every route is wrapped in an ErrorBoundary keyed by pathname
// so a crash in one view never white-screens the app and resets on navigation.
// /print/brief renders OUTSIDE Layout (bare print page for SmartBrowz).
import { Routes, Route, useLocation, Link } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import EmptyState from './components/EmptyState.jsx';

import Dashboard from './routes/Dashboard.jsx';
import GeoIntel from './routes/GeoIntel.jsx';
import Trends from './routes/Trends.jsx';
import Alerts from './routes/Alerts.jsx';
import Network from './routes/Network.jsx';
import Offenders from './routes/Offenders.jsx';
import Offender360 from './routes/Offender360.jsx';
import Predict from './routes/Predict.jsx';
import Copilot from './routes/Copilot.jsx';
import Cases from './routes/Cases.jsx';
import CaseDetail from './routes/CaseDetail.jsx';
import Reports from './routes/Reports.jsx';
import PrintBrief from './routes/PrintBrief.jsx';
import About from './routes/About.jsx';

function Boundary({ label, children }) {
  const location = useLocation();
  return (
    <ErrorBoundary key={location.pathname} label={label}>
      {children}
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
        <Route path="/network" element={<Boundary label="the Network explorer"><Network /></Boundary>} />
        <Route path="/offenders" element={<Boundary label="Offenders"><Offenders /></Boundary>} />
        <Route path="/offenders/:personKey" element={<Boundary label="Offender 360"><Offender360 /></Boundary>} />
        <Route path="/predict" element={<Boundary label="Predict"><Predict /></Boundary>} />
        <Route path="/copilot" element={<Boundary label="Ask DAPPA"><Copilot /></Boundary>} />
        <Route path="/cases" element={<Boundary label="the Case explorer"><Cases /></Boundary>} />
        <Route path="/cases/:id" element={<Boundary label="the FIR detail"><CaseDetail /></Boundary>} />
        <Route path="/reports" element={<Boundary label="Reports"><Reports /></Boundary>} />
        <Route path="/about" element={<Boundary label="About"><About /></Boundary>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
