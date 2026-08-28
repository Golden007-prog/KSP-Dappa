// The accessibility plumbing Layout mounts once:
//   • the two live regions announce() writes into (LiveAnnouncer)
//   • focus moves to the view's <h1> after every navigation (lib/a11y.js
//     focusMainHeading) — not on the first paint, where the document itself
//     keeps focus so the skip link stays the first Tab stop
//   • document.title follows a route-registered title (useDocumentTitle) when
//     one exists, else the nav-derived name Layout passes in; the pending
//     alert count is prefixed in one place either way
// Props: viewName (Layout's nav-derived name), pendingCount (open alerts).
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import LiveAnnouncer from './LiveAnnouncer.jsx';
import { focusMainHeading, formatDocumentTitle, getRouteTitle, onRouteTitleChange } from '../lib/a11y.js';

export default function ShellA11y({ viewName, pendingCount = 0 }) {
  const location = useLocation();
  const first = useRef(true);
  const [, bump] = useState(0);

  useEffect(() => onRouteTitleChange(() => bump((n) => n + 1)), []);

  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    return focusMainHeading();
  }, [location.pathname]);

  useEffect(() => {
    const view = getRouteTitle(location.pathname) || viewName;
    document.title = formatDocumentTitle(view, pendingCount);
  });

  return <LiveAnnouncer />;
}
