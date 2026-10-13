/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Layout } from '../components/Layout'
import { clip } from '../format'
import type { EmailTemplate } from '../template'
import { type BattleDropPayload, battleDrop, DropCard } from './battleDrop'
import { battleResults } from './battleResults'
import { type ResultsBlock, ResultsCard, resultsHeadline } from './results'

export interface BattleMondayPayload {
  results: ResultsBlock
  drop: BattleDropPayload
}

/**
 * `battle.monday`, el **Lunes de batalla** (§2.12.2, Anexo H): un solo email con los resultados de la semana
 * que se acaba de sellar (el personal o el podio) y, debajo, el drop nuevo con su cuenta atrás.
 */
export const battleMonday: EmailTemplate<BattleMondayPayload> = {
  subject: (p) => {
    const head = `${resultsHeadline(p.results)} · Nuevo drop: `
    return `${head}${clip(p.drop.title, Math.max(8, 50 - head.length))}`
  },
  preheader: (p) => `${battleResults.preheader(p.results)} Y el sample nuevo, hasta el ${p.drop.closesText}.`,
  fixture: {
    results: battleResults.fixture,
    drop: {
      ...battleDrop.fixture,
      weekNumber: 42,
      slug: '2026-w42',
      title: 'Niebla en Montjuïc',
      subscriber: false,
    },
  },
  body: (p) => (
    <Layout preheader={battleMonday.preheader(p)}>
      <ResultsCard r={p.results} />
      <DropCard p={p.drop} />
    </Layout>
  ),
}
