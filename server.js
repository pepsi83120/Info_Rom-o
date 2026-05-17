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


// ─── Cache scraping Golfe Saint-Tropez ───────────────────────────────────────
let golfeEventsCache = null;
let golfeEventsCacheAt = 0;
const GOLFE_CACHE_TTL = 3 * 60 * 60 * 1000; // 3h

async function fetchGolfeEvents() {
  const now = Date.now();
  if (golfeEventsCache && now - golfeEventsCacheAt < GOLFE_CACHE_TTL) {
    return golfeEventsCache;
  }

  const url = "https://www.golfe-saint-tropez-information.com/fr/animation";
  const html = await new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VillaRomeo/1.0)",
        "Accept": "text/html,*/*",
        "Accept-Language": "fr-FR,fr;q=0.9"
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve("");
        return;
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", chunk => { body += chunk; if (body.length > 3_000_000) req.destroy(); });
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.setTimeout(15000, () => req.destroy());
  });

  if (!html) return [];

  const events = [];
  const todayStr = new Date().toISOString().slice(0, 10);

  // Regex pour extraire les blocs événements de la liste
  // Chaque événement est un lien avec image, titre, lieu, date, description
  const blockRe = /<a[^>]+href="(https:\/\/www\.golfe-saint-tropez-information\.com\/fr\/animation\/[^"]+)"[^>]*>\s*(?:<img[^>]+src="([^"]*)"[^>]*\/?>)?[^]*?<\/a>/gi;
  const cardRe = /href="(https:\/\/www\.golfe-saint-tropez-information\.com\/fr\/animation\/[^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]*)"[\s\S]*?<\/a>/gi;

  // Parser simplifié : extraire les blocs <a href="/fr/animation/...">...</a>
  const linkBlocks = [];
  let m;
  const reLink = /href="(https:\/\/www\.golfe-saint-tropez-information\.com\/fr\/animation\/[^"]+)"[\s\S]*?<\/a>/gi;
  while ((m = reLink.exec(html)) !== null && linkBlocks.length < 30) {
    linkBlocks.push({ href: m[1], block: m[0] });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const { href, block } of linkBlocks) {
    // Extraire l'image
    const imgM = block.match(/src="(https:\/\/www\.golfe-saint-tropez-information\.com\/files\/[^"]+)"/);
    const image = imgM ? imgM[1] : "";

    // Extraire le texte visible (sans balises)
    const text = block.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!text || text.length < 10) continue;

    // Extraire les dates dans le texte (formats: "Du lundi 16 au mardi 17 mai 2026", "Samedi 17 mai 2026", etc.)
    const dateRe = /(?:du|le|samedi|dimanche|lundi|mardi|mercredi|jeudi|vendredi)\s+(?:\d+\s+\w+\s+(?:au\s+\w+\s+)?)?\d+\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})/i;
    const dateM = text.match(dateRe);

    // Extraire titre (souvent le premier texte long avant une virgule ou un retour)
    const titleM = text.match(/^([^\n\r]{5,80}?)(?:\s{2,}|$)/);
    const title = titleM ? titleM[1].trim() : text.slice(0, 60);
    if (!title) continue;

    // Extraire commune (après le titre, avant la date)
    const communeM = text.match(/(?:Cavalaire|Cogolin|Gassin|Grimaud|Croix Valmer|Garde-Freinet|La Mole|Plan de la Tour|Ramatuelle|Rayol|Saint-Tropez|Sainte-Maxime)/i);
    const commune = communeM ? communeM[0] : "Golfe de Saint-Tropez";

    // Extraire heure
    const timeM = text.match(/(\d{1,2})h(\d{2})?/i);
    const time = timeM ? `${timeM[1]}h${timeM[2] || "00"}` : "";

    // Extraire année pour garder seulement 2026
    const yearM = text.match(/2026/);
    if (!yearM && dateM) continue;

    // Date approximative pour tri (utiliser date trouvée ou aujourd'hui)
    let eventDate = today;
    if (dateM) {
      const months = { janvier: 0, février: 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5, juillet: 6, aout: 7, août: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11, decembre: 11 };
      const monthNum = months[dateM[1].toLowerCase()];
      const year = parseInt(dateM[2]);
      // Chercher un jour dans le texte avant le mois
      const dayM = text.match(/(\d{1,2})\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|décembre|decembre)\s+2026/i);
      const day = dayM ? parseInt(dayM[1]) : 1;
      if (monthNum !== undefined) {
        eventDate = new Date(year, monthNum, day);
      }
    }

    // Garder seulement les événements d'aujourd'hui ou à venir
    if (eventDate < today) continue;

    // Description = texte nettoyé sans le titre
    const desc = text.replace(title, "").replace(/\s+/g, " ").trim().slice(0, 200);

    events.push({
      title: title.slice(0, 80),
      commune,
      time,
      description: desc,
      image,
      url: href,
      eventDate: eventDate.toISOString().slice(0, 10),
      isToday: eventDate.toISOString().slice(0, 10) === todayStr
    });
  }

  // Trier : aujourd'hui d'abord, puis à venir
  events.sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  // Dédupliquer par titre
  const seen = new Set();
  const unique = events.filter(e => {
    const key = e.title.slice(0, 40).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Prendre 3 événements : priorité à ceux du jour, sinon les prochains
  const todayEvents = unique.filter(e => e.isToday).slice(0, 3);
  const upcoming = unique.filter(e => !e.isToday).slice(0, 3 - todayEvents.length);
  const result = [...todayEvents, ...upcoming].slice(0, 3);

  golfeEventsCache = result;
  golfeEventsCacheAt = now;
  return result;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${displayHost}:${port}`);


  if (url.pathname === "/api/golfe-events" && request.method === "GET") {
    fetchGolfeEvents().then(events => {
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*"
      });
      response.end(JSON.stringify(events));
    }).catch(err => {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify([]));
    });
    return;
  }

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

    response.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "text/plain; charset=utf-8" });
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
