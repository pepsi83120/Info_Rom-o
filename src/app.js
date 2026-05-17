import { defaultState } from "./data.js";
import { clone, downloadJson, loadServerState, loadState, nextId, resetState, saveState } from "./store.js";

const app = document.getElementById("app");
const ADMIN_AUTH_KEY = "villa-romeo-admin-auth-v1";
const GUEST_AUTH_KEY = "villa-romeo-guest-auth-v1";
const ADMIN_NOTIFICATION_READ_KEY = "villa-romeo-admin-notifications-read-v1";
const ADMIN_NOTIFICATION_SNAPSHOT_KEY = "villa-romeo-admin-notifications-snapshot-v1";
const ADMIN_CREDENTIALS = {
  username: "La Villa Roméo",
  password: "Jajap00mp00m*"
};

const VAPID_PUBLIC_KEY = "BAZT7ymj3mVaYdnXXxQRCyPuKPdA_bgaNHY96_BG8ueJ0W-zZLz00h-pbGH-7Yxxiv0Iq6yoEWZUEMzngUT5CZw";
let pushSubscription = null;

let installPromptEvent = null;
let state = loadState();
let isAdminAuthenticated = localStorage.getItem(ADMIN_AUTH_KEY) === "ok";
let view = "dashboard";
let activeSuiteId = state.suites[0]?.id || null;
let activeTab = "overview";
let modalMode = null;
let modalEntityId = null;
let toastTimer = null;
let notificationSnapshot = localStorage.getItem(ADMIN_NOTIFICATION_SNAPSHOT_KEY) || "";
let syncTimer = null;
let filters = {
  reservationStatus: "all",
  reservationSuite: "all",
  reservationQuery: "",
  taskStatus: "all",
  taskQuery: ""
};

boot();

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPromptEvent = event;
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

function boot() {
  if (!isAdminAuthenticated) {
    renderLoginChoice();
    return;
  }

  startAdminApp();
}

function startAdminApp() {
  app.innerHTML = shell();
  render();
  bindGlobalEvents();
  syncServerState();
  clearInterval(syncTimer);
  syncTimer = setInterval(() => syncServerState(false), 20000);
  checkExistingPushSubscription();
}

async function checkExistingPushSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      pushSubscription = sub;
      renderSettings();
    }
  } catch {}
}

function renderLoginChoice(mode = "admin", error = "") {
  const isAdmin = mode === "admin";
  app.innerHTML = `
    <main class="auth-screen">
      <form class="auth-card" id="loginForm">
        <div class="brand-mark">M</div>
        <div>
          <div class="auth-eyebrow">La villa Roméo</div>
          <h1>${isAdmin ? "Administration" : "Espace client"}</h1>
          <p>${isAdmin ? "Connectez-vous pour gerer La villa Roméo." : "Connectez-vous au logement reserve."}</p>
        </div>
        <div class="auth-switch" role="tablist" aria-label="Type de connexion">
          <button class="${isAdmin ? "active" : ""}" type="button" data-auth-mode="admin"><i class="ti ti-shield-lock"></i>Admin</button>
          <button class="${!isAdmin ? "active" : ""}" type="button" data-auth-mode="client"><i class="ti ti-home"></i>Client</button>
        </div>
        <label>
          Identifiant
          <input id="loginUsername" type="text" autocomplete="username" required>
        </label>
        <label>
          Mot de passe
          <input id="loginPassword" type="password" autocomplete="current-password" required>
        </label>
        ${error ? `<div class="auth-error">${esc(error)}</div>` : ""}
        <button class="btn primary" type="submit"><i class="ti ti-lock-open"></i>Se connecter</button>
      </form>
    </main>
  `;

  document.querySelectorAll("[data-auth-mode]").forEach(button => {
    button.addEventListener("click", () => renderLoginChoice(button.dataset.authMode));
  });

  document.getElementById("loginForm").addEventListener("submit", event => {
    event.preventDefault();
    isAdmin ? loginAdmin() : loginClient();
  });
}

function loginAdmin() {
  const username = val("loginUsername");
  const password = val("loginPassword");
  if (sameCredential(username, ADMIN_CREDENTIALS.username) && password === ADMIN_CREDENTIALS.password) {
    localStorage.setItem(ADMIN_AUTH_KEY, "ok");
    isAdminAuthenticated = true;
    startAdminApp();
    return;
  }

  renderLoginChoice("admin", "Identifiant ou mot de passe admin incorrect.");
}

function loginClient() {
  const username = val("loginUsername");
  const password = val("loginPassword");
  const suite = state.suites.find(item => {
    const login = suiteLogin(item);
    return sameCredential(username, login.username) && password === login.password;
  });

  if (!suite) {
    renderLoginChoice("client", "Identifiant ou mot de passe client incorrect.");
    return;
  }

  localStorage.setItem(GUEST_AUTH_KEY, JSON.stringify({ suiteId: suite.id }));
  window.location.href = `guest.html?suite=${encodeURIComponent(suite.id)}`;
}

function suiteLogin(suite) {
  return {
    username: suite.clientLogin?.username || suite.name,
    password: suite.clientLogin?.password || ""
  };
}

function sameCredential(input, expected) {
  return normalizeCredential(input) === normalizeCredential(expected);
}

function normalizeCredential(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

async function syncServerState(showToast = true) {
  const serverState = await loadServerState();
  if (!serverState) return;
  state = serverState;
  activeSuiteId = state.suites.some(s => s.id === activeSuiteId) ? activeSuiteId : state.suites[0]?.id || null;
  saveState(state);
  render();
  if (showToast) toast("Sauvegarde serveur chargee.");
}

function shell() {
  return `
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <div class="brand">
          <div class="brand-top">
            <div>
              <div class="brand-name" data-setting="propertyName">${esc(state.settings.propertyName)}</div>
              <div class="brand-sub" data-setting="descriptor">${esc(state.settings.descriptor)}</div>
            </div>
            <div class="brand-mark">M</div>
          </div>
        </div>
        <nav class="nav" id="nav"></nav>
        <div class="sidebar-foot">
          <div class="admin">
            <div class="avatar">AD</div>
            <div>
              <div class="admin-name" data-setting="adminName">${esc(state.settings.adminName)}</div>
              <div class="admin-role">Conciergerie premium</div>
            </div>
          </div>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div style="display:flex;align-items:center;gap:12px;min-width:0;">
            <button class="btn icon mobile-menu" data-action="toggle-sidebar" aria-label="Menu"><i class="ti ti-menu-2"></i></button>
            <div>
              <div class="page-title" id="pageTitle">Dashboard</div>
              <div class="page-subtitle" id="pageSubtitle">Pilotage conciergerie</div>
            </div>
          </div>
          <div class="top-actions">
            <button class="btn install-btn" data-action="install-app"><i class="ti ti-device-mobile-down"></i> Installer l'appli</button>
            <button class="btn icon" data-action="toggle-notifications" aria-label="Notifications">
              <i class="ti ti-bell"></i>
              <span class="notification-dot" id="notificationDot"></span>
            </button>
            <button class="btn mobile-hide" data-action="open-guest"><i class="ti ti-external-link"></i> Portail client</button>
            <button class="btn mobile-hide" data-action="logout-admin"><i class="ti ti-logout"></i> Deconnexion</button>
            <button class="btn" data-action="export"><i class="ti ti-download"></i> Export</button>
            <button class="btn gold mobile-hide" data-action="new-suite"><i class="ti ti-home-plus"></i> Logement</button>
          </div>
        </header>
        <div class="notification-panel" id="notificationPanel"></div>
        <div class="content">
          <section class="view active" id="view-dashboard"></section>
          <section class="view" id="view-analytics"></section>
          <section class="view" id="view-suites"></section>
          <section class="view" id="view-suite"></section>
          <section class="view" id="view-reservations"></section>
          <section class="view" id="view-breakfasts"></section>
          <section class="view" id="view-events"></section>
          <section class="view" id="view-agenda"></section>
          <section class="view" id="view-temperatures"></section>
          <section class="view" id="view-payments"></section>
          <section class="view" id="view-tasks"></section>
          <section class="view" id="view-messages"></section>
          <section class="view" id="view-qr"></section>
          <section class="view" id="view-settings"></section>
        </div>
      </main>
    </div>
    <div class="sidebar-backdrop" data-action="close-sidebar"></div>
    <div class="modal" id="modal"></div>
    <div class="toast" id="toast"></div>
  `;
}

function bindGlobalEvents() {
  document.addEventListener("click", event => {
    const button = event.target.closest("button");
    const actionTarget = event.target.closest("[data-action]");
    const suiteTarget = event.target.closest("[data-suite]");

    if (!button && actionTarget) {
      handleAction(actionTarget.dataset.action, actionTarget);
      return;
    }

    if (!button && suiteTarget) {
      openSuite(Number(suiteTarget.dataset.suite));
      return;
    }

    if (!button) return;

    if (button.dataset.suite) {
      openSuite(Number(button.dataset.suite));
      return;
    }

    if (button.dataset.view) showView(button.dataset.view);
    if (button.dataset.tab) showTab(button.dataset.tab);
    if (button.dataset.action) handleAction(button.dataset.action, button);
  });

  document.addEventListener("change", event => {
    const el = event.target;
    if (el.dataset.live) updateLive(el);
    if (el.dataset.filter) updateFilter(el);
  });

  document.addEventListener("input", event => {
    const el = event.target;
    if (el.dataset.filterText) updateFilter(el);
  });
}

function handleAction(action, button) {
  const id = Number(button.dataset.id || 0);
  const type = button.dataset.type;

  const actions = {
    "toggle-sidebar": () => setSidebarOpen(!document.getElementById("sidebar").classList.contains("open")),
    "close-sidebar": () => setSidebarOpen(false),
    "install-app": () => installApp(),
    "logout-admin": () => logoutAdmin(),
    "toggle-notifications": () => toggleNotifications(),
    "enable-notifications": () => enableBrowserNotifications(),
    "subscribe-push": () => subscribePush(),
    "unsubscribe-push": () => unsubscribePush(),
    "test-push": () => testPush(),
    "clear-admin-notifications": () => clearAdminNotifications(),
    "open-notification": () => openNotification(button.dataset.targetView, id),
    "open-guest": () => openGuestPortal(),
    "export": () => exportData(),
    "reset": () => resetAll(),
    "new-suite": () => openModal("suite"),
    "edit-suite": () => openModal("suite", id),
    "delete-suite": () => deleteSuite(id),
    "save-suite": () => saveSuiteFromModal(),
    "new-reservation": () => openModal("reservation"),
    "edit-reservation": () => openModal("reservation", id),
    "delete-reservation": () => deleteItem("reservations", id, "Reservation supprimee."),
    "save-reservation": () => saveReservationFromModal(),
    "sync-planning": () => syncPlanningCalendar(id),
    "sync-planning-all": () => syncAllPlanningCalendars(),
    "new-breakfast": () => openModal("breakfast"),
    "edit-breakfast": () => openModal("breakfast", id),
    "delete-breakfast": () => deleteItem("breakfasts", id, "Demande supprimee."),
    "save-breakfast": () => saveBreakfastFromModal(),
    "mark-payment-paid": () => markPaymentPaid(id),
    "mark-payment-deposit": () => markPaymentDeposit(id),
    "mark-payment-unpaid": () => markPaymentUnpaid(id),
    "new-task": () => openModal("task"),
    "edit-task": () => openModal("task", id),
    "delete-task": () => deleteItem("tasks", id, "Tache supprimee."),
    "complete-task": () => patchItem("tasks", id, { status: "done" }, "Tache terminee."),
    "save-task": () => saveTaskFromModal(),
    "new-event": () => openModal("event"),
    "edit-event": () => openModal("event", id),
    "delete-event": () => deleteItem("events", id, "Evenement supprime."),
    "toggle-event": () => toggleEvent(id),
    "save-event": () => saveEventFromModal(),
    "new-agenda": () => openModal("agenda"),
    "edit-agenda": () => openModal("agenda", id),
    "delete-agenda": () => deleteItem("agenda", id, "Activite supprimee."),
    "toggle-agenda": () => toggleAgenda(id),
    "save-agenda": () => saveAgendaFromModal(),
    "save-temperatures": () => saveTemperatures(),
    "new-message": () => openModal("message"),
    "reply-message": () => openModal("message", id),
    "mark-message-read": () => markMessageRead(id),
    "save-message": () => saveMessageFromModal(),
    "save-settings": () => saveSettings(),
    "save-suite-tab": () => saveSuiteTab(type),
    "copy-wifi": () => copyWifi(id),
    "print-qr": () => printQr(id),
    "close-modal": () => closeModal()
  };

  actions[action]?.();
}

function logoutAdmin() {
  localStorage.removeItem(ADMIN_AUTH_KEY);
  isAdminAuthenticated = false;
  renderLoginChoice();
}

async function installApp() {
  if (installPromptEvent) {
    installPromptEvent.prompt();
    await installPromptEvent.userChoice;
    installPromptEvent = null;
    return;
  }

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  toast(isIos ? "Sur iPhone : bouton Partager, puis Ajouter a l'ecran d'accueil." : "Ouvre le menu du navigateur puis choisis Installer l'application.");
}

function render() {
  renderNav();
  renderHeader();
  renderDashboard();
  renderAnalytics();
  renderSuitesView();
  renderSuiteDetail();
  renderReservations();
  renderBreakfasts();
  renderPayments();
  renderTasks();
  renderEvents();
  renderAgenda();
  renderTemperatures();
  renderMessages();
  renderQr();
  renderSettings();
  const unread = unreadAdminNotifications().length;
  const notificationDot = document.getElementById("notificationDot");
  if (notificationDot) notificationDot.hidden = unread === 0;
  renderNotificationPanel();
  document.querySelectorAll("[data-setting='propertyName']").forEach(el => el.textContent = state.settings.propertyName);
  document.querySelectorAll("[data-setting='descriptor']").forEach(el => el.textContent = state.settings.descriptor);
  document.querySelectorAll("[data-setting='adminName']").forEach(el => el.textContent = state.settings.adminName);
}

function renderNav() {
  const unread = state.messages.filter(m => m.status === "unread").length;
  const openTasks = state.tasks.filter(t => t.status !== "done").length;
  const breakfast = state.breakfasts.filter(b => b.status !== "done").length;
  const paymentDue = state.reservations.filter(r => paymentBalance(r) > 0).length;

  document.getElementById("nav").innerHTML = `
    <div class="nav-label">Pilotage</div>
    ${navItem("dashboard", "ti-layout-dashboard", "Dashboard")}
    ${navItem("reservations", "ti-calendar-check", "Reservations")}
    ${navItem("breakfasts", "ti-coffee", "Petits-dejeuners", breakfast)}
    ${navItem("messages", "ti-message-circle", "Messages", unread)}
    ${navItem("tasks", "ti-list-check", "A faire", openTasks)}
    ${navItem("events", "ti-calendar-star", "Nos animations", activeEventsCount())}
    ${navItem("agenda", "ti-calendar-event", "Agenda ville")}
    ${navItem("temperatures", "ti-temperature", "Temperatures")}
    ${navItem("payments", "ti-credit-card", "Paiements", paymentDue)}
    ${navItem("analytics", "ti-chart-line", "Chiffres")}
    ${navItem("qr", "ti-qrcode", "QR Codes")}
    <div class="nav-divider"></div>
    <div class="nav-label">Logements</div>
    ${state.suites.map(s => `
      <button class="suite-nav ${view === "suite" && activeSuiteId === s.id ? "active" : ""}" data-suite="${s.id}">
        <span class="suite-dot"></span>${esc(s.name)}
      </button>
    `).join("")}
    <div class="nav-divider"></div>
    ${navItem("suites", "ti-home-cog", "Tous les logements")}
    ${navItem("settings", "ti-settings", "Parametres")}
  `;
}

function navItem(key, icon, label, count = null) {
  return `
    <button class="nav-item ${view === key ? "active" : ""}" data-view="${key}">
      <i class="ti ${icon}"></i>${label}
      ${count ? `<span class="nav-badge">${count}</span>` : ""}
    </button>
  `;
}

function renderHeader() {
  const labels = {
    dashboard: ["Dashboard", "Vue executive de la propriete et des operations"],
    analytics: ["Chiffres", "Revenus, occupation, logements et services"],
    suites: ["Logements", "Inventaire, statut et edition rapide"],
    suite: [currentSuite()?.name || "Logement", "Fiche detaillee et portail invite"],
    reservations: ["Reservations", "Planning, paiements et demandes voyageurs"],
    breakfasts: ["Petits-dejeuners", "Production quotidienne et suivi service"],
    payments: ["Paiements", "Soldes, acomptes et encaissements sejours"],
    tasks: ["A faire", "Menage, maintenance et conciergerie terrain"],
    events: ["Nos animations", "Experiences et annonces visibles cote client"],
    agenda: ["Agenda ville", "Sorties, marches et activites autour de la villa"],
    temperatures: ["Temperatures", "Piscine, air et mer matin, apres-midi et soir"],
    messages: ["Messages", "Demandes voyageurs et priorites"],
    qr: ["QR Codes", "Portails invites par logement"],
    settings: ["Parametres", "Identite, contacts et preferences"]
  };

  document.getElementById("pageTitle").textContent = labels[view]?.[0] || "Admin";
  document.getElementById("pageSubtitle").textContent = labels[view]?.[1] || state.settings.propertyName;
}

function renderDashboard() {
  const container = document.getElementById("view-dashboard");
  const revenue = state.reservations.reduce((sum, r) => sum + Number(r.total || 0), 0);
  const occupied = occupiedSuiteIdsToday().size;
  const ready = state.suites.filter(s => s.housekeeping === "ready").length;
  const unread = state.messages.filter(m => m.status === "unread").length;
  const yearly = yearlyAnalytics();

  container.innerHTML = `
    <div class="dashboard-grid">
      <div>
        <div class="hero-panel">
          <div class="hero-copy">
            <div>
              <div class="eyebrow">${esc(state.settings.descriptor)}</div>
              <div class="hero-title">${esc(state.settings.propertyName)}</div>
              <div class="hero-text">${esc(state.settings.welcomeNote)}</div>
            </div>
            <div class="hero-metrics">
              ${heroMetric(formatMoney(revenue), "CA sejours")}
              ${heroMetric(`${occupied}/${state.suites.length}`, "Logements occupes")}
              ${heroMetric(String(unread), "Messages urgents")}
            </div>
          </div>
          <div class="hero-art dashboard-photo" aria-label="Piscine La villa Roméo"></div>
        </div>
        <div class="stats">
          ${statCard("Occupation", pct(occupied, state.suites.length), `${occupied} logements occupes`)}
          ${statCard("Prets", ready, "Suites inspectees")}
          ${statCard("Taches", state.tasks.filter(t => t.status !== "done").length, "Actions ouvertes")}
          ${statCard("Messages", state.messages.filter(m => m.status === "unread").length, "Demandes non lues")}
        </div>
        <div class="panel annual-panel">
          <div class="panel-head">
            <div>
              <div class="section-title">Chiffre annuel ${yearly.year}</div>
              <div class="section-copy">Revenus encaisses par mois, a partir des reservations.</div>
            </div>
            <button class="btn small" data-view="analytics">Details</button>
          </div>
          <div class="panel-body">
            ${lineChart(yearly.months.map(m => m.revenue), yearly.months.map(m => m.label))}
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <div>
            <div class="section-title">A traiter</div>
            <div class="section-copy">Priorites du jour</div>
          </div>
          <button class="btn small" data-view="tasks">Voir tout</button>
        </div>
        <div class="panel-body">
          <div class="timeline">
            ${state.tasks.slice(0, 5).map(taskTimeline).join("") || empty("Aucune tache ouverte.")}
          </div>
        </div>
      </div>
    </div>

    <div class="section-head">
      <div>
        <div class="section-title">Logements en direct</div>
        <div class="section-copy">Statut, client, housekeeping et actions rapides.</div>
      </div>
      <button class="btn primary" data-view="suites">Gerer les logements</button>
    </div>
    <div class="suite-grid">${state.suites.map(suiteCard).join("")}</div>
  `;
}

function occupiedSuiteIdsToday() {
  const occupiedIds = new Set(
    state.suites
      .filter(suite => suite.status === "occupied")
      .map(suite => Number(suite.id))
  );

  state.reservations.forEach(reservation => {
    if (reservationOccupiesToday(reservation)) {
      occupiedIds.add(Number(reservation.suiteId));
    }
  });

  return occupiedIds;
}

function reservationOccupiesToday(reservation) {
  if (!reservation) return false;
  if (reservation.status === "inhouse") return true;
  if (["checkout", "cancelled", "raw"].includes(reservation.status)) return false;

  const todayDate = startOfDay(new Date());
  const arrival = parseDate(reservation.arrival);
  const departure = parseDate(reservation.departure);
  return Boolean(arrival && departure && arrival <= todayDate && todayDate < departure);
}

function renderAnalytics() {
  const yearly = yearlyAnalytics();
  const totals = yearly.totals;
  document.getElementById("view-analytics").innerHTML = `
    <div class="stats" style="margin-top:0;">
      ${statCard("CA annuel", formatMoney(totals.revenue), `${totals.reservations} reservations`)}
      ${statCard("Occupation", `${totals.occupancy}%`, `${totals.roomNights} nuits logement`)}
      ${statCard("Prix moyen", formatMoney(totals.averageNight), "Par nuit vendue")}
      ${statCard("Petits-dej.", totals.breakfasts, "Demandes sur l'annee")}
    </div>

    <div class="panel annual-panel">
      <div class="panel-head">
        <div>
          <div class="section-title">Courbe annuelle</div>
          <div class="section-copy">Evolution du chiffre d'affaires mois par mois.</div>
        </div>
      </div>
      <div class="panel-body">
        ${lineChart(yearly.months.map(m => m.revenue), yearly.months.map(m => m.label))}
      </div>
    </div>

    <div class="section-head">
      <div>
        <div class="section-title">Performance par logement</div>
        <div class="section-copy">Revenus, nuits, clients, petits-dejeuners, operations et messages par villa.</div>
      </div>
    </div>
    <div class="analytics-grid">
      ${yearly.suites.map(suiteAnalyticsCard).join("")}
    </div>

    <div class="split" style="margin-top:18px;">
      <div class="panel">
        <div class="panel-head">
          <div>
            <div class="section-title">Petits-dejeuners</div>
            <div class="section-copy">Volume et statut de production.</div>
          </div>
        </div>
        <div class="panel-body">
          <div class="analytics-list">
            ${yearly.breakfastByStatus.map(item => analyticsLine(item.label, item.value, item.note)).join("")}
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <div>
            <div class="section-title">Operations</div>
            <div class="section-copy">Suivi rapide des taches terrain.</div>
          </div>
        </div>
        <div class="panel-body">
          <div class="analytics-list">
            ${yearly.tasksByStatus.map(item => analyticsLine(item.label, item.value, item.note)).join("")}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderSuitesView() {
  document.getElementById("view-suites").innerHTML = `
    <div class="section-head" style="margin-top:0;">
      <div>
        <div class="section-title">Inventaire logements</div>
        <div class="section-copy">Ajoute, modifie et controle tous les espaces voyageurs.</div>
      </div>
      <button class="btn gold" data-action="new-suite"><i class="ti ti-home-plus"></i>Nouveau logement</button>
    </div>
    <div class="suite-grid">${state.suites.map(suiteCard).join("")}</div>
  `;
}

function renderSuiteDetail() {
  const s = currentSuite();
  const container = document.getElementById("view-suite");
  if (!s) {
    container.innerHTML = empty("Aucun logement selectionne.");
    return;
  }

  container.innerHTML = `
    <div class="split">
      <div class="panel">
        <div class="panel-head">
          <div>
            <div class="section-title">${esc(s.name)}</div>
            <div class="section-copy">${esc(s.category)} - ${esc(s.view)}</div>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn small" data-action="copy-wifi" data-id="${s.id}"><i class="ti ti-wifi"></i>Wi-Fi</button>
            <button class="btn small danger" data-action="delete-suite" data-id="${s.id}"><i class="ti ti-trash"></i>Supprimer</button>
          </div>
        </div>
        <div class="panel-body">
          <div class="tabs">
            ${tabButton("overview", "Vue generale")}
            ${tabButton("villa", "Parametres villa")}
            ${tabButton("access", "Acces")}
            ${tabButton("guest", "Portail invite")}
            ${tabButton("internal", "Interne")}
          </div>
          <div class="tab-panel ${activeTab === "overview" ? "active" : ""}">
            <div class="form-grid">
              ${field("Nom", "suite-name", s.name)}
              ${field("Categorie", "suite-category", s.category)}
              ${select("Statut", "suite-status", s.status, statusOptions())}
              ${field("Tarif nuit", "suite-nightlyRate", s.nightlyRate, "number")}
              ${field("Surface", "suite-surface", s.surface)}
              ${field("Capacite", "suite-guests", s.guests, "number")}
              ${field("Etage", "suite-floor", s.floor)}
              ${field("Vue", "suite-view", s.view)}
              ${field("Couleur", "suite-color", s.color, "color")}
              ${field("Photo URL", "suite-photo", s.photo)}
            </div>
            ${saveRow("overview")}
          </div>
          <div class="tab-panel ${activeTab === "villa" ? "active" : ""}">
            <div class="form-grid">
              ${field("Nom public", "suite-publicName", s.publicName || s.name)}
              ${field("Type de villa", "suite-villaType", s.villaType || s.category)}
              ${field("Ambiance", "suite-ambience", s.ambience || "")}
              ${field("Langue client", "suite-preferredLanguage", s.preferredLanguage || state.settings.language)}
              ${field("Contact client", "suite-guestPhone", s.guestPhone || "")}
              ${select("Petit-dejeuner inclus", "suite-breakfastIncluded", s.breakfastIncluded || "no", [["yes", "Oui"], ["no", "Non"], ["optional", "Sur demande"]])}
              ${area("Instructions d'arrivee", "suite-arrivalInstructions", s.arrivalInstructions || "")}
              ${area("Message visible client", "suite-guestIntro", s.guestIntro || s.welcome)}
            </div>
            ${saveRow("villa")}
          </div>
          <div class="tab-panel ${activeTab === "access" ? "active" : ""}">
            <div class="form-grid">
              ${field("Wi-Fi", "suite-wifi", s.wifi)}
              ${field("Mot de passe", "suite-wifiPass", s.wifiPass)}
              ${field("Code porte", "suite-doorCode", s.doorCode)}
              ${field("Parking", "suite-parking", s.parking)}
              ${field("Check-in", "suite-checkin", s.checkin, "time")}
              ${field("Check-out", "suite-checkout", s.checkout, "time")}
              ${area("Regles", "suite-rules", s.rules)}
              ${field("Lien client automatique", "suite-qrUrl", `guest.html?suite=${s.id}`)}
            </div>
            ${saveRow("access")}
          </div>
          <div class="tab-panel ${activeTab === "guest" ? "active" : ""}">
            <div class="form-grid">
              ${area("Message d'accueil", "suite-welcome", s.welcome)}
              ${area("Minibar", "suite-minibar", s.minibar)}
            </div>
            ${saveRow("guest")}
          </div>
          <div class="tab-panel ${activeTab === "internal" ? "active" : ""}">
            <div class="form-grid">
              ${field("Client actuel", "suite-currentGuest", s.currentGuest)}
              ${field("Arrivee", "suite-arrival", s.arrival, "date")}
              ${field("Depart", "suite-departure", s.departure, "date")}
              ${field("Prochain checkout", "suite-nextCheckout", s.nextCheckout, "date")}
              ${select("Housekeeping", "suite-housekeeping", s.housekeeping, housekeepingOptions())}
              ${area("Notes internes", "suite-internalNotes", s.internalNotes)}
            </div>
            ${saveRow("internal")}
          </div>
        </div>
      </div>
      <div class="panel guest-preview">
        <div class="preview-cover" style="${heroStyle(s)}">
          <h3>${esc(s.publicName || s.name)}</h3>
          <p>${esc(s.guestIntro || s.welcome)}</p>
        </div>
        <div class="preview-list">
          ${preview("ti-home-star", "Parametres villa", `${s.villaType || s.category} - ${s.ambience || s.view}`)}
          ${preview("ti-wifi", "Wi-Fi", `${s.wifi} - ${s.wifiPass}`)}
          ${preview("ti-door", "Code porte", s.doorCode)}
          ${preview("ti-clock", "Horaires", `Check-in ${s.checkin} / Check-out ${s.checkout}`)}
          ${preview("ti-info-circle", "Arrivee", s.arrivalInstructions || "A preciser")}
          ${preview("ti-car", "Parking", s.parking)}
          ${preview("ti-qrcode", "Portail", clientUrl(s))}
        </div>
      </div>
    </div>
  `;
}

function renderReservations() {
  const filtered = state.reservations.filter(r => {
    const query = filters.reservationQuery.toLowerCase();
    const suite = suiteName(r.suiteId).toLowerCase();
    return (filters.reservationStatus === "all" || computedReservationStatus(r) === filters.reservationStatus)
      && (filters.reservationSuite === "all" || Number(r.suiteId) === Number(filters.reservationSuite))
      && (!query || r.guest.toLowerCase().includes(query) || suite.includes(query) || r.channel.toLowerCase().includes(query));
  });

  document.getElementById("view-reservations").innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div>
          <div class="section-title">Reservations</div>
          <div class="section-copy">Suivi clients, canaux, soldes et demandes speciales.</div>
        </div>
        <button class="btn gold" data-action="new-reservation"><i class="ti ti-calendar-plus"></i>Ajouter</button>
      </div>
      <div class="panel-body">
        ${planningImportPanel()}
        <div class="table-tools">
          <div class="filters">
            ${filterSelect("Statut", "reservationStatus", filters.reservationStatus, [["all","Tous"],["confirmed","Confirmee"],["inhouse","En sejour"],["checkout","Check-out"],["left","Sorti"],["raw","Sans description"]])}
            ${filterSelect("Logement", "reservationSuite", filters.reservationSuite, reservationSuiteOptions())}
            ${filterText("Recherche", "reservationQuery", filters.reservationQuery)}
          </div>
        </div>
        ${reservationTable(filtered)}
      </div>
    </div>
  `;
}

function planningImportPanel() {
  const planningUrls = planningIcsUrls();
  return `
    <div class="planning-import">
      <div>
        <div class="table-title">Planning-Planning</div>
        <div class="table-muted">Chaque logement est synchronise avec son lien iCal dedie.</div>
      </div>
      <div class="planning-actions">
        <button class="btn primary" data-action="sync-planning-all"><i class="ti ti-refresh"></i>Tout synchroniser</button>
      </div>
      <div class="planning-list">
        ${state.suites.map(suite => `
          <div class="planning-row">
            <div>
              <div class="table-title">${esc(suite.name)}</div>
              <div class="table-muted">${esc(planningUrls[suite.id] || "Lien manquant")}</div>
            </div>
            <button class="btn small" data-action="sync-planning" data-id="${suite.id}" ${planningUrls[suite.id] ? "" : "disabled"}>
              <i class="ti ti-refresh"></i>Sync
            </button>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function reservationTable(items) {
  if (!items.length) return empty("Aucune reservation trouvee.");
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Client</th><th>Logement</th><th>Dates</th><th>Canal</th><th>Total</th><th>Solde</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>
          ${items.map(r => `
            <tr>
              <td><div class="table-title">${esc(r.guest)}</div><div class="table-muted">${esc(shortText(r.requests, 120))}</div></td>
              <td>${esc(suiteName(r.suiteId))}</td>
              <td>${fmtDate(r.arrival)} -> ${fmtDate(r.departure)}<div class="table-muted">${r.guests} pers.</div></td>
              <td>${esc(r.channel)}</td>
              <td>${formatMoney(r.total)}</td>
              <td>${formatMoney(r.balance)}</td>
              <td><span class="badge ${computedReservationStatus(r)}">${reservationStatus(computedReservationStatus(r))}</span></td>
              <td>
                <button class="btn small" data-action="edit-reservation" data-id="${r.id}"><i class="ti ti-edit"></i></button>
                <button class="btn small danger" data-action="delete-reservation" data-id="${r.id}"><i class="ti ti-trash"></i></button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}


function renderPayments() {
  const rows = paymentRows();
  const totals = rows.reduce((acc, item) => {
    acc.expected += item.total;
    acc.received += item.paid;
    acc.due += item.balance;
    if (item.status === "paid") acc.paidCount += 1;
    if (item.status === "deposit") acc.depositCount += 1;
    if (item.status === "due" || item.status === "overdue") acc.dueCount += 1;
    return acc;
  }, { expected: 0, received: 0, due: 0, paidCount: 0, depositCount: 0, dueCount: 0 });

  document.getElementById("view-payments").innerHTML = `
    <div class="stats" style="margin-top:0;">
      ${statCard("Encaisse", formatMoney(totals.received), `${pct(totals.received, totals.expected).replace("%", "")} % du CA sejours`)}
      ${statCard("Reste a payer", formatMoney(totals.due), `${totals.dueCount} reservation${totals.dueCount > 1 ? "s" : ""}`)}
      ${statCard("Sejours soldes", totals.paidCount, "Paiement complet")}
      ${statCard("Acomptes", totals.depositCount, "Paiement partiel")}
    </div>

    <div class="panel payment-overview">
      <div class="panel-head">
        <div>
          <div class="section-title">Suivi paiements</div>
          <div class="section-copy">Vue claire des encaissements, soldes restants et actions rapides par reservation.</div>
        </div>
        <button class="btn gold" data-action="new-reservation"><i class="ti ti-calendar-plus"></i>Nouvelle reservation</button>
      </div>
      <div class="panel-body">
        <div class="payment-strip">
          <div>
            <span>CA attendu</span>
            <b>${formatMoney(totals.expected)}</b>
          </div>
          <div>
            <span>Deja encaisse</span>
            <b>${formatMoney(totals.received)}</b>
          </div>
          <div>
            <span>A encaisser</span>
            <b>${formatMoney(totals.due)}</b>
          </div>
        </div>
        ${paymentTable(rows)}
      </div>
    </div>
  `;
}

function paymentRows() {
  return state.reservations.map(reservation => {
    const total = Math.max(Number(reservation.total) || 0, 0);
    const balance = Math.min(paymentBalance(reservation), total || paymentBalance(reservation));
    const paid = Math.max(total - balance, 0);
    return {
      ...reservation,
      total,
      balance,
      paid,
      status: paymentStatus(reservation, total, balance, paid)
    };
  }).sort((a, b) => b.balance - a.balance || String(a.arrival || "").localeCompare(String(b.arrival || "")));
}

function paymentTable(items) {
  if (!items.length) return empty("Aucune reservation a suivre pour le moment.");
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Client</th><th>Sejour</th><th>Total</th><th>Encaisse</th><th>Solde</th><th>Paiement</th><th>Actions</th></tr></thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td><div class="table-title">${esc(item.guest)}</div><div class="table-muted">${esc(item.channel || "Direct")}</div></td>
              <td>${esc(suiteName(item.suiteId))}<div class="table-muted">${fmtDate(item.arrival)} -> ${fmtDate(item.departure)}</div></td>
              <td>${formatMoney(item.total)}</td>
              <td>${formatMoney(item.paid)}</td>
              <td><strong class="payment-due">${formatMoney(item.balance)}</strong></td>
              <td><span class="badge ${item.status}">${paymentStatusLabel(item.status)}</span></td>
              <td>
                <div class="payment-actions">
                  <button class="btn small primary" data-action="mark-payment-paid" data-id="${item.id}"><i class="ti ti-check"></i>Solder</button>
                  <button class="btn small" data-action="mark-payment-deposit" data-id="${item.id}"><i class="ti ti-receipt"></i>Acompte 30%</button>
                  <button class="btn small danger" data-action="mark-payment-unpaid" data-id="${item.id}"><i class="ti ti-alert-circle"></i>Impaye</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function paymentBalance(reservation) {
  return Math.max(Number(reservation.balance) || 0, 0);
}

function paymentStatus(reservation, total, balance, paid) {
  if (!total && !balance) return "unknown";
  if (balance <= 0) return "paid";
  if (paid > 0) return "deposit";
  const departure = parseDate(reservation.departure);
  if (departure && departure < new Date()) return "overdue";
  return "due";
}

function paymentStatusLabel(value) {
  return { paid: "Solde", deposit: "Acompte", due: "A encaisser", overdue: "En retard", unknown: "A renseigner" }[value] || value;
}

function renderBreakfasts() {
  document.getElementById("view-breakfasts").innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div>
          <div class="section-title">Petits-dejeuners</div>
          <div class="section-copy">Liste de production pour la cuisine et le service.</div>
        </div>
        <button class="btn gold" data-action="new-breakfast"><i class="ti ti-plus"></i>Ajouter</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Logement</th><th>Date</th><th>Heure</th><th>Pers.</th><th>Commande</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            ${state.breakfasts.map(b => `
              <tr>
                <td>${esc(suiteName(b.suiteId))}</td>
                <td>${fmtDate(b.date)}</td>
                <td>${esc(b.time)}</td>
                <td>${b.people}</td>
                <td>${esc(b.order)}</td>
                <td><span class="badge ${b.status}">${breakfastStatus(b.status)}</span></td>
                <td>
                  <button class="btn small" data-action="edit-breakfast" data-id="${b.id}"><i class="ti ti-edit"></i></button>
                  <button class="btn small danger" data-action="delete-breakfast" data-id="${b.id}"><i class="ti ti-trash"></i></button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderTasks() {
  const filtered = state.tasks.filter(t => {
    const query = filters.taskQuery.toLowerCase();
    return (filters.taskStatus === "all" || t.status === filters.taskStatus)
      && (!query || t.title.toLowerCase().includes(query) || t.owner.toLowerCase().includes(query) || suiteName(t.suiteId).toLowerCase().includes(query));
  });

  document.getElementById("view-tasks").innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div>
          <div class="section-title">Operations</div>
          <div class="section-copy">Menage, maintenance, arrivees, demandes concierge.</div>
        </div>
        <button class="btn gold" data-action="new-task"><i class="ti ti-plus"></i>Ajouter</button>
      </div>
      <div class="panel-body">
        <div class="table-tools">
          <div class="filters">
            ${filterSelect("Statut", "taskStatus", filters.taskStatus, [["all","Toutes"],["open","Ouvert"],["planned","Planifie"],["done","Termine"]])}
            ${filterText("Recherche", "taskQuery", filters.taskQuery)}
          </div>
        </div>
        <div class="timeline">
          ${filtered.map(taskTimelineFull).join("") || empty("Aucune tache trouvee.")}
        </div>
      </div>
    </div>
  `;
}

function renderServices() {
  document.getElementById("view-services").innerHTML = `
    <div class="section-head" style="margin-top:0;">
      <div>
        <div class="section-title">Catalogue services</div>
        <div class="section-copy">Prestations visibles dans le portail invite.</div>
      </div>
      <button class="btn gold" data-action="new-service"><i class="ti ti-plus"></i>Nouveau service</button>
    </div>
    <div class="service-grid">
      ${state.services.map(s => `
        <article class="service-card">
          <div class="service-top">
            <div class="service-identity">
              <div class="service-icon"><i class="ti ${esc(s.icon)}"></i></div>
              <div>
                <div class="service-title">${esc(s.title)}</div>
                <div class="service-meta">${esc(s.category)} - ${esc(s.price)}</div>
              </div>
            </div>
            <span class="badge ${s.active ? "ready" : "low"}">${s.active ? "Actif" : "Masque"}</span>
          </div>
          <div class="service-text">${esc(s.text)}</div>
          <div style="display:flex;gap:8px;">
            <button class="btn small" data-action="edit-service" data-id="${s.id}"><i class="ti ti-edit"></i>Modifier</button>
            <button class="btn small danger" data-action="delete-service" data-id="${s.id}"><i class="ti ti-trash"></i>Supprimer</button>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}


function renderEvents() {
  const events = [...(state.events || [])].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.time || "").localeCompare(String(b.time || "")));
  document.getElementById("view-events").innerHTML = `
    <div class="section-head" style="margin-top:0;">
      <div>
        <div class="section-title">Evenements clients</div>
        <div class="section-copy">Cree des sorties, soirees ou ateliers avec inscription client et suivi des presences.</div>
      </div>
      <button class="btn gold" data-action="new-event"><i class="ti ti-calendar-plus"></i>Nouvel evenement</button>
    </div>
    <div class="event-grid">
      ${events.map(eventCard).join("") || empty("Aucun evenement pour le moment.")}
    </div>
  `;
}

function eventCard(event) {
  const hasRegistration = eventRequiresRegistration(event);
  const registrations = eventRegistrations(event);
  const people = eventPeople(event);
  const capacity = Number(event.capacity) || 0;
  const placesLeft = eventPlacesLeft(event);
  return `
    <article class="panel event-card ${event.active ? "" : "is-muted"}">
      <div class="event-datebox">
        <span>${esc(eventMonth(event.date))}</span>
        <b>${esc(eventDay(event.date))}</b>
      </div>
      <div class="event-content">
        <div class="event-topline">
          <span class="badge ${event.active ? "ready" : "low"}">${event.active ? "Visible client" : "Masque"}</span>
          <span class="badge ${hasRegistration ? "confirmed" : "read"}">${hasRegistration ? "Avec inscription" : "Evenement normal"}</span>
          ${hasRegistration ? `<span class="badge ${event.registrationOpen === false ? "low" : "confirmed"}">${event.registrationOpen === false ? "Inscription fermee" : "Inscription ouverte"}</span>` : ""}
          <span class="table-muted">${esc(event.time || "Horaire libre")}</span>
        </div>
        <div class="event-title">${esc(event.title)}</div>
        <div class="event-meta"><i class="ti ti-map-pin"></i>${esc(event.location || "Lieu a preciser")}</div>
        <p>${esc(event.description || "")}</p>
        ${hasRegistration ? `
          <div class="event-presence">
            <div><b>${people}</b><span>personne${people > 1 ? "s" : ""} inscrite${people > 1 ? "s" : ""}</span></div>
            <div><b>${capacity || "-"}</b><span>capacite</span></div>
            <div><b>${capacity ? Math.max(placesLeft, 0) : "-"}</b><span>place${placesLeft > 1 ? "s" : ""} restante${placesLeft > 1 ? "s" : ""}</span></div>
          </div>
          <div class="registration-list">
            ${registrations.length ? registrations.map(registration => `
              <div class="registration-row">
                <span>${esc(registration.guest || "Client")} - ${esc(suiteName(registration.suiteId))}</span>
                <b>${Number(registration.people) || 1} pers.</b>
              </div>
            `).join("") : `<div class="registration-empty">Aucune inscription pour le moment.</div>`}
          </div>
        ` : `<div class="event-normal-note"><i class="ti ti-info-circle"></i>Evenement informatif : aucun suivi de presence.</div>`}
        <div class="event-actions">
          <button class="btn small" data-action="edit-event" data-id="${event.id}"><i class="ti ti-edit"></i>Modifier</button>
          <button class="btn small" data-action="toggle-event" data-id="${event.id}"><i class="ti ${event.active ? "ti-eye-off" : "ti-eye"}"></i>${event.active ? "Masquer" : "Afficher"}</button>
          <button class="btn small danger" data-action="delete-event" data-id="${event.id}"><i class="ti ti-trash"></i>Supprimer</button>
        </div>
      </div>
    </article>
  `;
}

function renderAgenda() {
  const items = [...(state.agenda || [])].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.time || "").localeCompare(String(b.time || "")));
  document.getElementById("view-agenda").innerHTML = `
    <div class="section-head" style="margin-top:0;">
      <div>
        <div class="section-title">Agenda ville</div>
        <div class="section-copy">Marches, activites et sorties autour de Sainte-Maxime a partager avec vos clients.</div>
      </div>
      <button class="btn gold" data-action="new-agenda"><i class="ti ti-calendar-plus"></i>Nouvelle activite</button>
    </div>
    <div class="event-grid">
      ${items.map(agendaCard).join("") || empty("Aucune activite pour le moment.")}
    </div>
  `;
}

function agendaCard(item) {
  return `
    <article class="panel event-card ${item.active ? "" : "is-muted"}">
      <div class="event-datebox">
        <span>${esc(eventMonth(item.date))}</span>
        <b>${esc(eventDay(item.date))}</b>
      </div>
      <div class="event-content">
        <div class="event-topline">
          <span class="badge ${item.active ? "ready" : "low"}">${item.active ? "Visible client" : "Masque"}</span>
          <span class="badge read">${esc(item.category || "Sortie locale")}</span>
          <span class="table-muted">${esc(item.time || "Horaire libre")}</span>
        </div>
        <div class="event-title">${esc(item.title)}</div>
        <div class="event-meta"><i class="ti ti-map-pin"></i>${esc(item.location || "Lieu a preciser")}</div>
        <p>${esc(item.description || "")}</p>
        <div class="event-actions">
          <button class="btn small" data-action="edit-agenda" data-id="${item.id}"><i class="ti ti-edit"></i>Modifier</button>
          <button class="btn small" data-action="toggle-agenda" data-id="${item.id}"><i class="ti ${item.active ? "ti-eye-off" : "ti-eye"}"></i>${item.active ? "Masquer" : "Afficher"}</button>
          <button class="btn small danger" data-action="delete-agenda" data-id="${item.id}"><i class="ti ti-trash"></i>Supprimer</button>
        </div>
      </div>
    </article>
  `;
}


function renderTemperatures() {
  const temperatures = state.temperatures || temperatureDefaults();
  document.getElementById("view-temperatures").innerHTML = `
    <div class="panel temperature-admin">
      <div class="panel-head">
        <div>
          <div class="section-title">Releve temperatures</div>
          <div class="section-copy">Mets a jour la piscine, l'air et la mer pour le matin, l'apres-midi et le soir.</div>
        </div>
        <button class="btn primary" data-action="save-temperatures"><i class="ti ti-device-floppy"></i>Enregistrer</button>
      </div>
      <div class="panel-body">
        <div class="temperature-table">
          <div></div><div>Matin</div><div>Apres-midi</div><div>Soir</div>
          ${temperatureRow("pool", "Piscine", temperatures.pool)}
          ${temperatureRow("air", "Air", temperatures.air)}
          ${temperatureRow("sea", "Mer", temperatures.sea)}
        </div>
        <div class="save-row">
          <span class="hint">Derniere mise a jour : ${esc(temperatures.updatedAt || "pas encore enregistree")}</span>
          <button class="btn primary" data-action="save-temperatures"><i class="ti ti-check"></i>Publier cote client</button>
        </div>
      </div>
    </div>
  `;
}

function temperatureRow(key, label, values = {}) {
  return `
    <div class="temperature-label"><i class="ti ${temperatureIcon(key)}"></i>${label}</div>
    ${field("", `temp-${key}-morning`, values.morning || "", "number")}
    ${field("", `temp-${key}-afternoon`, values.afternoon || "", "number")}
    ${field("", `temp-${key}-evening`, values.evening || "", "number")}
  `;
}

function renderMessages() {
  const unread = state.messages.filter(m => m.status === "unread").length;
  document.getElementById("view-messages").innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div>
          <div class="section-title">Messages voyageurs</div>
          <div class="section-copy">${unread} message${unread > 1 ? "s" : ""} a voir. Reponds aux clients et marque les demandes comme vues.</div>
        </div>
        <button class="btn gold" data-action="new-message"><i class="ti ti-send"></i>Nouveau message</button>
      </div>
      <div class="panel-body">
        <div class="timeline">
          ${state.messages.map(m => `
            <div class="timeline-item message-row ${m.direction === "outgoing" ? "outgoing" : "incoming"}">
              <div class="timeline-icon"><i class="ti ${m.direction === "outgoing" ? "ti-send" : "ti-message-circle"}"></i></div>
              <div class="timeline-card">
                <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
                  <div>
                    <div class="timeline-title">${esc(m.subject)} - ${esc(m.guest || "Client")}</div>
                    <div class="timeline-text">${esc(suiteName(m.suiteId))} - ${esc(m.body)}</div>
                    ${m.seenAt ? `<div class="table-muted" style="margin-top:7px;">Vu le ${esc(m.seenAt)}</div>` : ""}
                  </div>
                  <div style="display:flex;gap:8px;align-items:start;flex-wrap:wrap;justify-content:flex-end;">
                    <span class="badge ${m.status}">${messageStatus(m)}</span>
                    <span class="table-muted">${esc(m.time)}</span>
                    ${m.status === "unread" ? `<button class="btn small" data-action="mark-message-read" data-id="${m.id}"><i class="ti ti-eye-check"></i>Vu</button>` : ""}
                    <button class="btn small primary" data-action="reply-message" data-id="${m.id}"><i class="ti ti-corner-up-left"></i>Repondre</button>
                  </div>
                </div>
              </div>
            </div>
          `).join("") || empty("Aucun message pour le moment.")}
        </div>
      </div>
    </div>
  `;
}

function renderNotificationPanel() {
  const panel = document.getElementById("notificationPanel");
  if (!panel) return;
  const notifications = adminNotifications();
  const unread = unreadAdminNotifications();
  const permission = notificationPermissionLabel();

  panel.innerHTML = `
    <div class="notification-card">
      <div class="notification-head">
        <div>
          <div class="section-title">Notifications</div>
          <div class="section-copy">${unread.length} alerte${unread.length > 1 ? "s" : ""} a traiter - Navigateur : ${permission}</div>
        </div>
        <div class="notification-actions">
          <button class="btn small" data-action="enable-notifications"><i class="ti ti-bell-ringing"></i>Activer</button>
          <button class="btn small" data-action="clear-admin-notifications"><i class="ti ti-checks"></i>Tout vu</button>
        </div>
      </div>
      <div class="notification-list">
        ${notifications.length ? notifications.map(item => `
          <button class="notification-item ${item.read ? "" : "unread"}" data-action="open-notification" data-id="${escAttr(item.sourceId)}" data-target-view="${escAttr(item.view)}">
            <i class="ti ${item.icon}"></i>
            <span>
              <b>${esc(item.title)}</b>
              <small>${esc(item.text)}</small>
            </span>
          </button>
        `).join("") : `<div class="empty compact">Aucune notification pour le moment.</div>`}
      </div>
    </div>
  `;

  watchAdminNotifications();
}

function adminNotifications() {
  const readIds = notificationReadIds(ADMIN_NOTIFICATION_READ_KEY);
  const items = [];

  state.messages
    .filter(message => message.status === "unread")
    .forEach(message => items.push({
      id: `message-${message.id}`,
      sourceId: message.id,
      view: "messages",
      icon: "ti-message-circle",
      title: `Message - ${message.guest || "Client"}`,
      text: `${suiteName(message.suiteId)} - ${message.subject || "Nouvelle demande"}`
    }));

  state.breakfasts
    .filter(breakfast => breakfast.status === "new" || breakfast.status === "pending")
    .forEach(breakfast => items.push({
      id: `breakfast-${breakfast.id}`,
      sourceId: breakfast.id,
      view: "breakfasts",
      icon: "ti-coffee",
      title: "Petit-dejeuner",
      text: `${suiteName(breakfast.suiteId)} - ${fmtDate(breakfast.date)} ${breakfast.time || ""}`
    }));

  state.tasks
    .filter(task => task.status === "open" && task.priority === "high")
    .forEach(task => items.push({
      id: `task-${task.id}`,
      sourceId: task.id,
      view: "tasks",
      icon: "ti-alert-triangle",
      title: "Operation prioritaire",
      text: `${suiteName(task.suiteId)} - ${task.title}`
    }));

  state.events
    .flatMap(event => (event.registrations || []).map(registration => ({ event, registration })))
    .forEach(({ event, registration }) => items.push({
      id: `event-${event.id}-${registration.id}`,
      sourceId: event.id,
      view: "events",
      icon: "ti-calendar-star",
      title: "Inscription evenement",
      text: `${suiteName(registration.suiteId)} - ${event.title} (${registration.people || 1} pers.)`
    }));

  return items.map(item => ({ ...item, read: readIds.has(item.id) }));
}

function unreadAdminNotifications() {
  return adminNotifications().filter(item => !item.read);
}

function toggleNotifications() {
  document.getElementById("notificationPanel")?.classList.toggle("open");
}

async function enableBrowserNotifications() {
  if (!("Notification" in window)) {
    toast("Ce navigateur ne gere pas les notifications.");
    return;
  }
  const result = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (result === "granted") {
    toast("Notifications activees. Abonnement en cours...");
    await subscribePush();
  } else {
    toast("Notifications non autorisees.");
  }
  renderNotificationPanel();
  renderSettings();
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
}

async function subscribePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    toast("Push non supporte sur ce navigateur.");
    return;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      pushSubscription = existing;
      await fetch("./api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(existing)
      });
      toast("Deja abonne aux notifications push.");
      renderSettings();
      return;
    }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    pushSubscription = sub;
    await fetch("./api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub)
    });
    toast("Notifications push activees sur cet appareil !");
    renderSettings();
  } catch (err) {
    console.warn("Push subscribe error:", err);
    toast("Impossible d'activer les notifications push.");
  }
}

async function unsubscribePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("./api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint })
      });
      await sub.unsubscribe();
      pushSubscription = null;
      toast("Notifications push desactivees.");
      renderSettings();
    } else {
      toast("Aucun abonnement actif.");
    }
  } catch (err) {
    toast("Erreur lors de la desinscription.");
  }
}

async function testPush() {
  try {
    const response = await fetch("./api/push/test", { method: "POST" });
    const data = await response.json();
    if (data.ok) {
      toast("Notification test envoyee !");
    } else {
      toast("Erreur : " + (data.error || "inconnue"));
    }
  } catch {
    toast("Impossible d'envoyer la notification test.");
  }
}

async function sendPushNotification(title, body, tag = "villa-romeo") {
  try {
    await fetch("./api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, tag })
    });
  } catch {
  }
}

function clearAdminNotifications() {
  const ids = adminNotifications().map(item => item.id);
  localStorage.setItem(ADMIN_NOTIFICATION_READ_KEY, JSON.stringify(ids));
  notificationSnapshot = "";
  render();
  toast("Notifications marquees comme vues.");
}

function openNotification(targetView, id) {
  document.getElementById("notificationPanel")?.classList.remove("open");
  if (targetView) showView(targetView);
  if (targetView === "messages" && id) markMessageRead(id, false);
}

function watchAdminNotifications() {
  const unread = unreadAdminNotifications();
  const current = unread.map(item => item.id).join("|");
  if (!notificationSnapshot) {
    notificationSnapshot = current;
    localStorage.setItem(ADMIN_NOTIFICATION_SNAPSHOT_KEY, current);
    return;
  }

  const previous = new Set(notificationSnapshot.split("|").filter(Boolean));
  const fresh = unread.filter(item => !previous.has(item.id));
  if (fresh.length) {
    notifyBrowser("Nouvelle notification admin", fresh[0].title, fresh[0].text);
  }

  notificationSnapshot = current;
  localStorage.setItem(ADMIN_NOTIFICATION_SNAPSHOT_KEY, current);
}

function notifyBrowser(title, body, tag = "villa-romeo-admin") {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  new Notification(title, {
    body,
    tag,
    icon: "/assets/icons/icon-192.png"
  });
}

function notificationReadIds(key) {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || "[]"));
  } catch {
    return new Set();
  }
}

function notificationPermissionLabel() {
  if (!("Notification" in window)) return "indisponible";
  return {
    granted: "active",
    denied: "bloque",
    default: "a activer"
  }[Notification.permission] || Notification.permission;
}

function renderQr() {
  document.getElementById("view-qr").innerHTML = `
    <div class="section-head" style="margin-top:0;">
      <div>
        <div class="section-title">QR Codes invites</div>
        <div class="section-copy">Chaque QR renvoie vers le guide digital du logement via ${esc(clientBaseUrl())}, accessible depuis ton telephone sur le meme Wi-Fi.</div>
      </div>
    </div>
    <div class="qr-grid">
      ${state.suites.map(s => `
        <article class="panel qr-card">
          <div class="suite-name">${esc(s.name)}</div>
          <div class="suite-desc">${esc(clientUrl(s))}</div>
          <a href="${escAttr(clientUrl(s))}" target="_blank" rel="noopener" aria-label="Ouvrir le portail client ${escAttr(s.name)}">
            <img class="qr-box" src="${escAttr(qrImageUrl(clientUrl(s), 220))}" alt="QR code ${escAttr(s.name)}">
          </a>
          <div style="display:flex;gap:8px;">
            <button class="btn small primary" data-action="print-qr" data-id="${s.id}"><i class="ti ti-printer"></i>Imprimer</button>
            <button class="btn small" data-suite="${s.id}"><i class="ti ti-edit"></i>Editer</button>
            <a class="btn small" href="${escAttr(clientUrl(s))}" target="_blank" rel="noopener"><i class="ti ti-external-link"></i>Ouvrir</a>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderSettings() {
  const s = state.settings;
  document.getElementById("view-settings").innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div>
          <div class="section-title">Parametres essentiels</div>
          <div class="section-copy">Le reste se personnalise directement dans chaque logement.</div>
        </div>
        <button class="btn primary" data-action="save-settings"><i class="ti ti-device-floppy"></i>Enregistrer</button>
      </div>
      <div class="panel-body">
        <div class="form-grid compact-settings">
          ${field("Nom de la villa", "setting-propertyName", s.propertyName)}
          ${field("Signature", "setting-descriptor", s.descriptor)}
          ${field("Responsable", "setting-adminName", s.adminName)}
          ${field("Telephone", "setting-phone", s.phone)}
          ${field("Email", "setting-email", s.email, "email")}
          ${field("Adresse", "setting-address", s.address)}
          ${field("URL publique", "setting-publicBaseUrl", s.publicBaseUrl)}
          ${field("Devise", "setting-currency", s.currency)}
          ${field("Langues", "setting-language", s.language)}
          ${select("Choix logement cote client", "setting-guestShowSuitePicker", s.guestShowSuitePicker, [["yes", "Afficher"], ["no", "Masquer"]])}
          ${field("Couleur sombre", "setting-primaryColor", s.primaryColor, "color")}
          ${field("Accent luxe", "setting-accentColor", s.accentColor, "color")}
          ${area("Message general", "setting-welcomeNote", s.welcomeNote)}
          ${field("Signature client", "setting-signature", s.signature)}
        </div>
        <div class="save-row">
          <span class="hint">Identite globale uniquement. Les codes, textes clients, acces et notes sont dans l'onglet Logements.</span>
          <button class="btn primary" data-action="save-settings"><i class="ti ti-check"></i>Valider</button>
        </div>
      </div>
    </div>
    <div class="panel" style="margin-top:18px;">
      <div class="panel-head">
        <div>
          <div class="section-title">Notifications push</div>
          <div class="section-copy">Recois des vraies notifications sur ton telephone meme quand l'app est fermee.</div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn primary" data-action="enable-notifications"><i class="ti ti-bell-ringing"></i>Activer</button>
          <button class="btn" data-action="test-push"><i class="ti ti-send"></i>Tester</button>
          <button class="btn danger" data-action="unsubscribe-push"><i class="ti ti-bell-off"></i>Desactiver</button>
        </div>
      </div>
      <div class="panel-body">
        <div class="info-list" style="display:flex;flex-direction:column;gap:8px;">
          <div style="font-size:13px;color:var(--muted);">
            <b>Statut :</b> ${pushStatusLabel()}
          </div>
          <div style="font-size:13px;color:var(--muted);">
            1. Clique sur <b>Activer</b> et autorise les notifications.<br>
            2. Clique sur <b>Tester</b> pour recevoir une notif de test.<br>
            3. Les notifications arrivent automatiquement pour les nouveaux messages et petits-dejeuners.
          </div>
        </div>
      </div>
    </div>
    <div class="panel" style="margin-top:18px;">
      <div class="panel-head">
        <div>
          <div class="section-title">Session admin</div>
          <div class="section-copy">Fermer l'acces administration sur cet appareil.</div>
        </div>
        <button class="btn danger" data-action="logout-admin"><i class="ti ti-logout"></i>Se deconnecter</button>
      </div>
    </div>
  `;
}

function pushStatusLabel() {
  if (!("Notification" in window)) return "Non supporte sur ce navigateur.";
  if (Notification.permission === "denied") return "<span style=\"color:var(--red)\">Bloque par le navigateur. Autorise dans les reglages.</span>";
  if (Notification.permission === "granted" && pushSubscription) return "<span style=\"color:var(--green)\">Actif — cet appareil recoit les notifications.</span>";
  if (Notification.permission === "granted") return "<span style=\"color:var(--gold)\">Permission accordee, en cours d'abonnement...</span>";
  return "Non active. Clique sur Activer.";
}

function suiteCard(s) {
  return `
    <article class="suite-card">
      <div class="suite-cover" style="${heroStyle(s)}" data-suite="${s.id}">
        <span class="badge ${s.status}">${suiteStatus(s.status)}</span>
        <div class="suite-initial">${initial(s.name)}</div>
      </div>
      <div class="suite-body" data-suite="${s.id}">
        <div class="suite-name">${esc(s.name)}</div>
        <div class="suite-desc">${esc(s.category)} - ${esc(s.view)}</div>
        <div class="meta">
          <span><i class="ti ti-ruler"></i>${esc(s.surface)}</span>
          <span><i class="ti ti-users"></i>${s.guests} pers.</span>
          <span><i class="ti ti-cash"></i>${formatMoney(s.nightlyRate)}</span>
          <span><i class="ti ti-spray"></i>${housekeepingLabel(s.housekeeping)}</span>
        </div>
      </div>
      <div class="suite-actions">
        <button class="btn small primary" data-suite="${s.id}"><i class="ti ti-edit"></i>Ouvrir</button>
        <button class="btn small" data-action="copy-wifi" data-id="${s.id}"><i class="ti ti-wifi"></i>Wi-Fi</button>
        <button class="btn small danger" data-action="delete-suite" data-id="${s.id}" aria-label="Supprimer"><i class="ti ti-trash"></i></button>
      </div>
    </article>
  `;
}

function heroMetric(value, label) {
  return `<div class="hero-metric"><b>${value}</b><span>${label}</span></div>`;
}

function statCard(label, value, note) {
  return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></div>`;
}

function suiteAnalyticsCard(item) {
  return `
    <article class="panel analytics-card">
      <div class="analytics-card-head">
        <div>
          <div class="suite-name">${esc(item.name)}</div>
          <div class="suite-desc">${esc(item.category)} - ${esc(item.view)}</div>
        </div>
        <span class="badge ${item.status}">${suiteStatus(item.status)}</span>
      </div>
      <div class="analytics-kpis">
        ${miniKpi(formatMoney(item.revenue), "CA")}
        ${miniKpi(item.reservations, "Sejours")}
        ${miniKpi(item.nights, "Nuits")}
        ${miniKpi(`${item.occupancy}%`, "Occupation")}
      </div>
      <div class="analytics-list">
        ${analyticsLine("Petit-dejeuner", item.breakfasts, "demandes")}
        ${analyticsLine("Operations", item.tasks, "taches")}
        ${analyticsLine("Messages", item.messages, "echanges")}
        ${analyticsLine("Prix moyen", formatMoney(item.averageNight), "nuit vendue")}
      </div>
    </article>
  `;
}

function miniKpi(value, label) {
  return `<div class="mini-kpi"><b>${value}</b><span>${label}</span></div>`;
}

function analyticsLine(label, value, note) {
  return `
    <div class="analytics-line">
      <span>${esc(label)}</span>
      <b>${esc(value)}</b>
      <em>${esc(note)}</em>
    </div>
  `;
}

function lineChart(values, labels) {
  const width = 720;
  const height = 220;
  const pad = 26;
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = pad + (index * (width - pad * 2)) / Math.max(values.length - 1, 1);
    const y = height - pad - (Number(value || 0) / max) * (height - pad * 2);
    return { x, y, value };
  });
  const path = points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const area = `${path} L ${width - pad} ${height - pad} L ${pad} ${height - pad} Z`;

  return `
    <div class="chart-wrap">
      <svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Courbe de revenus annuels">
        <path class="chart-grid" d="M ${pad} ${height - pad} H ${width - pad} M ${pad} ${height * .66} H ${width - pad} M ${pad} ${height * .38} H ${width - pad}"></path>
        <path class="chart-area" d="${area}"></path>
        <path class="chart-line" d="${path}"></path>
        ${points.map(point => `<circle class="chart-dot" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4"><title>${formatMoney(point.value)}</title></circle>`).join("")}
        ${points.map((point, index) => `<text class="chart-label" x="${point.x.toFixed(1)}" y="${height - 6}" text-anchor="middle">${esc(labels[index])}</text>`).join("")}
      </svg>
      <div class="chart-summary">
        ${values.map((value, index) => `<span><b>${esc(labels[index])}</b>${formatMoney(value)}</span>`).join("")}
      </div>
    </div>
  `;
}

function taskTimeline(task) {
  return `
    <div class="timeline-item">
      <div class="timeline-icon"><i class="ti ${taskIcon(task.type)}"></i></div>
      <div class="timeline-card">
        <div style="display:flex;justify-content:space-between;gap:10px;">
          <div>
            <div class="timeline-title">${esc(task.title)}</div>
            <div class="timeline-text">${esc(suiteName(task.suiteId))} - ${esc(task.owner)} - ${esc(task.due)}</div>
          </div>
          <span class="badge ${task.priority}">${taskPriority(task.priority)}</span>
        </div>
      </div>
    </div>
  `;
}

function taskTimelineFull(task) {
  return `
    <div class="timeline-item">
      <div class="timeline-icon"><i class="ti ${taskIcon(task.type)}"></i></div>
      <div class="timeline-card">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
          <div>
            <div class="timeline-title">${esc(task.title)}</div>
            <div class="timeline-text">${esc(suiteName(task.suiteId))} - ${esc(task.owner)} - ${esc(task.due)}</div>
            <div style="display:flex;gap:7px;margin-top:9px;">
              <span class="badge ${task.status}">${taskStatus(task.status)}</span>
              <span class="badge ${task.priority}">${taskPriority(task.priority)}</span>
            </div>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn small primary" data-action="complete-task" data-id="${task.id}"><i class="ti ti-check"></i></button>
            <button class="btn small" data-action="edit-task" data-id="${task.id}"><i class="ti ti-edit"></i></button>
            <button class="btn small danger" data-action="delete-task" data-id="${task.id}"><i class="ti ti-trash"></i></button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function tabButton(key, label) {
  return `<button class="tab ${activeTab === key ? "active" : ""}" data-tab="${key}">${label}</button>`;
}

function saveRow(type) {
  return `
    <div class="save-row">
      <span class="hint">Modifie librement, puis enregistre cette section.</span>
      <button class="btn primary" data-action="save-suite-tab" data-type="${type}">
        <i class="ti ti-device-floppy"></i> Enregistrer
      </button>
    </div>
  `;
}

function preview(icon, title, text) {
  return `<div class="preview-item"><i class="ti ${icon}"></i><div><b>${esc(title)}</b><br>${esc(text)}</div></div>`;
}

function field(label, id, value = "", type = "text") {
  return `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${escAttr(value)}"></div>`;
}

function area(label, id, value = "") {
  return `<div class="field full"><label for="${id}">${label}</label><textarea id="${id}">${esc(value)}</textarea></div>`;
}

function select(label, id, value, options) {
  return `
    <div class="field">
      <label for="${id}">${label}</label>
      <select id="${id}">${options.map(([v, l]) => `<option value="${escAttr(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
    </div>
  `;
}

function filterSelect(label, key, value, options) {
  return `
    <div class="filter">
      <label>${label}</label>
      <select data-filter="${key}">
        ${options.map(([v, l]) => `<option value="${escAttr(v)}" ${v === value ? "selected" : ""}>${esc(l)}</option>`).join("")}
      </select>
    </div>
  `;
}

function filterText(label, key, value) {
  return `<div class="filter"><label>${label}</label><input data-filter-text="${key}" value="${escAttr(value)}" placeholder="Rechercher"></div>`;
}

function showView(next) {
  view = next;
  document.querySelectorAll(".view").forEach(el => el.classList.remove("active"));
  document.getElementById(`view-${view}`).classList.add("active");
  setSidebarOpen(false);
  render();
}

function setSidebarOpen(isOpen) {
  document.getElementById("sidebar")?.classList.toggle("open", isOpen);
  document.body.classList.toggle("sidebar-open", isOpen);
}

function openSuite(id) {
  activeSuiteId = id;
  view = "suite";
  activeTab = "overview";
  showView("suite");
}

function showTab(tab) {
  activeTab = tab;
  renderSuiteDetail();
}

function saveSuiteTab(type) {
  const s = currentSuite();
  if (!s) return;
  const fields = {
    overview: ["name", "category", "status", "nightlyRate", "surface", "guests", "floor", "view", "color", "photo"],
    villa: ["publicName", "villaType", "ambience", "preferredLanguage", "guestPhone", "breakfastIncluded", "arrivalInstructions", "guestIntro"],
    access: ["wifi", "wifiPass", "doorCode", "parking", "checkin", "checkout", "rules", "qrUrl"],
    guest: ["welcome", "minibar"],
    internal: ["currentGuest", "arrival", "departure", "nextCheckout", "housekeeping", "internalNotes"]
  }[type] || [];

  fields.forEach(key => {
    const input = document.getElementById(`suite-${key}`);
    if (!input) return;
    s[key] = ["nightlyRate", "guests"].includes(key) ? Number(input.value) || 0 : input.value;
  });
  persist("Logement mis a jour.");
}

function updateLive(el) {
  const [collection, id, key] = el.dataset.live.split(":");
  const item = state[collection]?.find(entry => String(entry.id) === id);
  if (!item) return;
  item[key] = el.type === "number" ? Number(el.value) : el.value;
  persist("Mise a jour enregistree.");
}

function updateFilter(el) {
  const key = el.dataset.filter || el.dataset.filterText;
  filters[key] = el.value;
  render();
}

function persist(message) {
  saveState(state);
  render();
  if (message) toast(message);
}

function openModal(type, id = null) {
  modalMode = type;
  modalEntityId = id;
  const modal = document.getElementById("modal");
  modal.classList.add("active");
  modal.innerHTML = modalTemplate(type, id);
}

function closeModal() {
  document.getElementById("modal").classList.remove("active");
  document.getElementById("modal").innerHTML = "";
  modalMode = null;
  modalEntityId = null;
}

function modalTemplate(type, id) {
  const titles = {
    suite: id ? "Modifier logement" : "Nouveau logement",
    reservation: id ? "Modifier reservation" : "Nouvelle reservation",
    breakfast: id ? "Modifier petit-dejeuner" : "Nouvelle demande",
    task: id ? "Modifier operation" : "Nouvelle operation",
    event: id ? "Modifier evenement" : "Nouvel evenement",
    agenda: id ? "Modifier activite" : "Nouvelle activite ville",
    service: id ? "Modifier service" : "Nouveau service",
    message: id ? "Repondre au client" : "Nouveau message client"
  };
  return `
    <div class="modal-card">
      <div class="modal-head">
        <div class="modal-title">${titles[type]}</div>
        <button class="btn icon" data-action="close-modal" aria-label="Fermer"><i class="ti ti-x"></i></button>
      </div>
      <div class="modal-body">
        ${modalBody(type, id)}
      </div>
    </div>
  `;
}

function modalBody(type, id) {
  if (type === "suite") {
    const item = id ? state.suites.find(s => s.id === id) : suiteDefaults();
    return `
      <div class="form-grid">
        ${field("Nom", "modal-name", item.name)}
        ${field("Categorie", "modal-category", item.category)}
        ${select("Statut", "modal-status", item.status, statusOptions())}
        ${field("Tarif nuit", "modal-nightlyRate", item.nightlyRate, "number")}
        ${field("Surface", "modal-surface", item.surface)}
        ${field("Capacite", "modal-guests", item.guests, "number")}
        ${field("Vue", "modal-view", item.view)}
        ${field("Couleur", "modal-color", item.color, "color")}
      </div>
      <div class="save-row"><span class="hint">Tous les details seront modifiables ensuite.</span><button class="btn primary" data-action="save-suite">Valider</button></div>
    `;
  }

  if (type === "reservation") {
    const item = id ? state.reservations.find(r => r.id === id) : reservationDefaults();
    return `
      <div class="form-grid">
        ${field("Client", "modal-guest", item.guest)}
        ${suiteSelect("Logement", "modal-suiteId", item.suiteId)}
        ${select("Statut", "modal-status", item.status, reservationOptions())}
        ${field("Canal", "modal-channel", item.channel)}
        ${field("Arrivee", "modal-arrival", item.arrival, "date")}
        ${field("Depart", "modal-departure", item.departure, "date")}
        ${field("Personnes", "modal-guests", item.guests, "number")}
        ${field("Total", "modal-total", item.total, "number")}
        ${field("Solde", "modal-balance", item.balance, "number")}
        ${area("Demandes", "modal-requests", item.requests)}
      </div>
      <div class="save-row"><span class="hint">Reservation stockee localement.</span><button class="btn primary" data-action="save-reservation">Valider</button></div>
    `;
  }

  if (type === "breakfast") {
    const item = id ? state.breakfasts.find(b => b.id === id) : breakfastDefaults();
    return `
      <div class="form-grid">
        ${suiteSelect("Logement", "modal-suiteId", item.suiteId)}
        ${field("Date", "modal-date", item.date, "date")}
        ${field("Heure", "modal-time", item.time, "time")}
        ${field("Personnes", "modal-people", item.people, "number")}
        ${select("Statut", "modal-status", item.status, breakfastOptions())}
        ${area("Commande", "modal-order", item.order)}
      </div>
      <div class="save-row"><span class="hint">Demande cuisine et room service.</span><button class="btn primary" data-action="save-breakfast">Valider</button></div>
    `;
  }

  if (type === "task") {
    const item = id ? state.tasks.find(t => t.id === id) : taskDefaults();
    return `
      <div class="form-grid">
        ${field("Titre", "modal-title", item.title)}
        ${suiteSelect("Logement", "modal-suiteId", item.suiteId)}
        ${select("Type", "modal-type", item.type, [["housekeeping","Menage"],["maintenance","Maintenance"],["concierge","Conciergerie"],["arrival","Arrivee"]])}
        ${select("Priorite", "modal-priority", item.priority, [["high","Haute"],["medium","Moyenne"],["low","Basse"]])}
        ${select("Statut", "modal-status", item.status, [["open","Ouvert"],["planned","Planifie"],["done","Termine"]])}
        ${field("Responsable", "modal-owner", item.owner)}
        ${field("Echeance", "modal-due", item.due)}
      </div>
      <div class="save-row"><span class="hint">Operation visible dans les priorites.</span><button class="btn primary" data-action="save-task">Valider</button></div>
    `;
  }


  if (type === "event") {
    const item = id ? state.events.find(event => event.id === id) : eventDefaults();
    return `
      <div class="form-grid">
        ${field("Titre", "modal-title", item.title)}
        ${field("Categorie", "modal-category", item.category)}
        ${select("Type d'evenement", "modal-requiresRegistration", String(eventRequiresRegistration(item)), [["false", "Evenement normal"], ["true", "Evenement a inscription"]])}
        ${field("Date", "modal-date", item.date, "date")}
        ${field("Heure", "modal-time", item.time, "time")}
        ${field("Lieu", "modal-location", item.location)}
        ${field("Capacite max si inscription", "modal-capacity", item.capacity || "", "number")}
        ${select("Visible cote client", "modal-active", String(item.active), [["true", "Oui"], ["false", "Non"]])}
        ${select("Inscription ouverte si besoin", "modal-registrationOpen", String(item.registrationOpen !== false), [["true", "Oui"], ["false", "Non"]])}
        ${area("Description", "modal-description", item.description)}
      </div>
      <div class="save-row"><span class="hint">Choisis "normal" pour une simple annonce, ou "a inscription" pour afficher le bouton de reservation client.</span><button class="btn primary" data-action="save-event">Valider</button></div>
    `;
  if (type === "agenda") {
    const item = id ? (state.agenda || []).find(a => a.id === id) : agendaDefaults();
    return `
      <div class="form-grid">
        ${field("Titre", "modal-title", item.title)}
        ${field("Categorie", "modal-category", item.category)}
        ${field("Date", "modal-date", item.date, "date")}
        ${field("Heure", "modal-time", item.time, "time")}
        ${field("Lieu", "modal-location", item.location)}
        ${select("Visible cote client", "modal-active", String(item.active), [["true", "Oui"], ["false", "Non"]])}
        ${area("Description", "modal-description", item.description)}
      </div>
      <div class="save-row"><span class="hint">Ces activites apparaissent dans l'agenda ville du portail client.</span><button class="btn primary" data-action="save-agenda">Valider</button></div>
    `;
  }
  if (type === "message") {
    const source = id ? state.messages.find(m => m.id === id) : null;
    const item = source ? messageReplyDefaults(source) : messageDefaults();
    return `
      <div class="form-grid">
        ${suiteSelect("Logement", "modal-suiteId", item.suiteId)}
        <input id="modal-reservationId" type="hidden" value="${escAttr(item.reservationId || "")}">
        ${field("Client", "modal-guest", item.guest)}
        ${field("Objet", "modal-subject", item.subject)}
        ${area("Message a envoyer", "modal-body", item.body)}
      </div>
      <div class="save-row"><span class="hint">Le message apparaitra dans le portail client du logement.</span><button class="btn primary" data-action="save-message"><i class="ti ti-send"></i>Envoyer</button></div>
    `;
  }

  if (type === "service") {
    const item = id ? state.services.find(s => s.id === id) : serviceDefaults();
    return `
      <div class="form-grid">
        ${field("Icone Tabler", "modal-icon", item.icon)}
        ${field("Titre", "modal-title", item.title)}
        ${field("Categorie", "modal-category", item.category)}
        ${field("Prix", "modal-price", item.price)}
        ${select("Statut", "modal-active", String(item.active), [["true","Actif"],["false","Masque"]])}
        ${area("Description", "modal-text", item.text)}
      </div>
      <div class="save-row"><span class="hint">Service visible dans le catalogue invite.</span><button class="btn primary" data-action="save-service">Valider</button></div>
    `;
  }

  return empty("Type inconnu.");
}

function saveSuiteFromModal() {
  const existingSuite = modalEntityId ? state.suites.find(s => s.id === modalEntityId) : null;
  const payload = {
    name: val("modal-name"),
    category: val("modal-category"),
    status: val("modal-status"),
    nightlyRate: Number(val("modal-nightlyRate")) || 0,
    surface: val("modal-surface"),
    guests: Number(val("modal-guests")) || 1,
    view: val("modal-view"),
    color: val("modal-color"),
    clientLogin: suiteClientLogin(existingSuite, val("modal-name"))
  };

  if (modalEntityId) {
    Object.assign(existingSuite, payload);
  } else {
    const suite = { ...suiteDefaults(), id: nextId(state.suites), ...payload };
    suite.qrUrl = `guest.html?suite=${suite.id}`;
    state.suites.push(suite);
    activeSuiteId = suite.id;
  }
  closeModal();
  persist("Logement enregistre.");
}

function suiteClientLogin(existingSuite, suiteName) {
  return {
    username: suiteName,
    password: existingSuite?.clientLogin?.password || `${compactLoginName(suiteName)}${randomDigits(5)}`
  };
}

function compactLoginName(value) {
  return String(value || "Logement").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "");
}

function randomDigits(length) {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join("");
}

function saveReservationFromModal() {
  const payload = {
    guest: val("modal-guest"),
    suiteId: Number(val("modal-suiteId")),
    status: val("modal-status"),
    channel: val("modal-channel"),
    arrival: val("modal-arrival"),
    departure: val("modal-departure"),
    guests: Number(val("modal-guests")) || 1,
    total: Number(val("modal-total")) || 0,
    balance: Number(val("modal-balance")) || 0,
    requests: val("modal-requests")
  };
  upsert("reservations", payload);
  closeModal();
  persist("Reservation enregistree.");
}

function saveBreakfastFromModal() {
  const payload = {
    suiteId: Number(val("modal-suiteId")),
    date: val("modal-date"),
    time: val("modal-time"),
    people: Number(val("modal-people")) || 1,
    order: val("modal-order"),
    status: val("modal-status")
  };
  upsert("breakfasts", payload);
  closeModal();
  persist("Petit-dejeuner enregistre.");
  if (!modalEntityId) {
    sendPushNotification(
      "La villa Romeo - Petit-dejeuner",
      `Nouvelle demande pour ${esc(suiteName(payload.suiteId))} le ${payload.date} a ${payload.time}`,
      "villa-romeo-breakfast"
    );
  }
}

function saveTaskFromModal() {
  const payload = {
    title: val("modal-title"),
    suiteId: Number(val("modal-suiteId")),
    type: val("modal-type"),
    priority: val("modal-priority"),
    status: val("modal-status"),
    owner: val("modal-owner"),
    due: val("modal-due")
  };
  upsert("tasks", payload);
  closeModal();
  persist("Operation enregistree.");
}


function saveEventFromModal() {
  const payload = {
    title: val("modal-title") || "Nouvel evenement",
    category: val("modal-category") || "Experience locale",
    date: val("modal-date"),
    time: val("modal-time"),
    location: val("modal-location"),
    description: val("modal-description"),
    requiresRegistration: val("modal-requiresRegistration") === "true",
    capacity: Number(val("modal-capacity")) || 0,
    registrationOpen: val("modal-registrationOpen") === "true",
    registrations: modalEntityId ? eventRegistrations(state.events.find(event => event.id === modalEntityId)) : [],
    active: val("modal-active") === "true"
  };
  upsert("events", payload);
  closeModal();
  persist("Evenement enregistre.");
}

function saveAgendaFromModal() {
  const payload = {
    title: val("modal-title") || "Nouvelle activite",
    category: val("modal-category") || "Sortie locale",
    date: val("modal-date"),
    time: val("modal-time"),
    location: val("modal-location"),
    description: val("modal-description"),
    active: val("modal-active") === "true"
  };
  if (!state.agenda) state.agenda = [];
  upsert("agenda", payload);
  closeModal();
  persist("Activite enregistree.");
}

function toggleAgenda(id) {
  if (!state.agenda) state.agenda = [];
  const item = state.agenda.find(a => a.id === id);
  if (!item) return;
  item.active = !item.active;
  persist(item.active ? "Activite visible cote client." : "Activite masquee cote client.");
}

function saveTemperatures() {
  state.temperatures = {
    pool: readTemperatureGroup("pool"),
    air: readTemperatureGroup("air"),
    sea: readTemperatureGroup("sea"),
    updatedAt: new Date().toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  };
  persist("Temperatures publiees cote client.");
}

function readTemperatureGroup(key) {
  return {
    morning: val(`temp-${key}-morning`),
    afternoon: val(`temp-${key}-afternoon`),
    evening: val(`temp-${key}-evening`)
  };
}

function toggleEvent(id) {
  const event = state.events.find(item => item.id === id);
  if (!event) return;
  event.active = !event.active;
  persist(event.active ? "Evenement visible cote client." : "Evenement masque cote client.");
}

function saveMessageFromModal() {
  const source = modalEntityId ? state.messages.find(m => m.id === modalEntityId) : null;
  const suiteId = Number(val("modal-suiteId"));
  const reservationId = Number(val("modal-reservationId")) || source?.reservationId || activeReservationForSuite(suiteId)?.id || null;
  const payload = {
    suiteId,
    reservationId,
    guest: val("modal-guest") || "Client",
    subject: val("modal-subject") || "Message concierge",
    body: val("modal-body"),
    status: "sent",
    direction: "outgoing",
    time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  };
  state.messages.unshift({ id: nextId(state.messages), ...payload });
  if (modalEntityId) {
    const original = state.messages.find(m => m.id === modalEntityId);
    if (original?.status === "unread") markMessageRead(modalEntityId, false);
  }
  closeModal();
  persist("Message envoye au portail client.");
  sendPushNotification(
    "La villa Romeo - Nouveau message",
    `${esc(payload.subject)} - ${esc(suiteName(payload.suiteId))}`,
    "villa-romeo-message"
  );
}

function saveServiceFromModal() {
  const payload = {
    icon: val("modal-icon"),
    title: val("modal-title"),
    category: val("modal-category"),
    price: val("modal-price"),
    active: val("modal-active") === "true",
    text: val("modal-text")
  };
  upsert("services", payload);
  closeModal();
  persist("Service enregistre.");
}

function upsert(collection, payload) {
  if (modalEntityId) {
    Object.assign(state[collection].find(item => item.id === modalEntityId), payload);
  } else {
    state[collection].push({ id: nextId(state[collection]), ...payload });
  }
}

function saveSettings() {
  const keys = [
    "propertyName", "descriptor", "adminName", "phone", "email", "address", "publicBaseUrl", "checkin", "checkout", "currency", "language",
    "primaryColor", "accentColor", "welcomeNote", "signature", "guestEyebrow", "guestHeroTitle", "guestHeroText",
    "guestBreakfastTitle", "guestBreakfastText", "guestCallTitle", "guestCallText", "guestMessageTitle", "guestMessageText",
    "guestWifiTitle", "guestWifiText", "guestInfoTitle", "guestInfoText", "guestContactTitle", "guestBreakfastDefaultOrder",
    "guestBreakfastOptions", "guestShowSuitePicker", "guestFooterText"
  ];
  keys.forEach(key => {
    const input = document.getElementById(`setting-${key}`);
    if (input) state.settings[key] = input.value;
  });
  document.documentElement.style.setProperty("--navy", state.settings.primaryColor);
  document.documentElement.style.setProperty("--gold", state.settings.accentColor);
  persist("Parametres enregistres.");
}


function markPaymentPaid(id) {
  const reservation = state.reservations.find(item => item.id === id);
  if (!reservation) return;
  reservation.balance = 0;
  persist("Reservation soldee.");
}

function markPaymentDeposit(id) {
  const reservation = state.reservations.find(item => item.id === id);
  if (!reservation) return;
  const total = Number(reservation.total) || 0;
  if (!total) {
    toast("Ajoute d'abord un total a la reservation.");
    return;
  }
  reservation.balance = Math.round(total * 0.7);
  persist("Acompte de 30% enregistre.");
}

function markPaymentUnpaid(id) {
  const reservation = state.reservations.find(item => item.id === id);
  if (!reservation) return;
  reservation.balance = Number(reservation.total) || reservation.balance || 0;
  persist("Reservation marquee comme impayee.");
}

function patchItem(collection, id, patch, message) {
  const item = state[collection].find(entry => entry.id === id);
  if (!item) return;
  Object.assign(item, patch);
  persist(message);
}

function markMessageRead(id, shouldPersist = true) {
  const item = state.messages.find(entry => entry.id === id);
  if (!item) return;
  item.status = "read";
  item.seenAt = new Date().toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  if (shouldPersist) persist("Message marque comme vu.");
}

function deleteItem(collection, id, message) {
  if (!confirm("Confirmer la suppression ?")) return;
  state[collection] = state[collection].filter(item => item.id !== id);
  persist(message);
}

function deleteSuite(id) {
  const suite = state.suites.find(s => s.id === id);
  if (!suite || !confirm(`Supprimer ${suite.name} ?`)) return;
  state.suites = state.suites.filter(s => s.id !== id);
  state.reservations = state.reservations.filter(r => r.suiteId !== id);
  state.breakfasts = state.breakfasts.filter(b => b.suiteId !== id);
  state.tasks = state.tasks.filter(t => t.suiteId !== id);
  state.messages = state.messages.filter(m => m.suiteId !== id);
  activeSuiteId = state.suites[0]?.id || null;
  view = "suites";
  showView("suites");
  persist("Logement supprime.");
}

async function syncPlanningCalendar(suiteId) {
  const id = Number(suiteId || state.settings.planningDefaultSuiteId || 2);
  const url = planningIcsUrls()[id];

  if (!url) {
    toast("Ajoute le lien Planning-Planning.");
    return;
  }

  try {
    toast("Synchronisation Planning-Planning...");
    const response = await fetch(`./api/ics?url=${encodeURIComponent(url)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Calendrier indisponible");

    const calendar = await response.text();
    const result = importIcsReservations(calendar, id, url);
    state.settings.planningDefaultSuiteId = id;
    saveState(state);
    render();

    if (!result.created && !result.updated) {
      toast("Aucune nouvelle reservation trouvee.");
      return;
    }

    toast(`${result.created} ajoutee(s), ${result.updated} mise(s) a jour.`);
  } catch (error) {
    console.warn(error);
    toast("Impossible de synchroniser Planning-Planning.");
  }
}

async function syncAllPlanningCalendars() {
  const entries = state.suites
    .map(suite => [Number(suite.id), planningIcsUrls()[suite.id]])
    .filter(([, url]) => Boolean(url));

  if (!entries.length) {
    toast("Aucun lien Planning-Planning configure.");
    return;
  }

  let created = 0;
  let updated = 0;
  let failed = 0;
  toast("Synchronisation de tous les logements...");

  for (const [suiteId, url] of entries) {
    try {
      const response = await fetch(`./api/ics?url=${encodeURIComponent(url)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Calendrier indisponible");
      const result = importIcsReservations(await response.text(), suiteId, url);
      created += result.created;
      updated += result.updated;
    } catch (error) {
      console.warn(error);
      failed += 1;
    }
  }

  saveState(state);
  render();
  toast(failed ? `${created} ajoutee(s), ${updated} mise(s) a jour, ${failed} echec(s).` : `${created} ajoutee(s), ${updated} mise(s) a jour.`);
}

function importIcsReservations(calendar, suiteId, sourceUrl) {
  const events = parseIcsEvents(calendar);
  let created = 0;
  let updated = 0;
  let skipped = 0;

  events.forEach(event => {
    const arrival = icsDateToInput(event.DTSTART);
    const departure = icsDateToInput(event.DTEND);
    if (!arrival || !departure || departure < today()) {
      skipped += 1;
      return;
    }

    const externalId = event.UID || `planning-${suiteId}-${arrival}-${departure}-${event.SUMMARY || ""}`;
    const existing = state.reservations.find(reservation => reservation.externalId === externalId)
      || state.reservations.find(reservation =>
        reservation.channel === "Planning-Planning"
        && Number(reservation.suiteId) === Number(suiteId)
        && reservation.arrival === arrival
        && reservation.departure === departure
      );

    const description = cleanIcsText([event.SUMMARY, event.DESCRIPTION, event.LOCATION].filter(Boolean).join(" - "));
    const isRawPlanning = !description || /^reserve( - reserve)?$/i.test(description);
    const guest = extractGuestName(event) || "Client Planning-Planning";
    const payload = {
      suiteId,
      guest,
      channel: "Planning-Planning",
      status: isRawPlanning ? "raw" : statusFromDates(arrival, departure),
      arrival,
      departure,
      guests: existing?.guests || 1,
      total: existing?.total || 0,
      balance: existing?.balance || 0,
      requests: isRawPlanning ? "Import Planning-Planning" : description,
      externalId,
      sourceUrl
    };

    if (existing) {
      Object.assign(existing, payload);
      updated += 1;
    } else {
      state.reservations.push({ id: nextId(state.reservations), ...payload });
      created += 1;
    }
  });

  return { created, updated, skipped };
}

function parseIcsEvents(calendar) {
  const unfolded = String(calendar || "").replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  const events = [];
  let current = null;

  lines.forEach(line => {
    if (line === "BEGIN:VEVENT") {
      current = {};
      return;
    }
    if (line === "END:VEVENT") {
      if (current) events.push(current);
      current = null;
      return;
    }
    if (!current) return;

    const separator = line.indexOf(":");
    if (separator === -1) return;
    const key = line.slice(0, separator).split(";")[0].toUpperCase();
    const value = line.slice(separator + 1);
    current[key] = decodeIcsValue(value);
  });

  return events;
}

function icsDateToInput(value) {
  if (!value) return "";
  const raw = String(value).trim();
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  if (/^\d{8}T/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function decodeIcsValue(value) {
  return String(value || "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function cleanIcsText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function extractGuestName(event) {
  const text = cleanIcsText([event.SUMMARY, event.DESCRIPTION].filter(Boolean).join(" "));
  if (!text || /reserve|reserved|indisponible|occup[eé]|busy|blocked/i.test(text)) return "";
  return text.split(/[-|,]/)[0].trim().slice(0, 80);
}

function statusFromDates(arrival, departure) {
  const todayValue = today();
  if (departure <= todayValue) return "checkout";
  if (arrival <= todayValue && departure > todayValue) return "inhouse";
  return "confirmed";
}

function copyWifi(id) {
  const s = state.suites.find(item => item.id === id);
  if (!s) return;
  const text = `Wi-Fi: ${s.wifi} | Mot de passe: ${s.wifiPass}`;
  navigator.clipboard?.writeText(text).catch(() => {});
  toast(text);
}

function printQr(id) {
  const s = state.suites.find(item => item.id === id);
  if (!s) return;
  const printUrl = `print-qr.html?suite=${encodeURIComponent(s.id)}`;
  const win = window.open(printUrl, "_blank", "noopener");
  if (!win) {
    toast("Autorise les pop-ups pour ouvrir la page d'impression.");
  }
}

function openGuestPortal() {
  const suite = currentSuite() || state.suites[0];
  window.open(clientUrl(suite), "_blank");
}

function exportData() {
  downloadJson("villa-romeo-admin.json", state);
  toast("Export JSON telecharge.");
}

function resetAll() {
  if (!confirm("Reinitialiser toutes les donnees du panel ?")) return;
  state = resetState();
  activeSuiteId = state.suites[0]?.id || null;
  view = "dashboard";
  showView("dashboard");
  toast("Donnees reinitialisees.");
}

function currentSuite() {
  return state.suites.find(s => s.id === activeSuiteId) || state.suites[0];
}

function suiteName(id) {
  return state.suites.find(s => Number(s.id) === Number(id))?.name || "Logement supprime";
}

function suiteSelect(label, id, value) {
  return select(label, id, value, state.suites.map(s => [s.id, s.name]));
}

function reservationSuiteOptions() {
  return [["all", "Tous les logements"], ...state.suites.map(suite => [suite.id, suite.name])];
}

function planningIcsUrls() {
  return {
    1: "https://www.planning-planning.com/ICS/Planning-Planning-ntcvyd.ics",
    2: "https://www.planning-planning.com/ICS/Planning-Planning-ufddgc.ics",
    3: "https://www.planning-planning.com/ICS/Planning-Planning-bweaaa.ics",
    4: "https://www.planning-planning.com/ICS/Planning-Planning-rhchtf.ics",
    5: "https://www.planning-planning.com/ICS/Planning-Planning-bweaaa.ics",
    ...(state.settings.planningIcsUrls || {})
  };
}

function suiteDefaults() {
  return {
    name: "Nouveau logement",
    category: "Hebergement de charme",
    publicName: "Nouveau logement",
    villaType: "Hebergement de charme",
    ambience: "Charme, calme, piscine et jacuzzi",
    status: "free",
    nightlyRate: 250,
    surface: "52 m2",
    guests: 4,
    floor: "Rez-de-chaussee",
    color: "#4a8fa8",
    view: "Pas de vue particuliere",
    housekeeping: "ready",
    nextCheckout: "",
    currentGuest: "",
    arrival: "",
    departure: "",
    wifi: "LavillaRoméo",
    wifiPass: "roméo83120",
    doorCode: "Code portail : 2346",
    parking: "Pas de parking privatif",
    guestPhone: "",
    preferredLanguage: state.settings.language,
    breakfastIncluded: "optional",
    arrivalInstructions: "Horaires piscine : 10h00 - 20h00.",
    minibar: "Petit-dejeuner disponible sur demande : 13 EUR adulte, 8 EUR enfant.",
    rules: "Les animaux ne sont pas acceptes. Logement non-fumeur. Merci de deposer les draps dans le sac mis a disposition avant votre depart.",
    welcome: "Bienvenue a La villa Roméo. Nous vous souhaitons un sejour doux et reposant au coeur du Golfe de Saint-Tropez.",
    guestIntro: "Bienvenue a La villa Roméo. Profitez de votre hebergement, de la piscine et du jacuzzi dans une atmosphere chaleureuse et elegante.",
    internalNotes: "",
    photo: "",
    qrUrl: "guest.html?suite=new"
  };
}

function reservationDefaults() {
  return { suiteId: state.suites[0]?.id || 0, guest: "Nouveau client", channel: "Direct", status: "confirmed", arrival: today(), departure: today(2), guests: 2, total: 0, balance: 0, requests: "" };
}

function breakfastDefaults() {
  return { suiteId: state.suites[0]?.id || 0, date: today(), time: "08:30", people: 2, order: "Commande a preciser", status: "new" };
}

function taskDefaults() {
  return { type: "concierge", suiteId: state.suites[0]?.id || 0, title: "Nouvelle operation", due: `${today()} 15:00`, priority: "medium", status: "open", owner: state.settings.adminName };
}

function messageDefaults() {
  const suite = currentSuite() || state.suites[0];
  const reservation = activeReservationForSuite(suite?.id);
  return { suiteId: suite?.id || 0, reservationId: reservation?.id || null, guest: reservation?.guest || suite?.currentGuest || "Client", subject: "Message concierge", body: "Bonjour, " };
}

function messageReplyDefaults(message) {
  return {
    suiteId: message.suiteId,
    reservationId: message.reservationId || activeReservationForSuite(message.suiteId)?.id || null,
    guest: message.guest || suiteName(message.suiteId),
    subject: message.subject?.startsWith("Re:") ? message.subject : `Re: ${message.subject || "Message"}`,
    body: "Bonjour,\n\n"
  };
}


function eventDefaults() {
  return {
    title: "Nouvel evenement",
    category: "Experience locale",
    date: today(),
    time: "18:00",
    location: "La villa Roméo",
    description: "Description de l'evenement visible dans l'espace client.",
    requiresRegistration: false,
    capacity: 0,
    registrationOpen: false,
    registrations: [],
    active: true
  };
}

function agendaDefaults() {
  return {
    title: "Nouvelle activite",
    category: "Sortie locale",
    date: today(),
    time: "10:00",
    location: "Sainte-Maxime",
    description: "Description de l'activite visible dans l'agenda client.",
    active: true
  };
}

function temperatureDefaults() {
  return { pool: { morning: "", afternoon: "", evening: "" }, air: { morning: "", afternoon: "", evening: "" }, sea: { morning: "", afternoon: "", evening: "" }, updatedAt: "" };
}

function activeEventsCount() {
  return (state.events || []).filter(event => event.active).length;
}

function eventRegistrations(event) {
  return Array.isArray(event?.registrations) ? event.registrations : [];
}

function eventRequiresRegistration(event) {
  return event?.requiresRegistration === true || event?.type === "registration";
}

function eventPeople(event) {
  return eventRegistrations(event).reduce((total, registration) => total + (Number(registration.people) || 1), 0);
}

function eventPlacesLeft(event) {
  const capacity = Number(event?.capacity) || 0;
  return capacity ? capacity - eventPeople(event) : 0;
}

function eventMonth(value) {
  if (!value) return "Date";
  return new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(new Date(value));
}

function eventDay(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit" }).format(new Date(value));
}

function temperatureIcon(key) {
  return { pool: "ti-swimming", air: "ti-wind", sea: "ti-waves" }[key] || "ti-temperature";
}

function serviceDefaults() {
  return { icon: "ti-sparkles", title: "Nouveau service", category: "Conciergerie", price: "Sur devis", active: true, text: "Description du service." };
}

function heroStyle(s) {
  if (s.photo) return `background-image:linear-gradient(180deg,rgba(0,0,0,.04),rgba(0,0,0,.52)),url('${escAttr(s.photo)}')`;
  return `background:radial-gradient(circle at 26% 25%,rgba(255,255,255,.36),transparent 22%),linear-gradient(135deg,${escAttr(s.color || "#4a8fa8")},#183342)`;
}

function clientUrl(suite) {
  const fallback = `guest.html?suite=${suite?.id || 1}`;
  try {
    const base = clientBaseUrl();
    return new URL(fallback, base).href;
  } catch (error) {
    return new URL(fallback, window.location.href).href;
  }
}

function clientBaseUrl() {
  const configured = state.settings.publicBaseUrl?.trim();
  if (configured) return configured.endsWith("/") ? configured : `${configured}/`;
  return window.location.href;
}

function qrImageUrl(url, size = 220) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}`;
}

function statusOptions() {
  return [["occupied", "Occupe"], ["free", "Libre"], ["checkout", "Check-out"], ["cleaning", "Menage"]];
}

function housekeepingOptions() {
  return [["ready", "Pret"], ["refresh", "Refresh"], ["turnover", "Turnover"], ["priority", "Prioritaire"]];
}

function reservationOptions() {
  return [["confirmed", "Confirmee"], ["inhouse", "En sejour"], ["checkout", "Check-out"], ["raw", "Sans description"]];
}

function breakfastOptions() {
  return [["new", "Nouvelle"], ["pending", "En cours"], ["done", "Servi"]];
}

function suiteStatus(value) {
  return { occupied: "Occupe", free: "Libre", checkout: "Check-out", cleaning: "Menage" }[value] || value;
}

function housekeepingLabel(value) {
  return { ready: "Pret", refresh: "Refresh", turnover: "Turnover", priority: "Prioritaire" }[value] || value;
}

function reservationStatus(value) {
  return { confirmed: "Confirmee", inhouse: "En sejour", checkout: "Check-out", raw: "Sans description", left: "Sorti" }[value] || value;
}

function computedReservationStatus(r) {
  // Reservations sans dates : on garde le statut manuel
  if (!r.arrival || !r.departure) return r.status;
  // Annulees ou sans description : statut manuel
  if (r.status === "cancelled" || r.status === "raw") return r.status;

  const todayDate = startOfDay(new Date());
  const arrival = parseDate(r.arrival);
  const departure = parseDate(r.departure);
  if (!arrival || !departure) return r.status;

  // Depart = aujourd hui -> check-out
  if (departure.getTime() === todayDate.getTime()) return "checkout";
  // Depart passe -> sorti
  if (departure < todayDate) return "left";
  // Arrival <= today < departure -> en cours
  if (arrival <= todayDate && todayDate < departure) return "inhouse";
  // Arrival dans le futur -> confirme
  return "confirmed";
}

function breakfastStatus(value) {
  return { new: "Nouvelle", pending: "En cours", done: "Servi" }[value] || value;
}

function taskStatus(value) {
  return { open: "Ouvert", planned: "Planifie", done: "Termine" }[value] || value;
}

function messageStatus(message) {
  if (message.direction === "outgoing") return "Envoye";
  return message.status === "unread" ? "A voir" : "Vu";
}

function taskPriority(value) {
  return { high: "Haute", medium: "Moyenne", low: "Basse" }[value] || value;
}

function taskIcon(type) {
  return { housekeeping: "ti-spray", maintenance: "ti-tool", concierge: "ti-concierge-bell", arrival: "ti-luggage" }[type] || "ti-circle";
}

function formatMoney(value) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: state.settings.currency || "EUR", maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function yearlyAnalytics(year = new Date().getFullYear()) {
  const monthLabels = ["Jan", "Fev", "Mar", "Avr", "Mai", "Juin", "Juil", "Aout", "Sep", "Oct", "Nov", "Dec"];
  const months = monthLabels.map(label => ({ label, revenue: 0, reservations: 0, nights: 0, breakfasts: 0 }));
  const suiteMap = new Map(state.suites.map(suite => [Number(suite.id), {
    ...suite,
    revenue: 0,
    reservations: 0,
    nights: 0,
    breakfasts: 0,
    tasks: 0,
    messages: 0,
    averageNight: 0,
    occupancy: 0
  }]));

  state.reservations.forEach(reservation => {
    const date = parseDate(reservation.arrival);
    if (!date || date.getFullYear() !== year) return;
    const nights = reservationNights(reservation);
    const revenue = Number(reservation.total) || 0;
    const month = date.getMonth();
    months[month].revenue += revenue;
    months[month].reservations += 1;
    months[month].nights += nights;

    const suite = suiteMap.get(Number(reservation.suiteId));
    if (!suite) return;
    suite.revenue += revenue;
    suite.reservations += 1;
    suite.nights += nights;
  });

  state.breakfasts.forEach(breakfast => {
    const date = parseDate(breakfast.date);
    if (date && date.getFullYear() === year) months[date.getMonth()].breakfasts += 1;
    const suite = suiteMap.get(Number(breakfast.suiteId));
    if (suite) suite.breakfasts += 1;
  });

  state.tasks.forEach(task => {
    const suite = suiteMap.get(Number(task.suiteId));
    if (suite) suite.tasks += 1;
  });

  state.messages.forEach(message => {
    const suite = suiteMap.get(Number(message.suiteId));
    if (suite) suite.messages += 1;
  });

  const roomCapacity = Math.max(state.suites.length * 365, 1);
  const totals = months.reduce((acc, month) => {
    acc.revenue += month.revenue;
    acc.reservations += month.reservations;
    acc.roomNights += month.nights;
    acc.breakfasts += month.breakfasts;
    return acc;
  }, { revenue: 0, reservations: 0, roomNights: 0, breakfasts: 0, averageNight: 0, occupancy: 0 });

  totals.averageNight = totals.roomNights ? Math.round(totals.revenue / totals.roomNights) : 0;
  totals.occupancy = Math.round((totals.roomNights / roomCapacity) * 100);

  const suites = Array.from(suiteMap.values()).map(suite => ({
    ...suite,
    averageNight: suite.nights ? Math.round(suite.revenue / suite.nights) : 0,
    occupancy: Math.round((suite.nights / 365) * 100)
  })).sort((a, b) => b.revenue - a.revenue);

  return {
    year,
    months,
    suites,
    totals,
    breakfastByStatus: [
      { label: "Nouvelles", value: state.breakfasts.filter(b => b.status === "new").length, note: "a preparer" },
      { label: "En cours", value: state.breakfasts.filter(b => b.status === "pending").length, note: "production" },
      { label: "Servies", value: state.breakfasts.filter(b => b.status === "done").length, note: "terminees" }
    ],
    tasksByStatus: [
      { label: "Ouvertes", value: state.tasks.filter(t => t.status === "open").length, note: "a traiter" },
      { label: "Planifiees", value: state.tasks.filter(t => t.status === "planned").length, note: "programmees" },
      { label: "Terminees", value: state.tasks.filter(t => t.status === "done").length, note: "cloturees" }
    ]
  };
}


function activeReservationForSuite(suiteId) {
  const todayDate = startOfDay(new Date());
  const reservations = state.reservations
    .filter(reservation => Number(reservation.suiteId) === Number(suiteId))
    .map(reservation => ({ ...reservation, arrivalDate: parseDate(reservation.arrival), departureDate: parseDate(reservation.departure) }))
    .filter(reservation => reservation.arrivalDate && reservation.departureDate)
    .sort((a, b) => a.arrivalDate - b.arrivalDate);

  return reservations.find(reservation => reservation.arrivalDate <= todayDate && todayDate < reservation.departureDate)
    || reservations.find(reservation => reservation.arrivalDate >= todayDate)
    || null;
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
function reservationNights(reservation) {
  const arrival = parseDate(reservation.arrival);
  const departure = parseDate(reservation.departure);
  if (!arrival || !departure) return 0;
  return Math.max(Math.round((departure - arrival) / 86400000), 1);
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : startOfDay(date);
}

function fmtDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(new Date(value));
}

function today(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function pct(part, total) {
  if (!total) return "0%";
  return `${Math.round(part / total * 100)}%`;
}

function initial(name) {
  return String(name || "M").split(/\s+/).filter(Boolean).pop().slice(0, 1).toUpperCase();
}

function slugify(value) {
  return String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function val(id) {
  return document.getElementById(id)?.value || "";
}

function empty(text) {
  return `<div class="empty">${esc(text)}</div>`;
}

function shortText(value, max = 90) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function escAttr(value) {
  return esc(value).replace(/`/g, "&#096;");
}

function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("active");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("active"), 2600);
}
