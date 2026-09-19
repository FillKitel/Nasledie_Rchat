const crypto = require("node:crypto");

class ApiError extends Error {
  constructor(statusCode, message, code = "request_failed") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function loadConfig(env = process.env) {
  const cloud = env.MAYAK_MODE === "cloud" || env.NODE_ENV === "production";
  const publicUrl =
    env.PUBLIC_URL ||
    (env.RENDER_EXTERNAL_HOSTNAME
      ? `https://${env.RENDER_EXTERNAL_HOSTNAME}`
      : "");
  let publicOrigin = "";
  if (publicUrl) {
    const parsed = new URL(publicUrl);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== "/"
    ) {
      throw new Error(
        "PUBLIC_URL must be an HTTPS origin without a path or credentials",
      );
    }
    publicOrigin = parsed.origin;
  }
  if (cloud && !env.DATABASE_URL)
    throw new Error(
      "Cloud mode requires DATABASE_URL; ephemeral SQLite is not allowed",
    );
  if (cloud && !publicOrigin)
    throw new Error(
      "Cloud mode requires PUBLIC_URL or RENDER_EXTERNAL_HOSTNAME",
    );
  if (cloud && String(env.REGISTRATION_CODE || "").length < 16)
    throw new Error(
      "Cloud mode requires REGISTRATION_CODE (at least 16 characters)",
    );
  return {
    cloud,
    publicOrigin,
    trustProxy: env.TRUST_PROXY === "1",
    registrationCode: env.REGISTRATION_CODE || "",
  };
}

class RateLimiter {
  constructor({ now = Date.now, maxKeys = 10000 } = {}) {
    this.now = now;
    this.maxKeys = maxKeys;
    this.entries = new Map();
  }
  check(key, limit, windowMs) {
    const now = this.now();
    if (this.entries.size >= this.maxKeys) {
      for (const [entryKey, value] of this.entries)
        if (value.until <= now) this.entries.delete(entryKey);
    }
    let entry = this.entries.get(key);
    if (!entry || entry.until <= now) {
      if (!entry && this.entries.size >= this.maxKeys)
        throw new ApiError(
          503,
          "Сервер занят. Попробуйте позже",
          "server_busy",
        );
      entry = { count: 0, until: now + windowMs };
      this.entries.set(key, entry);
    }
    if (entry.count >= limit) {
      const error = new ApiError(
        429,
        "Слишком много запросов. Попробуйте позже",
        "rate_limited",
      );
      error.retryAfter = Math.max(1, Math.ceil((entry.until - now) / 1000));
      throw error;
    }
    entry.count++;
  }
}

function clientAddress(req, config) {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .at(-1)
    .trim();
  return config.trustProxy && forwarded
    ? forwarded
    : req.socket.remoteAddress || "unknown";
}

function secureHeaders(res, config) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  if (config.cloud)
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
}

function checkRequest(req, config, limiter) {
  const ip = clientAddress(req, config);
  limiter.check(`api:${ip}`, 300, 60000);
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) return;
  const expectedOrigin = config.publicOrigin || `http://${req.headers.host}`;
  if (
    (req.headers.origin && req.headers.origin !== expectedOrigin) ||
    req.headers["sec-fetch-site"] === "cross-site"
  ) {
    throw new ApiError(
      403,
      "Запрос с другого сайта запрещён",
      "origin_forbidden",
    );
  }
  const contentType = String(req.headers["content-type"] || "")
    .split(";", 1)[0]
    .toLowerCase();
  if (
    ["POST", "PATCH"].includes(req.method) &&
    contentType !== "application/json"
  ) {
    throw new ApiError(
      415,
      "Ожидается application/json",
      "unsupported_content_type",
    );
  }
}

function checkInvite(value, expected) {
  if (!expected) return;
  const hash = (text) =>
    crypto
      .createHash("sha256")
      .update(String(text || ""))
      .digest();
  if (!crypto.timingSafeEqual(hash(value), hash(expected))) {
    throw new ApiError(
      403,
      "Нужен действующий код приглашения",
      "invalid_invite",
    );
  }
}

module.exports = {
  ApiError,
  loadConfig,
  RateLimiter,
  clientAddress,
  secureHeaders,
  checkRequest,
  checkInvite,
};
