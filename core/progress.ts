/*
 * Indicador de progreso estilo Meta AI.
 * Envía una tarjeta richResponseMessage y la edita mientras avanza la tarea.
 */
import crypto from 'crypto'
import { generateWAMessageFromContent, proto } from '@whiskeysockets/baileys'

type StepInput = {
  title: string
  body?: string
  reasoning?: boolean
  description?: string
}

type Step = Required<Pick<StepInput, 'title'>> & {
  body: string
  reasoning?: boolean
  status: number
}

export type ProgressHandle = {
  step: (input: StepInput) => Promise<void>
  done: (final?: string | StepInput) => Promise<void>
  fail: (reason?: string) => Promise<void>
}

const Status = proto.BotProgressIndicatorMetadata.BotPlanningStepMetadata.PlanningStepStatus

const capabilities = [
  'PROGRESS_INDICATOR',
  'RICH_RESPONSE_HEADING',
  'RICH_RESPONSE_NESTED_LIST',
  'AI_MEMORY',
  'RICH_RESPONSE_THREAD_SURFING',
  'RICH_RESPONSE_TABLE',
  'RICH_RESPONSE_CODE',
  'RICH_RESPONSE_STRUCTURED_RESPONSE',
  'RICH_RESPONSE_INLINE_IMAGE',
  'RICH_RESPONSE_SUB_HEADING',
  'RICH_RESPONSE_GRID_IMAGE',
  'AI_STUDIO_UGC_MEMORY',
  'RICH_RESPONSE_LATEX',
  'RICH_RESPONSE_MAPS',
  'RICH_RESPONSE_INLINE_REELS',
  'AGENTIC_PLANNING',
  'ACCOUNT_LINKING',
  'STREAMING_DISAGGREGATION',
  'RICH_RESPONSE_GRID_IMAGE_3P',
  'RICH_RESPONSE_LATEX_INLINE',
  'QUERY_PLAN',
  'RICH_RESPONSE_UNIFIED_RESPONSE',
  'PROMOTION_MESSAGE',
  'SIMPLIFIED_PROFILE_PAGE',
  'RICH_RESPONSE_SOURCES_IN_MESSAGE',
  'RICH_RESPONSE_SIDE_BY_SIDE_SURVEY',
  'RICH_RESPONSE_UNIFIED_TEXT_COMPONENT',
  'AI_SHARED_MEMORY',
  'RICH_RESPONSE_UNIFIED_SOURCES',
  'RICH_RESPONSE_UNIFIED_DOMAIN_CITATIONS',
  'RICH_RESPONSE_UR_INLINE_REELS_ENABLED',
  'RICH_RESPONSE_UR_MEDIA_GRID_ENABLED',
  'RICH_RESPONSE_UR_TIMESTAMP_PLACEHOLDER',
  'RICH_RESPONSE_IN_APP_SURVEY',
  'AI_RESPONSE_MODEL_BRANDING',
  'SESSION_TRANSPARENCY_SYSTEM_MESSAGE',
  'RICH_RESPONSE_UR_REASONING',
  'RICH_RESPONSE_UR_ZEITGEIST_CITATIONS',
  'RICH_RESPONSE_UR_ZEITGEIST_CAROUSEL',
  'AI_IMAGINE_LOADING_INDICATOR',
  'RICH_RESPONSE_UR_IMAGINE',
  'AI_IMAGINE_UR_TO_NATIVE_LOADING_INDICATOR',
  'RICH_RESPONSE_UR_BLOKS_ENABLED',
  'RICH_RESPONSE_INLINE_LINKS_ENABLED',
  'RICH_RESPONSE_UR_IMAGINE_VIDEO',
  'JSON_PATCH_STREAMING',
  'AI_TAB_FORCE_CLIPPY',
  'UNIFIED_RESPONSE_EMBEDDED_SCREENS',
  'AI_SUBSCRIPTION_ENABLED',
]

const fakeQuoted = {
  key: {
    fromMe: false,
    participant: '13135550002@s.whatsapp.net',
    remoteJid: 'status@broadcast',
    id: 'META-BYPASS',
  },
  message: {
    contactMessage: {
      displayName:
        'WhatsApp Business 🔵\nContacto: Meta AI:\n¡𝘈𝘲𝘶𝘪 𝘦𝘴𝘵𝘢 𝘵𝘶 𝘝𝘶𝘴𝘲𝘶𝘦𝘥𝘢! 😏',
      vcard:
        'BEGIN:VCARD\nVERSION:3.0\nN;CHARSET=UTF-8:;Meta AI;;;;\nFN;CHARSET=UTF-8:Meta AI\nTEL;waid=13135550002:+1 313 555 0002\nEND:VCARD',
    },
  },
}

function noopHandle(): ProgressHandle {
  return {
    step: async () => {},
    done: async () => {},
    fail: async () => {},
  }
}

export async function createProgress(
  sock: any,
  chat: string,
  initial: StepInput
): Promise<ProgressHandle> {
  if (!sock?.relayMessage || !chat) return noopHandle()

  const responseId = `sticker-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${crypto.randomBytes(6).toString('hex')}`
  const steps: Step[] = [
    {
      title: initial.title,
      body: String(initial.body || ''),
      reasoning: initial.reasoning,
      status: Status.EXECUTING,
    },
  ]
  let text = initial.title
  let description = initial.description || initial.title

  const stepEntry = (step: Step) => ({
    __typename: 'GenAIStepThoughtEntry',
    header: step.title,
    body: step.body,
  })

  const richResponse = () => ({
    __typename: 'GenAIUnifiedResponse',
    response_id: responseId,
    sections: [
      {
        view_model: {
          primitive: {
            text: text + (steps[steps.length - 1]?.body ? `\n\n${steps[steps.length - 1].body}` : ''),
            __typename: 'GenAIMarkdownTextUXPrimitive',
          },
          __typename: 'GenAISingleLayoutViewModel',
        },
      },
    ],
    embedded_screens: [
      {
        __typename: 'FOAUnifiedResponseEmbeddedScreen',
        title: 'Progreso',
        content: [
          {
            __typename: 'FOAEmbeddedScreenContentTabbed',
            tabs: [
              {
                __typename: 'FOAUnifiedResponseTab',
                id: 'steps',
                tab_header: 'Pasos',
                sections: [],
                step_entries: steps.map(stepEntry),
              },
            ],
          },
        ],
      },
    ],
  })

  const richText = () => ({
    messageType: 1,
    submessages: [{ messageType: 2, messageText: text }],
    unifiedResponse: {
      data: Buffer.from(JSON.stringify(richResponse())).toString('base64'),
    },
    contextInfo: {
      forwardingScore: 1,
      isForwarded: true,
      expiration: 0,
      forwardOrigin: 4,
      forwardedAiBotMessageInfo: { botJid: '0@bot' },
      botMessageSharingInfo: {
        botEntryPointOrigin: 'FAVICON',
        forwardScore: 1,
      },
      participant: '0@s.whatsapp.net',
      remoteJid: chat,
      stanzaId: responseId,
    },
  })

  const build = (): any => ({
    messageContextInfo: {
      threadId: [],
      deviceListMetadata: {
        senderKeyIndexes: [],
        recipientKeyIndexes: [],
      },
      deviceListMetadataVersion: 2,
      botMetadata: {
        messageDisclaimerText: 'Progreso de la IA',
        botResponseId: responseId,
        verificationMetadata: {
          proofs: [
            {
              certificateChain: [Buffer.alloc(0), Buffer.alloc(0)],
              version: 1,
              useCase: 1,
              signature: Buffer.alloc(0),
            },
          ],
        },
        progressIndicatorMetadata: {
          progressDescription: description,
          stepsMetadata: steps.map(step => ({
            statusTitle: step.title,
            statusBody: step.body,
            status: step.status,
            ...(step.reasoning ? { isReasoning: true } : {}),
          })),
        },
        capabilityMetadata: { capabilities },
        botMessageOriginMetadata: {},
        botGroupMetadata: {
          participantsMetadata: [{ botFbid: '867051314767696' }],
        },
        botRenderingConfigMetadata: {
          bloksVersioningId:
            'b2283ed77b26a6c0456f43d90a7d192ee508374aa31695e4774216ea5bb0700a85f4b064167acdc3275b48d195da42ba2f458fd15fc8445e69c2a874c2834406',
          pixelDensity: 1.7,
        },
      },
    },
    botForwardedMessage: {
      message: {
        richResponseMessage: richText(),
      },
    },
  })

  let first: any
  try {
    first = generateWAMessageFromContent(chat, build(), {
      quoted: fakeQuoted,
      userJid: sock.user?.id,
    })
    await sock.relayMessage(chat, first.message, { messageId: first.key.id })
  } catch {
    return noopHandle()
  }

  const edit = (key: any) =>
    generateWAMessageFromContent(
      chat,
      {
        botForwardedMessage: {
          message: {
            protocolMessage: {
              key,
              type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
              editedMessage: build(),
              timestampMs: Date.now(),
            },
          },
        },
      },
      { userJid: sock.user?.id }
    )

  let queue = Promise.resolve()
  const sendUpdate = () => {
    const task = async () => {
      try {
        const message = edit(first.key)
        await sock.relayMessage(chat, message.message, { messageId: message.key.id })
      } catch {}
    }
    queue = queue.then(task, task)
    return queue
  }

  try {
    const initialEdit = edit(first.key)
    await sock.relayMessage(chat, initialEdit.message, { messageId: initialEdit.key.id })
  } catch {}

  const finishPrevious = () => {
    for (const step of steps) {
      if (step.status === Status.EXECUTING || step.status === Status.PLANNED) {
        step.status = Status.FINISHED
      }
    }
  }

  return {
    async step(input) {
      finishPrevious()
      steps.push({
        title: input.title,
        body: String(input.body || ''),
        reasoning: input.reasoning,
        status: Status.EXECUTING,
      })
      text = input.title
      if (input.description) description = input.description
      await sendUpdate()
    },
    async done(final) {
      finishPrevious()
      if (typeof final === 'string') {
        description = final
      } else if (final) {
        steps.push({
          title: final.title,
          body: String(final.body || ''),
          reasoning: final.reasoning,
          status: Status.FINISHED,
        })
        text = final.title
        description = final.description || final.title
      }
      await sendUpdate()
    },
    async fail(reason) {
      finishPrevious()
      steps.push({
        title: 'Error',
        body: String(reason || 'No se pudo completar la tarea.'),
        status: Status.FINISHED,
      })
      text = 'Error'
      description = 'No se pudo completar'
      await sendUpdate()
    },
  }
}
