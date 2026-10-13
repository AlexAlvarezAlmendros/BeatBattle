/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Layout } from '../components/Layout'
import type { EmailTemplate } from '../template'
import { ordinal, type ResultsBlock, ResultsCard } from './results'

export type BattleResultsPayload = ResultsBlock

/**
 * `battle.results` (§2.12, Anexo H): los resultados solos, para quien prefiere el lunes separado o cuando el
 * sellado llegó tarde al Lunes de batalla (§2.12.2). Solo a quien participó o votó esa semana.
 */
export const battleResults: EmailTemplate<BattleResultsPayload> = {
  subject: (p) =>
    p.mine?.position
      ? `Semana #${p.weekNumber}: has quedado ${ordinal(p.mine.position)}`
      : p.empty
        ? `Semana #${p.weekNumber}: semana desierta`
        : `Ya hay campeón de la semana #${p.weekNumber}`,
  preheader: (p) =>
    p.empty
      ? 'Nadie subió su flip. Mira el sample de esta semana.'
      : `El podio de «${p.sampleTitle}» y la ceremonia.`,
  fixture: {
    weekNumber: 41,
    slug: '2026-w41',
    sampleTitle: 'Lluvia en Gràcia',
    corrected: false,
    podium: [
      { position: 1, title: 'Gotas sobre el asfalto', producer: 'mar_beats', score: '4,38' },
      { position: 2, title: 'Paraguas rojo', producer: 'prod01', score: '4,21' },
      { position: 3, title: 'Gràcia 3 a.m.', producer: 'jefa', score: '4,02' },
    ],
    mine: {
      position: 2,
      title: 'Paraguas rojo',
      score: '4,21',
      votes: 23,
      cardUrl: 'https://battle.otherpeople.es/api/og/result/2026-w41/0192f0c4?sig=abc',
    },
    empty: false,
  },
  body: (p) => (
    <Layout preheader={battleResults.preheader(p)}>
      <ResultsCard r={p} />
    </Layout>
  ),
}
