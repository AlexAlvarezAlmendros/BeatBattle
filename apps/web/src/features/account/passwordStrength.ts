/**
 * Medidor de fortaleza de la contraseña (guía §2.3 y §4.13: `zxcvbn-ts` en el cliente; tarea 2.15). Solo
 * orienta: la regla que manda es la del servidor (12–128 caracteres y fuera de las filtradas,
 * `RF-AUTH-07`). Los diccionarios pesan, así que se cargan la primera vez que alguien escribe una
 * contraseña, nunca con la página.
 */

export interface PasswordStrength {
  /** 0 (muy débil) a 4 (muy fuerte). */
  score: 0 | 1 | 2 | 3 | 4
  /** Aviso concreto de `zxcvbn` («Es una palabra muy común»), ya en castellano. */
  warning: string | null
}

type Checker = (password: string, userInputs: string[]) => Promise<PasswordStrength>

let checker: Promise<Checker> | null = null

function load(): Promise<Checker> {
  checker ??= Promise.all([
    import('@zxcvbn-ts/core'),
    import('@zxcvbn-ts/language-common'),
    import('@zxcvbn-ts/language-es-es'),
  ]).then(([core, common, es]) => {
    const zxcvbn = new core.ZxcvbnFactory({
      translations: es.translations,
      graphs: common.adjacencyGraphs,
      dictionary: { ...common.dictionary, ...es.dictionary },
    })
    return async (password, userInputs) => {
      const result = await zxcvbn.checkAsync(password, userInputs)
      return { score: result.score, warning: result.feedback.warning || null }
    }
  })
  return checker
}

/** La fortaleza de una contraseña; `userInputs` son el email y el nombre, que no deberían aparecer en ella. */
export async function passwordStrength(
  password: string,
  userInputs: string[] = [],
): Promise<PasswordStrength> {
  if (!password) return { score: 0, warning: null }
  return (await load())(password, userInputs)
}
