import { loadServerState, loadState, nextId, saveState } from "./store.js";

const app = document.getElementById("guestApp");
const GUEST_AUTH_KEY = "villa-romeo-guest-auth-v1";
const GUEST_NOTIFICATION_READ_KEY = "villa-romeo-guest-notifications-read-v1";
const GUEST_NOTIFICATION_SNAPSHOT_KEY = "villa-romeo-guest-notifications-snapshot-v1";

let installPromptEvent = null;
let state = loadState();
let guestSession = loadGuestSession();
let activeSuiteId = guestSession?.suiteId || getInitialSuiteId();
let toastTimer = null;
let notificationSnapshot = localStorage.getItem(GUEST_NOTIFICATION_SNAPSHOT_KEY) || "";
let syncTimer = null;

bootGuest();
bindEvents();

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPromptEvent = event;
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

function bootGuest() {
  render();
  if (guestSession) syncServerState();
  clearInterval(syncTimer);
  syncTimer = setInterval(() => {
    if (guestSession) syncServerState();
  }, 20000);
}

async function syncServerState() {
  const serverState = await loadServerState();
  if (!serverState) return;
  state = serverState;
  activeSuiteId = guestSession?.suiteId || activeSuiteId;
  if (!state.suites.some(s => Number(s.id) === Number(activeSuiteId))) {
    logoutGuest();
    return;
  }
  saveState(state);
  render();
}

function bindEvents() {
  document.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;

    const action = button.dataset.action;
    const id = Number(button.dataset.id || 0);

    if (action === "logout") logoutGuest();
    if (action === "install-app") installApp();
    if (action === "toggle-notifications") toggleGuestNotifications();
    if (action === "enable-notifications") enableGuestBrowserNotifications();
    if (action === "clear-client-notifications") clearGuestNotifications();
    if (action === "modal") openModal(button.dataset.modal, id);
    if (action === "close") closeModal();
    if (action === "breakfast") submitBreakfast();
    if (action === "event-register") submitEventRegistration(id);
    if (action === "message") submitMessage();
    if (action === "copy-wifi") copyWifi();
    if (action === "call") callConcierge();
  });

  document.addEventListener("submit", event => {
    if (event.target.id === "guestLoginForm") {
      event.preventDefault();
      loginGuest();
    }
  });
}

function render() {
  if (!guestSession) {
    renderGuestLogin();
    return;
  }

  const suite = currentSuite();
  const reservation = currentReservation();
  const suiteMessages = reservation
    ? state.messages.filter(message => Number(message.reservationId) === Number(reservation.id))
    : [];
  const visibleEvents = upcomingEvents();
  const temperatures = state.temperatures || {};
  const notificationCount = unreadGuestNotifications().length;
  document.documentElement.style.setProperty("--navy", state.settings.primaryColor || "#183342");
  document.documentElement.style.setProperty("--gold", state.settings.accentColor || "#b99655");

  app.innerHTML = `
    <div class="guest-shell">
      <nav class="guest-nav">
        <div class="brand">
          <div class="brand-mark">M</div>
          <div>
            <div class="brand-name">${esc(state.settings.propertyName)}</div>
            <div class="brand-sub">${esc(state.settings.descriptor || "Portail invite")}</div>
          </div>
        </div>
        <button class="btn install-btn" data-action="install-app"><i class="ti ti-device-mobile-down"></i><span>Installer l'appli</span></button>
        <div class="nav-actions">
          <button class="btn icon" data-action="copy-wifi" aria-label="Copier Wi-Fi"><i class="ti ti-wifi"></i></button>
          <button class="btn icon notification-button" data-action="toggle-notifications" aria-label="Notifications">
            <i class="ti ti-bell"></i>
            <span class="notification-dot" ${notificationCount ? "" : "hidden"}></span>
          </button>
          <button class="btn" data-action="modal" data-modal="message"><i class="ti ti-message-circle"></i><span>Message</span></button>
          <button class="btn" data-action="logout"><i class="ti ti-logout"></i><span>Deconnexion</span></button>
          <button class="btn primary" data-action="call"><i class="ti ti-phone"></i><span>Appeler</span></button>
        </div>
      </nav>
      ${guestNotificationPanel()}

      <header class="hero">
        <div class="hero-copy">
          <div>
            <div class="eyebrow">${esc(state.settings.guestEyebrow || "Bienvenue dans votre sejour")}</div>
            <h1>${esc(suite.publicName || state.settings.guestHeroTitle || suite.name)}</h1>
            <p class="hero-text">${esc(suite.guestIntro || state.settings.guestHeroText || suite.welcome || state.settings.welcomeNote)}</p>
            <div class="hero-actions">
              <button class="btn gold" data-action="modal" data-modal="breakfast"><i class="ti ti-coffee"></i>Reserver petit-dejeuner</button>
              <button class="btn" data-action="copy-wifi"><i class="ti ti-wifi"></i>Copier Wi-Fi</button>
            </div>
          </div>
          <div class="arrival-card">
            <div class="arrival-item"><span>Check-in</span><b>${esc(suite.checkin || state.settings.checkin)}</b></div>
            <div class="arrival-item"><span>Check-out</span><b>${esc(suite.checkout || state.settings.checkout)}</b></div>
            <div class="arrival-item"><span>Concierge</span><b>${esc(state.settings.phone)}</b></div>
          </div>
        </div>
        <div class="hero-visual" style="${heroStyle(suite)}">
          <div class="suite-floating">
            <h2>${esc(suite.category)}</h2>
            <p>${esc(suite.villaType || suite.category)} - ${esc(suite.ambience || suite.view)} - ${Number(suite.guests) || 0} voyageurs</p>
          </div>
        </div>
      </header>

      <main class="main">
        <div class="suite-picker locked">
          <div class="field">
            <label>Votre logement</label>
            <div class="locked-suite"><i class="ti ti-home-check"></i>${esc(suite.name)}</div>
          </div>
          <button class="btn primary" data-action="modal" data-modal="message"><i class="ti ti-send"></i>Contacter la conciergerie</button>
        </div>

        <section>
          <div class="section-head">
            <div>
              <h2 class="section-title">Actions rapides</h2>
              <p class="section-copy">Tout ce dont un client a besoin pendant son sejour, sans chercher.</p>
            </div>
          </div>
          <div class="quick-grid">
            ${quickCard("ti-coffee", state.settings.guestBreakfastTitle, state.settings.guestBreakfastText, "breakfast")}
            ${quickCard("ti-phone", state.settings.guestCallTitle, state.settings.guestCallText, "call")}
            ${quickCard("ti-message-circle", state.settings.guestMessageTitle, state.settings.guestMessageText, "message")}
            ${quickCard("ti-wifi", state.settings.guestWifiTitle, state.settings.guestWifiText, "wifi")}
          </div>
        </section>


        <section class="split" style="margin-top:28px;">
          <div class="panel guest-events-panel">
            <div class="panel-head">
              <div>
                <div class="panel-title">Evenements & sorties</div>
                <div class="panel-sub">Suggestions selectionnees par la conciergerie.</div>
              </div>
            </div>
            <div class="panel-body">
              <div class="guest-event-list">
                ${visibleEvents.length ? visibleEvents.map(guestEventCard).join("") : `<div class="info-item"><i class="ti ti-calendar-star"></i><div><b>Aucun evenement publie</b><br>La conciergerie ajoutera ici les suggestions du moment.</div></div>`}
              </div>
            </div>
          </div>

          <div class="panel guest-temperatures-panel">
            <div class="panel-head">
              <div>
                <div class="panel-title">Temperatures</div>
                <div class="panel-sub">Piscine, air et mer selon le moment de la journee.</div>
              </div>
            </div>
            <div class="panel-body">
              ${guestTemperatures(temperatures)}
            </div>
          </div>
        </section>
        <section class="split" style="margin-top:28px;">
          <div class="panel">
            <div class="panel-head">
              <div>
                <div class="panel-title">${esc(state.settings.guestInfoTitle || "Informations sejour")}</div>
                <div class="panel-sub">${esc(state.settings.guestInfoText || "Acces, Wi-Fi, horaires et regles utiles.")}</div>
              </div>
              <button class="btn" data-action="copy-wifi"><i class="ti ti-copy"></i>Copier Wi-Fi</button>
            </div>
            <div class="panel-body">
              <div class="info-list">
                ${info("ti-wifi", "Wi-Fi", `${suite.wifi} - ${suite.wifiPass}`)}
                ${info("ti-door", "Code porte", suite.doorCode)}
                ${info("ti-clock", "Horaires", `Arrivee ${suite.checkin || state.settings.checkin} / Depart ${suite.checkout || state.settings.checkout}`)}
                ${info("ti-info-circle", "Arrivee", suite.arrivalInstructions)}
                ${info("ti-tools-kitchen-2", "Minibar", suite.minibar)}
                ${info("ti-shield-check", "Regles", suite.rules)}
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <div>
                <div class="panel-title">${esc(state.settings.guestContactTitle || "Conciergerie")}</div>
                <div class="panel-sub">${esc(state.settings.signature)}</div>
              </div>
            </div>
            <div class="panel-body">
              <div class="info-list">
                ${info("ti-phone", "Telephone", state.settings.phone)}
                ${info("ti-mail", "Email", state.settings.email)}
                ${info("ti-map-pin", "Adresse", state.settings.address)}
                ${info("ti-language", "Langues", state.settings.language)}
              </div>
            </div>
          </div>
        </section>

        <section style="margin-top:28px;">
          <div class="panel">
            <div class="panel-head">
              <div>
                <div class="panel-title">Messages</div>
                <div class="panel-sub">Echanges avec la conciergerie.</div>
              </div>
              <button class="btn primary" data-action="modal" data-modal="message"><i class="ti ti-send"></i>Repondre</button>
            </div>
            <div class="panel-body">
              <div class="message-list">
                ${suiteMessages.length ? suiteMessages.map(messageBubble).join("") : `<div class="info-item"><i class="ti ti-message-circle"></i><div><b>Aucun message</b><br>La conciergerie reste joignable a tout moment.</div></div>`}
              </div>
            </div>
          </div>
        </section>

        <section>
          <div class="panel">
            <div class="panel-head">
              <div>
                <div class="panel-title">Parametres</div>
                <div class="panel-sub">Session client sur cet appareil.</div>
              </div>
              <button class="btn danger" data-action="logout"><i class="ti ti-logout"></i><span>Se deconnecter</span></button>
            </div>
          </div>
        </section>

        <footer class="footer">
          <div>${esc(state.settings.guestFooterText || state.settings.propertyName)}</div>
          <div>${esc(state.settings.phone)} - ${esc(state.settings.email)}</div>
        </footer>
      </main>
    </div>
    <div class="modal" id="guestModal"></div>
    <div class="toast" id="toast"></div>
  `;
  watchGuestNotifications();
}

function guestNotificationPanel() {
  const notifications = guestNotifications();
  const unread = unreadGuestNotifications();
  const permission = notificationPermissionLabel();

  return `
    <div class="guest-notification-panel" id="guestNotificationPanel">
      <div class="guest-notification-card">
        <div class="notification-head">
          <div>
            <div class="panel-title">Notifications</div>
            <div class="panel-sub">${unread.length} alerte${unread.length > 1 ? "s" : ""} - Navigateur : ${permission}</div>
          </div>
          <div class="notification-actions">
            <button class="btn small" data-action="enable-notifications"><i class="ti ti-bell-ringing"></i><span>Activer</span></button>
            <button class="btn small" data-action="clear-client-notifications"><i class="ti ti-checks"></i><span>Tout vu</span></button>
          </div>
        </div>
        <div class="notification-list">
          ${notifications.length ? notifications.map(item => `
            <div class="notification-item ${item.read ? "" : "unread"}">
              <i class="ti ${item.icon}"></i>
              <span>
                <b>${esc(item.title)}</b>
                <small>${esc(item.text)}</small>
              </span>
            </div>
          `).join("") : `<div class="info-item"><i class="ti ti-bell"></i><div><b>Aucune notification</b><br>Les messages importants apparaitront ici.</div></div>`}
        </div>
      </div>
    </div>
  `;
}

function guestNotifications() {
  const readIds = notificationReadIds(guestNotificationReadKey());
  const suite = currentSuite();
  const reservation = currentReservation();
  const items = [];

  state.messages
    .filter(message => message.direction === "outgoing")
    .filter(message => Number(message.suiteId) === Number(suite.id) || Number(message.reservationId) === Number(reservation?.id))
    .forEach(message => items.push({
      id: `message-${message.id}`,
      icon: "ti-message-circle",
      title: message.subject || "Message de la conciergerie",
      text: message.body || "Nouveau message"
    }));

  upcomingEvents()
    .slice(0, 3)
    .forEach(event => items.push({
      id: `event-${event.id}`,
      icon: "ti-calendar-star",
      title: event.title,
      text: `${fmtDate(event.date)} - ${event.location || state.settings.propertyName}`
    }));

  if (state.temperatures?.updatedAt) {
    items.push({
      id: `temperatures-${state.temperatures.updatedAt}`,
      icon: "ti-temperature",
      title: "Temperatures mises a jour",
      text: `Piscine ${state.temperatures.pool?.value || "-"} degres - Air ${state.temperatures.air?.value || "-"} degres`
    });
  }

  return items.map(item => ({ ...item, read: readIds.has(item.id) }));
}

function unreadGuestNotifications() {
  return guestNotifications().filter(item => !item.read);
}

function toggleGuestNotifications() {
  document.getElementById("guestNotificationPanel")?.classList.toggle("open");
}

async function enableGuestBrowserNotifications() {
  if (!("Notification" in window)) {
    toast("Ce navigateur ne gere pas les notifications.");
    return;
  }
  const result = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  toast(result === "granted" ? "Notifications activees." : "Notifications non autorisees.");
  render();
}

function clearGuestNotifications() {
  localStorage.setItem(guestNotificationReadKey(), JSON.stringify(guestNotifications().map(item => item.id)));
  notificationSnapshot = "";
  render();
  toast("Notifications marquees comme vues.");
}

function watchGuestNotifications() {
  const unread = unreadGuestNotifications();
  const current = unread.map(item => item.id).join("|");
  if (!notificationSnapshot) {
    notificationSnapshot = current;
    localStorage.setItem(GUEST_NOTIFICATION_SNAPSHOT_KEY, current);
    return;
  }

  const previous = new Set(notificationSnapshot.split("|").filter(Boolean));
  const fresh = unread.filter(item => !previous.has(item.id));
  if (fresh.length) notifyBrowser("La villa Roméo", fresh[0].title, fresh[0].text, `villa-romeo-client-${activeSuiteId}`);

  notificationSnapshot = current;
  localStorage.setItem(GUEST_NOTIFICATION_SNAPSHOT_KEY, current);
}

function guestNotificationReadKey() {
  return `${GUEST_NOTIFICATION_READ_KEY}-${activeSuiteId || "guest"}`;
}

function renderGuestLogin(error = "") {
  document.documentElement.style.setProperty("--navy", state.settings.primaryColor || "#183342");
  document.documentElement.style.setProperty("--gold", state.settings.accentColor || "#b99655");
  app.innerHTML = `
    <main class="auth-screen">
      <form class="auth-card" id="guestLoginForm">
        <div class="brand-mark">M</div>
        <div>
          <div class="auth-eyebrow">Espace client</div>
          <h1>Votre logement</h1>
          <p>Connectez-vous avec l'identifiant de votre logement.</p>
        </div>
        <label>
          Identifiant
          <input id="guestUsername" type="text" autocomplete="username" required>
        </label>
        <label>
          Mot de passe
          <input id="guestPassword" type="password" autocomplete="current-password" required>
        </label>
        ${error ? `<div class="auth-error">${esc(error)}</div>` : ""}
        <button class="btn primary" type="submit"><i class="ti ti-lock-open"></i>Se connecter</button>
      </form>
    </main>
  `;
}

function loginGuest() {
  const username = value("guestUsername").trim();
  const password = value("guestPassword");
  const suite = state.suites.find(item => {
    const login = suiteLogin(item);
    return login.username === username && login.password === password;
  });

  if (!suite) {
    renderGuestLogin("Identifiant ou mot de passe incorrect.");
    return;
  }

  guestSession = { suiteId: suite.id };
  activeSuiteId = suite.id;
  localStorage.setItem(GUEST_AUTH_KEY, JSON.stringify(guestSession));
  updateUrlSuite();
  render();
  syncServerState();
}

function logoutGuest() {
  localStorage.removeItem(GUEST_AUTH_KEY);
  guestSession = null;
  renderGuestLogin();
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

function quickCard(icon, title, text, modal) {
  const action = modal === "call" ? "call" : modal === "wifi" ? "copy-wifi" : "modal";
  const extra = action === "modal" ? `data-modal="${modal}"` : "";
  return `
    <button class="quick-card" data-action="${action}" ${extra}>
      <div class="quick-icon"><i class="ti ${icon}"></i></div>
      <div>
        <h3>${esc(title)}</h3>
        <p>${esc(text)}</p>
      </div>
    </button>
  `;
}

function openModal(type, serviceId = 0) {
  const modal = document.getElementById("guestModal");
  modal.classList.add("active");
  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-head">
        <div class="modal-title">${modalTitle(type)}</div>
        <button class="btn icon" data-action="close" aria-label="Fermer"><i class="ti ti-x"></i></button>
      </div>
      <div class="modal-body">${modalBody(type, serviceId)}</div>
    </div>
  `;
}

function closeModal() {
  const modal = document.getElementById("guestModal");
  modal.classList.remove("active");
  modal.innerHTML = "";
}

function modalTitle(type) {
  return {
    breakfast: "Reserver un petit-dejeuner",
    event: "S'inscrire a l'evenement",
    message: "Contacter la conciergerie",
  }[type] || "Demande";
}

function modalBody(type, serviceId) {
  if (type === "breakfast") {
    return `
      <div class="form-grid">
        ${field("Date", "breakfast-date", today(), "date")}
        ${field("Heure souhaitee", "breakfast-time", "08:30", "time")}
        ${field("Nombre de personnes", "breakfast-people", "2", "number")}
        ${select("Preference", "breakfast-style", breakfastOptions())}
        ${area("Votre commande", "breakfast-order", state.settings.guestBreakfastDefaultOrder || "Cafe, jus frais, viennoiseries, fruits...")}
      </div>
      <div class="save-row">
        <span class="hint">Votre demande apparaitra dans le panel admin.</span>
        <button class="btn primary" data-action="breakfast"><i class="ti ti-check"></i>Envoyer</button>
      </div>
    `;
  }

  if (type === "event") {
    const event = state.events.find(item => Number(item.id) === Number(serviceId));
    if (!event) return `<div class="info-item"><i class="ti ti-calendar-x"></i><div><b>Evenement introuvable</b><br>Merci de contacter la conciergerie.</div></div>`;
    if (!eventRequiresRegistration(event)) return `<div class="info-item"><i class="ti ti-info-circle"></i><div><b>Evenement sans inscription</b><br>Cet evenement est une information visible dans votre espace client.</div></div>`;
    const placesLeft = eventPlacesLeft(event);
    const disabled = event.registrationOpen === false || placesLeft <= 0;
    return `
      <div class="event-modal-summary">
        <b>${esc(event.title)}</b>
        <span>${esc(fmtDate(event.date))}${event.time ? ` - ${esc(event.time)}` : ""} - ${esc(event.location || "Lieu a preciser")}</span>
        <p>${event.capacity ? `${Math.max(placesLeft, 0)} place${placesLeft > 1 ? "s" : ""} restante${placesLeft > 1 ? "s" : ""}` : "Inscription ouverte"}</p>
      </div>
      <div class="form-grid">
        ${field("Votre nom", "event-guest", currentReservation()?.guest || currentSuite().currentGuest || "Client")}
        ${field("Nombre de personnes", "event-people", "2", "number")}
        ${field("Telephone", "event-phone", "", "tel")}
        ${area("Message", "event-note", "Bonjour, nous souhaitons participer.")}
      </div>
      <div class="save-row">
        <span class="hint">${disabled ? "Les inscriptions sont closes pour cet evenement." : "Votre inscription apparaitra dans le panel admin."}</span>
        <button class="btn primary" data-action="event-register" data-id="${event.id}" ${disabled ? "disabled" : ""}><i class="ti ti-check"></i>Confirmer</button>
      </div>
    `;
  }

  return `
    <div class="form-grid">
      ${field("Objet", "message-subject", "Demande concierge")}
      ${field("Votre nom", "message-guest", currentReservation()?.guest || currentSuite().currentGuest || "Client")}
      ${field("Moment souhaite", "message-time", "", "text")}
      ${area("Message", "message-body", "Bonjour, j'aimerais...")}
    </div>
    <div class="save-row">
      <span class="hint">Votre message sera visible dans le panel admin.</span>
      <button class="btn primary" data-action="message"><i class="ti ti-send"></i>Envoyer</button>
    </div>
  `;
}

function submitBreakfast() {
  const suite = currentSuite();
  const reservation = currentReservation();
  state.breakfasts.unshift({
    id: nextId(state.breakfasts),
    suiteId: suite.id,
    reservationId: reservation?.id || null,
    date: value("breakfast-date"),
    time: value("breakfast-time"),
    people: Number(value("breakfast-people")) || 1,
    order: `${value("breakfast-style")} - ${value("breakfast-order")}`,
    status: "new"
  });
  saveState(state);
  closeModal();
  toast("Petit-dejeuner demande. La conciergerie s'en occupe.");
}

function submitEventRegistration(eventId) {
  const event = state.events.find(item => Number(item.id) === Number(eventId));
  if (!event) return;
  if (!eventRequiresRegistration(event)) {
    toast("Cet evenement ne demande pas d'inscription.");
    return;
  }

  const people = Math.max(Number(value("event-people")) || 1, 1);
  const placesLeft = eventPlacesLeft(event);
  if (event.registrationOpen === false || (Number(event.capacity) && people > placesLeft)) {
    toast("Plus assez de places disponibles.");
    return;
  }

  const suite = currentSuite();
  const reservation = currentReservation();
  event.registrations = Array.isArray(event.registrations) ? event.registrations : [];
  event.registrations.push({
    id: nextId(event.registrations),
    suiteId: suite.id,
    reservationId: reservation?.id || null,
    guest: value("event-guest") || reservation?.guest || suite.currentGuest || "Client",
    people,
    phone: value("event-phone"),
    note: value("event-note"),
    createdAt: new Date().toISOString()
  });
  saveState(state);
  closeModal();
  render();
  toast("Inscription confirmee. Merci !");
}

function submitMessage() {
  const suite = currentSuite();
  const reservation = currentReservation();
  state.messages.unshift({
    id: nextId(state.messages),
    suiteId: suite.id,
    reservationId: reservation?.id || null,
    guest: value("message-guest") || reservation?.guest || suite.currentGuest || "Client",
    subject: value("message-subject") || "Demande concierge",
    body: withOptionalTime(value("message-body"), value("message-time")),
    status: "unread",
    direction: "incoming",
    time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  });
  saveState(state);
  closeModal();
  toast("Message envoye a la conciergerie.");
}

function copyWifi() {
  const suite = currentSuite();
  const text = `Wi-Fi: ${suite.wifi} | Mot de passe: ${suite.wifiPass}`;
  navigator.clipboard?.writeText(text).catch(() => {});
  toast("Informations Wi-Fi copiees.");
}

function callConcierge() {
  window.location.href = `tel:${state.settings.phone.replace(/\s+/g, "")}`;
  toast("Ouverture de l'appel concierge.");
}

function loadGuestSession() {
  try {
    const session = JSON.parse(localStorage.getItem(GUEST_AUTH_KEY) || "null");
    if (!session?.suiteId) return null;
    return state.suites.some(suite => Number(suite.id) === Number(session.suiteId)) ? session : null;
  } catch (error) {
    return null;
  }
}

function suiteLogin(suite) {
  return {
    username: suite.clientLogin?.username || suite.name,
    password: suite.clientLogin?.password || ""
  };
}

function getInitialSuiteId() {
  const params = new URLSearchParams(window.location.search);
  const querySuite = Number(params.get("suite"));
  if (querySuite && loadState().suites.some(s => s.id === querySuite)) return querySuite;
  return loadState().suites[0]?.id || 1;
}

function updateUrlSuite() {
  const url = new URL(window.location.href);
  url.searchParams.set("suite", String(activeSuiteId));
  window.history.replaceState({}, "", url);
}

function currentSuite() {
  return state.suites.find(s => s.id === activeSuiteId) || state.suites[0];
}
function currentReservation() {
  const todayDate = startOfDay(new Date());
  const reservations = state.reservations
    .filter(reservation => Number(reservation.suiteId) === Number(activeSuiteId))
    .map(reservation => ({ ...reservation, arrivalDate: parseDate(reservation.arrival), departureDate: parseDate(reservation.departure) }))
    .filter(reservation => reservation.arrivalDate && reservation.departureDate)
    .sort((a, b) => a.arrivalDate - b.arrivalDate);

  return reservations.find(reservation => reservation.arrivalDate <= todayDate && todayDate < reservation.departureDate) || null;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : startOfDay(date);
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}


function upcomingEvents() {
  const todayDate = startOfDay(new Date());
  return (state.events || [])
    .filter(event => event.active !== false)
    .map(event => ({ ...event, eventDate: parseDate(event.date) }))
    .filter(event => !event.eventDate || event.eventDate >= todayDate)
    .sort((a, b) => (a.eventDate || todayDate) - (b.eventDate || todayDate) || String(a.time || "").localeCompare(String(b.time || "")))
    .slice(0, 4);
}

function guestEventCard(event) {
  const hasRegistration = eventRequiresRegistration(event);
  const people = eventPeople(event);
  const capacity = Number(event.capacity) || 0;
  const placesLeft = eventPlacesLeft(event);
  const full = capacity && placesLeft <= 0;
  const closed = !hasRegistration || event.registrationOpen === false || full;
  return `
    <article class="guest-event-card">
      <div class="guest-event-date"><span>${esc(eventMonth(event.date))}</span><b>${esc(eventDay(event.date))}</b></div>
      <div>
        <div class="guest-event-meta">${esc(event.category || "Evenement")} ${event.time ? `- ${esc(event.time)}` : ""}</div>
        <h3>${esc(event.title)}</h3>
        <p>${esc(event.description || "")}</p>
        <div class="guest-event-place"><i class="ti ti-map-pin"></i>${esc(event.location || "Lieu a preciser")}</div>
        ${hasRegistration ? `
          <div class="guest-event-booking">
            <span>${capacity ? `${people}/${capacity} inscrit${people > 1 ? "s" : ""}` : `${people} inscrit${people > 1 ? "s" : ""}`}</span>
            <button class="btn small ${closed ? "" : "primary"}" data-action="modal" data-modal="event" data-id="${event.id}" ${closed ? "disabled" : ""}>${closed ? "Complet" : "S'inscrire"}</button>
          </div>
        ` : `<div class="guest-event-info"><i class="ti ti-info-circle"></i>Evenement sans inscription</div>`}
      </div>
    </article>
  `;
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
  return capacity ? capacity - eventPeople(event) : 9999;
}

function guestTemperatures(temperatures) {
  return `
    <div class="guest-temp-grid">
      <div></div><span>Matin</span><span>Apres-midi</span><span>Soir</span>
      ${guestTempRow("Piscine", "ti-swimming", temperatures.pool)}
      ${guestTempRow("Air", "ti-wind", temperatures.air)}
      ${guestTempRow("Mer", "ti-waves", temperatures.sea)}
    </div>
    <div class="temp-updated">Mis a jour ${esc(temperatures.updatedAt || "prochainement")}</div>
  `;
}

function guestTempRow(label, icon, values = {}) {
  return `
    <strong><i class="ti ${icon}"></i>${label}</strong>
    <b>${tempValue(values.morning)}</b>
    <b>${tempValue(values.afternoon)}</b>
    <b>${tempValue(values.evening)}</b>
  `;
}

function tempValue(value) {
  return value === undefined || value === null || value === "" ? "-" : `${esc(value)}&#176;`;
}

function eventMonth(value) {
  if (!value) return "Date";
  return new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(new Date(value));
}

function eventDay(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit" }).format(new Date(value));
}

function fmtDate(value) {
  if (!value) return "Date a preciser";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long" }).format(new Date(value));
}

function info(icon, title, text) {
  return `<div class="info-item"><i class="ti ${icon}"></i><div><b>${esc(title)}</b><br>${esc(text || "-")}</div></div>`;
}

function messageBubble(message) {
  return `
    <div class="message-bubble ${message.direction === "outgoing" ? "from-admin" : "from-guest"}">
      <div class="message-meta">${message.direction === "outgoing" ? "Conciergerie" : esc(message.guest || "Vous")} - ${esc(message.time || "")}</div>
      <b>${esc(message.subject || "Message")}</b>
      <p>${esc(message.body || "")}</p>
    </div>
  `;
}

function field(label, id, val = "", type = "text") {
  return `<div class="field"><label for="${id}">${esc(label)}</label><input id="${id}" type="${type}" value="${escAttr(val)}"></div>`;
}

function area(label, id, val = "") {
  return `<div class="field full"><label for="${id}">${esc(label)}</label><textarea id="${id}">${esc(val)}</textarea></div>`;
}

function select(label, id, options) {
  return `
    <div class="field">
      <label for="${id}">${esc(label)}</label>
      <select id="${id}">
        ${options.map(([value, text]) => `<option value="${escAttr(value)}">${esc(text)}</option>`).join("")}
      </select>
    </div>
  `;
}

function breakfastOptions() {
  const raw = state.settings.guestBreakfastOptions || "Continental, Mediterraneen, Healthy, Sur mesure";
  return raw.split(",").map(item => item.trim()).filter(Boolean).map(item => [item, item]);
}

function heroStyle(suite) {
  if (suite.photo) {
    return `background-image:linear-gradient(180deg,rgba(0,0,0,.04),rgba(0,0,0,.54)),url('${escAttr(suite.photo)}')`;
  }
  return `background:radial-gradient(circle at 28% 24%,rgba(255,255,255,.36),transparent 22%),linear-gradient(135deg,${escAttr(suite.color || "#4a8fa8")},#183342)`;
}

function withOptionalTime(body, time) {
  return time ? `${body} Horaire souhaite: ${time}` : body;
}

function value(id) {
  return document.getElementById(id)?.value || "";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function escAttr(value) {
  return esc(value).replace(/`/g, "&#096;");
}

function notifyBrowser(title, body, tag = "villa-romeo-client") {
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

function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("active");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("active"), 2600);
}
