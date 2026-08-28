// The two live regions lib/a11y.js announce() writes into. Mounted once in
// Layout. sr-only keeps them out of the visual page; aria-atomic makes the
// whole message read even when only part of it changed.
import { LIVE_REGION_IDS } from '../lib/a11y.js';

export default function LiveAnnouncer() {
  return (
    <>
      <div id={LIVE_REGION_IDS.polite} className="sr-only" role="status" aria-live="polite" aria-atomic="true" />
      <div id={LIVE_REGION_IDS.assertive} className="sr-only" role="alert" aria-live="assertive" aria-atomic="true" />
    </>
  );
}
