import { loadServerState, loadState, saveState } from "./store.js";

const app = document.getElementById("printQrApp");

let state = loadState();

render();
syncServerState();

async function syncServerState() {
  const serverState = await loadServerState();
  if (!serverState) return;
  state = serverState;
  saveState(state);
  render();
}

function render() {
  const suiteId = Number(new URLSearchParams(window.location.search).get("suite") || 0);
  const suite = state.suites.find(item => Number(item.id) === suiteId);

  if (!suite) {
    app.innerHTML = `
      <main class="error">
        <h1>QR introuvable</h1>
        <p>Impossible de trouver le logement demande.</p>
        <button class="btn primary" onclick="window.close()">Fermer</button>
      </main>
    `;
    return;
  }

  const url = clientUrl(suite);
  const login = suiteLogin(suite);
  document.title = `QR ${suite.name}`;

  app.innerHTML = `
    <div class="actions">
      <button class="btn" type="button" data-action="close">Fermer</button>
      <button class="btn primary" type="button" data-action="print">Imprimer</button>
    </div>

    <main class="sheet">
      <section class="hero">
        <div class="brand">
          <div class="brand-name">${esc(state.settings.propertyName)}</div>
          <div class="mark">M</div>
        </div>
        <div class="eyebrow">Flyer invite A5</div>
        <h1>${esc(suite.name)}</h1>
        <p class="subtitle">Votre guide digital pendant le sejour.</p>
      </section>

      <section class="content">
        <div class="intro">
          <div class="intro-kicker">Bienvenue</div>
          <div class="intro-title">Scannez le QR code</div>
          <p>Acces Wi-Fi, horaires, messages, petit-dejeuner et informations utiles du logement.</p>
        </div>
        <div class="qr-wrap">
          <img class="qr" src="${escAttr(qrImageUrl(url, 520))}" alt="QR ${escAttr(suite.name)}">
        </div>
        <div class="url">${esc(url)}</div>
        <div class="access-title">Acces client</div>
        <div class="credentials">
          <div class="credential">
            <div class="label">Identifiant</div>
            <div class="value">${esc(login.username)}</div>
          </div>
          <div class="credential">
            <div class="label">Mot de passe</div>
            <div class="value">${esc(login.password)}</div>
          </div>
        </div>
      </section>

      <footer class="footer">
        ${esc(state.settings.signature || state.settings.propertyName)} - ${esc(state.settings.phone || "")}
      </footer>
    </main>
  `;

  bindPrintActions();
  printWhenReady();
}

function bindPrintActions() {
  document.querySelector("[data-action='print']")?.addEventListener("click", () => window.print());
  document.querySelector("[data-action='close']")?.addEventListener("click", () => window.close());
}

function printWhenReady() {
  const qr = document.querySelector(".qr");
  if (!qr) return;
  const trigger = () => setTimeout(() => window.print(), 250);
  if (qr.complete) trigger();
  else qr.addEventListener("load", trigger, { once: true });
}

function suiteLogin(suite) {
  return {
    username: suite.clientLogin?.username || suite.name,
    password: suite.clientLogin?.password || ""
  };
}

function clientUrl(suite) {
  const path = suite.qrUrl || `guest.html?suite=${suite.id}`;
  try {
    const base = clientBaseUrl();
    return new URL(path, base).href;
  } catch {
    return path;
  }
}

function clientBaseUrl() {
  const configured = state.settings.publicBaseUrl?.trim();
  if (configured) return configured.endsWith("/") ? configured : `${configured}/`;
  return `${window.location.origin}/`;
}

function qrImageUrl(url, size = 220) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}`;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function escAttr(value) {
  return esc(value).replace(/`/g, "&#096;");
}
