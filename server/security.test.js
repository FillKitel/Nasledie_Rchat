const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  loadConfig,
  RateLimiter,
  clientAddress,
  checkInvite,
} = require("./security");
const { postgresConfig, postgresSql } = require("./database");
const { postgresFixture, startApp } = require("./test-helpers");

test("cloud startup fails closed without persistent storage, HTTPS or an invite code", () => {
  assert.throws(() => loadConfig({ NODE_ENV: "production" }), /DATABASE_URL/);
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://example/db",
      }),
    /PUBLIC_URL/,
  );
  assert.throws(
    () => loadConfig({ PUBLIC_URL: "http://example.com" }),
    /HTTPS/,
  );
  assert.throws(
    () => loadConfig({ PUBLIC_URL: "https://example.com/path" }),
    /HTTPS/,
  );
  assert.equal(loadConfig({}).cloud, false);
  assert.throws(() => checkInvite("wrong", "secret-code"), /приглашения/);
});

test("Postgres certificate verification cannot be disabled through a remote URL", () => {
  for (const mode of ["require", "disable", "no-verify"]) {
    assert.deepEqual(
      postgresConfig(
        `postgresql://user:pass@database.example/db?sslmode=${mode}`,
      ).ssl,
      { rejectUnauthorized: true },
    );
  }
  assert.equal(
    postgresConfig("postgresql://user:pass@127.0.0.1/db?sslmode=disable").ssl,
    false,
  );
  assert.equal(
    postgresSql("SELECT '?' AS literal, ? AS value"),
    "SELECT '?' AS literal, $1 AS value",
  );
});

test("rate limits expire, remain bounded and ignore untrusted proxy headers", () => {
  let now = 0;
  const limiter = new RateLimiter({ now: () => now, maxKeys: 2 });
  limiter.check("a", 1, 1000);
  assert.throws(
    () => limiter.check("a", 1, 1000),
    (error) => error.statusCode === 429 && error.retryAfter === 1,
  );
  limiter.check("b", 1, 1000);
  assert.throws(
    () => limiter.check("c", 1, 1000),
    (error) => error.statusCode === 503,
  );
  now = 1001;
  limiter.check("c", 1, 1000);
  const req = {
    headers: { "x-forwarded-for": "spoofed, trusted-client" },
    socket: { remoteAddress: "proxy" },
  };
  assert.equal(clientAddress(req, { trustProxy: false }), "proxy");
  assert.equal(clientAddress(req, { trustProxy: true }), "trusted-client");
});

test(
  "hosted mode: invitation, CSRF, secure cookies, long QR and persisted login after restart",
  { timeout: 60000 },
  async () => {
    const postgres = await postgresFixture();
    const origin =
      "https://mayak-a-long-name-for-cloud-deployment-testing.onrender.com";
    const env = {
      DATABASE_URL: postgres.url,
      MAYAK_MODE: "cloud",
      PUBLIC_URL: origin,
      REGISTRATION_CODE: "test-only-invitation-code",
      TRUST_PROXY: "0",
    };
    let app;
    try {
      app = await startApp(env);
      let response = await fetch(app.url + "/api/health");
      const health = await response.json();
      assert.equal(health.mode, "cloud");
      assert.equal(health.inviteRequired, true);
      assert.equal(health.accounts, undefined);
      assert.equal(response.headers.get("access-control-allow-origin"), null);
      assert.match(
        response.headers.get("strict-transport-security"),
        /max-age/,
      );
      const connect = await (await fetch(app.url + "/api/connect")).json();
      assert.equal(connect.primaryUrl, origin);
      assert.equal(connect.localUrl, undefined);
      assert.deepEqual(connect.urls, [origin]);
      response = await fetch(
        app.url + "/api/connect.svg?url=https://attacker.example",
      );
      assert.equal(response.status, 200);
      assert.match(await response.text(), /<svg/);
      const register = (data, extraHeaders = {}) =>
        fetch(app.url + "/api/auth/register", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            ...extraHeaders,
          },
          body: JSON.stringify(data),
        });
      const input = {
        name: "Проверка",
        handle: "hosted",
        password: "test-password-09",
        deviceId: "test",
      };
      assert.equal((await register(input)).status, 403);
      assert.equal(
        (await register(input, { origin: "https://attacker.example" })).status,
        403,
      );
      assert.equal(
        (await register(input, { "content-type": "text/plain" })).status,
        415,
      );
      response = await register({
        ...input,
        inviteCode: env.REGISTRATION_CODE,
      });
      assert.equal(response.status, 201);
      assert.match(response.headers.get("set-cookie"), /; Secure/);
      const cookie = response.headers.get("set-cookie").split(";", 1)[0];
      await app.close();
      app = await startApp(env);
      response = await fetch(app.url + "/api/auth/me", { headers: { cookie } });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).user.handle, "@hosted");
      for (let i = 0; i < 16; i++) {
        response = await fetch(app.url + "/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json", origin },
          body: JSON.stringify({
            handle: "hosted",
            password: "incorrect-password",
          }),
        });
      }
      assert.equal(response.status, 429);
      assert.ok(Number(response.headers.get("retry-after")) > 0);
      assert.equal((await fetch(app.url + "/%E0%A4%A")).status, 400);
    } finally {
      if (app) await app.close();
      await postgres.close();
    }
  },
);
