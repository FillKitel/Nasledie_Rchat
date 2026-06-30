#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { URL } = require("node:url");

const rootDir = path.resolve(__dirname, "..");
const appDir = path.join(rootDir, "app");
const dataDir = path.join(__dirname, ".data");
const dataFile = path.join(dataDir, "messages.json");

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 4173);
const clients = new Set();
const QR_VERSION = 3;
const QR_SIZE = 17 + QR_VERSION * 4;
const QR_DATA_CODEWORDS = 55;
const QR_ECC_CODEWORDS = 15;

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

function sendSvg(res, statusCode, svg) {
  res.writeHead(statusCode, {
    "content-type": "image/svg+xml; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*"
  });
  res.end(svg);
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

function localNetworkUrls(req) {
  const urls = [];
  const seen = new Set();
  const addUrl = (address) => {
    const url = `http://${address}:${port}`;
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  };

  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const item of interfaces || []) {
      if (item.family !== "IPv4" || item.internal) continue;
      if (item.address.startsWith("169.254.")) continue;
      if (item.address.startsWith("198.18.") || item.address.startsWith("198.19.")) continue;
      addUrl(item.address);
    }
  }

  const hostHeader = req.headers.host || `127.0.0.1:${port}`;
  const requestHost = hostHeader.split(":")[0];
  if (requestHost && !["127.0.0.1", "localhost", "::1"].includes(requestHost)) {
    addUrl(requestHost);
  }

  return urls;
}

function connectInfo(req) {
  const urls = localNetworkUrls(req);
  const localUrl = `http://127.0.0.1:${port}`;
  const primaryUrl = urls[0] || localUrl;

  return {
    primaryUrl,
    localUrl,
    urls: [primaryUrl, ...urls.filter((url) => url !== primaryUrl), localUrl],
    qrSvgUrl: `/api/connect.svg?url=${encodeURIComponent(primaryUrl)}`,
    hint: "Подключите телефон к той же Wi‑Fi сети, откройте камеру и наведите её на QR-код."
  };
}

function getBit(value, index) {
  return ((value >>> index) & 1) !== 0;
}

function appendBits(bits, value, length) {
  for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
}

function qrDataCodewords(text) {
  const data = Buffer.from(text, "utf8");
  if (data.length > 53) throw new Error("QR payload is too long for v0.4 demo");

  const bits = [];
  appendBits(bits, 0x4, 4);
  appendBits(bits, data.length, 8);
  for (const byte of data) appendBits(bits, byte, 8);

  const capacityBits = QR_DATA_CODEWORDS * 8;
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    codewords.push(Number.parseInt(bits.slice(i, i + 8).join(""), 2));
  }
  for (let pad = 0; codewords.length < QR_DATA_CODEWORDS; pad ^= 1) {
    codewords.push(pad ? 0x11 : 0xec);
  }
  return codewords;
}

const gfExp = new Array(512);
const gfLog = new Array(256);
for (let value = 1, i = 0; i < 255; i++) {
  gfExp[i] = value;
  gfLog[value] = i;
  value <<= 1;
  if (value & 0x100) value ^= 0x11d;
}
for (let i = 255; i < 512; i++) gfExp[i] = gfExp[i - 255];

function rsMultiply(x, y) {
  if (x === 0 || y === 0) return 0;
  return gfExp[gfLog[x] + gfLog[y]];
}

function rsDivisor(degree) {
  const result = Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = rsMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = rsMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data, divisor) {
  const result = Array(divisor.length).fill(0);
  for (const byte of data) {
    const factor = byte ^ result.shift();
    result.push(0);
    for (let i = 0; i < result.length; i++) {
      result[i] ^= rsMultiply(divisor[i], factor);
    }
  }
  return result;
}

function qrFormatBits() {
  const errorCorrectionLevelL = 1;
  const mask = 0;
  const data = (errorCorrectionLevelL << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i++) {
    remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) * 0x537);
  }
  return ((data << 10) | remainder) ^ 0x5412;
}

function makeQrSvg(text) {
  const modules = Array.from({ length: QR_SIZE }, () => Array(QR_SIZE).fill(false));
  const reserved = Array.from({ length: QR_SIZE }, () => Array(QR_SIZE).fill(false));

  const setFunction = (x, y, dark) => {
    if (x < 0 || y < 0 || x >= QR_SIZE || y >= QR_SIZE) return;
    modules[y][x] = dark;
    reserved[y][x] = true;
  };

  const drawFinder = (x, y) => {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        const inFinder = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
        const dark = inFinder && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
        setFunction(xx, yy, dark);
      }
    }
  };

  const drawAlignment = (cx, cy) => {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) === 2 || (dx === 0 && dy === 0));
      }
    }
  };

  const drawFormat = (bits) => {
    for (let i = 0; i <= 5; i++) setFunction(8, i, getBit(bits, i));
    setFunction(8, 7, getBit(bits, 6));
    setFunction(8, 8, getBit(bits, 7));
    setFunction(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) setFunction(14 - i, 8, getBit(bits, i));
    for (let i = 0; i < 8; i++) setFunction(QR_SIZE - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) setFunction(8, QR_SIZE - 15 + i, getBit(bits, i));
    setFunction(8, QR_SIZE - 8, true);
  };

  drawFinder(0, 0);
  drawFinder(QR_SIZE - 7, 0);
  drawFinder(0, QR_SIZE - 7);
  drawAlignment(22, 22);
  for (let i = 8; i < QR_SIZE - 8; i++) {
    const dark = i % 2 === 0;
    setFunction(6, i, dark);
    setFunction(i, 6, dark);
  }
  drawFormat(0);

  const data = qrDataCodewords(text);
  const ecc = rsRemainder(data, rsDivisor(QR_ECC_CODEWORDS));
  const codewords = [...data, ...ecc];
  const bits = codewords.flatMap((byte) => Array.from({ length: 8 }, (_, i) => (byte >>> (7 - i)) & 1));

  let bitIndex = 0;
  for (let right = QR_SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = Math.floor((QR_SIZE - 1 - right) / 2) % 2 === 0;
    for (let vert = 0; vert < QR_SIZE; vert++) {
      const y = upward ? QR_SIZE - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        if (reserved[y][x]) continue;
        const bit = bitIndex < bits.length ? bits[bitIndex++] === 1 : false;
        const masked = bit !== ((x + y) % 2 === 0);
        modules[y][x] = masked;
      }
    }
  }
  drawFormat(qrFormatBits());

  const quiet = 4;
  const viewSize = QR_SIZE + quiet * 2;
  const rects = [];
  for (let y = 0; y < QR_SIZE; y++) {
    for (let x = 0; x < QR_SIZE; x++) {
      if (modules[y][x]) rects.push(`<rect x="${x + quiet}" y="${y + quiet}" width="1" height="1"/>`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="crispEdges" role="img" aria-label="QR-код подключения к Маяку"><rect width="${viewSize}" height="${viewSize}" fill="#fff"/><g fill="#111827">${rects.join("")}</g></svg>`;
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
      version: "0.4",
      clients: clients.size,
      messages: messages.length
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/connect") {
    sendJson(res, 200, connectInfo(req));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/connect.svg") {
    const info = connectInfo(req);
    const target = url.searchParams.get("url") || info.primaryUrl;
    sendSvg(res, 200, makeQrSvg(target));
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
  const urls = localNetworkUrls({ headers: {} });
  if (urls[0]) console.log(`Phone LAN URL: ${urls[0]}`);
  console.log("Open the URL in two tabs/devices and send a message in “Живой чат”.");
});
