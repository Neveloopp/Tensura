# Tensura

## Donaciones

Si Tensura te resulta útil, puedes apoyar el proyecto con una donación:

[**Donar por PayPal**](https://paypal.me/eliasarmoncada)

Versión recortada de **Viko** enfocada en tres cosas: **grupos**, **descargas** y **stickers** (incluidos los stickers con audio `-aud`). La estructura y el estilo de código siguen la idea de **Megumin-Bot-MD**: TypeScript, `index.ts`, `handler.ts`, `settings.ts`, `core/` y comandos auto-cargados desde `cmds/`.


## Sponsor

**Host recomendado:** [ctrl.orbitxspace.com](https://ctrl.orbitxspace.com) — ideal para mantener Tensura activo 24/7.

> Guía completa de instalación en Android: [TERMUX.md](TERMUX.md)

## Características

- Conexión por **código QR** o **código de 8 dígitos**.
- Comandos con prefijos configurables y recarga en caliente al editar archivos de `cmds/`.
- `sync` actualiza desde GitHub (git o ZIP), recarga comandos y reinicia el proceso si cambia el núcleo.
- `stch` publica stickers de audio en el canal y `texch` envía texto; ambos usan el canal y el grupo configurados con `stch --config`.
- `ia` consulta DeepSeek V3 con OpenRouter, búsqueda web, Wikipedia, clima y hora, con tarjeta de progreso y sin ejecutar código.
- Bienvenidas, despedidas, reglas, antienlaces, advertencias, expulsiones, administradores, invitaciones, solicitudes, cierre/apertura y horario automático.
- Descargas de YouTube, TikTok, Facebook, Instagram, MediaFire, Pinterest, Threads y APK.
- Stickers de imagen/video y stickers con audio (`#s -aud`) con metadatos por usuario.
- Base de datos JSON editable a mano en `database/`.
- Todo lo importante se configura desde `settings.ts` o `.env`.

## Requisitos

- Node.js 20 o superior.
- `ffmpeg` y `ffprobe` en el PATH (obligatorios para stickers de video y `-aud`).
- Fork `@whiskeysockets/baileys` de Tensura incluido en `vendor/` (se instala sin acceso a URLs remotas).
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
│   ├── subbots/
│   │   ├── manager.ts       # conexiones, QR/código y reconexión
│   │   └── store.ts         # persistencia de sub bots
│   ├── web/
│   │   ├── accounts.ts      # cuentas, registro y contraseñas
│   │   └── server.ts        # panel HTTP, login y API
│   └── system/
│       ├── comandos.ts      # registro para el menú
│       ├── commandLoader.ts # carga y recarga de cmds/
│       ├── sync.ts          # git, actualización y watcher
│       └── database.ts      # JSON DB y globales
├── cmds/
│   ├── events.ts            # bienvenida/despedida
│   ├── info/                # menu, ping, infobot, ia
│   ├── grupo/               # moderación y administración
│   ├── owner/               # bots y herramientas de dueño
│   ├── dow/                 # descargas
│   ├── otros/               # sync y utilidades
│   └── sticker/             # stickers
├── web/                     # panel de sub bots (HTML/CSS/JS)
├── database/                # settings, users, chats, sub bots (JSON)
└── Sessions/                # credenciales de WhatsApp y sub bots
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
| `SYNC_DIR` | Ruta de un clon git para `sync` (opcional) | proyecto actual |
| `SYNC_REPO` | Repo usado en modo ZIP | `Neveloopp/Tensura` |
| `SYNC_BRANCH` | Rama a descargar | `main` |
| `SYNC_WATCH` | Vigilar cambios (`0` lo desactiva) | `1` |
| `TENSURA_AUTO_RESTART` | Reinicio automático (`0` lo desactiva) | `1` |
| `TENSURA_VERBOSE` | Muestra el ruido de sesiones de libsignal (`1` lo activa) | `0` |
| `GITHUB_TOKEN` | Token para `sync push` (solo en `.env`) | vacío |
| `DB_PERSIST_MS` | Retardo de guardado JSON (ms) | `250` |
| `SUBBOT_DATA_FILE` | JSON de sub bots | `database/subbots.json` |
| `SUBBOT_SESSION_DIR` | Credenciales de sub bots | `Sessions/SubBots` |
| `SUBBOT_FOLLOW_CHANNEL` | Canal que siguen los sub bots al vincularse | `120363414217688890@newsletter` |
| `SUBBOT_PAIRING_TTL_MS` | Vigencia de una vinculación (ms) | `180000` |
| `SUBBOT_SUPERVISOR_MS` | Revisión de sub bots (ms) | `30000` |
| `SUBBOT_WEB_ENABLED` | Enciende el panel (`1`) o lo apaga (`0`) | `0` |
| `SUBBOT_WEB_HOST` | Interfaz del panel | `0.0.0.0` |
| `SUBBOT_WEB_PORT` | Puerto del panel | `3000` |
| `SUBBOT_WEB_ACCOUNTS_FILE` | JSON de cuentas web | `database/web-accounts.json` |
| `SUBBOT_WEB_SESSIONS_FILE` | JSON de sesiones web persistentes | `database/web-sessions.json` |
| `SUBBOT_WEB_PHONE` | Teléfono de la cuenta administradora opcional | vacío |
| `SUBBOT_WEB_PASSWORD` | Contraseña de la cuenta administradora opcional | vacío |
| `EVOGB_API_KEY` | Clave de Evogb | configúrala |
| `RAYLAIS_API_KEY` | Clave de Raylais | configúrala |
| `OPENROUTER_API_KEY` | Clave de OpenRouter para `ia` | vacío |
| `OPENROUTER_MODEL` | Modelo de OpenRouter | `deepseek/deepseek-chat-v3-0324` |
| `OPENROUTER_MAX_TOKENS` | Tokens máximos de la respuesta | `2048` |
| `OPENROUTER_MAX_TOOL_ROUNDS` | Rondas máximas de herramientas | `4` |

Configura tus propias claves en `.env`. Si una clave deja de funcionar, cámbiala sin tocar los comandos.

## Comandos

El menú se genera solo con los archivos de `cmds/`. Los nombres principales son:

### Información
- `menu` / `help` / `allmenu` — menú y ayuda por comando.
- `ping` — RTT real de WhatsApp, event loop, CPU, RAM, límites del contenedor (cgroup) y estado de las colas (250 ms de muestra y hasta 3 s de espera). La línea `Colas` muestra `activos/límite+esperando`; por ejemplo `dow 2/2+8` significa descargas llenas y 8 comandos esperando.
- `infobot` — información del bot.
- `ia` / `ai` — pregunta a DeepSeek V3 mediante OpenRouter. Muestra una tarjeta de progreso con los pasos y puede buscar en la web, leer URLs públicas, consultar Wikipedia, el clima y la hora. No ejecuta código, comandos ni accede a archivos locales. También acepta responder a un mensaje para usar su texto como pregunta. Requiere `OPENROUTER_API_KEY`.

### Grupos
- `welcome` — bienvenida (`on`, `off`, `set`, `reset`).
- `goodbye` — despedida (`on`, `off`, `set`, `reset`).
- `rules` — reglas (`set`, `del`).
- `antilink` — bloqueo de enlaces (`on`, `off`).
- `kick` — expulsar miembro (reintenta con LID/PN y avisa si WhatsApp rechaza).
- `promote` / `demote` — dar o quitar administración.
- `warn` / `warnings` / `unwarn` / `warnlimit` — advertencias.
- `invite` — enlace de invitación (`reset`); detecta al bot como admin por PN o LID.
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
- `sticker` / `s` — imagen o video a sticker. Responde a un video con `#s -aud` para incluir el audio; si supera 25 s se recorta automáticamente.
- `toimg` — sticker a PNG.
- `setmeta` — cambia pack/autor (`#setmeta Mi Pack | Mi Nombre`); `delmeta` restaura.
- `stch` — responde a un video y publica un sticker con audio en el canal; si supera el máximo configurado se recorta automáticamente. También acepta responder a un sticker con audio ya creado y lo publica sin volver a convertirlo; si el bot recibió ese sticker, reutiliza su audio aunque WhatsApp lo omita en la cita. Lo pueden usar todos los miembros del grupo configurado; la configuración sigue siendo solo del Creador y se guarda por bot (`stch --config`: `channel`, `group`, `pack`, `author`, `max`, `on/off`, `reset`).
- `stch --config channel <enlace|jid>` — acepta enlaces de canal como `https://whatsapp.com/channel/...` y los convierte al JID correcto.
- `stch --config group -here` — ejecutado dentro de un grupo, lo configura como grupo permitido sin tener que pegar el JID.
- `texch` — envía un mensaje de texto al mismo canal (`#texch Hola` o responde a un texto). También lo pueden usar los miembros del grupo configurado.

### Sistema
- `sync` — `status`, `pull`, `push [mensaje]`, `reload` o `restart`. Sin git descarga el ZIP del repo, copia los archivos cambiados y elimina los que ya no existen en GitHub.
- `bots` — muestra cuántos sub bots están conectados y cuántos están registrados.
- `antiprivado` — `on` u `off` bloquea los mensajes privados de otras personas. Se guarda por bot y el Creador siempre puede seguir usando el bot en privado.
- `e` / `eval` — evalúa código JavaScript en el contexto del bot y devuelve el resultado tal cual. Solo Creador.
- `r` — evalúa una expresión JavaScript y devuelve el resultado tal cual. Solo Creador.
- `crm` — responde a un mensaje y envía un TXT con el código listo para copiar y ejecutar con `.e`. Solo Creador.
- `ver` — responde a una imagen, video, audio o sticker, incluidos los de una sola vista, para reenviarlo.

El estado de `antiprivado` es independiente en el bot principal y en cada sub bot (`database/settings.json`). Al activarlo, los mensajes privados de usuarios que no sean el Creador o el responsable del sub bot se ignoran.

Las conversiones de stickers y las descargas tienen colas separadas con límites para evitar que saturen el bot. Los comandos rápidos como `ping`, `menu` o la configuración no esperan a esas tareas; si una cola pesada está llena, el bot responde que está saturado en vez de quedarse bloqueado y `#ping` lo muestra en la línea `Colas`. Las descargas y búsquedas tienen timeouts (30 s APIs/texto, 20 s búsquedas, 90 s búferes, 120 s archivos y 60 s multimedia) y una espera máxima en cola (20–30 s) para que una descarga atascada no bloquee el bot indefinidamente. La consola oculta el ruido de `Closing session` de libsignal; usa `TENSURA_VERBOSE=1` para verlo.

## Sub bots y panel web

Los sub bots son cuentas adicionales que ejecutan los mismos comandos. El panel web permite crear una cuenta, vincular números por QR o código y administrar los sub bots de esa cuenta:

```env
SUBBOT_WEB_ENABLED=1
SUBBOT_WEB_HOST=0.0.0.0
SUBBOT_WEB_PORT=3000
SUBBOT_WEB_ACCOUNTS_FILE=database/web-accounts.json
SUBBOT_WEB_SESSIONS_FILE=database/web-sessions.json
```

Con el panel activo, cualquier persona puede abrir `http://IP-DEL-HOST:3000`, crear una cuenta con teléfono y contraseña, entrar y gestionar únicamente sus propios sub bots. Las cuentas se guardan con contraseña cifrada en `database/web-accounts.json`.

- La cuenta administradora es opcional: define `SUBBOT_WEB_PHONE` y `SUBBOT_WEB_PASSWORD` para crearla o actualizarla al iniciar. Esa cuenta ve y administra los sub bots de todas las cuentas.
- Las cuentas normales solo ven, inician, detienen y eliminan sus propios sub bots.
- Las sesiones del navegador se guardan en `database/web-sessions.json` y sobreviven a reinicios y actualizaciones de Tensura.
- El panel usa tema claro u oscuro automáticamente según la preferencia del sistema operativo.
- Los sub bots habilitados arrancan al iniciar Tensura aunque el panel esté apagado.
- La sesión de cada sub bot queda en `Sessions/SubBots/` y los metadatos en `database/subbots.json`; no se guardan tokens en el JSON.
- Al vincularse o reconectarse, cada sub bot sigue el canal definido en `SUBBOT_FOLLOW_CHANNEL`.
- Si la cuenta principal está en un grupo, los sub bots ignoran los mensajes y eventos de ese grupo para no duplicar respuestas.
- `#bots` informa cuántos sub bots están conectados.

## Actualización desde GitHub

```bash
# dueño del bot, desde WhatsApp
#sync                 # pull + recarga/reinicio automático
#sync status          # rama, último commit y cambios locales
#sync push            # sube cambios (requiere git + GITHUB_TOKEN)
#sync reload          # recarga cmds/ sin reiniciar
```

`sync` funciona de dos formas:

1. **Con git:** actualiza el clon (`SYNC_DIR` o el proyecto actual) con `pull --ff-only` y sube con `push`.
2. **Sin git:** descarga el ZIP de `SYNC_REPO` en `SYNC_BRANCH` y copia solo los archivos que cambiaron. Nunca sobrescribe `.env`, `.env.example`, `settings.ts`, `Sessions/`, `database/` ni capturas.

El watcher recarga `cmds/` al guardar y reinicia el proceso para cambios en `core/`, `index.ts`, `handler.ts` o `settings.ts`. En paneles con reinicio automático (Pterodactyl, PM2, systemd) solo sale del proceso; en ejecución directa lanza un reemplazo. `TENSURA_AUTO_RESTART=0` desactiva el reinicio y `node --watch` lo delega al propio Node.

Para publicar desde el bot, el clon debe tener `origin` y un token con permiso de escritura en `.env`:

```env
GITHUB_TOKEN=github_pat_...
```

No se suben `settings.ts`, `.env`, `.env.example` locales ni capturas, aunque estén modificados.

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
- Si cambias un comando, el loader lo recarga sin reiniciar el bot. Los cambios de núcleo los aplica `sync` o el watcher reiniciando el proceso.
- Los scripts usan `node` directamente (`node --import tsx`, `node node_modules/typescript/bin/tsc`), así no dependen de `/usr/bin/env` y funcionan en Termux.
- Usa el fork `Neveloopp/baileys-tensura` (`v7.0.0-rc14-tensura.1`) desde el tarball incluido en `vendor/`; no requiere compilar ni descargar URLs externas.
- El benchmark local está en `scripts/benchmark.ts`; simula 25 ms por llamada de WhatsApp y no necesita sesión real.

## Rendimiento

Comparativa histórica con `npm run bench` (12 iteraciones, 25 ms simulados por llamada de red):

| Prueba | Antes | Optimizado | Mejora |
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

Estos números son del benchmark local de comandos; no miden la red real ni el consumo del proceso.

## Baileys del fork

La dependencia apunta al tarball `vendor/baileys-7.0.0-rc14-tensura.1.tgz`, generado desde el release `v7.0.0-rc14-tensura.1` de [`Neveloopp/baileys-tensura`](https://github.com/Neveloopp/baileys-tensura). Se incluye en el repo para que `npm install` funcione en paneles que bloquean dependencias por URL remota, como Pterodactyl. Incluye:

- Timeouts acotados para conexión, consultas, descargas y subidas.
- Keepalive efectivo de 20 s (máximo 30 s) sin solapar pings.
- Watchdog de cuerpo inactivo en descargas de medios.
- Cachés con límite de entradas para sesiones, reintentos y dispositivos.
- Manejo de frames corruptos sin tumbar el proceso.

Tensura ya no fuerza `keepAliveIntervalMs: 45000` ni la vista previa de alta calidad; usa los valores del fork.

## Licencia y acuerdos de atribución

Tensura/Viko es un proyecto original de **Neveloopp**. Se permite usar, editar y reutilizar el código y partes de él, incluso en otros bots, siempre que se conserven créditos claros y visibles a **Neveloopp** y al proyecto original. Si publicas una edición, versión recortada, fork o rebranding, debes indicar que está basado en Tensura de Neveloopp y enlazar este repositorio; los créditos no pueden eliminarse, ocultarse ni sustituirse.

Toda persona que use, copie, modifique o distribuya el proyecto acepta que:

- El proyecto original y su identidad corresponden a **Neveloopp**.
- **Neveloopp** debe aparecer siempre en los créditos y no puede quedar fuera de ellos.
- Si solo se trata de una edición del bot original, la atribución debe ser al menos igual de visible que el nombre del proyecto derivado.
- **Neveloopp** puede exigir una mención adicional o más destacada cuando la atribución sea insuficiente.
- El incumplimiento de estas condiciones termina los permisos de uso.

La licencia completa está en [LICENSE](LICENSE). Reemplaza a la licencia MIT anterior.

## Créditos

- Proyecto original y titular: **Tensura / Viko**, por **Neveloopp** — https://github.com/Neveloopp/Tensura
- Inspiración de estructura TypeScript: **Megumin-Bot-MD**.
- Baileys: **@whiskeysockets/baileys** (MIT), con fork mantenido por **Neveloopp**.
- Tensura es una versión recortada y reordenada para grupos, descargas y stickers.
