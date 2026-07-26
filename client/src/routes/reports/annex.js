// Methodology annex for the Weekly Brief — numbered notes explaining how each
// analytic in the brief is produced, phrased for a reader who did not build
// the system. Dynamic where it can be (forecast model + backtest MAPE come
// from the live payload, and the socio-economic note states how many districts
// actually had enough variance to correlate); shared by BriefContent (print),
// markdown.js, exportHtml.js and exportJson.js.
import { fmtNum } from '../../lib/format.js';
import { translate } from '../../lib/i18n.jsx';

const en = (key, vars) => translate('en', key, vars);

const KEYS = ['alerts', 'severity', 'hotspots', 'emerging', 'socio', 'forecast', 'risk', 'network', 'sla', 'triage', 'ethics'];

export function annexNotes(brief, t = en) {
  const model = brief.forecast.data?.model;
  const mape = brief.forecast.data?.mape;
  const vars = {
    forecast: {
      model: model ? t('alerts.annex.forecast.model', { model }) : '',
      mape: mape !== null && mape !== undefined
        ? t('alerts.annex.forecast.mape', { v: fmtNum(mape, 1) })
        : '',
    },
    socio: {
      n: (brief.socio?.data?.points || []).length,
      window: brief.socio?.data?.fromYm && brief.socio?.data?.toYm
        ? `${brief.socio.data.fromYm} – ${brief.socio.data.toYm}` : '—',
    },
    emerging: {
      window: brief.emerging?.data?.fromYm && brief.emerging?.data?.anchorYm
        ? `${brief.emerging.data.fromYm} – ${brief.emerging.data.anchorYm}` : '—',
    },
  };
  return KEYS.map((k) => ({
    key: k,
    title: t(`alerts.annex.${k}.title`),
    body: t(`alerts.annex.${k}.body`, vars[k]),
  }));
}
