// Methodology annex for the Weekly Brief — numbered notes explaining how each
// analytic in the brief is produced, phrased for a reader who did not build
// the system. Dynamic where it can be (forecast model + backtest MAPE come
// from the live payload); shared by BriefContent (print) and markdown.js.
import { fmtNum } from '../../lib/format.js';
import { translate } from '../../lib/i18n.jsx';

const en = (key, vars) => translate('en', key, vars);

const KEYS = ['alerts', 'hotspots', 'forecast', 'risk', 'network', 'sla', 'ethics'];

export function annexNotes(brief, t = en) {
  const model = brief.forecast.data?.model;
  const mape = brief.forecast.data?.mape;
  const forecastVars = {
    model: model ? t('alerts.annex.forecast.model', { model }) : '',
    mape: mape !== null && mape !== undefined
      ? t('alerts.annex.forecast.mape', { v: fmtNum(mape, 1) })
      : '',
  };
  return KEYS.map((k) => ({
    key: k,
    title: t(`alerts.annex.${k}.title`),
    body: t(`alerts.annex.${k}.body`, k === 'forecast' ? forecastVars : undefined),
  }));
}
