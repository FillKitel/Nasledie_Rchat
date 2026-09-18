const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const username = require("../app/username");
const { postgresFixture, startApp } = require("./test-helpers");

test("username rules preserve separators and never invent or silently truncate a name", () => {
  const browserContext = { window: {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../app/username.js"), "utf8"),
    browserContext,
  );
  for (const rules of [username, browserContext.window.MayakUsername]) {
    for (const [input, expected] of [
      ["  @РОМАН-_  ", "роман-_"],
      ["_roman__", "_roman__"],
      ["roma-n", "roma-n"],
      ["roman", "roman"],
      ["a_1", "a_1"],
      ["a".repeat(32), "a".repeat(32)],
    ]) {
      assert.equal(rules.normalize(input), expected);
      assert.equal(rules.format(input), `@${expected}`);
      assert.equal(rules.isValid(input), true, input);
    }
    for (const input of [
      undefined,
      null,
      "",
      " ",
      "@",
      "m",
      "ab",
      "a".repeat(33),
      "@@roman",
      "bad name",
      "ro.man",
      "roman!",
      "roman—name",
      "🙂",
    ]) {
      assert.equal(rules.isValid(input), false, String(input));
    }
    assert.equal(rules.normalize(""), "");
    assert.equal(rules.format(""), "");
    assert.equal(rules.format("@"), "");
    assert.equal(rules.normalize("bad name"), "bad name");
    assert.equal(rules.normalize("ro.man"), "ro.man");
    assert.equal(rules.normalize("a".repeat(33)).length, 33);
  }
});

for (const kind of ["sqlite", "postgres"]) {
  test(
    `${kind}: register, log in and find usernames with hyphens and underscores`,
    { timeout: 60000 },
    async () => {
      const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), "mayak-username-test-"),
      );
      let postgres;
      let app;
      try {
        postgres = kind === "postgres" ? await postgresFixture() : null;
        app = await startApp({
          NODE_ENV: "test",
          MAYAK_MODE: "local",
          REGISTRATION_CODE: "",
          DATABASE_URL: postgres?.url || "",
          MAYAK_DATA_DIR: dir,
          MAYAK_DB_PATH: path.join(dir, "mayak.sqlite"),
          DATABASE_POOL_SIZE: "1",
          PUBLIC_URL: "",
          RENDER_EXTERNAL_HOSTNAME: "",
        });
        async function api(route, { body, cookie } = {}) {
          const response = await fetch(app.url + route, {
            method: body ? "POST" : "GET",
            headers: {
              ...(body ? { "content-type": "application/json" } : {}),
              ...(cookie ? { cookie } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
          });
          return {
            status: response.status,
            data: await response.json(),
            cookie: response.headers.get("set-cookie")?.split(";")[0],
          };
        }
        const account = {
          name: "Проверка username",
          password: "username-test-password",
          deviceId: "username-test",
        };
        const users = [];
        for (const handle of [
          "roma-n",
          "roman",
          "_roman__",
          "РОМАН-_",
          "a".repeat(32),
        ]) {
          const registered = await api("/api/auth/register", {
            body: { ...account, handle },
          });
          assert.equal(registered.status, 201, JSON.stringify(registered.data));
          assert.equal(registered.data.user.handle, username.format(handle));
          users.push(registered);
          await api("/api/auth/logout", {
            cookie: registered.cookie,
            body: {},
          });
          const login = await api("/api/auth/login", {
            body: {
              handle: `  @${handle.toLocaleUpperCase("ru")}  `,
              password: account.password,
            },
          });
          assert.equal(login.status, 200, JSON.stringify(login.data));
          assert.equal(login.data.user.id, registered.data.user.id);
          assert.equal(login.data.user.handle, username.format(handle));
          const me = await api("/api/auth/me", { cookie: login.cookie });
          assert.equal(me.data.user.id, registered.data.user.id);
          await api("/api/auth/logout", { cookie: login.cookie, body: {} });
        }
        assert.notEqual(users[0].data.user.id, users[1].data.user.id);
        // Five valid + four invalid + one duplicate remain within the registration limit.
        for (const handle of ["", "ab", "bad name", "a".repeat(33)]) {
          const result = await api("/api/auth/register", {
            body: { ...account, handle },
          });
          assert.equal(result.status, 400, handle);
          assert.equal(result.data.code, "invalid_handle");
        }
        const duplicate = await api("/api/auth/register", {
          body: { ...account, handle: "@ROMA-N" },
        });
        assert.equal(duplicate.status, 409);
        assert.equal(duplicate.data.code, "handle_taken");
        for (const handle of ["ro.man", "roman!", "@@roman", "a".repeat(33)]) {
          const result = await api("/api/auth/login", {
            body: { handle, password: account.password },
          });
          assert.equal(result.status, 401, handle);
          assert.equal(result.data.code, "invalid_credentials");
        }
        const viewer = await api("/api/auth/login", {
          body: { handle: "roman", password: account.password },
        });
        for (const index of [0, 2, 3, 4]) {
          const user = users[index].data.user;
          const found = await api(
            `/api/users?query=${encodeURIComponent(user.handle)}`,
            { cookie: viewer.cookie },
          );
          assert.equal(found.status, 200);
          assert.deepEqual(
            found.data.users.map((result) => result.id),
            [user.id],
          );
        }
      } finally {
        await app?.close();
        await postgres?.close();
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );
}
