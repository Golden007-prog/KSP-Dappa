// One pass over the offender corpus, shared by every C5 panel.
//
// The whole pipeline — name lexicon, tag classification, per-tag reach, lift
// pairs, MO families, crew derivation and crew scoring — measures ~30 ms on the
// live 2,044-row corpus, so it runs in a single memo rather than being split
// across panels that would each redo the expensive parts.
import { useMemo } from 'react';
import { useNetworkGraph } from '../../lib/api.js';
import { useOffenderCorpus } from './corpus.js';
import {
  buildNameLexicon, classifyTags, tagStats, tagPairs, moFamilies,
} from './moVocab.js';
import { deriveCrews, scoreCrews, buildSharedCaseIndex } from './crews.js';

const EMPTY = Object.freeze([]);

export function useMoAnalysis({ enabled = true } = {}) {
  const corpus = useOffenderCorpus({ enabled });
  // Co-offending edges corroborate MO-derived crews. The endpoint caps at
  // 3,000 of the 23,833 stored edges, so this is a sample: it can only ever
  // confirm a tie, never rule one out, which is why it carries the smallest
  // driver weight and is labelled as corroboration rather than evidence.
  const graph = useNetworkGraph({ limit: 3000 });

  const rows = corpus.data?.rows || EMPTY;

  const vocab = useMemo(() => {
    if (!rows.length) return null;
    const lexicon = buildNameLexicon(rows);
    const cls = classifyTags(rows, lexicon);
    const stats = tagStats(rows, cls.signalByKey);
    const { pairs, df } = tagPairs(rows, cls.signalByKey, { minCo: 3, limit: 160 });
    const families = moFamilies(pairs, stats, { minLift: 8, maxFamilies: 14 });
    return { lexicon, ...cls, stats, pairs, df, families };
  }, [rows]);

  const rowsByKey = useMemo(() => {
    const m = new Map();
    for (const r of rows) m.set(String(r.personKey), r);
    return m;
  }, [rows]);

  const sharedCaseIndex = useMemo(
    () => buildSharedCaseIndex(graph.data?.edges || EMPTY),
    [graph.data],
  );

  const crews = useMemo(() => {
    if (!vocab || !rows.length) return EMPTY;
    const derived = deriveCrews(rows, vocab.signalByKey, vocab.df, { minSize: 3 });
    return scoreCrews(derived, rowsByKey, vocab.signalByKey, sharedCaseIndex);
  }, [vocab, rows, rowsByKey, sharedCaseIndex]);

  return {
    rows,
    rowsByKey,
    vocab,
    crews,
    isLoading: enabled && (corpus.isLoading || corpus.isPending),
    error: corpus.error,
    refetch: corpus.refetch,
    total: corpus.data?.total ?? 0,
    graphSampled: (graph.data?.edges || EMPTY).length,
  };
}
