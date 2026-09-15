#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { URL } = require("node:url");

const rootDir = path.resolve(__dirname, "..");
const appDir = path.join(rootDir, "app");
const dataDir = process.env.MAYAK_DATA_DIR
  ? path.resolve(process.env.MAYAK_DATA_DIR)
  : path.join(__dirname, ".data");
const legacyDataFile = path.join(dataDir, "messages.json");
const databaseFile = process.env.MAYAK_DB_PATH
  ? path.resolve(process.env.MAYAK_DB_PATH)
  : path.join(dataDir, "mayak.sqlite");

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 4173);
const clients = new Map();
const SESSION_COOKIE = "mayak_session";
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const AVATAR_MAX_BYTES = 512 * 1024;
const AVATAR_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
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

class ApiError extends Error {
  constructor(statusCode, message, code = "request_failed") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function safeText(value, fallback = "", limit = 80) {
  const text = String(value || fallback).trim();
  return text.slice(0, limit);
}

function normalizeHandle(value) {
  return safeText(value, "", 40)
    .replace(/^@+/, "")
    .toLocaleLowerCase("ru")
    .replace(/\s+/g, "_")
    .replace(/[^a-zа-яё0-9_]/giu, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

function normalizeBio(value) {
  return String(value ?? "").trim().slice(0, 280);
}

function publicUser(row) {
  const avatarVersion = row.avatar_updated_at
    ? `?v=${encodeURIComponent(row.avatar_updated_at)}`
    : "";
  return {
    id: row.id,
    name: row.display_name,
    handle: `@${row.handle}`,
    bio: row.bio || "",
    avatarUrl: row.avatar_mime ? `/api/users/${encodeURIComponent(row.id)}/avatar${avatarVersion}` : "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

fs.mkdirSync(dataDir, { recursive: true });
const database = new DatabaseSync(databaseFile);
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    handle TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    avatar_mime TEXT NOT NULL DEFAULT '',
    avatar_blob BLOB,
    avatar_updated_at TEXT NOT NULL DEFAULT '',
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    device_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK(kind IN ('room', 'direct')),
    title TEXT NOT NULL DEFAULT '',
    direct_key TEXT UNIQUE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT NOT NULL,
    cleared_before_rowid INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (conversation_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS conversation_members_user_idx ON conversation_members(user_id);

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    author_id_snapshot TEXT NOT NULL DEFAULT '',
    author_name TEXT NOT NULL,
    author_handle TEXT NOT NULL DEFAULT '',
    device_id TEXT NOT NULL DEFAULT '',
    device_name TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    received_at TEXT NOT NULL,
    route TEXT NOT NULL DEFAULT 'local-server'
  );
  CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
    ON messages(conversation_id, created_at);
`);

function migrateUserProfiles() {
  const columns = new Set(database.prepare("PRAGMA table_info(users)").all().map((column) => column.name));
  const additions = [
    ["bio", "TEXT NOT NULL DEFAULT ''"],
    ["avatar_mime", "TEXT NOT NULL DEFAULT ''"],
    ["avatar_blob", "BLOB"],
    ["avatar_updated_at", "TEXT NOT NULL DEFAULT ''"]
  ];
  for (const [name, definition] of additions) {
    if (!columns.has(name)) database.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
  }
}

migrateUserProfiles();

function migrateConversationMembers() {
  const columns = new Set(database.prepare("PRAGMA table_info(conversation_members)").all().map((column) => column.name));
  if (!columns.has("cleared_before_rowid")) {
    database.exec("ALTER TABLE conversation_members ADD COLUMN cleared_before_rowid INTEGER NOT NULL DEFAULT 0");
  }
}

migrateConversationMembers();

database.prepare(`
  INSERT OR IGNORE INTO conversations (id, kind, title, created_at)
  VALUES ('live', 'room', 'Локальная комната', ?)
`).run(nowIso());

function migrateLegacyMessages() {
  const marker = database.prepare("SELECT value FROM metadata WHERE key = ?").get("legacy_messages_v07");
  if (marker || !fs.existsSync(legacyDataFile)) return;

  let legacyMessages = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(legacyDataFile, "utf8"));
    if (Array.isArray(parsed)) legacyMessages = parsed;
  } catch {}

  const insert = database.prepare(`
    INSERT OR IGNORE INTO messages (
      id, conversation_id, sender_id, author_id_snapshot, author_name,
      author_handle, device_id, device_name, text, created_at, received_at, route
    ) VALUES (?, 'live', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  database.exec("BEGIN");
  try {
    for (const message of legacyMessages) {
      if (message?.chatId && message.chatId !== "live") continue;
      const text = safeText(message?.text, "", 4000);
      if (!text) continue;
      const createdAt = message.createdAt || nowIso();
      insert.run(
        safeText(message.id, crypto.randomUUID(), 120),
        safeText(message.authorId, "legacy", 120),
        safeText(message.authorName, "Локальное устройство", 80),
        safeText(message.authorHandle, "", 80),
        safeText(message.deviceId, "", 120),
        safeText(message.deviceName, "", 80),
        text,
        createdAt,
        message.receivedAt || createdAt,
        safeText(message.route, "local-server", 40)
      );
    }
    database.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)").run("legacy_messages_v07", nowIso());
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

migrateLegacyMessages();

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    ...extraHeaders
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

function sendBinary(res, statusCode, content, contentType, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "content-type": contentType,
    "content-length": content.length,
    "cache-control": "private, max-age=86400",
    ...extraHeaders
  });
  res.end(content);
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

async function readJsonBody(req) {
  try {
    const body = await readRequestBody(req);
    return body ? JSON.parse(body) : {};
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "Некорректный JSON", "invalid_json");
  }
}

function readBinaryBody(req, limit = AVATAR_MAX_BYTES) {
  return new Promise((resolve, reject) => {
    const declaredLength = Number(req.headers["content-length"] || 0);
    if (declaredLength > limit) {
      reject(new ApiError(413, "Файл аватара слишком большой", "avatar_too_large"));
      req.resume();
      return;
    }
    const chunks = [];
    let total = 0;
    let settled = false;
    req.on("data", (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > limit) {
        settled = true;
        reject(new ApiError(413, "Файл аватара слишком большой", "avatar_too_large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
    req.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function pushSse(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(event, payload) {
  for (const res of clients.keys()) {
    pushSse(res, event, payload);
  }
}

function broadcastConversationEvent(conversationId, event, payload) {
  for (const [res, participant] of clients.entries()) {
    if (isConversationMember(participant.userId, conversationId)) {
      pushSse(res, event, payload);
    }
  }
}

function broadcastUserEvent(userId, event, payload) {
  for (const [res, participant] of clients.entries()) {
    if (participant.userId === userId) pushSse(res, event, payload);
  }
}

function broadcastMessage(message) {
  broadcastConversationEvent(message.chatId, "message", message);
}

function participantFromSession(url, auth) {
  const connectedAt = nowIso();
  const clientId = safeText(url.searchParams.get("clientId"), crypto.randomUUID(), 120);

  return {
    sessionId: crypto.randomUUID(),
    clientId,
    userId: auth.user.id,
    deviceId: auth.session.device_id,
    profileId: auth.user.id,
    name: auth.user.display_name,
    handle: `@${auth.user.handle}`,
    bio: auth.user.bio || "",
    avatarUrl: publicUser(auth.user).avatarUrl,
    deviceName: auth.session.device_name,
    connectedAt,
    lastSeenAt: connectedAt
  };
}

function participantList() {
  const grouped = new Map();
  for (const participant of clients.values()) {
    const key = participant.deviceId || participant.clientId || participant.sessionId;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        id: key,
        profileId: participant.profileId,
        name: participant.name,
        handle: participant.handle,
        bio: participant.bio,
        avatarUrl: participant.avatarUrl,
        deviceName: participant.deviceName,
        connectedAt: participant.connectedAt,
        lastSeenAt: participant.lastSeenAt,
        connections: 1
      });
      continue;
    }
    existing.connections += 1;
    if (participant.lastSeenAt > existing.lastSeenAt) existing.lastSeenAt = participant.lastSeenAt;
    if (participant.connectedAt < existing.connectedAt) existing.connectedAt = participant.connectedAt;
  }
  return [...grouped.values()].sort((a, b) => a.connectedAt.localeCompare(b.connectedAt));
}

function presencePayload() {
  const participants = participantList();
  return {
    clients: clients.size,
    devices: participants.length,
    participants
  };
}

function broadcastPresence() {
  broadcast("presence", presencePayload());
}

function normalizeMessage(input, auth) {
  const text = String(input.text || "").trim();
  if (!text) throw new ApiError(400, "Введите сообщение", "empty_message");
  if (text.length > 4000) throw new ApiError(400, "Сообщение слишком длинное", "message_too_long");

  const createdAt = nowIso();
  return {
    id: crypto.randomUUID(),
    chatId: safeText(input.chatId, "live", 120),
    text,
    authorId: auth.user.id,
    authorName: auth.user.display_name,
    authorHandle: `@${auth.user.handle}`,
    deviceId: auth.session.device_id,
    deviceName: auth.session.device_name,
    createdAt,
    receivedAt: createdAt,
    route: "local-server"
  };
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function passwordRecord(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function passwordMatches(password, user) {
  const expected = Buffer.from(user.password_hash, "hex");
  const actual = Buffer.from(passwordRecord(password, user.password_salt).hash, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function parseCookies(req) {
  const cookies = new Map();
  for (const part of String(req.headers.cookie || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      cookies.set(key, decodeURIComponent(value));
    } catch {
      cookies.set(key, value);
    }
  }
  return cookies;
}

function requestToken(req) {
  const authorization = safeText(req.headers.authorization, "", 300);
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  return bearer || parseCookies(req).get(SESSION_COOKIE) || "";
}

function authFromRequest(req) {
  const token = requestToken(req);
  if (!token) return null;
  const currentTime = nowIso();
  const row = database.prepare(`
    SELECT
      u.id AS user_id, u.handle, u.display_name, u.created_at AS user_created_at,
      u.updated_at AS user_updated_at, u.bio, u.avatar_mime, u.avatar_updated_at,
      s.id AS session_id, s.device_id,
      s.device_name, s.created_at AS session_created_at, s.expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(hashToken(token), currentTime);
  if (!row) return null;
  database.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(currentTime, row.session_id);
  return {
    token,
    user: {
      id: row.user_id,
      handle: row.handle,
      display_name: row.display_name,
      bio: row.bio,
      avatar_mime: row.avatar_mime,
      avatar_updated_at: row.avatar_updated_at,
      created_at: row.user_created_at,
      updated_at: row.user_updated_at
    },
    session: {
      id: row.session_id,
      device_id: row.device_id,
      device_name: row.device_name,
      created_at: row.session_created_at,
      expires_at: row.expires_at
    }
  };
}

function requireAuth(req) {
  const auth = authFromRequest(req);
  if (!auth) throw new ApiError(401, "Войдите в аккаунт", "authentication_required");
  return auth;
}

function sessionCookie(req, token, maxAge = Math.floor(SESSION_LIFETIME_MS / 1000)) {
  const forwardedProtocol = safeText(req.headers["x-forwarded-proto"], "", 20);
  const secure = req.socket.encrypted || forwardedProtocol === "https" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
}

function createSession(userId, input = {}) {
  const token = crypto.randomBytes(32).toString("base64url");
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS).toISOString();
  const session = {
    id: crypto.randomUUID(),
    deviceId: safeText(input.deviceId, `device-${crypto.randomUUID()}`, 120),
    deviceName: safeText(input.deviceName, "Устройство Маяка", 80),
    createdAt,
    expiresAt
  };
  database.prepare(`
    INSERT INTO sessions (
      id, token_hash, user_id, device_id, device_name, created_at, last_seen_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    session.id,
    hashToken(token),
    userId,
    session.deviceId,
    session.deviceName,
    createdAt,
    createdAt,
    expiresAt
  );
  return { token, session };
}

function validateAccountInput(input, { requirePassword = true } = {}) {
  const name = safeText(input.name, "", 60).replace(/\s+/g, " ");
  const handle = normalizeHandle(input.handle);
  const password = String(input.password || "");
  const bio = normalizeBio(input.bio);
  if (name.length < 2) throw new ApiError(400, "Введите имя", "invalid_name");
  if (!/^[a-zа-яё0-9_]{3,32}$/iu.test(handle)) {
    throw new ApiError(400, "Username: от 3 до 32 букв, цифр или _", "invalid_handle");
  }
  if (requirePassword && (password.length < 8 || password.length > 128)) {
    throw new ApiError(400, "Пароль должен содержать не менее 8 символов", "invalid_password");
  }
  return { name, handle, password, bio };
}

function ensureLiveMembership(userId) {
  database.prepare(`
    INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, joined_at)
    VALUES ('live', ?, 'member', ?)
  `).run(userId, nowIso());
}

function isConversationMember(userId, conversationId) {
  return Boolean(database.prepare(`
    SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?
  `).get(conversationId, userId));
}

function requireConversationMember(auth, conversationId) {
  if (conversationId === "live") ensureLiveMembership(auth.user.id);
  if (!isConversationMember(auth.user.id, conversationId)) {
    throw new ApiError(403, "Нет доступа к этому диалогу", "conversation_forbidden");
  }
}

function messageFromRow(row) {
  return {
    id: row.id,
    chatId: row.conversation_id,
    text: row.text,
    authorId: row.sender_id || row.author_id_snapshot,
    authorName: row.author_name,
    authorHandle: row.author_handle,
    deviceId: row.device_id,
    deviceName: row.device_name,
    createdAt: row.created_at,
    receivedAt: row.received_at,
    route: row.route
  };
}

function conversationClearCutoff(userId, conversationId) {
  const membership = database.prepare(`
    SELECT cleared_before_rowid FROM conversation_members
    WHERE conversation_id = ? AND user_id = ?
  `).get(conversationId, userId);
  return Number(membership?.cleared_before_rowid || 0);
}

function conversationMessages(conversationId, userId) {
  const clearedBeforeRowid = conversationClearCutoff(userId, conversationId);
  const rows = database.prepare(`
    SELECT * FROM (
      SELECT * FROM messages
      WHERE conversation_id = ? AND rowid > ?
      ORDER BY created_at DESC LIMIT 500
    ) ORDER BY created_at ASC
  `).all(conversationId, clearedBeforeRowid);
  return rows.map(messageFromRow);
}

function insertMessage(message) {
  database.prepare(`
    INSERT INTO messages (
      id, conversation_id, sender_id, author_id_snapshot, author_name,
      author_handle, device_id, device_name, text, created_at, received_at, route
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    message.id,
    message.chatId,
    message.authorId,
    message.authorId,
    message.authorName,
    message.authorHandle,
    message.deviceId,
    message.deviceName,
    message.text,
    message.createdAt,
    message.receivedAt,
    message.route
  );
}

function conversationForUser(row, userId) {
  let peer = null;
  if (row.kind === "direct") {
    const peerRow = database.prepare(`
      SELECT u.* FROM conversation_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.conversation_id = ? AND cm.user_id != ?
      LIMIT 1
    `).get(row.id, userId);
    if (peerRow) peer = publicUser(peerRow);
  }
  const clearedBeforeRowid = Number(
    row.cleared_before_rowid ?? conversationClearCutoff(userId, row.id)
  );
  const lastMessage = database.prepare(`
    SELECT * FROM messages
    WHERE conversation_id = ? AND rowid > ?
    ORDER BY created_at DESC LIMIT 1
  `).get(row.id, clearedBeforeRowid);
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    peer,
    createdAt: row.created_at,
    lastMessage: lastMessage ? messageFromRow(lastMessage) : null
  };
}

function userConversations(userId) {
  const rows = database.prepare(`
    SELECT c.*, cm.cleared_before_rowid FROM conversations c
    JOIN conversation_members cm ON cm.conversation_id = c.id
    WHERE cm.user_id = ?
    ORDER BY COALESCE(
      (SELECT MAX(m.created_at) FROM messages m
       WHERE m.conversation_id = c.id AND m.rowid > cm.cleared_before_rowid),
      c.created_at
    ) DESC
  `).all(userId);
  return rows.map((row) => conversationForUser(row, userId));
}

function createDirectConversation(userId, peerUserId) {
  if (!peerUserId || peerUserId === userId) {
    throw new ApiError(400, "Нельзя создать диалог с самим собой", "invalid_peer");
  }
  const peer = database.prepare("SELECT * FROM users WHERE id = ?").get(peerUserId);
  if (!peer) throw new ApiError(404, "Пользователь не найден", "user_not_found");

  const directKey = [userId, peerUserId].sort().join(":");
  const conversationId = `dm-${crypto.createHash("sha256").update(directKey).digest("hex").slice(0, 24)}`;
  const createdAt = nowIso();
  database.exec("BEGIN");
  try {
    database.prepare(`
      INSERT OR IGNORE INTO conversations (id, kind, title, direct_key, created_by, created_at)
      VALUES (?, 'direct', '', ?, ?, ?)
    `).run(conversationId, directKey, userId, createdAt);
    const addMember = database.prepare(`
      INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, joined_at)
      VALUES (?, ?, 'member', ?)
    `);
    addMember.run(conversationId, userId, createdAt);
    addMember.run(conversationId, peerUserId, createdAt);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  const row = database.prepare("SELECT * FROM conversations WHERE id = ?").get(conversationId);
  return conversationForUser(row, userId);
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
  if (data.length > 53) throw new Error("QR payload is too long for v0.6 demo");

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
    const messageCount = database.prepare("SELECT COUNT(*) AS count FROM messages").get().count;
    const accountCount = database.prepare("SELECT COUNT(*) AS count FROM users").get().count;
    sendJson(res, 200, {
      ok: true,
      name: "Mayak local realtime",
      version: "0.8",
      auth: "sessions",
      clients: clients.size,
      devices: participantList().length,
      accounts: accountCount,
      messages: messageCount
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

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const payload = await readJsonBody(req);
    const input = validateAccountInput(payload);
    const existing = database.prepare("SELECT id FROM users WHERE handle = ?").get(input.handle);
    if (existing) throw new ApiError(409, "Этот username уже занят", "handle_taken");

    const createdAt = nowIso();
    const userId = `user-${crypto.randomUUID()}`;
    const password = passwordRecord(input.password);
    database.prepare(`
      INSERT INTO users (
        id, handle, display_name, bio, password_salt, password_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, input.handle, input.name, input.bio, password.salt, password.hash, createdAt, createdAt);
    ensureLiveMembership(userId);
    const user = database.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    const createdSession = createSession(userId, payload);
    sendJson(res, 201, {
      user: publicUser(user),
      session: createdSession.session,
      sessionToken: createdSession.token
    }, { "set-cookie": sessionCookie(req, createdSession.token) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const payload = await readJsonBody(req);
    const handle = normalizeHandle(payload.handle);
    const password = String(payload.password || "");
    const user = database.prepare("SELECT * FROM users WHERE handle = ?").get(handle);
    if (!user || !passwordMatches(password, user)) {
      throw new ApiError(401, "Неверный username или пароль", "invalid_credentials");
    }
    ensureLiveMembership(user.id);
    const createdSession = createSession(user.id, payload);
    sendJson(res, 200, {
      user: publicUser(user),
      session: createdSession.session,
      sessionToken: createdSession.token
    }, { "set-cookie": sessionCookie(req, createdSession.token) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    const auth = requireAuth(req);
    sendJson(res, 200, {
      user: publicUser(auth.user),
      session: {
        id: auth.session.id,
        deviceId: auth.session.device_id,
        deviceName: auth.session.device_name,
        createdAt: auth.session.created_at,
        expiresAt: auth.session.expires_at
      }
    });
    return;
  }

  if (req.method === "PATCH" && url.pathname === "/api/auth/me") {
    const auth = requireAuth(req);
    const payload = await readJsonBody(req);
    const name = safeText(payload.name, auth.user.display_name, 60).replace(/\s+/g, " ");
    const bio = Object.prototype.hasOwnProperty.call(payload, "bio")
      ? normalizeBio(payload.bio)
      : auth.user.bio;
    const deviceName = safeText(payload.deviceName, auth.session.device_name, 80);
    if (name.length < 2) throw new ApiError(400, "Введите имя", "invalid_name");
    const updatedAt = nowIso();
    database.prepare("UPDATE users SET display_name = ?, bio = ?, updated_at = ? WHERE id = ?")
      .run(name, bio, updatedAt, auth.user.id);
    database.prepare("UPDATE sessions SET device_name = ?, last_seen_at = ? WHERE id = ?")
      .run(deviceName, updatedAt, auth.session.id);
    const user = database.prepare("SELECT * FROM users WHERE id = ?").get(auth.user.id);
    sendJson(res, 200, {
      user: publicUser(user),
      session: {
        id: auth.session.id,
        deviceId: auth.session.device_id,
        deviceName,
        createdAt: auth.session.created_at,
        expiresAt: auth.session.expires_at
      }
    });
    broadcastPresence();
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/auth/avatar") {
    const auth = requireAuth(req);
    const contentType = String(req.headers["content-type"] || "").split(";", 1)[0].toLowerCase();
    if (!AVATAR_CONTENT_TYPES.has(contentType)) {
      throw new ApiError(415, "Поддерживаются JPEG, PNG и WebP", "unsupported_avatar_type");
    }
    const avatar = await readBinaryBody(req);
    if (!avatar.length) throw new ApiError(400, "Выберите изображение", "empty_avatar");
    const updatedAt = nowIso();
    database.prepare(`
      UPDATE users
      SET avatar_mime = ?, avatar_blob = ?, avatar_updated_at = ?, updated_at = ?
      WHERE id = ?
    `).run(contentType, avatar, updatedAt, updatedAt, auth.user.id);
    const user = database.prepare("SELECT * FROM users WHERE id = ?").get(auth.user.id);
    sendJson(res, 200, { user: publicUser(user) });
    broadcastPresence();
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/auth/avatar") {
    const auth = requireAuth(req);
    const updatedAt = nowIso();
    database.prepare(`
      UPDATE users
      SET avatar_mime = '', avatar_blob = NULL, avatar_updated_at = '', updated_at = ?
      WHERE id = ?
    `).run(updatedAt, auth.user.id);
    const user = database.prepare("SELECT * FROM users WHERE id = ?").get(auth.user.id);
    sendJson(res, 200, { user: publicUser(user) });
    broadcastPresence();
    return;
  }

  const avatarMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/avatar$/);
  if (req.method === "GET" && avatarMatch) {
    requireAuth(req);
    let userId;
    try {
      userId = decodeURIComponent(avatarMatch[1]);
    } catch {
      throw new ApiError(400, "Некорректный ID пользователя", "invalid_user_id");
    }
    const avatar = database.prepare(`
      SELECT avatar_mime, avatar_blob, avatar_updated_at FROM users WHERE id = ?
    `).get(userId);
    if (!avatar?.avatar_blob || !avatar.avatar_mime) {
      throw new ApiError(404, "Аватар не найден", "avatar_not_found");
    }
    sendBinary(res, 200, avatar.avatar_blob, avatar.avatar_mime, {
      etag: `"${crypto.createHash("sha256").update(avatar.avatar_blob).digest("hex").slice(0, 24)}"`
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = requestToken(req);
    if (token) database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
    sendJson(res, 200, { ok: true }, { "set-cookie": sessionCookie(req, "", 0) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/users") {
    const auth = requireAuth(req);
    const query = normalizeHandle(url.searchParams.get("query"));
    if (query.length < 2) {
      sendJson(res, 200, { users: [] });
      return;
    }
    const users = database.prepare(`
      SELECT * FROM users
      WHERE id != ? AND (handle LIKE ? OR display_name LIKE ?)
      ORDER BY handle ASC LIMIT 20
    `).all(auth.user.id, `%${query}%`, `%${safeText(url.searchParams.get("query"), "", 60)}%`);
    sendJson(res, 200, { users: users.map(publicUser) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/conversations") {
    const auth = requireAuth(req);
    ensureLiveMembership(auth.user.id);
    sendJson(res, 200, { conversations: userConversations(auth.user.id) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/conversations/direct") {
    const auth = requireAuth(req);
    const payload = await readJsonBody(req);
    const conversation = createDirectConversation(auth.user.id, safeText(payload.peerUserId, "", 120));
    sendJson(res, 201, { conversation });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/messages") {
    const auth = requireAuth(req);
    const chatId = url.searchParams.get("chatId") || "live";
    requireConversationMember(auth, chatId);
    sendJson(res, 200, { messages: conversationMessages(chatId, auth.user.id) });
    return;
  }

  const clearConversationMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
  if (req.method === "DELETE" && clearConversationMatch) {
    const auth = requireAuth(req);
    let chatId;
    try {
      chatId = decodeURIComponent(clearConversationMatch[1]);
    } catch {
      throw new ApiError(400, "Некорректный ID диалога", "invalid_conversation_id");
    }
    requireConversationMember(auth, chatId);
    const latest = database.prepare(`
      SELECT COALESCE(MAX(rowid), 0) AS rowid FROM messages WHERE conversation_id = ?
    `).get(chatId);
    database.prepare(`
      UPDATE conversation_members
      SET cleared_before_rowid = MAX(cleared_before_rowid, ?)
      WHERE conversation_id = ? AND user_id = ?
    `).run(Number(latest.rowid || 0), chatId, auth.user.id);
    const cleared = { chatId, clearedBy: auth.user.id, clearedAt: nowIso() };
    broadcastUserEvent(auth.user.id, "chat_cleared", cleared);
    sendJson(res, 200, { ok: true, cleared });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/presence") {
    requireAuth(req);
    sendJson(res, 200, presencePayload());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    const auth = requireAuth(req);
    ensureLiveMembership(auth.user.id);
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive"
    });
    const participant = participantFromSession(url, auth);
    clients.set(res, participant);
    pushSse(res, "hello", { ok: true, participant, ...presencePayload() });
    pushSse(res, "snapshot", { messages: conversationMessages("live", auth.user.id) });
    broadcastPresence();

    const heartbeat = setInterval(() => {
      const record = clients.get(res);
      if (record) record.lastSeenAt = new Date().toISOString();
      pushSse(res, "ping", { at: new Date().toISOString() });
    }, 25000);
    req.on("close", () => {
      clearInterval(heartbeat);
      clients.delete(res);
      broadcastPresence();
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/messages") {
    const auth = requireAuth(req);
    const payload = await readJsonBody(req);
    const message = normalizeMessage(payload, auth);
    requireConversationMember(auth, message.chatId);
    insertMessage(message);
    broadcastMessage(message);
    sendJson(res, 201, { message });
    return;
  }

  const messageMatch = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
  if (req.method === "DELETE" && messageMatch) {
    const auth = requireAuth(req);
    let messageId;
    try {
      messageId = decodeURIComponent(messageMatch[1]);
    } catch {
      throw new ApiError(400, "Некорректный ID сообщения", "invalid_message_id");
    }
    const row = database.prepare("SELECT * FROM messages WHERE id = ?").get(messageId);
    if (!row) throw new ApiError(404, "Сообщение не найдено", "message_not_found");
    requireConversationMember(auth, row.conversation_id);
    if (row.sender_id !== auth.user.id) {
      throw new ApiError(403, "Можно удалять только свои сообщения", "message_delete_forbidden");
    }
    database.prepare("DELETE FROM messages WHERE id = ?").run(messageId);
    const deleted = {
      messageId,
      chatId: row.conversation_id,
      deletedBy: auth.user.id,
      deletedAt: nowIso()
    };
    broadcastConversationEvent(row.conversation_id, "message_deleted", deleted);
    sendJson(res, 200, { ok: true, deleted });
    return;
  }

  sendJson(res, 404, { error: "not found" });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url).catch((error) => {
      const statusCode = error instanceof ApiError ? error.statusCode : 500;
      const message = error instanceof ApiError ? error.message : "Внутренняя ошибка сервера";
      const code = error instanceof ApiError ? error.code : "server_error";
      if (!res.headersSent) sendJson(res, statusCode, { error: message, code });
      if (!(error instanceof ApiError)) console.error(error);
    });
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
