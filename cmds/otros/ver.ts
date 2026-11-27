/*
 * Reenvía el archivo citado, incluidos los de una sola vista.
 */
export default {
  command: ['ver', 'viewonce', 'vo'],
  category: 'otros',
  description: 'Recupera y reenvía una imagen, video, audio o sticker citado.',
  usage: '',
  example: ['#ver (respondiendo a una imagen, video, audio o sticker)'],
  async run({ m }: any) {
    const quoted = m.quoted
    if (!quoted) {
      return m.reply(
        '(>_<) Responde a una imagen, video, audio o sticker para reenviarlo.'
      )
    }

    const message = quoted.msg || {}
    const mimetype = String(message.mimetype || '')
    const isImage = Boolean(quoted.isImage || /^image\//i.test(mimetype))
    const isVideo = Boolean(quoted.isVideo || quoted.isGif || /^video\//i.test(mimetype))
    const isAudio = Boolean(quoted.isAudio || /^audio\//i.test(mimetype))
    const isSticker = Boolean(quoted.isSticker)

    if (!isImage && !isVideo && !isAudio && !isSticker) {
      return m.reply('(>_<) El mensaje citado no contiene una imagen, video, audio o sticker.')
    }

    try {
      const download = quoted.download || m.download
      const buffer = await download()
      if (!buffer?.length) throw new Error('El archivo citado está vacío.')

      if (isImage) return m.send({ image: buffer })
      if (isVideo) return m.send({ video: buffer, gifPlayback: Boolean(quoted.isGif || message.gifPlayback) })
      if (isAudio) {
        return m.send({
          audio: buffer,
          mimetype: mimetype || 'audio/ogg; codecs=opus',
          ptt: Boolean(message.ptt),
        })
      }
      return m.send({ sticker: buffer })
    } catch (error: any) {
      return m.reply(`(x_x) No pude recuperar el archivo citado: ${error?.message || 'error desconocido'}`)
    }
  },
}
