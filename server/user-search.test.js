const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { openDatabase } = require("./database");
const { postgresFixture, startApp } = require("./test-helpers");
const { createSearch } = require("../app/user-search");

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("people search discards stale responses, aborts on reset and can retry", async () => {
  const pending = [];
  const updates = [];
  const search = createSearch({
    search: (query, signal) =>
      new Promise((resolve, reject) =>
        pending.push({ query, signal, resolve, reject }),
      ),
    onChange: (state) => updates.push(state),
  });
  search.setQuery("@a", { immediate: true });
  assert.equal(pending.length, 0);
  search.setQuery("  @Коля  ", { immediate: true });
  assert.equal(pending[0].query, "Коля");
  search.setQuery("Роман", { immediate: true });
  assert.equal(pending[0].signal.aborted, true);
  pending[1].resolve([{ id: "roman" }]);
  await tick();
  pending[0].resolve([{ id: "kolya" }]);
  await tick();
  assert.deepEqual(search.getState().users, [{ id: "roman" }]);
  search.setQuery("Ошибка", { immediate: true });
  pending[2].reject(new Error("offline"));
  await tick();
  assert.equal(search.getState().status, "error");
  search.retry();
  pending[3].resolve([]);
  await tick();
  assert.equal(search.getState().status, "ready");
  search.setQuery("Закрываем", { immediate: true });
  search.reset();
  const resetCount = updates.length;
  assert.equal(pending[4].signal.aborted, true);
  pending[4].reject(new Error("late failure"));
  await tick();
  assert.equal(updates.length, resetCount);
  assert.equal(search.getState().status, "idle");
  assert.deepEqual(search.getState().users, []);
});

test("people search debounces typing and cancels queued searches", async () => {
  const requests = [];
  let completed;
  const ready = new Promise((resolve) => {
    completed = resolve;
  });
  const search = createSearch({
    delay: 5,
    search: async (query) => {
      requests.push(query);
      return [];
    },
    onChange: (state) => {
      if (state.status === "ready") completed();
    },
  });
  search.setQuery("ко");
  search.setQuery("кол");
  search.setQuery("коля");
  await ready;
  assert.deepEqual(requests, ["коля"]);
  search.setQuery("роман");
  search.reset();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.deepEqual(requests, ["коля"]);
});

for (const kind of ["sqlite", "postgres"]) {
  test(
    `${kind}: authenticated user search finds offline people and opens one private dialog`,
    { timeout: 60000 },
    async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mayak-people-test-"));
      const postgres = kind === "postgres" ? await postgresFixture() : null;
      let db;
      let app;
      try {
        const file = path.join(dir, "mayak.sqlite");
        db = await openDatabase({ file, url: postgres?.url || "" });
        const seed = db.prepare(`INSERT INTO users
        (id, handle, display_name, password_salt, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, 'test-only', 'test-only', '2026-09-18', '2026-09-18')`);
        for (let i = 0; i < 25; i++) {
          const handle = `person${String(i).padStart(2, "0")}`;
          await seed.run(handle, handle, "Участник теста");
        }
        await seed.run("wildcard-decoy", "qaxpeer", "Другой человек");
        await seed.run("special-name", "special", "100% друг_!");
        await seed.run("cyrillic", "миша_ёж", "Михаил");
        await db.close();
        db = null;
        app = await startApp({
          NODE_ENV: "test",
          MAYAK_MODE: "local",
          REGISTRATION_CODE: "",
          DATABASE_URL: postgres?.url || "",
          MAYAK_DB_PATH: file,
          DATABASE_POOL_SIZE: "1",
          PUBLIC_URL: "",
          RENDER_EXTERNAL_HOSTNAME: "",
        });
        async function api(route, { cookie, body, method = "GET" } = {}) {
          const response = await fetch(app.url + route, {
            method,
            headers: {
              ...(cookie ? { cookie } : {}),
              ...(body ? { "content-type": "application/json" } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
          });
          return {
            status: response.status,
            data: await response.json(),
            cookie: response.headers.get("set-cookie")?.split(";")[0],
          };
        }
        assert.equal((await api("/api/users?query=person")).status, 401);
        const viewer = await api("/api/auth/register", {
          method: "POST",
          body: {
            name: "Проверяющий",
            handle: "viewer",
            password: "search-test-pass",
            deviceId: "viewer-test",
          },
        });
        assert.equal(viewer.status, 201);
        const peer = await api("/api/auth/register", {
          method: "POST",
          body: {
            name: "Коля Ёлкин",
            handle: "qa_peer",
            password: "search-peer-pass",
            deviceId: "peer-test",
          },
        });
        assert.equal(peer.status, 201);
        await api("/api/auth/logout", {
          method: "POST",
          cookie: peer.cookie,
          body: {},
        });
        const search = (query) =>
          api(`/api/users?query=${encodeURIComponent(query)}`, {
            cookie: viewer.cookie,
          });
        for (const query of [
          "",
          "@",
          "я",
          "@я",
          "  ",
          "viewer",
          "nothing-found",
          "%' OR 1=1 --",
        ]) {
          const result = await search(query);
          assert.equal(result.status, 200);
          assert.deepEqual(result.data.users, [], query);
        }
        for (const query of [
          "коля",
          "КОЛЯ",
          "кОлЯ ёЛкИн",
          "ЁЛ",
          "@QA_PEER",
          "qa_",
          "  @qa_peer  ",
        ]) {
          const result = await search(query);
          assert.deepEqual(
            result.data.users.map((user) => user.id),
            [peer.data.user.id],
            query,
          );
          assert.deepEqual(
            Object.keys(result.data.users[0]).sort(),
            [
              "id",
              "name",
              "handle",
              "bio",
              "avatarUrl",
              "createdAt",
              "updatedAt",
              "online",
              "lastSeenAt",
            ].sort(),
          );
        }
        assert.deepEqual(
          (await search("друг_!")).data.users.map((user) => user.id),
          ["special-name"],
        );
        assert.deepEqual(
          (await search("0%")).data.users.map((user) => user.id),
          ["special-name"],
        );
        assert.deepEqual(
          (await search("@МИША_ЁЖ")).data.users.map((user) => user.id),
          ["cyrillic"],
        );
        assert.equal((await search("person")).data.users.length, 20);
        const first = await api("/api/conversations/direct", {
          method: "POST",
          cookie: viewer.cookie,
          body: { peerUserId: peer.data.user.id },
        });
        assert.equal(first.status, 201);
        const chatId = first.data.conversation.id;
        assert.equal(
          (
            await api("/api/messages", {
              method: "POST",
              cookie: viewer.cookie,
              body: { chatId, text: "Сообщение офлайн-получателю" },
            })
          ).status,
          201,
        );
        const reopened = await api("/api/conversations/direct", {
          method: "POST",
          cookie: viewer.cookie,
          body: { peerUserId: peer.data.user.id },
        });
        assert.equal(reopened.data.conversation.id, chatId);
        const login = await api("/api/auth/login", {
          method: "POST",
          body: {
            handle: "qa_peer",
            password: "search-peer-pass",
            deviceId: "peer-test",
          },
        });
        assert.equal(login.status, 200);
        const history = await api(`/api/messages?chatId=${chatId}`, {
          cookie: login.cookie,
        });
        assert.equal(
          history.data.messages[0].text,
          "Сообщение офлайн-получателю",
        );
        const ownChat = await api("/api/conversations/direct", {
          method: "POST",
          cookie: viewer.cookie,
          body: { peerUserId: viewer.data.user.id },
        });
        assert.equal(ownChat.status, 400);
        let throttled;
        for (let i = 0; i < 61; i++) {
          throttled = await search("person");
          if (throttled.status === 429) break;
        }
        assert.equal(throttled.status, 429);
      } finally {
        if (db) await db.close();
        if (app) await app.close();
        if (postgres) await postgres.close();
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );
}
