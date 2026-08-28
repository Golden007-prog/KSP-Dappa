// /offenders "Behavioural depth" tab — the corpus-wide C5 / C2 analytics that
// read careers rather than profiles: escalation ladder + watchlist, offence-type
// transitions, recidivism survival, dormant-pair re-activation, and the
// identity-resolution validation with its threshold sweep.
import EscalationLadderPanel from './EscalationLadderPanel.jsx';
import MoTransitionPanel from './MoTransitionPanel.jsx';
import RecidivismPanel from './RecidivismPanel.jsx';
import ReactivationPanel from './ReactivationPanel.jsx';
import IdentityAuditPanel from './IdentityAuditPanel.jsx';
import { useT } from '../../lib/i18n.jsx';

export default function DepthBehaviourSection() {
  const t = useT();
  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted">{t('depth.section.intro')}</p>
      <EscalationLadderPanel />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <RecidivismPanel />
        <MoTransitionPanel />
      </div>
      <ReactivationPanel />
      <IdentityAuditPanel />
    </div>
  );
}
