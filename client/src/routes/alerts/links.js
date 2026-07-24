// /alerts — deep-link builders. caseDrillHref is the alert-to-case drill: it
// opens /cases pre-filtered to the alert's district + crime head + anomaly
// period using the shared URL filter keys (districtId/crimeHeadId/from/to),
// so the case list shows exactly the FIRs behind the spike.
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function caseDrillHref(a) {
  if (!a?.districtId) return null;
  const p = new URLSearchParams();
  p.set('districtId', String(a.districtId));
  if (a.crimeHeadId !== undefined && a.crimeHeadId !== null && a.crimeHeadId !== '') {
    p.set('crimeHeadId', String(a.crimeHeadId));
  }
  const from = String(a.periodStart || '').slice(0, 10);
  const to = String(a.periodEnd || '').slice(0, 10);
  if (ISO_RE.test(from)) p.set('from', from);
  if (ISO_RE.test(to)) p.set('to', to);
  return `/cases?${p.toString()}`;
}
