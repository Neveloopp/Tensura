# Tensura

Versión recortada de **Viko** enfocada en tres cosas: **grupos**, **descargas** y **stickers** (incluidos los stickers con audio `-aud`). La estructura y el estilo de código siguen la idea de **Megumin-Bot-MD**: TypeScript, `index.ts`, `handler.ts`, `settings.ts`, `core/` y comandos auto-cargados desde `cmds/`.


## Sponsor

**Host recomendado:** [ctrl.orbitxspace.com](https://ctrl.orbitxspace.com) — ideal para mantener Tensura activo 24/7.

> Guía completa de instalación en Android: [TERMUX.md](TERMUX.md)

## Características

- Conexión por **código QR** o **código de 8 dígitos**.
- Comandos con prefijos configurables y recarga en caliente al editar archivos de `cmds/`.
- Bienvenidas, despedidas, reglas, antienlaces, advertencias, expulsiones, administradores, invitaciones, solicitudes, cierre/apertura y horario automático.
- Descargas de YouTube, TikTok, Facebook, Instagram, MediaFire, Pinterest, Threads y APK.
- Stickers de imagen/video y stickers con audio (`#s -aud`) con metadatos por usuario.
- Base de datos JSON editable a mano en `database/`.
- Todo lo importante se configura desde `settings.ts` o `.env`.

## Requisitos

- Node.js 20 o superior.
- `ffmpeg` y `ffprobe` en el PATH (obligatorios para stickers de video y `-aud`).
- `@whiskeysockets/baileys` oficial (npm lo instala; no hace falta Git).
- `sharp` es opcional (`optionalDependencies`): si no carga, Tensura usa ffmpeg para las imágenes.

En Termux:

```bash
pkg install nodejs ffmpeg
```

> **Importante en Termux:** si el proyecto está en `/storage/emulated/0`, npm no puede crear enlaces ni ejecutar binarios nativos desde esa ruta (error `EACCES`). Copia el proyecto a la memoria interna y ejecútalo desde ahí:
>
> ```bash
> cp -r /storage/emulated/0/viko/Tensura ~/Tensura
> cd ~/Tensura
> npm install
> npm start
> ```
>
> Puedes seguir editando los archivos en `/storage/emulated/0/viko/Tensura` y copiarlos a `~/Tensura` para probar.

## Instalación

```bash
cd Tensura
npm install
cp .env.example .env
# edita .env con tu número, prefijos y claves
npm start      # node --import tsx (funciona en Termux)
npm run check  # verificación de TypeScript
npm run bench  # comparativa de rendimiento local
```

Al iniciar sin sesión, Tensura pregunta:

1. Código QR.
2. Código de 8 dígitos (pide el número con código de país).

También puedes fijarlo en `.env`:

```env
WA_CONNECTION_METHOD=code
WA_PHONE_NUMBER=50585117242
```

La sesión se guarda en `Sessions/Tensura/`. No compartas esa carpeta.

## Estructura

```
Tensura/
├── index.ts                 # conexión, QR/código, eventos
├── handler.ts               # prefijos, permisos, antienlaces, ejecución
├── settings.ts              # configuración central
├── core/
│   ├── audioSticker.ts      # envío de stickers con audio
│   ├── detect.ts            # detectores de media/plataformas
│   ├── downloader.ts        # APIs, búsquedas y descargas
│   ├── exif.ts              # conversión webp y metadatos
│   ├── group.ts             # helpers de grupos y advertencias
│   ├── message.ts           # objeto m (reply, quoted, download...)
│   ├── scheduler.ts         # horario automático
│   ├── utils.ts             # JID, fechas, plantillas, temporales
│   └── system/
│       ├── comandos.ts      # registro para el menú
│       ├── commandLoader.ts # carga y recarga de cmds/
│       └── database.ts      # JSON DB y globales
├── cmds/
│   ├── events.ts            # bienvenida/despedida
│   ├── info/                # menu, ping, infobot
│   ├── grupo/               # moderación y administración
│   ├── dow/                 # descargas
│   └── sticker/             # stickers
├── database/                # settings, users, chats, stickers (JSON)
└── Sessions/                # credenciales de WhatsApp
```

## Configuración rápida

Edita `settings.ts` o crea `.env`:

| Variable | Descripción | Por defecto |
| --- | --- | --- |
| `OWNER_NUMBER` | Dueño(s), separados por coma | `50585117242` |
| `BOT_NAME` | Nombre del bot | `Tensura` |
| `PREFIXES` | Prefijos separados por coma | `#,/,.,!` |
| `TIMEZONE` | Zona horaria | `America/Havana` |
| `SESSION_NAME` | Carpeta de sesión | `Sessions/Tensura` |
| `STICKER_PACK` | Pack por defecto | `Tensura` |
| `STICKER_AUTHOR` | Autor por defecto | `Tensura Bot` |
| `STICKER_AUDIO_MAX` | Duración máxima de `-aud` | `25` |
| `DOWNLOAD_MAX_MB` | Límite de descargas | `100` |
| `DB_PERSIST_MS` | Retardo de guardado JSON (ms) | `250` |
| `EVOGB_API_KEY` | Clave de Evogb | configúrala |
| `RAYLAIS_API_KEY` | Clave de Raylais | configúrala |

Configura tus propias claves en `.env`. Si una clave deja de funcionar, cámbiala sin tocar los comandos.

## Comandos

El menú se genera solo con los archivos de `cmds/`. Los nombres principales son:

### Información
- `menu` / `help` / `allmenu` — menú y ayuda por comando.
- `ping` — latencia, uptime y memoria.
- `infobot` — información del bot.

### Grupos
- `welcome` — bienvenida (`on`, `off`, `set`, `reset`).
- `goodbye` — despedida (`on`, `off`, `set`, `reset`).
- `rules` — reglas (`set`, `del`).
- `antilink` — bloqueo de enlaces (`on`, `off`).
- `kick` — expulsar miembro.
- `promote` / `demote` — dar o quitar administración.
- `warn` / `warnings` / `unwarn` / `warnlimit` — advertencias.
- `invite` — enlace de invitación (`reset`).
- `approve` / `reject` / `pending` — solicitudes de entrada.
- `close` / `open` — cerrar o abrir el grupo.
- `schedule` — horario automático (`on`, `off`, `set 22:00 08:00`, `timezone`).
- `delete` — borrar el mensaje citado.
- `admins` — lista de administradores.
- `groupinfo` — información del grupo.
- `tag` — mencionar a todos.

### Descargas
- `play` — audio de YouTube (`fast`, `medium`, `best`).
- `play2` — video de YouTube.
- `tiktok` — video de TikTok; `tiktokaudio` para audio.
- `facebook` — video de Facebook.
- `instagram` — fotos/videos de Instagram.
- `mediafire` — archivo de MediaFire.
- `pinterest` — pin o búsqueda de imágenes.
- `threads` — video/imagen de Threads.
- `apk` — busca y descarga una APK.

### Stickers
- `sticker` / `s` — imagen o video a sticker. Responde a un video con `#s -aud` para incluir el audio (máximo 25 s).
- `toimg` — sticker a PNG.
- `setmeta` — cambia pack/autor (`#setmeta Mi Pack | Mi Nombre`); `delmeta` restaura.

## Crear un comando

Crea un archivo dentro de `cmds/`, por ejemplo `cmds/info/hola.ts`:

```ts
export default {
  command: ['hola', 'hi'],
  category: 'info',
  description: 'Saluda.',
  usage: '[nombre]',
  example: ['#hola'],
  async run({ m, args }: any) {
    return m.reply(`(＾▽＾) Hola, ${args[0] || m.pushName || 'usuario'}.`)
  },
}
```

El loader lo detecta al guardar. No hace falta registrarlo en el menú.

Propiedades disponibles: `command`, `alias`, `category`, `description`, `usage`, `example`, `isOwner`, `isAdmin`, `botAdmin`, `groupOnly`, `privateOnly`, `hidden` y `run`.

Dentro de `run` recibes:

```ts
{
  sock, m, args, command, text, prefix, usedPrefix,
  settings, group, metadata, isAdmin, isBotAdmin, isOwner
}
```

## Stickers con audio

El flujo es el mismo de Viko:

1. Responde a un video con `#s -aud`.
2. Se recorta el video y se genera un WebP animado.
3. Se extrae el audio a Opus/Ogg.
4. Se parchea el proto de Baileys para enviar `audioStickerMessage`.
5. El sticker se envía con su pista de audio.

Límite por defecto: **25 segundos** y **1 MB** por sticker. Si el video no tiene audio o supera el límite, el comando responde con el error.

## Base de datos

- `database/settings.json`: configuración por bot.
- `database/users.json`: usuarios y metadatos de stickers.
- `database/chats.json`: bienvenidas, reglas, antienlaces, advertencias, horarios y estadísticas.
- `database/stickers.json`: metadatos de stickers por usuario.

Puedes editarlos con cualquier editor de texto. Los cambios se mantienen en memoria y se escriben de forma atómica con un debounce de 250 ms (`DB_PERSIST_MS`); al cerrar el bot se vuelcan a disco.

## Notas

- `database/`, `Sessions/`, `node_modules/` y `.env` están en `.gitignore`.
- Si `sharp` no carga, las imágenes se convierten con ffmpeg; los stickers siguen funcionando.
- Para stickers con audio, `ffmpeg` debe incluir `libopus` y `libwebp`. En ffmpeg 9 ya no se usa `-vsync`; Tensura no depende de esa opción.
- Las descargas usan `fetch` nativo para evitar bloqueos de Cloudflare en los enlaces de Raylais.
- Si cambias un comando, el loader lo recarga sin reiniciar el bot.
- Los scripts usan `node` directamente (`node --import tsx`, `node node_modules/typescript/bin/tsc`), así no dependen de `/usr/bin/env` y funcionan en Termux.
- Usa `@whiskeysockets/baileys@7.0.0-rc14`, el paquete oficial; no se usa ningún fork.
- El benchmark local está en `scripts/benchmark.ts`; simula 25 ms por llamada de WhatsApp y no necesita sesión real.

## Rendimiento

Medido con `npm run bench` (12 iteraciones, 25 ms simulados por llamada de red):

| Prueba | Antes (fork) | Después (oficial + optimizado) | Mejora |
| --- | ---: | ---: | ---: |
| `#ping` | 109.8 ms | 28.7 ms | -74% |
| Menú privado | 82.3 ms | 28.9 ms | -65% |
| Menú en grupo (frío) | 109.7 ms | 56.8 ms | -48% |
| Menú en grupo (caliente) | 82.8 ms | 28.9 ms | -65% |
| Sticker imagen | 201.4 ms | 187.7 ms | -7% |
| Sticker audio (3 s) | 3140 ms | 960 ms | -69% |
| Actualización DB | 1.11 ms | 0.04 ms | -96% |
| Carga de comandos | 1184 ms | 851 ms | -28% |

Cambios principales: `readMessages` y presencia ya no bloquean la respuesta, `#ping` envía un solo mensaje, la DB escribe en segundo plano, el sticker con audio convierte video/audio y sube ambos medios en paralelo, WebP usa compresión 2 y los comandos se cargan con concurrencia 2. En un video de 25 s el sticker con audio bajó de 9.2 s a 4.2 s al elegir fps/calidad según la duración. Con el Baileys oficial sin optimizar, la carga era ~1664 ms y el sticker de audio de 3 s ~2448 ms; con las mejoras quedaron en ~851 ms y ~960 ms. La red real de WhatsApp sigue siendo el factor dominante en los comandos de descarga.

## Créditos

- Funcionalidad y estilo original: **Viko** de Neveloopp.
- Inspiración de estructura TypeScript: **Megumin-Bot-MD**.
- Tensura es una versión recortada y reordenada para grupos, descargas y stickers.
