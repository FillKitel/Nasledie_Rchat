#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { openDatabase } = require("./database");
const username = require("../app/username");
const {
  ApiError,
  loadConfig,
  RateLimiter,
  clientAddress,
  secureHeaders,
  checkRequest,
  checkInvite,
} = require("./security");
const { promisify } = require("node:util");
const QRCode = require("qrcode");
const scrypt = promisify(crypto.scrypt);

async function main() {
  const config = loadConfig();
  const limiter = new RateLimiter();
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
  const AVATAR_CONTENT_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

  const contentTypes = new Map([
    [".html", "text/html; charset=utf-8"],
    [".css", "text/css; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
    [".json", "application/json; charset=utf-8"],
    [".svg", "image/svg+xml; charset=utf-8"],
    [".webmanifest", "application/manifest+json; charset=utf-8"],
    [".png", "image/png"],
    [".ico", "image/x-icon"],
  ]);

  function nowIso() {
    return new Date().toISOString();
  }

  function safeText(value, fallback = "", limit = 80) {
    const text = String(value || fallback).trim();
    return text.slice(0, limit);
  }

  function normalizeHandle(value) {
    return username.normalize(value);
  }

  function normalizeBio(value) {
    return String(value ?? "")
      .trim()
      .slice(0, 280);
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
      avatarUrl: row.avatar_mime
        ? `/api/users/${encodeURIComponent(row.id)}/avatar${avatarVersion}`
        : "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  const database = await openDatabase({ file: databaseFile });

  await database
    .prepare(
      `
  INSERT OR IGNORE INTO conversations (id, kind, title, created_at)
  VALUES ('live', 'room', 'Локальная комната', ?)
`,
    )
    .run(nowIso());

  async function migrateLegacyMessages() {
    const marker = await database
      .prepare("SELECT value FROM metadata WHERE key = ?")
      .get("legacy_messages_v07");
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

    await database.transaction(async () => {
      for (const message of legacyMessages) {
        if (message?.chatId && message.chatId !== "live") continue;
        const text = safeText(message?.text, "", 4000);
        if (!text) continue;
        const createdAt = message.createdAt || nowIso();
        await insert.run(
          safeText(message.id, crypto.randomUUID(), 120),
          safeText(message.authorId, "legacy", 120),
          safeText(message.authorName, "Локальное устройство", 80),
          safeText(message.authorHandle, "", 80),
          safeText(message.deviceId, "", 120),
          safeText(message.deviceName, "", 80),
          text,
          createdAt,
          message.receivedAt || createdAt,
          safeText(message.route, "local-server", 40),
        );
      }
      await database
        .prepare("INSERT INTO metadata (key, value) VALUES (?, ?)")
        .run("legacy_messages_v07", nowIso());
    });
  }

  if (!config.cloud) await migrateLegacyMessages();

  function sendJson(res, statusCode, payload, extraHeaders = {}) {
    res.writeHead(statusCode, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    });
    res.end(JSON.stringify(payload));
  }

  function sendSvg(res, statusCode, svg) {
    res.writeHead(statusCode, {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(svg);
  }

  function sendBinary(
    res,
    statusCode,
    content,
    contentType,
    extraHeaders = {},
  ) {
    res.writeHead(statusCode, {
      "content-type": contentType,
      "content-length": content.length,
      "cache-control": "no-store",
      ...extraHeaders,
    });
    res.end(content);
  }

  async function readJsonBody(req) {
    try {
      const body = (await readBinaryBody(req, 64 * 1024)).toString("utf8");
      const value = body ? JSON.parse(body) : {};
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Expected an object");
      return value;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(400, "Некорректный JSON", "invalid_json");
    }
  }

  function readBinaryBody(req, limit = AVATAR_MAX_BYTES) {
    return new Promise((resolve, reject) => {
      const declaredLength = Number(req.headers["content-length"] || 0);
      if (declaredLength > limit) {
        reject(
          new ApiError(413, "Файл аватара слишком большой", "avatar_too_large"),
        );
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
          reject(
            new ApiError(
              413,
              "Файл аватара слишком большой",
              "avatar_too_large",
            ),
          );
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
    if (res.destroyed || res.writableEnded) return;
    const participant = clients.get(res);
    if (participant && Date.parse(participant.expiresAt) <= Date.now()) {
      res.end();
      return;
    }
    if (res.writableLength > 256 * 1024) {
      res.destroy();
      return;
    }
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  function broadcast(event, payload) {
    for (const res of clients.keys()) {
      pushSse(res, event, payload);
    }
  }

  async function broadcastConversationEvent(conversationId, event, payload) {
    for (const [res, participant] of clients.entries()) {
      if (await isConversationMember(participant.userId, conversationId)) {
        pushSse(res, event, payload);
      }
    }
  }

  function broadcastUserEvent(userId, event, payload) {
    for (const [res, participant] of clients.entries()) {
      if (participant.userId === userId) pushSse(res, event, payload);
    }
  }

  async function broadcastMessage(message) {
    await broadcastConversationEvent(message.chatId, "message", message);
  }

  function participantFromSession(url, auth) {
    const connectedAt = nowIso();
    const clientId = safeText(
      url.searchParams.get("clientId"),
      crypto.randomUUID(),
      120,
    );

    return {
      sessionId: crypto.randomUUID(),
      authSessionId: auth.session.id,
      expiresAt: auth.session.expires_at,
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
      lastSeenAt: connectedAt,
    };
  }

  function participantList() {
    const grouped = new Map();
    for (const participant of clients.values()) {
      const key = `${participant.userId}:${participant.deviceId || participant.clientId}`;
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
          connections: 1,
        });
        continue;
      }
      existing.connections += 1;
      if (participant.lastSeenAt > existing.lastSeenAt)
        existing.lastSeenAt = participant.lastSeenAt;
      if (participant.connectedAt < existing.connectedAt)
        existing.connectedAt = participant.connectedAt;
    }
    return [...grouped.values()].sort((a, b) =>
      a.connectedAt.localeCompare(b.connectedAt),
    );
  }

  function presencePayload() {
    const participants = participantList();
    return {
      clients: clients.size,
      devices: participants.length,
      participants,
    };
  }

  function broadcastPresence() {
    broadcast("presence", presencePayload());
  }

  function normalizeMessage(input, auth) {
    const text = String(input.text || "").trim();
    if (!text) throw new ApiError(400, "Введите сообщение", "empty_message");
    if (text.length > 4000)
      throw new ApiError(400, "Сообщение слишком длинное", "message_too_long");

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
      route: config.cloud ? "internet-server" : "local-server",
    };
  }

  function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  let passwordJobs = 0;
  async function passwordRecord(
    password,
    salt = crypto.randomBytes(16).toString("hex"),
  ) {
    if (passwordJobs >= 4)
      throw new ApiError(
        503,
        "Сервер занят. Попробуйте ещё раз",
        "server_busy",
      );
    passwordJobs++;
    try {
      const hash = (await scrypt(password, salt, 64)).toString("hex");
      return { salt, hash };
    } finally {
      passwordJobs--;
    }
  }

  async function passwordMatches(password, user) {
    const expected = Buffer.from(user.password_hash, "hex");
    const actual = Buffer.from(
      (await passwordRecord(password, user.password_salt)).hash,
      "hex",
    );
    return (
      expected.length === actual.length &&
      crypto.timingSafeEqual(expected, actual)
    );
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

  async function authFromRequest(req) {
    const token = requestToken(req);
    if (!token) return null;
    const currentTime = nowIso();
    const row = await database
      .prepare(
        `
    SELECT
      u.id AS user_id, u.handle, u.display_name, u.created_at AS user_created_at,
      u.updated_at AS user_updated_at, u.bio, u.avatar_mime, u.avatar_updated_at,
      s.id AS session_id, s.device_id,
      s.device_name, s.created_at AS session_created_at, s.expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `,
      )
      .get(hashToken(token), currentTime);
    if (!row) return null;
    await database
      .prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?")
      .run(currentTime, row.session_id);
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
        updated_at: row.user_updated_at,
      },
      session: {
        id: row.session_id,
        device_id: row.device_id,
        device_name: row.device_name,
        created_at: row.session_created_at,
        expires_at: row.expires_at,
      },
    };
  }

  async function requireAuth(req) {
    const auth = await authFromRequest(req);
    if (!auth)
      throw new ApiError(401, "Войдите в аккаунт", "authentication_required");
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method))
      limiter.check(`write:${auth.user.id}`, 90, 60000);
    return auth;
  }

  function sessionCookie(
    req,
    token,
    maxAge = Math.floor(SESSION_LIFETIME_MS / 1000),
  ) {
    const forwardedProtocol = safeText(
      req.headers["x-forwarded-proto"],
      "",
      20,
    );
    const secure =
      config.cloud ||
      req.socket.encrypted ||
      (config.trustProxy && forwardedProtocol === "https")
        ? "; Secure"
        : "";
    return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
  }

  async function createSession(userId, input = {}) {
    const token = crypto.randomBytes(32).toString("base64url");
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS).toISOString();
    const session = {
      id: crypto.randomUUID(),
      deviceId: safeText(input.deviceId, `device-${crypto.randomUUID()}`, 120),
      deviceName: safeText(input.deviceName, "Устройство Маяка", 80),
      createdAt,
      expiresAt,
    };
    await database
      .prepare(
        `
    INSERT INTO sessions (
      id, token_hash, user_id, device_id, device_name, created_at, last_seen_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
      )
      .run(
        session.id,
        hashToken(token),
        userId,
        session.deviceId,
        session.deviceName,
        createdAt,
        createdAt,
        expiresAt,
      );
    return { token, session };
  }

  function validateAccountInput(input, { requirePassword = true } = {}) {
    const name = safeText(input.name, "", 60).replace(/\s+/g, " ");
    const handle = normalizeHandle(input.handle);
    const password = String(input.password || "");
    const bio = normalizeBio(input.bio);
    if (name.length < 2) throw new ApiError(400, "Введите имя", "invalid_name");
    if (!username.isValid(input.handle)) {
      throw new ApiError(400, username.errorMessage, "invalid_handle");
    }
    if (requirePassword && (password.length < 8 || password.length > 128)) {
      throw new ApiError(
        400,
        "Пароль должен содержать не менее 8 символов",
        "invalid_password",
      );
    }
    return { name, handle, password, bio };
  }

  async function ensureLiveMembership(userId) {
    await database
      .prepare(
        `
    INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, joined_at)
    VALUES ('live', ?, 'member', ?)
  `,
      )
      .run(userId, nowIso());
  }

  async function isConversationMember(userId, conversationId) {
    return Boolean(
      await database
        .prepare(
          `
    SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?
  `,
        )
        .get(conversationId, userId),
    );
  }

  async function requireConversationMember(auth, conversationId) {
    if (conversationId === "live") await ensureLiveMembership(auth.user.id);
    if (!(await isConversationMember(auth.user.id, conversationId))) {
      throw new ApiError(
        403,
        "Нет доступа к этому диалогу",
        "conversation_forbidden",
      );
    }
  }

  async function conversationTransaction(chatId, callback) {
    return database.transaction(async () => {
      // A single conversation lock orders inserts and clearing even over a network database.
      await database
        .prepare(
          `SELECT id FROM conversations WHERE id = ?${database.kind === "postgres" ? " FOR UPDATE" : ""}`,
        )
        .get(chatId);
      return callback();
    });
  }

  function messageFromRow(row) {
    return {
      id: row.id,
      sequence: Number(row.rowid),
      chatId: row.conversation_id,
      text: row.text,
      authorId: row.sender_id || row.author_id_snapshot,
      authorName: row.author_name,
      authorHandle: row.author_handle,
      deviceId: row.device_id,
      deviceName: row.device_name,
      createdAt: row.created_at,
      receivedAt: row.received_at,
      route: row.route,
    };
  }

  async function conversationClearCutoff(userId, conversationId) {
    const membership = await database
      .prepare(
        `
    SELECT cleared_before_rowid FROM conversation_members
    WHERE conversation_id = ? AND user_id = ?
  `,
      )
      .get(conversationId, userId);
    return Number(membership?.cleared_before_rowid || 0);
  }

  async function conversationMessages(conversationId, userId) {
    const clearedBeforeRowid = await conversationClearCutoff(
      userId,
      conversationId,
    );
    const rows = await database
      .prepare(
        `
    SELECT * FROM (
      SELECT * FROM messages
      WHERE conversation_id = ? AND rowid > ?
      ORDER BY rowid DESC LIMIT 500
    ) AS history ORDER BY rowid ASC
  `,
      )
      .all(conversationId, clearedBeforeRowid);
    return rows.map(messageFromRow);
  }

  async function insertMessage(message) {
    await database
      .prepare(
        `
    INSERT INTO messages (
      id, conversation_id, sender_id, author_id_snapshot, author_name,
      author_handle, device_id, device_name, text, created_at, received_at, route
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
      )
      .run(
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
        message.route,
      );
    const saved = await database
      .prepare("SELECT rowid FROM messages WHERE id = ?")
      .get(message.id);
    message.sequence = Number(saved.rowid);
  }

  async function conversationForUser(row, userId) {
    let peer = null;
    if (row.kind === "direct") {
      const peerRow = await database
        .prepare(
          `
      SELECT u.* FROM conversation_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.conversation_id = ? AND cm.user_id != ?
      LIMIT 1
    `,
        )
        .get(row.id, userId);
      if (peerRow) peer = publicUser(peerRow);
    }
    const clearedBeforeRowid = Number(
      row.cleared_before_rowid ??
        (await conversationClearCutoff(userId, row.id)),
    );
    const lastMessage = await database
      .prepare(
        `
    SELECT * FROM messages
    WHERE conversation_id = ? AND rowid > ?
    ORDER BY rowid DESC LIMIT 1
  `,
      )
      .get(row.id, clearedBeforeRowid);
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      peer,
      createdAt: row.created_at,
      clearedBeforeSequence: clearedBeforeRowid,
      lastMessage: lastMessage ? messageFromRow(lastMessage) : null,
    };
  }

  async function userConversations(userId) {
    const rows = await database
      .prepare(
        `
    SELECT c.*, cm.cleared_before_rowid FROM conversations c
    JOIN conversation_members cm ON cm.conversation_id = c.id
    WHERE cm.user_id = ?
    ORDER BY COALESCE(
      (SELECT MAX(m.created_at) FROM messages m
       WHERE m.conversation_id = c.id AND m.rowid > cm.cleared_before_rowid),
      c.created_at
    ) DESC
  `,
      )
      .all(userId);
    return Promise.all(
      rows.map(async (row) => await conversationForUser(row, userId)),
    );
  }

  async function createDirectConversation(userId, peerUserId) {
    if (!peerUserId || peerUserId === userId) {
      throw new ApiError(
        400,
        "Нельзя создать диалог с самим собой",
        "invalid_peer",
      );
    }
    const peer = await database
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(peerUserId);
    if (!peer)
      throw new ApiError(404, "Пользователь не найден", "user_not_found");

    const directKey = [userId, peerUserId].sort().join(":");
    const conversationId = `dm-${crypto.createHash("sha256").update(directKey).digest("hex").slice(0, 24)}`;
    const createdAt = nowIso();
    await database.transaction(async () => {
      await database
        .prepare(
          `
      INSERT OR IGNORE INTO conversations (id, kind, title, direct_key, created_by, created_at)
      VALUES (?, 'direct', '', ?, ?, ?)
    `,
        )
        .run(conversationId, directKey, userId, createdAt);
      const addMember = database.prepare(`
      INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, joined_at)
      VALUES (?, ?, 'member', ?)
    `);
      await addMember.run(conversationId, userId, createdAt);
      await addMember.run(conversationId, peerUserId, createdAt);
    });
    const row = await database
      .prepare("SELECT * FROM conversations WHERE id = ?")
      .get(conversationId);
    return await conversationForUser(row, userId);
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
        if (
          item.address.startsWith("198.18.") ||
          item.address.startsWith("198.19.")
        )
          continue;
        addUrl(item.address);
      }
    }

    const hostHeader = req.headers.host || `127.0.0.1:${port}`;
    const requestHost = hostHeader.split(":")[0];
    if (
      requestHost &&
      !["127.0.0.1", "localhost", "::1"].includes(requestHost)
    ) {
      addUrl(requestHost);
    }

    return urls;
  }

  function connectInfo(req) {
    if (config.cloud) {
      return {
        mode: "cloud",
        primaryUrl: config.publicOrigin,
        urls: [config.publicOrigin],
        qrSvgUrl: "/api/connect.svg",
        hint: "Откройте ссылку или наведите камеру телефона на QR-код. Можно подключаться из любой сети с доступом к серверу.",
      };
    }
    const urls = localNetworkUrls(req);
    const localUrl = `http://127.0.0.1:${port}`;
    const primaryUrl = urls[0] || localUrl;

    return {
      mode: "local",
      primaryUrl,
      localUrl,
      urls: [primaryUrl, ...urls.filter((url) => url !== primaryUrl), localUrl],
      qrSvgUrl: `/api/connect.svg?url=${encodeURIComponent(primaryUrl)}`,
      hint: "Подключите телефон к той же Wi‑Fi сети, откройте камеру и наведите её на QR-код.",
    };
  }

  function serveStatic(req, res, pathname) {
    const filePath = pathname === "/" ? "/index.html" : pathname;
    const safePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
    const absolutePath = path.join(appDir, safePath);

    if (!absolutePath.startsWith(appDir + path.sep)) {
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
        "cache-control": ext === ".html" ? "no-store" : "no-cache",
      });
      res.end(content);
    });
  }

  async function handleApi(req, res, url) {
    checkRequest(req, config, limiter);
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      await database.prepare("SELECT 1 AS ok").get();
      sendJson(res, 200, {
        ok: true,
        name: "Mayak",
        version: "0.9",
        mode: config.cloud ? "cloud" : "local",
        database: database.kind,
        inviteRequired: Boolean(config.registrationCode),
        auth: "sessions",
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/connect") {
      sendJson(res, 200, connectInfo(req));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/connect.svg") {
      const info = connectInfo(req);
      const target = info.primaryUrl;
      sendSvg(
        res,
        200,
        await QRCode.toString(target, {
          type: "svg",
          errorCorrectionLevel: "M",
          margin: 4,
        }),
      );
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      limiter.check(
        `register:${clientAddress(req, config)}`,
        10,
        60 * 60 * 1000,
      );
      const payload = await readJsonBody(req);
      checkInvite(payload.inviteCode, config.registrationCode);
      const input = validateAccountInput(payload);
      const existing = await database
        .prepare("SELECT id FROM users WHERE handle = ?")
        .get(input.handle);
      if (existing)
        throw new ApiError(409, "Этот username уже занят", "handle_taken");

      const createdAt = nowIso();
      const userId = `user-${crypto.randomUUID()}`;
      const password = await passwordRecord(input.password);
      const { user, createdSession } = await database.transaction(async () => {
        await database
          .prepare(
            `
      INSERT INTO users (
        id, handle, display_name, bio, password_salt, password_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
          )
          .run(
            userId,
            input.handle,
            input.name,
            input.bio,
            password.salt,
            password.hash,
            createdAt,
            createdAt,
          );
        await ensureLiveMembership(userId);
        const user = await database
          .prepare("SELECT * FROM users WHERE id = ?")
          .get(userId);
        const createdSession = await createSession(userId, payload);
        return { user, createdSession };
      });
      sendJson(
        res,
        201,
        {
          user: publicUser(user),
          session: createdSession.session,
          sessionToken: createdSession.token,
        },
        { "set-cookie": sessionCookie(req, createdSession.token) },
      );
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      limiter.check(
        `login-ip:${clientAddress(req, config)}`,
        30,
        15 * 60 * 1000,
      );
      const payload = await readJsonBody(req);
      const handle = normalizeHandle(payload.handle);
      const password = String(payload.password || "");
      limiter.check(`login-user:${handle}`, 15, 15 * 60 * 1000);
      if (
        !username.isValid(payload.handle) ||
        password.length < 8 ||
        password.length > 128
      )
        throw new ApiError(
          401,
          "Неверный username или пароль",
          "invalid_credentials",
        );
      const user = await database
        .prepare("SELECT * FROM users WHERE handle = ?")
        .get(handle);
      const matches = user
        ? await passwordMatches(password, user)
        : (await passwordRecord(password), false);
      if (!matches) {
        throw new ApiError(
          401,
          "Неверный username или пароль",
          "invalid_credentials",
        );
      }
      await ensureLiveMembership(user.id);
      const createdSession = await createSession(user.id, payload);
      sendJson(
        res,
        200,
        {
          user: publicUser(user),
          session: createdSession.session,
          sessionToken: createdSession.token,
        },
        { "set-cookie": sessionCookie(req, createdSession.token) },
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const auth = await requireAuth(req);
      sendJson(res, 200, {
        user: publicUser(auth.user),
        session: {
          id: auth.session.id,
          deviceId: auth.session.device_id,
          deviceName: auth.session.device_name,
          createdAt: auth.session.created_at,
          expiresAt: auth.session.expires_at,
        },
      });
      return;
    }

    if (req.method === "PATCH" && url.pathname === "/api/auth/me") {
      const auth = await requireAuth(req);
      const payload = await readJsonBody(req);
      const name = safeText(payload.name, auth.user.display_name, 60).replace(
        /\s+/g,
        " ",
      );
      const bio = Object.prototype.hasOwnProperty.call(payload, "bio")
        ? normalizeBio(payload.bio)
        : auth.user.bio;
      const deviceName = safeText(
        payload.deviceName,
        auth.session.device_name,
        80,
      );
      if (name.length < 2)
        throw new ApiError(400, "Введите имя", "invalid_name");
      const updatedAt = nowIso();
      await database
        .prepare(
          "UPDATE users SET display_name = ?, bio = ?, updated_at = ? WHERE id = ?",
        )
        .run(name, bio, updatedAt, auth.user.id);
      await database
        .prepare(
          "UPDATE sessions SET device_name = ?, last_seen_at = ? WHERE id = ?",
        )
        .run(deviceName, updatedAt, auth.session.id);
      const user = await database
        .prepare("SELECT * FROM users WHERE id = ?")
        .get(auth.user.id);
      sendJson(res, 200, {
        user: publicUser(user),
        session: {
          id: auth.session.id,
          deviceId: auth.session.device_id,
          deviceName,
          createdAt: auth.session.created_at,
          expiresAt: auth.session.expires_at,
        },
      });
      broadcastPresence();
      return;
    }

    if (req.method === "PUT" && url.pathname === "/api/auth/avatar") {
      const auth = await requireAuth(req);
      const contentType = String(req.headers["content-type"] || "")
        .split(";", 1)[0]
        .toLowerCase();
      if (!AVATAR_CONTENT_TYPES.has(contentType)) {
        throw new ApiError(
          415,
          "Поддерживаются JPEG, PNG и WebP",
          "unsupported_avatar_type",
        );
      }
      const avatar = await readBinaryBody(req);
      if (!avatar.length)
        throw new ApiError(400, "Выберите изображение", "empty_avatar");
      const updatedAt = nowIso();
      await database
        .prepare(
          `
      UPDATE users
      SET avatar_mime = ?, avatar_blob = ?, avatar_updated_at = ?, updated_at = ?
      WHERE id = ?
    `,
        )
        .run(contentType, avatar, updatedAt, updatedAt, auth.user.id);
      const user = await database
        .prepare("SELECT * FROM users WHERE id = ?")
        .get(auth.user.id);
      sendJson(res, 200, { user: publicUser(user) });
      broadcastPresence();
      return;
    }

    if (req.method === "DELETE" && url.pathname === "/api/auth/avatar") {
      const auth = await requireAuth(req);
      const updatedAt = nowIso();
      await database
        .prepare(
          `
      UPDATE users
      SET avatar_mime = '', avatar_blob = NULL, avatar_updated_at = '', updated_at = ?
      WHERE id = ?
    `,
        )
        .run(updatedAt, auth.user.id);
      const user = await database
        .prepare("SELECT * FROM users WHERE id = ?")
        .get(auth.user.id);
      sendJson(res, 200, { user: publicUser(user) });
      broadcastPresence();
      return;
    }

    const avatarMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/avatar$/);
    if (req.method === "GET" && avatarMatch) {
      await requireAuth(req);
      let userId;
      try {
        userId = decodeURIComponent(avatarMatch[1]);
      } catch {
        throw new ApiError(
          400,
          "Некорректный ID пользователя",
          "invalid_user_id",
        );
      }
      const avatar = await database
        .prepare(
          `
      SELECT avatar_mime, avatar_blob, avatar_updated_at FROM users WHERE id = ?
    `,
        )
        .get(userId);
      if (!avatar?.avatar_blob || !avatar.avatar_mime) {
        throw new ApiError(404, "Аватар не найден", "avatar_not_found");
      }
      sendBinary(res, 200, avatar.avatar_blob, avatar.avatar_mime, {
        etag: `"${crypto.createHash("sha256").update(avatar.avatar_blob).digest("hex").slice(0, 24)}"`,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      const token = requestToken(req);
      const session = token
        ? await database
            .prepare("SELECT id FROM sessions WHERE token_hash = ?")
            .get(hashToken(token))
        : null;
      if (token)
        await database
          .prepare("DELETE FROM sessions WHERE token_hash = ?")
          .run(hashToken(token));
      for (const [stream, participant] of clients)
        if (participant.authSessionId === session?.id) stream.end();
      sendJson(
        res,
        200,
        { ok: true },
        { "set-cookie": sessionCookie(req, "", 0) },
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/users") {
      const auth = await requireAuth(req);
      limiter.check(`user-search:${auth.user.id}`, 60, 60000);
      const query = safeText(url.searchParams.get("query"), "", 64)
        .replace(/^@+/, "")
        .slice(0, 60)
        .toLocaleLowerCase("ru");
      if (query.length < 2) {
        sendJson(res, 200, { users: [] });
        return;
      }
      // Treat %, _ and ! as literal input, never SQL pattern wildcards.
      const pattern = `%${query.replace(/[!%_]/g, "!$&")}%`;
      const lower = database.kind === "sqlite" ? "unicode_lower" : "LOWER";
      const users = await database
        .prepare(
          `
      SELECT id, handle, display_name, bio, avatar_mime, avatar_updated_at,
             created_at, updated_at FROM users
      WHERE id != ? AND (handle LIKE ? ESCAPE '!' OR ${lower}(display_name) LIKE ? ESCAPE '!')
      ORDER BY CASE WHEN handle = ? THEN 0 ELSE 1 END, handle ASC LIMIT 20
    `,
        )
        .all(auth.user.id, pattern, pattern, query);
      sendJson(res, 200, { users: users.map(publicUser) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/conversations") {
      const auth = await requireAuth(req);
      await ensureLiveMembership(auth.user.id);
      sendJson(res, 200, {
        conversations: await userConversations(auth.user.id),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/conversations/direct") {
      const auth = await requireAuth(req);
      const payload = await readJsonBody(req);
      const conversation = await createDirectConversation(
        auth.user.id,
        safeText(payload.peerUserId, "", 120),
      );
      sendJson(res, 201, { conversation });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/messages") {
      const auth = await requireAuth(req);
      const chatId = url.searchParams.get("chatId") || "live";
      await requireConversationMember(auth, chatId);
      sendJson(res, 200, {
        messages: await conversationMessages(chatId, auth.user.id),
      });
      return;
    }

    const clearConversationMatch = url.pathname.match(
      /^\/api\/conversations\/([^/]+)\/messages$/,
    );
    if (req.method === "DELETE" && clearConversationMatch) {
      const auth = await requireAuth(req);
      let chatId;
      try {
        chatId = decodeURIComponent(clearConversationMatch[1]);
      } catch {
        throw new ApiError(
          400,
          "Некорректный ID диалога",
          "invalid_conversation_id",
        );
      }
      await requireConversationMember(auth, chatId);
      const cutoff = await conversationTransaction(chatId, async () => {
        const latest = await database
          .prepare(
            `
      SELECT COALESCE(MAX(rowid), 0) AS rowid FROM messages WHERE conversation_id = ?
    `,
          )
          .get(chatId);
        await database
          .prepare(
            `
      UPDATE conversation_members
      SET cleared_before_rowid = MAX(cleared_before_rowid, ?)
      WHERE conversation_id = ? AND user_id = ?
    `,
          )
          .run(Number(latest.rowid || 0), chatId, auth.user.id);
        return conversationClearCutoff(auth.user.id, chatId);
      });
      const cleared = {
        chatId,
        clearedBy: auth.user.id,
        clearedAt: nowIso(),
        beforeSequence: cutoff,
      };
      broadcastUserEvent(auth.user.id, "chat_cleared", cleared);
      sendJson(res, 200, { ok: true, cleared });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/presence") {
      await requireAuth(req);
      sendJson(res, 200, presencePayload());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/events") {
      const auth = await requireAuth(req);
      if (
        clients.size >= 100 ||
        [...clients.values()].filter((client) => client.userId === auth.user.id)
          .length >= 5
      ) {
        throw new ApiError(
          429,
          "Слишком много открытых подключений",
          "connection_limit",
        );
      }
      await ensureLiveMembership(auth.user.id);
      const snapshot = await conversationMessages("live", auth.user.id);
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        "x-accel-buffering": "no",
        connection: "keep-alive",
      });
      const participant = participantFromSession(url, auth);
      clients.set(res, participant);
      pushSse(res, "hello", { ok: true, participant, ...presencePayload() });
      pushSse(res, "snapshot", { messages: snapshot });
      broadcastPresence();

      const heartbeat = setInterval(() => {
        const record = clients.get(res);
        if (record) record.lastSeenAt = new Date().toISOString();
        pushSse(res, "ping", { at: new Date().toISOString() });
      }, 25000);
      res.on("close", () => {
        clearInterval(heartbeat);
        clients.delete(res);
        broadcastPresence();
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/messages") {
      const auth = await requireAuth(req);
      limiter.check(`messages:${auth.user.id}`, 30, 60000);
      const payload = await readJsonBody(req);
      const message = normalizeMessage(payload, auth);
      await requireConversationMember(auth, message.chatId);
      await conversationTransaction(message.chatId, () =>
        insertMessage(message),
      );
      await broadcastMessage(message);
      sendJson(res, 201, { message });
      return;
    }

    const messageMatch = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
    if (req.method === "DELETE" && messageMatch) {
      const auth = await requireAuth(req);
      let messageId;
      try {
        messageId = decodeURIComponent(messageMatch[1]);
      } catch {
        throw new ApiError(
          400,
          "Некорректный ID сообщения",
          "invalid_message_id",
        );
      }
      const row = await database
        .prepare("SELECT * FROM messages WHERE id = ?")
        .get(messageId);
      if (!row)
        throw new ApiError(404, "Сообщение не найдено", "message_not_found");
      await requireConversationMember(auth, row.conversation_id);
      if (row.sender_id !== auth.user.id) {
        throw new ApiError(
          403,
          "Можно удалять только свои сообщения",
          "message_delete_forbidden",
        );
      }
      await conversationTransaction(row.conversation_id, () =>
        database.prepare("DELETE FROM messages WHERE id = ?").run(messageId),
      );
      const deleted = {
        messageId,
        chatId: row.conversation_id,
        deletedBy: auth.user.id,
        deletedAt: nowIso(),
      };
      await broadcastConversationEvent(
        row.conversation_id,
        "message_deleted",
        deleted,
      );
      sendJson(res, 200, { ok: true, deleted });
      return;
    }

    sendJson(res, 404, { error: "not found" });
  }

  const server = http.createServer(async (req, res) => {
    secureHeaders(res, config);
    try {
      const url = new URL(req.url || "/", "http://localhost");
      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url);
      } else {
        let pathname;
        try {
          pathname = decodeURIComponent(url.pathname);
        } catch {
          throw new ApiError(400, "Некорректный адрес", "invalid_url");
        }
        serveStatic(req, res, pathname);
      }
    } catch (error) {
      const duplicate =
        error.code === "23505" ||
        (error.code?.startsWith("ERR_SQLITE") &&
          /UNIQUE constraint failed: users.handle/.test(error.message));
      const statusCode =
        error instanceof ApiError ? error.statusCode : duplicate ? 409 : 500;
      const message =
        error instanceof ApiError
          ? error.message
          : duplicate
            ? "Этот username уже занят"
            : "Внутренняя ошибка сервера";
      const code =
        error instanceof ApiError
          ? error.code
          : duplicate
            ? "handle_taken"
            : "server_error";
      if (error.retryAfter)
        res.setHeader("Retry-After", String(error.retryAfter));
      if (!res.headersSent) sendJson(res, statusCode, { error: message, code });
      else res.end();
      if (statusCode === 500)
        console.error("Request failed:", error.code || "internal_error");
    }
  });

  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    const forced = setTimeout(() => process.exit(1), 10000).unref();
    for (const stream of clients.keys()) stream.end();
    await new Promise((resolve) => server.close(resolve));
    await database.close();
    clearTimeout(forced);
  }
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  server.on("error", async (error) => {
    console.error("Server failed:", error.code || "listen_error");
    await database.close();
    process.exitCode = 1;
  });

  server.listen(port, host, () => {
    console.log(
      `Mayak v0.9 (${database.kind}) is running: ${config.publicOrigin || `http://127.0.0.1:${port}`}`,
    );
    const urls = config.cloud ? [] : localNetworkUrls({ headers: {} });
    if (urls[0]) console.log(`Phone LAN URL: ${urls[0]}`);
    console.log(
      "Open the URL in two tabs/devices and send a message in “Живой чат”.",
    );
  });
}

main().catch((error) => {
  console.error(
    "Mayak failed to start:",
    error.code || "configuration_or_database_error",
  );
  process.exitCode = 1;
});
