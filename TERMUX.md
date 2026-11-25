# Instalar Tensura en Termux

Guía para ejecutar Tensura en Android con Termux, sin PC y sin depender de `/storage/emulated/0`.

## 1. Requisitos

- Termux desde [F-Droid](https://f-droid.org/packages/com.termux/) (la versión de Play Store está desactualizada).
- Node.js 20 o superior.
- `ffmpeg` y `ffprobe` (stickers de video y `-aud`).
- Git (opcional, para clonar y actualizar).

```bash
pkg update && pkg upgrade -y
pkg install nodejs ffmpeg git -y
```

Comprueba las versiones:

```bash
node -v
npm -v
ffmpeg -version | head -1
```

## 2. Descargar el proyecto

```bash
cd ~
git clone https://github.com/Neveloopp/Tensura.git
cd Tensura
```

Si no usas Git, descarga el ZIP del repositorio y descomprímelo en `~/Tensura`.

> **Importante:** no ejecutes el bot desde `/storage/emulated/0`. Esa ruta no permite enlaces ni binarios de npm (`EACCES`). Copia el proyecto a la memoria interna:
>
> ```bash
> cp -r /storage/emulated/0/viko/Tensura ~/Tensura
> cd ~/Tensura
> ```

## 3. Instalar dependencias

```bash
npm install
```

`sharp` es opcional. Si falla en Android, Tensura usa `ffmpeg` para las imágenes y los stickers siguen funcionando.

## 4. Configurar

```bash
cp .env.example .env
nano .env
```

Como mínimo configura:

```env
OWNER_NUMBER=50585117242
PREFIXES=#,/,.,!
WA_CONNECTION_METHOD=
WA_PHONE_NUMBER=
```

- `WA_CONNECTION_METHOD=qr`: escanear QR.
- `WA_CONNECTION_METHOD=code`: código de 8 dígitos; rellena `WA_PHONE_NUMBER`.
- Vacío: Tensura pregunta al iniciar.

Añade tus claves de APIs si usas las descargas:

```env
EVOGB_API_KEY=
RAYLAIS_API_KEY=
LEMPI_API_KEY=
```

No compartas `.env` ni subas esa carpeta a GitHub.

### Panel de sub bots

Para abrir el registro y la gestión de sub bots desde el navegador:

```env
SUBBOT_WEB_ENABLED=1
SUBBOT_WEB_HOST=0.0.0.0
SUBBOT_WEB_PORT=3000
SUBBOT_WEB_ACCOUNTS_FILE=database/web-accounts.json
SUBBOT_WEB_SESSIONS_FILE=database/web-sessions.json
SUBBOT_FOLLOW_CHANNEL=120363414217688890@newsletter
```

Abre `http://IP-DEL-TELEFONO:3000` o `http://127.0.0.1:3000` desde el mismo teléfono. Cualquier persona puede crear una cuenta, entrar y gestionar únicamente sus propios sub bots. La cuenta administradora es opcional y se define con `SUBBOT_WEB_PHONE` y `SUBBOT_WEB_PASSWORD`. Las sesiones del navegador se guardan en `database/web-sessions.json` para no perderlas al reiniciar o actualizar.

## 5. Iniciar

```bash
npm start
```

La sesión se guarda en `Sessions/Tensura/`. En el primer arranque:

1. Escanea el QR o pide el código.
2. Espera el mensaje `Conectado`.
3. Envía `#menu` al bot.

Para desarrollo con recarga automática:

```bash
npm run dev
```

## 6. Mantenerlo activo

Termux puede suspender procesos en segundo plano. Para uso 24/7:

```bash
termux-wake-lock
npm start
```

O usa `tmux`:

```bash
pkg install tmux -y
tmux new -s tensura
npm start
# Ctrl+B, luego D para salir de tmux
```

Para volver:

```bash
tmux attach -t tensura
```

### Host recomendado

Si prefieres no mantener el teléfono encendido, el host recomendado es:

**[ctrl.orbitxspace.com](https://ctrl.orbitxspace.com)**

## 7. Actualizar

Desde WhatsApp, como dueño:

```text
#sync status
#sync
#sync push
```

`#sync` descarga los cambios del repositorio, recarga `cmds/` y reinicia el proceso si cambió el núcleo. También puedes hacerlo a mano:

```bash
cd ~/Tensura
git pull
npm install
npm start
```

Si el proyecto no es un clon git, `#sync` descarga el ZIP de `Neveloopp/Tensura` y copia solo los archivos cambiados; no toca `.env`, `settings.ts`, `Sessions/` ni `database/`. Para publicar cambios con `#sync push`, el clon debe tener `origin` y `GITHUB_TOKEN` en `.env`.

## 8. Problemas comunes

| Problema | Solución |
| --- | --- |
| `EACCES` al instalar | Mueve el proyecto a `~/Tensura`; no uses `/storage/emulated/0`. |
| `tsx: not found` | Ejecuta `npm start` o `node --import tsx index.ts`; no uses `npx tsx`. |
| No genera QR | Revisa la conexión, borra `Sessions/Tensura` y vuelve a iniciar. |
| `sharp` falla | Es opcional; Tensura usa `ffmpeg`. |
| Sticker sin audio | Comprueba que `ffmpeg` tenga `libopus` y `libwebp`. |
| El bot se detiene | Usa `termux-wake-lock` o un host 24/7. |

## Sponsor

**Host recomendado:** [ctrl.orbitxspace.com](https://ctrl.orbitxspace.com)
