const app = document.getElementById("app");
const modalRoot = document.getElementById("modal-root");
const toastRoot = document.getElementById("toasts");

const state = {
  session: null,
  overview: null,
  pairing: null,
  view: "overview",
  sidebarOpen: false,
  refreshTimer: null
};

const ICONS = {
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
  server: "M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  plus: "M12 5v14M5 12h14",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z",
  key: "M14 7a4 4 0 1 1 3 6.9V17l-2 2-2-2-2 2v-3.1A4 4 0 0 1 14 7zM8 13l-4 4v3h3l4-4",
  x: "M6 6l12 12M18 6 6 18",
  check: "M5 12l5 5 9-10",
  alert: "M12 3l9 17H3zM12 9v5M12 17h.01",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5",
  power: "M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0",
  stop: "M6 6h12v12H6z",
  clock: "M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  phone: "M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z",
  link: "M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2",
  menu: "M4 7h16M4 12h16M4 17h16",
  spark: "M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z",
  lock: "M6 10V8a6 6 0 0 1 12 0v2M5 10h14v10H5zM12 14v2",
  arrow: "M5 12h14M13 6l6 6-6 6",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  dot: "M12 12h.01"
};

function icon(name, size = 18) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", ICONS[name] || ICONS.dot);
  svg.append(path);
  return svg;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = String(value);
    else if (key === "onclick") node.addEventListener("click", value);
    else if (key === "onsubmit") node.addEventListener("submit", value);
    else if (key === "oninput") node.addEventListener("input", value);
    else if (key === "value") node.value = value;
    else if (["disabled", "checked", "selected"].includes(key)) node[key] = Boolean(value);
    else if (key === "autocomplete" || key === "autocapitalize" || key === "inputmode" || key === "spellcheck" || key === "minlength" || key === "maxlength" || key === "placeholder" || key === "type" || key === "name" || key === "role" || key === "title" || key === "href" || key === "src" || key === "alt" || key === "aria-label") {
      node.setAttribute(key, value === true ? "" : String(value));
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function brandMark(extra = "") {
  return el("span", { class: `brand-mark ${extra}`.trim(), "aria-hidden": "true" }, "T");
}

function initials(value) {
  const parts = String(value || "TS").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "TS";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function fmtDate(value) {
  if (!value) return "Nunca";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Desconocido";
  return date.toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" });
}

function ago(value) {
  if (!value) return "Nunca";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Desconocido";
  const diff = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Hace un momento";
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Hace ${days} d`;
  return fmtDate(value);
}

function statusText(status) {
  return {
    online: "Conectado",
    connecting: "Conectando",
    pairing: "Vinculando",
    offline: "En espera",
    disabled: "Desactivado",
    error: "Error"
  }[status] || "Desconocido";
}

function statusPill(status) {
  return el(
    "span",
    { class: `status status--${status || "offline"}` },
    el("span", { class: "status-dot" }),
    statusText(status)
  );
}

function formatCode(code) {
  const value = String(code || "").replace(/\s+/g, "");
  if (!value) return "";
  return value.match(/.{1,4}/g).join(" ");
}

async function api(path, method = "GET", body) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (state.session?.csrf && method !== "GET") headers["x-csrf-token"] = state.session.csrf;
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "No se pudo completar la solicitud.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function toast(message, tone = "") {
  const node = el(
    "div",
    { class: `toast ${tone ? `toast--${tone}` : ""}`.trim(), role: "status" },
    icon(tone === "bad" ? "alert" : tone === "gold" ? "spark" : "check", 16),
    el("span", {}, message)
  );
  toastRoot.append(node);
  setTimeout(() => node.remove(), 4200);
}

function showError(error, fallback = "No se pudo completar la solicitud.") {
  if (error?.status === 401) {
    state.session = null;
    stopPolling();
    renderLogin();
    return;
  }
  toast(error?.message || fallback, "bad");
}

function stopPolling() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = null;
}

function startPolling() {
  stopPolling();
  state.refreshTimer = setInterval(() => {
    if (!state.session) return;
    if (document.visibilityState === "hidden") return;
    void refresh({ silent: true });
  }, 6000);
}

async function refresh(options = {}) {
  if (!state.session) return;
  try {
    const result = await api("/overview");
    state.overview = result.data;
    if (options.force || !document.querySelector(".modal-backdrop")) renderDashboard();
  } catch (error) {
    if (error?.status === 401) {
      state.session = null;
      stopPolling();
      renderLogin();
      return;
    }
    if (!options.silent) showError(error);
  }
}

function renderLogin() {
  stopPolling();
  state.overview = null;
  state.sidebarOpen = false;
  document.title = "Tensura · Sub bots";
  const error = el("p", { class: "form-error", role: "alert" });
  const phone = el("input", {
    class: "input input--phone",
    type: "tel",
    name: "phone",
    inputmode: "numeric",
    autocomplete: "tel",
    placeholder: "50585117242",
    required: true
  });
  const password = el("input", {
    class: "input",
    type: "password",
    name: "password",
    autocomplete: "current-password",
    placeholder: "Tu contraseña",
    required: true
  });
  const submit = el("button", { class: "btn btn--primary btn--block", type: "submit" }, "Entrar al panel");
  const form = el(
    "form",
    {
      class: "form",
      onsubmit: async event => {
        event.preventDefault();
        error.textContent = "";
        submit.disabled = true;
        submit.replaceChildren(el("span", { class: "spinner" }), "Entrando");
        try {
          const result = await api("/login", "POST", {
            phone: phone.value,
            password: password.value
          });
          state.session = { phone: result.phone, csrf: result.csrf };
          await refresh({ force: true });
          startPolling();
          toast("Sesión iniciada.", "gold");
        } catch (requestError) {
          error.textContent = requestError.message;
          submit.disabled = false;
          submit.replaceChildren("Entrar al panel");
        }
      }
    },
    el("div", { class: "field" }, el("label", { for: "login-phone" }, "Número de teléfono"), phone),
    el("div", { class: "field" }, el("label", { for: "login-password" }, "Contraseña"), password),
    error,
    submit
  );
  phone.id = "login-phone";
  password.id = "login-password";

  const orbit = el(
    "div",
    { class: "orbit", "aria-hidden": "true" },
    el("span", { class: "orbit-ring" }),
    el("span", { class: "orbit-ring" }),
    el("span", { class: "orbit-ring" }),
    el("span", { class: "orbit-core" }, brandMark()),
    el("span", { class: "orbit-chip" }, el("i"), "Sesión segura"),
    el("span", { class: "orbit-chip" }, el("i"), "Control privado"),
    el("span", { class: "orbit-chip" }, el("i"), "Sub bots activos")
  );

  const visual = el(
    "section",
    { class: "login-visual" },
    el(
      "div",
      { class: "login-brand" },
      brandMark(),
      el("div", {}, el("span", {}, "Tensura"), el("small", {}, "Sub bot control"))
    ),
    orbit,
    el(
      "div",
      { class: "login-copy" },
      el("p", { class: "eyebrow" }, "Panel privado"),
      el("h1", { class: "display" }, "Conecta cuentas.", el("br"), el("em", {}, "Controla todo.")),
      el(
        "p",
        { class: "lead" },
        "Vincula números adicionales, revisa su estado y administra cada sesión desde un único lugar."
      )
    ),
    el(
      "div",
      { class: "feature-list" },
      el("div", { class: "feature" }, el("strong", {}, "Vinculación rápida"), el("span", {}, "QR o código de 8 dígitos.")),
      el("div", { class: "feature" }, el("strong", {}, "Sesiones aisladas"), el("span", {}, "Cada bot conserva sus credenciales.")),
      el("div", { class: "feature" }, el("strong", {}, "Acceso restringido"), el("span", {}, "Solo el teléfono autorizado."))
    )
  );

  const panel = el(
    "section",
    { class: "login-panel" },
    el(
      "div",
      { class: "login-card" },
      brandMark(),
      el("h2", {}, "Entrar al panel"),
      el("p", {}, "Usa el número y la contraseña configurados en el archivo .env."),
      form,
      el("div", { class: "login-foot" }, icon("lock", 14), "Conexión privada · cookies HttpOnly")
    )
  );

  app.replaceChildren(el("main", { class: "login" }, visual, panel));
}

function renderDashboard() {
  if (!state.overview) {
    app.replaceChildren(el("div", { class: "boot" }, brandMark("brand-mark--pulse"), el("span", {}, "Cargando panel")));
    return;
  }
  document.title = "Tensura · Sub bots";
  const overview = state.overview;
  const stats = overview.stats || { total: 0, online: 0, enabled: 0, pairing: 0 };
  const main = overview.main || { connected: false, botId: "", name: "Tensura" };

  const nav = [
    ["overview", "Resumen", "activity"],
    ["bots", "Sub bots", "server"],
    ["guide", "Cómo funciona", "spark"]
  ];

  const navButtons = nav.map(([key, label, iconName]) =>
    el(
      "button",
      {
        class: `nav-btn ${state.view === key ? "is-active" : ""}`,
        type: "button",
        onclick: () => {
          state.view = key;
          state.sidebarOpen = false;
          renderDashboard();
          const target = document.getElementById(`section-${key}`);
          target?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      },
      icon(iconName, 17),
      label
    )
  );

  const sidebar = el(
    "aside",
    { class: `sidebar ${state.sidebarOpen ? "is-open" : ""}`, "aria-label": "Navegación principal" },
    el(
      "div",
      { class: "sidebar-inner" },
      el(
        "div",
        { class: "sidebar-brand" },
        brandMark(),
        el("div", {}, el("strong", {}, "Tensura"), el("small", {}, "Sub bot control"))
      ),
      el("nav", { class: "nav" }, navButtons),
      el("div", { class: "sidebar-spacer" }),
      el(
        "div",
        { class: "sidebar-note" },
        el("strong", {}, "Sesión protegida"),
        el("p", {}, "El acceso está limitado al número configurado en SUBBOT_WEB_PHONE.")
      ),
      el(
        "div",
        { class: "sidebar-user" },
        el("span", { class: "avatar" }, initials(state.session?.phone)),
        el(
          "div",
          { class: "sidebar-user-meta" },
          el("strong", {}, state.session?.phone ? `+${state.session.phone}` : "Administrador"),
          el("span", {}, "Control de sub bots")
        ),
        el("button", { class: "icon-btn", type: "button", title: "Cerrar sesión", "aria-label": "Cerrar sesión", onclick: logout }, icon("logout", 16))
      )
    )
  );

  const scrim = state.sidebarOpen
    ? el("div", {
        class: "sidebar-scrim",
        onclick: () => {
          state.sidebarOpen = false;
          renderDashboard();
        }
      })
    : null;

  const menuButton = el(
    "button",
    {
      class: "icon-btn menu-btn",
      type: "button",
      "aria-label": "Abrir menú",
      onclick: () => {
        state.sidebarOpen = !state.sidebarOpen;
        renderDashboard();
      }
    },
    icon("menu", 18)
  );

  const topbar = el(
    "header",
    { class: "topbar" },
    el("div", { class: "topbar-left" }, menuButton, el("span", { class: "topbar-title" }, "Tensura / Sub bots")),
    el(
      "div",
      { class: "live" },
      el("span", { class: "live-dot" }),
      main.connected ? "Bot principal conectado" : "Bot principal sin sesión"
    )
  );

  const head = el(
    "div",
    { class: "page-head" },
    el(
      "div",
      {},
      el("p", { class: "eyebrow" }, "Centro de control"),
      el("h1", { class: "page-title" }, "Sub bots"),
      el("p", { class: "page-sub" }, "Vincula cuentas adicionales de WhatsApp y administra sus sesiones sin salir del panel.")
    ),
    el(
      "div",
      { class: "page-actions" },
      el(
        "button",
        {
          class: "btn btn--ghost",
          type: "button",
          onclick: () => refresh({ force: true }),
          title: "Actualizar datos"
        },
        icon("refresh", 16),
        "Actualizar"
      ),
      el(
        "button",
        { class: "btn btn--gold", type: "button", onclick: openPairing },
        icon("plus", 16),
        "Nuevo bot"
      )
    )
  );

  const statCards = el(
    "section",
    { class: "stats", id: "section-overview" },
    statCard("Conectados", `${stats.online}`, `de ${stats.total} registrados`, "server", false),
    statCard("Registrados", `${stats.total}`, `${stats.enabled} habilitados`, "user", false),
    statCard("Vinculando", `${stats.pairing}`, stats.pairing ? "En espera de WhatsApp" : "Sin procesos activos", "link", false),
    statCard("Bot principal", main.connected ? "Activo" : "Inactivo", main.botId ? `+${main.botId}` : "Sin sesión", "shield", true)
  );

  const botsPanel = el(
    "section",
    { class: "panel", id: "section-bots" },
    el(
      "div",
      { class: "panel-head" },
      el(
        "div",
        {},
        el("h2", { class: "panel-title" }, "Conexiones"),
        el("p", { class: "panel-sub" }, `${stats.total} ${stats.total === 1 ? "cuenta registrada" : "cuentas registradas"}`)
      ),
      el(
        "div",
        { class: "panel-tools" },
        el("button", { class: "btn btn--ghost btn--small", type: "button", onclick: () => refresh({ force: true }) }, icon("refresh", 14), "Refrescar")
      )
    ),
    (overview.bots || []).length
      ? el("div", { class: "bot-list" }, overview.bots.map(renderBot))
      : emptyBots()
  );

  const guidePanel = el(
    "aside",
    { class: "panel", id: "section-guide" },
    el(
      "div",
      { class: "guide" },
      el("div", { class: "guide-head" }, "Vinculación"),
      step("01", "Abre WhatsApp", "En el teléfono que será el nuevo sub bot."),
      step("02", "Dispositivos vinculados", "Entra en Ajustes y elige vincular un dispositivo."),
      step("03", "Elige QR o código", "Usa el método que prefieras desde el panel."),
      step("04", "Confirma la sesión", "Tensura guarda las credenciales y deja el bot activo.")
    ),
    el(
      "div",
      { style: "padding: 0 20px 20px" },
      el(
        "div",
        { class: "main-status" },
        el("span", { class: "avatar" }, initials(main.name)),
        el(
          "div",
          { class: "main-status-meta" },
          el("strong", {}, main.name || "Tensura"),
          el("span", {}, main.connected ? `+${main.botId}` : "Sin conexión principal")
        ),
        statusPill(main.connected ? "online" : "offline")
      )
    )
  );

  const content = el(
    "div",
    { class: "content-grid" },
    botsPanel,
    guidePanel
  );

  const page = el("main", { class: "page" }, head, statCards, content);

  app.replaceChildren(
    el("div", { class: "shell" }, scrim, sidebar, el("div", { class: "main-wrap" }, topbar, page))
  );
}

function statCard(label, value, foot, iconName, gold) {
  return el(
    "article",
    { class: `stat ${gold ? "stat--gold" : ""}`.trim() },
    el(
      "div",
      { class: "stat-top" },
      el("span", { class: "stat-label" }, label),
      el("span", { class: "stat-icon" }, icon(iconName, 15))
    ),
    el("div", { class: "stat-value" }, value),
    el("div", { class: "stat-foot" }, foot)
  );
}

function step(number, title, text) {
  return el(
    "div",
    { class: "step" },
    el("span", { class: "step-n" }, number),
    el("div", {}, el("strong", {}, title), el("p", {}, text))
  );
}

function emptyBots() {
  return el(
    "div",
    { class: "empty" },
    el(
      "div",
      { class: "empty-art", "aria-hidden": "true" },
      el("span"),
      el("span"),
      el("span", {}, icon("plus", 22))
    ),
    el("h3", {}, "Aún no hay sub bots"),
    el("p", {}, "Vincula la primera cuenta para que Tensura pueda responder y administrar grupos desde otro número."),
    el("button", { class: "btn btn--gold", type: "button", onclick: openPairing }, icon("plus", 16), "Vincular el primero")
  );
}

function renderBot(bot) {
  const running = bot.connected || bot.status === "online" || bot.status === "connecting";
  const action = running ? "stop" : "start";
  const actionLabel = running ? "Detener" : "Iniciar";
  const actionIcon = running ? "stop" : "power";
  const actionClass = running ? "btn--ghost" : "btn--primary";

  const actionButton = el(
    "button",
    {
      class: `btn ${actionClass} btn--small`,
      type: "button",
      onclick: event => runBotAction(bot, action, event.currentTarget)
    },
    icon(actionIcon, 14),
    actionLabel
  );

  const deleteButton = el(
    "button",
    {
      class: "icon-btn",
      type: "button",
      title: "Eliminar sub bot",
      "aria-label": `Eliminar ${bot.name}`,
      onclick: () => confirmDelete(bot)
    },
    icon("trash", 15)
  );

  return el(
    "article",
    { class: "bot" },
    el("span", { class: "bot-avatar" }, initials(bot.name)),
    el(
      "div",
      { class: "bot-main" },
      el(
        "div",
        { class: "bot-name" },
        el("strong", {}, bot.name || "Sub bot"),
        el("span", { class: "bot-phone" }, `+${bot.phone || bot.botId}`)
      ),
      el(
        "div",
        { class: "bot-meta" },
        el("span", {}, icon("clock", 12), `Última conexión: ${ago(bot.lastStartedAt)}`),
        el("span", {}, icon("shield", 12), `Creado: ${fmtDate(bot.createdAt)}`)
      ),
      bot.lastError ? el("div", { class: "bot-error" }, bot.lastError) : null
    ),
    el("div", { class: "bot-side" }, statusPill(bot.status), actionButton, deleteButton)
  );
}

async function runBotAction(bot, action, button) {
  if (button) button.disabled = true;
  try {
    const result = await api(`/bots/${bot.botId}/${action}`, "POST");
    state.overview = result.data;
    renderDashboard();
    toast(action === "start" ? "Sub bot iniciado." : "Sub bot detenido.", "gold");
  } catch (error) {
    if (button) button.disabled = false;
    showError(error);
  }
}

function confirmDelete(bot) {
  const footer = el(
    "div",
    { class: "modal-foot" },
    el("button", { class: "btn btn--ghost", type: "button", onclick: () => modal.close() }, "Cancelar"),
    el(
      "button",
      {
        class: "btn btn--danger",
        type: "button",
        onclick: async event => {
          const button = event.currentTarget;
          button.disabled = true;
          button.replaceChildren(el("span", { class: "spinner" }), "Eliminando");
          try {
            const result = await api(`/bots/${bot.botId}`, "DELETE");
            state.overview = result.data;
            modal.close();
            renderDashboard();
            toast("Sub bot eliminado.", "gold");
          } catch (error) {
            button.disabled = false;
            button.replaceChildren("Eliminar");
            showError(error);
          }
        }
      },
      icon("trash", 15),
      "Eliminar"
    )
  );
  const modal = openModal({
    title: "Eliminar sub bot",
    subtitle: "Esta acción cierra la sesión y borra sus credenciales.",
    body: el(
      "p",
      { class: "confirm-text" },
      "Vas a eliminar ",
      el("strong", {}, bot.name || bot.botId),
      ". Podrás volver a vincularlo cuando quieras."
    ),
    footer,
    size: "modal--small"
  });
}

function openModal(options) {
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    modalRoot.replaceChildren();
    document.body.style.overflow = "";
    options.onClose?.();
  };
  const backdrop = el("div", {
    class: "modal-backdrop",
    onclick: event => {
      if (event.target === backdrop) close();
    }
  });
  const modal = el(
    "div",
    { class: `modal ${options.size || ""}`.trim(), role: "dialog", "aria-modal": "true" },
    el(
      "div",
      { class: "modal-head" },
      el("div", {}, el("h3", {}, options.title), options.subtitle ? el("p", {}, options.subtitle) : null),
      el("button", { class: "icon-btn", type: "button", "aria-label": "Cerrar", onclick: close }, icon("x", 16))
    ),
    options.body,
    options.footer || null
  );
  backdrop.append(modal);
  modalRoot.replaceChildren(backdrop);
  document.body.style.overflow = "hidden";
  return { close, modal };
}

let pairingUI = null;

function openPairing() {
  state.pairing = null;
  const content = el("div", { class: "modal-body" });
  const footer = el("div", { class: "modal-foot" });
  const ui = { content, footer, modal: null, active: null, timer: null, closing: false };
  ui.modal = openModal({
    title: "Vincular un sub bot",
    subtitle: "Conecta otra cuenta de WhatsApp a Tensura.",
    body: content,
    footer,
    size: "modal--pair",
    onClose: () => {
      const current = pairingUI;
      if (!current) return;
      pairingUI = null;
      if (current.timer) clearTimeout(current.timer);
      const active = current.active;
      current.active = null;
      if (active) void api(`/pairings/${active}`, "DELETE").catch(() => {});
    }
  });
  pairingUI = ui;
  renderPairingStart();
}

function closePairingModal() {
  if (!pairingUI) return;
  const ui = pairingUI;
  pairingUI = null;
  if (ui.timer) clearTimeout(ui.timer);
  ui.active = null;
  ui.modal.close();
}

function renderPairingStart() {
  const ui = pairingUI;
  if (!ui) return;
  let method = "qr";
  const phone = state.session?.phone || "";
  const error = el("p", { class: "form-error" });
  const startText = el("span", {}, "Generar QR");

  const methodCard = (key, title, text, iconName) => {
    const button = el(
      "button",
      {
        class: `method ${method === key ? "is-active" : ""}`.trim(),
        type: "button",
        onclick: () => {
          method = key;
          methodCardNodes.forEach(node => node.classList.toggle("is-active", node === button));
          phoneField.style.display = method === "code" ? "" : "none";
          startText.textContent = method === "code" ? "Generar código" : "Generar QR";
          error.textContent = "";
        }
      },
      el("span", { class: "method-icon" }, icon(iconName, 17)),
      el("strong", {}, title),
      el("span", {}, text)
    );
    return button;
  };

  const qrCard = methodCard("qr", "Código QR", "Escanea desde WhatsApp.", "qr");
  const codeCard = methodCard("code", "Código de 8 dígitos", "Vincula con tu número.", "key");
  const methodCardNodes = [qrCard, codeCard];

  const phoneInput = el("input", {
    class: "input input--phone",
    type: "tel",
    inputmode: "numeric",
    autocomplete: "tel",
    placeholder: "Número con código de país",
    value: phone
  });
  const phoneField = el(
    "div",
    { class: "field", style: "display: none; margin-top: 16px" },
    el("label", {}, "Número del nuevo sub bot"),
    phoneInput
  );

  const start = el(
    "button",
    {
      class: "btn btn--gold",
      type: "button",
      onclick: async event => {
        const button = event.currentTarget;
        error.textContent = "";
        if (method === "code" && !/^\d{7,15}$/.test(phoneInput.value.replace(/\D/g, ""))) {
          error.textContent = "Indica el número con código de país, solo dígitos.";
          return;
        }
        button.disabled = true;
        button.replaceChildren(el("span", { class: "spinner" }), "Preparando");
        try {
          const result = await api("/pairings", "POST", {
            method,
            phone: method === "code" ? phoneInput.value : undefined
          });
          if (!pairingUI) return;
          pairingUI.active = result.data.sessionId;
          state.pairing = result.data;
          renderPairingActive(result.data);
          pollPairing();
        } catch (requestError) {
          button.disabled = false;
          startText.textContent = method === "qr" ? "Generar QR" : "Generar código";
          button.replaceChildren(icon("arrow", 15), startText);
          error.textContent = requestError.message;
        }
      }
    },
    icon("arrow", 15),
    startText
  );

  ui.content.replaceChildren(
    el("p", { class: "pairing-text", style: "text-align: left; max-width: none; margin-bottom: 14px" }, "Elige cómo quieres conectar la cuenta. El proceso vence en unos minutos por seguridad."),
    el("div", { class: "method-grid" }, qrCard, codeCard),
    phoneField,
    error
  );
  ui.footer.replaceChildren(
    el("button", { class: "btn btn--ghost", type: "button", onclick: closePairingModal }, "Cancelar"),
    start
  );
}

function renderPairingActive(pairing) {
  const ui = pairingUI;
  if (!ui) return;
  if (pairing.status === "completed") {
    renderPairingCompleted(pairing);
    return;
  }

  const error = pairing.error ? el("div", { class: "pairing-error" }, pairing.error) : null;
  const isQr = pairing.method === "qr";
  const waiting = !pairing.error;
  const qrContent = pairing.qr
    ? el("div", { class: "qr-frame" }, el("img", { src: pairing.qr, alt: "Código QR de vinculación" }))
    : el(
        "div",
        { class: "qr-frame" },
        el("div", { class: "pairing-status" }, el("span", { class: "spinner" }), "Generando QR")
      );
  const codeContent = el(
    "div",
    { class: "code-box" },
    pairing.code ? formatCode(pairing.code) : el("span", { class: "spinner" })
  );

  ui.content.replaceChildren(
    el(
      "div",
      { class: "pairing" },
      isQr ? qrContent : codeContent,
      el("h4", { class: "pairing-title" }, isQr ? "Escanea el código QR" : "Introduce este código"),
      el(
        "p",
        { class: "pairing-text" },
        isQr
          ? "Abre WhatsApp en el nuevo teléfono, entra en Dispositivos vinculados y escanea el código."
          : "Abre WhatsApp, entra en Dispositivos vinculados, elige vincular con número de teléfono e introduce el código."
      ),
      waiting
        ? el("span", { class: "pairing-status" }, el("span", { class: "spinner" }), "Esperando confirmación de WhatsApp")
        : null,
      error
    )
  );

  ui.footer.replaceChildren(
    el(
      "button",
      {
        class: "btn btn--ghost",
        type: "button",
        onclick: async () => {
          const active = ui.active;
          closePairingModal();
          if (active) await api(`/pairings/${active}`, "DELETE").catch(() => {});
        }
      },
      "Cancelar vinculación"
    ),
    pairing.error
      ? el(
          "button",
          {
            class: "btn btn--gold",
            type: "button",
            onclick: () => {
              closePairingModal();
              openPairing();
            }
          },
          "Volver a intentar"
        )
      : null
  );
}

function renderPairingCompleted(pairing) {
  const ui = pairingUI;
  if (!ui) return;
  ui.active = null;
  if (ui.timer) clearTimeout(ui.timer);
  ui.content.replaceChildren(
    el(
      "div",
      { class: "pairing" },
      el(
        "div",
        { class: "qr-frame", style: "width: 88px; height: 88px; padding: 0; border-radius: 50%; border-color: rgba(56,211,159,.4)" },
        el("span", { style: "color: #38d39f; display:flex" }, icon("check", 40))
      ),
      el("h4", { class: "pairing-title" }, "Sub bot conectado"),
      el("p", { class: "pairing-text" }, `La cuenta +${pairing.botId} ya forma parte de Tensura y quedó activa.`)
    )
  );
  ui.footer.replaceChildren(
    el(
      "button",
      {
        class: "btn btn--gold",
        type: "button",
        onclick: () => {
          closePairingModal();
          void refresh({ force: true });
          toast("Sub bot vinculado correctamente.", "gold");
        }
      },
      "Listo"
    )
  );
}

async function pollPairing() {
  const ui = pairingUI;
  if (!ui?.active) return;
  try {
    const result = await api(`/pairings/${ui.active}`);
    if (!pairingUI || pairingUI !== ui) return;
    const pairing = result.data;
    state.pairing = pairing;
    if (pairing.status === "completed") {
      renderPairingCompleted(pairing);
      void refresh({ force: true });
      toast("Sub bot conectado.", "gold");
      return;
    }
    renderPairingActive(pairing);
    if (pairing.status !== "error") {
      ui.timer = setTimeout(pollPairing, 1400);
    }
  } catch (error) {
    if (!pairingUI || pairingUI !== ui) return;
    if (error?.status === 404) {
      ui.content.replaceChildren(
        el("div", { class: "pairing-error" }, "La vinculación ya no está disponible. Cierra esta ventana e inténtalo otra vez.")
      );
      ui.footer.replaceChildren(el("button", { class: "btn btn--ghost", type: "button", onclick: closePairingModal }, "Cerrar"));
      return;
    }
    ui.timer = setTimeout(pollPairing, 2200);
  }
}

async function logout() {
  try {
    await api("/logout", "POST");
  } catch {}
  state.session = null;
  state.overview = null;
  stopPolling();
  renderLogin();
  toast("Sesión cerrada.");
}

window.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.session) void refresh({ silent: true });
});

async function boot() {
  try {
    const session = await api("/session");
    if (session.authenticated) {
      state.session = { phone: session.phone, csrf: session.csrf };
      await refresh({ force: true });
      startPolling();
      return;
    }
  } catch {}
  renderLogin();
}

void boot();
