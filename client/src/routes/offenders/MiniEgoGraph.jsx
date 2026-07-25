// Depth-1 ego mini-graph for Offender 360 — the person plus their strongest
// co-accused links, on the shared CytoGraph canvas (concentric layout puts the
// ego in the middle). Tap an associate to jump to their Offender 360.
import { useMemo } from 'react';
import CytoGraph from '../network/CytoGraph.jsx';
import { communityColor } from '../network/graphUtils.js';
import { fmtInt } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';

const MAX_ASSOCIATES = 12;

export default function MiniEgoGraph({
  personKey, name, communityId, associates = [], nameByKey = new Map(),
  height = 230, onTapPerson,
}) {
  const t = useT();
  const elements = useMemo(() => {
    const ego = String(personKey);
    const top = [...associates]
      .sort((a, b) => (Number(b.sharedCases) || 0) - (Number(a.sharedCases) || 0))
      .slice(0, MAX_ASSOCIATES);
    const maxShared = Math.max(1, ...top.map((a) => Number(a.sharedCases) || 0));
    const nodes = [
      { data: { id: ego, label: name || ego, color: communityColor(communityId), size: 34, isEgo: 1 } },
      ...top.map((a) => ({
        data: {
          id: String(a.personKey),
          label: nameByKey.get(String(a.personKey)) || String(a.personKey),
          color: communityColor(communityId),
          size: Math.round(14 + 14 * Math.sqrt((Number(a.sharedCases) || 0) / maxShared)),
          isEgo: 0,
        },
      })),
    ];
    const edges = top.map((a) => ({
      data: {
        id: `${ego}~${a.personKey}`,
        source: ego,
        target: String(a.personKey),
        weight: a.sharedCases,
        width: 1 + 2.5 * ((Number(a.sharedCases) || 1) / maxShared),
      },
    }));
    return [...nodes, ...edges];
  }, [personKey, name, communityId, associates, nameByKey]);

  return (
    <CytoGraph
      elements={elements}
      layout="concentric"
      height={height}
      ariaLabel={t('network.o360.egoAria', {
        name: name || personKey,
        n: fmtInt(Math.min(associates.length, MAX_ASSOCIATES)),
      })}
      onNodeTap={(d) => {
        if (String(d.id) !== String(personKey)) onTapPerson?.(String(d.id));
      }}
    />
  );
}
