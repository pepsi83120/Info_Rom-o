const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const webpush = require("web-push");

const root = __dirname;
const storageDir = process.env.STORAGE_DIR || path.join(root, "storage");
const stateFile = path.join(storageDir, "state.json");
const bundledStateFile = path.join(root, "storage", "state.json");
const subscriptionsFile = path.join(storageDir, "subscriptions.json");
const port = Number(process.env.PORT || 4174);
const host = process.env.HOST || "0.0.0.0";
const displayHost = host === "0.0.0.0" ? "localhost" : host;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

const VAPID_PUBLIC_KEY = "BAZT7ymj3mVaYdnXXxQRCyPuKPdA_bgaNHY96_BG8ueJ0W-zZLz00h-pbGH-7Yxxiv0Iq6yoEWZUEMzngUT5CZw";
const VAPID_PRIVATE_KEY = "WqRGxa4UDrnpjIXtF_j-1AXRUVJQNfHdTVpp0G5eQ4w";
const VAPID_SUBJECT = "mailto:info@lavillaromeo.fr";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

function loadSubscriptions() {
  try {
    const raw = fs.readFileSync(subscriptionsFile, "utf8");
    return JSON.parse(raw || "[]");
  } catch {
    return [];
  }
}

function saveSubscriptions(subs) {
  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(subscriptionsFile, JSON.stringify(subs, null, 2), "utf8");
}

async function sendPushToAll(payload) {
  const subs = loadSubscriptions();
  const dead = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) dead.push(sub.endpoint);
    }
  }
  if (dead.length) {
    saveSubscriptions(subs.filter(s => !dead.includes(s.endpoint)));
  }
}

async function sendPushToEndpoint(endpoint, payload) {
  const subs = loadSubscriptions();
  const sub = subs.find(s => s.endpoint === endpoint);
  if (!sub) return;
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      saveSubscriptions(subs.filter(s => s.endpoint !== endpoint));
    }
  }
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${displayHost}:${port}`);

  if (url.pathname === "/api/state") {
    handleStateApi(request, response);
    return;
  }

  if (url.pathname === "/api/ics") {
    handleIcsApi(url, response);
    return;
  }

  if (url.pathname === "/api/push/vapid-public-key" && request.method === "GET") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ key: VAPID_PUBLIC_KEY }));
    return;
  }

  if (url.pathname === "/api/push/subscribe" && request.method === "POST") {
    readBody(request, (body) => {
      try {
        const subscription = JSON.parse(body);
        const subs = loadSubscriptions();
        const exists = subs.find(s => s.endpoint === subscription.endpoint);
        if (!exists) {
          subs.push(subscription);
          saveSubscriptions(subs);
        }
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true }));
      } catch {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: false }));
      }
    });
    return;
  }

  if (url.pathname === "/api/push/unsubscribe" && request.method === "POST") {
    readBody(request, (body) => {
      try {
        const { endpoint } = JSON.parse(body);
        const subs = loadSubscriptions().filter(s => s.endpoint !== endpoint);
        saveSubscriptions(subs);
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true }));
      } catch {
        response.writeHead(400);
        response.end();
      }
    });
    return;
  }

  if (url.pathname === "/api/push/send" && request.method === "POST") {
    readBody(request, async (body) => {
      try {
        const { title, body: msgBody, icon, badge, tag, endpoint } = JSON.parse(body);
        const payload = {
          title: title || "La villa Roméo",
          body: msgBody || "",
          icon: icon || "/assets/icons/icon-192.png",
          badge: badge || "/assets/icons/favicon-32.png",
          tag: tag || "villa-romeo",
          timestamp: Date.now()
        };
        if (endpoint) {
          await sendPushToEndpoint(endpoint, payload);
        } else {
          await sendPushToAll(payload);
        }
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true }));
      } catch (err) {
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  if (url.pathname === "/api/push/test" && request.method === "POST") {
    sendPushToAll({
      title: "La villa Roméo",
      body: "Test de notification — tout fonctionne !",
      icon: "/assets/icons/icon-192.png",
      badge: "/assets/icons/favicon-32.png",
      tag: "villa-romeo-test",
      timestamp: Date.now()
    }).then(() => {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true }));
    }).catch(err => {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: false, error: err.message }));
    });
    return;
  }

  const requestPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(root, requestPath));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    const headers = { "Content-Type": types[ext] || "text/plain; charset=utf-8" };
    if ([".html", ".js", ".css", ".json", ".webmanifest"].includes(ext) || path.basename(filePath) === "sw.js") {
      headers["Cache-Control"] = "no-store";
    }
    response.writeHead(200, headers);
    response.end(content);
  });
});

function readBody(request, callback) {
  let body = "";
  request.on("data", chunk => {
    body += chunk;
    if (body.length > 5_000_000) request.destroy();
  });
  request.on("end", () => callback(body));
}

function handleStateApi(request, response) {
  if (request.method === "GET") {
    fs.readFile(stateFile, "utf8", (error, content) => {
      if (!error) {
        sendJsonState(response, content);
        return;
      }

      fs.readFile(bundledStateFile, "utf8", (fallbackError, fallbackContent) => {
        if (fallbackError) {
          response.writeHead(204);
          response.end();
          return;
        }

        fs.mkdirSync(storageDir, { recursive: true });
        fs.writeFileSync(stateFile, fallbackContent, "utf8");
        sendJsonState(response, fallbackContent);
      });
    });
    return;
  }

  if (request.method === "POST") {
    readBody(request, async (body) => {
      try {
        const newState = JSON.parse(body || "{}");

        // Charger l'ancien state pour comparer
        let oldState = { messages: [], breakfasts: [], tasks: [] };
        try {
          oldState = JSON.parse(fs.readFileSync(stateFile, "utf8") || "{}");
        } catch {}

        fs.mkdirSync(storageDir, { recursive: true });
        fs.writeFileSync(stateFile, JSON.stringify(newState, null, 2), "utf8");
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true }));

        detectAndNotify(oldState, newState);

      } catch (error) {
        if (!response.headersSent) {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
        }
      }
    });
    return;
  }

  response.writeHead(405, { "Allow": "GET, POST" });
  response.end("Method not allowed");
}

function sendJsonState(response, content) {
  try {
    const state = JSON.parse(content || "{}");
    const publicBaseUrl = process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL;
    if (publicBaseUrl) {
      state.settings = state.settings || {};
      state.settings.publicBaseUrl = publicBaseUrl.endsWith("/") ? publicBaseUrl : `${publicBaseUrl}/`;
    }

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify(state));
  } catch (error) {
    fs.readFile(bundledStateFile, "utf8", (fallbackError, fallbackContent) => {
      if (fallbackError) {
        response.writeHead(204);
        response.end();
        return;
      }

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(fallbackContent);
    });
  }
}

function handleIcsApi(url, response) {
  const source = url.searchParams.get("url");
  let sourceUrl;

  try {
    sourceUrl = new URL(source);
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: false, error: "URL calendrier invalide" }));
    return;
  }

  if (!["http:", "https:"].includes(sourceUrl.protocol)) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: false, error: "URL calendrier non autorisee" }));
    return;
  }

  const client = sourceUrl.protocol === "https:" ? https : http;
  const calendarRequest = client.get(sourceUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 Villa-Romeo-Admin",
      "Accept": "text/calendar,*/*"
    }
  }, calendarResponse => {
    if (calendarResponse.statusCode >= 300 && calendarResponse.statusCode < 400 && calendarResponse.headers.location) {
      handleIcsApi(new URL(`/api/ics?url=${encodeURIComponent(new URL(calendarResponse.headers.location, sourceUrl).href)}`, `http://${displayHost}:${port}`), response);
      return;
    }

    if (calendarResponse.statusCode !== 200) {
      response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: false, error: "Calendrier indisponible" }));
      return;
    }

    let body = "";
    calendarResponse.setEncoding("utf8");
    calendarResponse.on("data", chunk => {
      body += chunk;
      if (body.length > 5_000_000) calendarRequest.destroy();
    });
    calendarResponse.on("end", () => {
      response.writeHead(200, {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "no-store"
      });
      response.end(body);
    });
  });

  calendarRequest.on("error", () => {
    if (response.headersSent) return;
    response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: false, error: "Impossible de lire le calendrier" }));
  });

  calendarRequest.setTimeout(15000, () => calendarRequest.destroy());
}

function suiteName(suites, id) {
  return (suites || []).find(s => Number(s.id) === Number(id))?.name || "Logement";
}

async function detectAndNotify(oldState, newState) {
  const suites = newState.suites || [];

  // Nouveaux messages clients (incoming = envoyés par le client depuis guest.js)
  const oldMsgIds = new Set((oldState.messages || []).map(m => String(m.id)));
  const newMsgs = (newState.messages || []).filter(m =>
    !oldMsgIds.has(String(m.id)) && m.direction === "incoming"
  );
  for (const msg of newMsgs) {
    await sendPushToAll({
      title: `💬 Message — ${suiteName(suites, msg.suiteId)}`,
      body: `${msg.guest || "Client"} : ${(msg.body || msg.subject || "Nouvelle demande").slice(0, 120)}`,
      icon: "/assets/icons/icon-192.png",
      badge: "/assets/icons/favicon-32.png",
      tag: `msg-${msg.id}`,
      url: "/",
      timestamp: Date.now()
    });
  }

  // Nouveaux petits-déjeuners
  const oldBfIds = new Set((oldState.breakfasts || []).map(b => String(b.id)));
  const newBfs = (newState.breakfasts || []).filter(b => !oldBfIds.has(String(b.id)));
  for (const bf of newBfs) {
    await sendPushToAll({
      title: `☕ Petit-déjeuner — ${suiteName(suites, bf.suiteId)}`,
      body: `${bf.people} pers. — ${bf.date} à ${bf.time}${bf.order ? " — " + bf.order.slice(0, 60) : ""}`,
      icon: "/assets/icons/icon-192.png",
      badge: "/assets/icons/favicon-32.png",
      tag: `bf-${bf.id}`,
      url: "/",
      timestamp: Date.now()
    });
  }

  // Nouvelles réservations
  const oldResIds = new Set((oldState.reservations || []).map(r => String(r.id)));
  const newRes = (newState.reservations || []).filter(r => !oldResIds.has(String(r.id)));
  for (const res of newRes) {
    await sendPushToAll({
      title: `📅 Nouvelle réservation — ${suiteName(suites, res.suiteId)}`,
      body: `${res.guest || "Client"} — ${res.arrival} → ${res.departure} (${res.guests} pers.)`,
      icon: "/assets/icons/icon-192.png",
      badge: "/assets/icons/favicon-32.png",
      tag: `res-${res.id}`,
      url: "/",
      timestamp: Date.now()
    });
  }

  // Réservations modifiées (statut changé)
  const oldResMap = new Map((oldState.reservations || []).map(r => [String(r.id), r]));
  for (const res of (newState.reservations || [])) {
    const old = oldResMap.get(String(res.id));
    if (old && old.status !== res.status) {
      await sendPushToAll({
        title: `📋 Réservation mise à jour — ${suiteName(suites, res.suiteId)}`,
        body: `${res.guest || "Client"} : ${old.status} → ${res.status}`,
        icon: "/assets/icons/icon-192.png",
        badge: "/assets/icons/favicon-32.png",
        tag: `res-update-${res.id}`,
        url: "/",
        timestamp: Date.now()
      });
    }
  }

  // Nouvelles tâches prioritaires
  const oldTaskIds = new Set((oldState.tasks || []).map(t => String(t.id)));
  const newTasks = (newState.tasks || []).filter(t => !oldTaskIds.has(String(t.id)));
  for (const task of newTasks) {
    const emoji = task.priority === "high" ? "🚨" : task.type === "housekeeping" ? "🧹" : "📌";
    await sendPushToAll({
      title: `${emoji} Tâche — ${suiteName(suites, task.suiteId)}`,
      body: `${task.title} — ${task.owner || "Non assigné"} — Échéance : ${task.due || "à définir"}`,
      icon: "/assets/icons/icon-192.png",
      badge: "/assets/icons/favicon-32.png",
      tag: `task-${task.id}`,
      url: "/",
      timestamp: Date.now()
    });
  }

  // Nouvelles inscriptions événements
  const oldEventMap = new Map((oldState.events || []).map(e => [String(e.id), new Set((e.registrations || []).map(r => String(r.id)))]));
  for (const event of (newState.events || [])) {
    const oldRegIds = oldEventMap.get(String(event.id)) || new Set();
    const newRegs = (event.registrations || []).filter(r => !oldRegIds.has(String(r.id)));
    for (const reg of newRegs) {
      await sendPushToAll({
        title: `🎉 Inscription — ${event.title}`,
        body: `${reg.guest || "Client"} — ${reg.people || 1} pers.${reg.phone ? " — " + reg.phone : ""}`,
        icon: "/assets/icons/icon-192.png",
        badge: "/assets/icons/favicon-32.png",
        tag: `event-${event.id}-reg-${reg.id}`,
        url: "/",
        timestamp: Date.now()
      });
    }
  }

  // Statuts housekeeping changés
  const oldSuiteMap = new Map((oldState.suites || []).map(s => [String(s.id), s]));
  for (const suite of (newState.suites || [])) {
    const old = oldSuiteMap.get(String(suite.id));
    if (old && old.housekeeping !== suite.housekeeping) {
      await sendPushToAll({
        title: `🏠 Housekeeping — ${suite.name}`,
        body: `Statut : ${suite.housekeeping}`,
        icon: "/assets/icons/icon-192.png",
        badge: "/assets/icons/favicon-32.png",
        tag: `hk-${suite.id}`,
        url: "/",
        timestamp: Date.now()
      });
    }
  }
}

server.listen(port, host, () => {
  console.log(`La villa Romeo Admin running at http://${displayHost}:${port}`);
  console.log(`Push notifications: ${loadSubscriptions().length} abonne(s)`);
});
