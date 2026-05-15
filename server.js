const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const storageDir = process.env.STORAGE_DIR || path.join(root, "storage");
const stateFile = path.join(storageDir, "state.json");
const bundledStateFile = path.join(root, "storage", "state.json");
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
    let body = "";
    request.on("data", chunk => {
      body += chunk;
      if (body.length > 5_000_000) request.destroy();
    });
    request.on("end", () => {
      try {
        const parsed = JSON.parse(body || "{}");
        fs.mkdirSync(storageDir, { recursive: true });
        fs.writeFileSync(stateFile, JSON.stringify(parsed, null, 2), "utf8");
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true }));
      } catch (error) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
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

server.listen(port, host, () => {
  console.log(`La villa Romeo Admin running at http://${displayHost}:${port}`);
});
