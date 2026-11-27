import botConfig from '../../settings.ts'
import { askAI, splitMessage } from '../../core/ai.ts'
import { createProgress } from '../../core/progress.ts'

function quotedText(m: any) {
  const quoted = m?.quoted
  if (!quoted) return ''
  return String(
    quoted.text ||
      quoted.msg?.conversation ||
      quoted.msg?.extendedTextMessage?.text ||
      quoted.message?.conversation ||
      quoted.message?.extendedTextMessage?.text ||
      ''
  )
    .trim()
    .slice(0, 1_200)
}

export default {
  command: ['ia', 'ai'],
  category: 'info',
  description: 'Pregunta a DeepSeek con búsqueda web, Wikipedia, clima y hora.',
  usage: '<pregunta>',
  example: [
    '#ia ¿Qué es OpenRouter?',
    '#ia busca las noticias de tecnología de hoy',
    '#ia (respondiendo a un mensaje) resúmelo',
  ],
  async run({ sock, m, args, rawText, prefix }: any) {
    const quoted = quotedText(m)
    const prompt = String(rawText || args.join(' ')).trim()
    const question = prompt || quoted

    if (!question) {
      return m.reply(
        `(>_<) Uso: ${prefix || '#'}ia <pregunta>\nTambién puedes responder a un mensaje con ${prefix || '#'}ia.`
      )
    }

    if (question.length > 4_000) {
      return m.reply('(>_<) La pregunta es demasiado larga. Usa menos de 4000 caracteres.')
    }

    if (!botConfig.ai.key) {
      return m.reply(
        '(>_<) Falta configurar OPENROUTER_API_KEY en el archivo .env para usar la IA.'
      )
    }

    let progress: any = null

    try {
      progress = await createProgress(sock, m.chat, {
        title: 'Analizando solicitud',
        body: 'Preparando búsqueda y herramientas...',
        description: 'IA de Tensura',
      })

      const context = [
        m.isGroup ? 'Chat grupal' : 'Chat privado',
        m.pushName ? `Usuario: ${m.pushName}` : '',
        quoted && prompt ? `Mensaje citado: ${quoted}` : '',
      ]
        .filter(Boolean)
        .join('\n')

      const answer = await askAI({
        prompt: question,
        context,
        onStep: async step => {
          try {
            await progress?.step(step)
          } catch {}
        },
      })

      await progress.done({
        title: 'Respuesta lista',
        body: 'Enviando respuesta...',
        description: 'IA de Tensura',
      })

      for (const chunk of splitMessage(answer)) {
        await m.reply(chunk)
      }
    } catch (error: any) {
      const message = String(error?.message || 'No pude completar la consulta.').slice(0, 300)
      await progress?.fail(message)
      return m.reply(`(x_x) IA: ${message}`)
    }
  },
}
