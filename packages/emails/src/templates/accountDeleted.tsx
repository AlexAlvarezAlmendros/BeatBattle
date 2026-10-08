/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Card } from '../components/Card'
import { Layout } from '../components/Layout'
import { Heading, Kicker, Paragraph } from '../components/Text'
import type { EmailTemplate } from '../template'

export interface AccountDeletedPayload {
  name: string
}

/** `account.deleted` (Anexo H, `RF-PRF-04`): qué se ha borrado y qué se conserva anonimizado. */
export const accountDeleted: EmailTemplate<AccountDeletedPayload> = {
  subject: () => 'Tu cuenta se ha borrado',
  preheader: () => 'Hemos borrado tus datos. Las semanas ya selladas quedan como «Productor eliminado».',
  fixture: { name: 'LilBru' },
  body: (p) => (
    <Layout preheader={accountDeleted.preheader(p)}>
      <Card>
        <Kicker>Fin de la partida</Kicker>
        <Heading>Cuenta borrada</Heading>
        <Paragraph>{p.name}, hemos borrado tu cuenta de Beat Battle como pediste.</Paragraph>
        <Paragraph>
          Se han borrado tu perfil, tus sesiones, tus preferencias, tus votos y entradas de semanas sin sellar
          y sus audios.
        </Paragraph>
        <Paragraph>
          Las entradas de semanas ya selladas siguen en su clasificación como «Productor eliminado», sin tu
          nombre ni tus datos, para que los resultados no cambien. Guardamos solo una huella cifrada de tu
          email para respetar tus bajas.
        </Paragraph>
        <Paragraph muted>
          Este es el último email que te enviamos. Si cambias de idea, puedes volver cuando quieras.
        </Paragraph>
      </Card>
    </Layout>
  ),
}
