#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const rootDir = path.resolve(__dirname, "..");
const appDir = path.join(rootDir, "app");
const dataDir = path.join(__dirname, ".data");
const dataFile = path.join(dataDir, "messages.json");

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 4173);
const clients = new Set();

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".png", "image/png"],
  [".ico", "image/x-icon"]
]);

function ensureDataFile() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, "[]\n");
}

function readMessages() {
  ensureDataFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let messages = readMessages();

function saveMessages() {
  ensureDataFile();
  fs.writeFileSync(dataFile, `${JSON.stringify(messages.slice(-500), null, 2)}\n`);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(JSON.stringify(payload));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) {
        reject(new Error("payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function pushSse(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(event, payload) {
  for (const res of clients) {
    pushSse(res, event, payload);
  }
}

function normalizeMessage(input) {
  const text = String(input.text || "").trim();
  if (!text) throw new Error("empty text");
  if (text.length > 4000) throw new Error("message too long");

  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    chatId: String(input.chatId || "live"),
    text,
    authorId: String(input.authorId || "anonymous"),
    authorName: String(input.authorName || "Локальное устройство").trim().slice(0, 80),
    createdAt: now,
    receivedAt: now,
    route: "local-server"
  };
}

function serveStatic(req, res, pathname) {
  const filePath = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = path.join(appDir, safePath);

  if (!absolutePath.startsWith(appDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(absolutePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(absolutePath);
    res.writeHead(200, {
      "content-type": contentTypes.get(ext) || "application/octet-stream",
      "cache-control": ext === ".html" ? "no-store" : "no-cache"
    });
    res.end(content);
  });
}

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      name: "Mayak local realtime",
      version: "0.3",
      clients: clients.size,
      messages: messages.length
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/messages") {
    const chatId = url.searchParams.get("chatId") || "live";
    sendJson(res, 200, { messages: messages.filter((message) => message.chatId === chatId) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
      "access-control-allow-origin": "*"
    });
    clients.add(res);
    pushSse(res, "hello", { ok: true, clients: clients.size });
    pushSse(res, "snapshot", { messages: messages.filter((message) => message.chatId === "live") });
    broadcast("presence", { clients: clients.size });

    const heartbeat = setInterval(() => pushSse(res, "ping", { at: new Date().toISOString() }), 25000);
    req.on("close", () => {
      clearInterval(heartbeat);
      clients.delete(res);
      broadcast("presence", { clients: clients.size });
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/messages") {
    try {
      const payload = JSON.parse(await readRequestBody(req));
      const message = normalizeMessage(payload);
      messages.push(message);
      messages = messages.slice(-500);
      saveMessages();
      broadcast("message", message);
      sendJson(res, 201, { message });
    } catch (error) {
      sendJson(res, 400, { error: error.message || "bad request" });
    }
    return;
  }

  sendJson(res, 404, { error: "not found" });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url).catch((error) => sendJson(res, 500, { error: error.message || "server error" }));
    return;
  }
  serveStatic(req, res, decodeURIComponent(url.pathname));
});

server.listen(port, host, () => {
  console.log(`Mayak local realtime is running: http://127.0.0.1:${port}`);
  console.log("Open the same URL in two tabs and send a message in “Живой чат”.");
});
