const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { test } = require("node:test");
const { postgresFixture, stopChild } = require("./test-helpers");

const serverFile = path.join(__dirname, "index.js");

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServer(baseUrl, child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null)
      throw new Error(`Server exited with ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Server did not start in time");
}

async function api(baseUrl, pathname, { method = "GET", body, cookie } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  const setCookie = response.headers.get("set-cookie")?.split(";", 1)[0] || "";
  return { status: response.status, payload, cookie: setCookie };
}

async function binaryApi(
  baseUrl,
  pathname,
  { method = "GET", body, cookie, contentType } = {},
) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(contentType ? { "content-type": contentType } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body,
  });
  return { response, bytes: Buffer.from(await response.arrayBuffer()) };
}

for (const kind of ["sqlite", "postgres"])
  test(
    `v0.9 ${kind}: accounts protect identities and direct conversations`,
    { timeout: 60000 },
    async () => {
      const postgres = kind === "postgres" ? await postgresFixture() : null;
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mayak-v08-test-"));
      const port = await freePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const child = spawn(
        process.execPath,
        ["--no-warnings=ExperimentalWarning", serverFile],
        {
          env: {
            ...process.env,
            NODE_ENV: "test",
            MAYAK_MODE: "local",
            REGISTRATION_CODE: "",
            DATABASE_URL: postgres?.url || "",
            MAYAK_DB_PATH: "",
            HOST: "127.0.0.1",
            PORT: String(port),
            MAYAK_DATA_DIR: dataDir,
          },
          stdio: "ignore",
        },
      );

      try {
        await waitForServer(baseUrl, child);

        const health = await api(baseUrl, "/api/health");
        assert.equal(health.status, 200);
        assert.equal(health.payload.version, "0.9");
        assert.equal(health.payload.database, kind);
        assert.equal(health.payload.auth, "sessions");

        const anonymousHistory = await api(
          baseUrl,
          "/api/messages?chatId=live",
        );
        assert.equal(anonymousHistory.status, 401);

        const roman = await api(baseUrl, "/api/auth/register", {
          method: "POST",
          body: {
            name: "Роман",
            handle: "@roman",
            password: "roman-pass-08",
            bio: "Строю локальный мессенджер",
            deviceId: "roman-mac",
            deviceName: "Mac Романа",
          },
        });
        assert.equal(roman.status, 201);
        assert.ok(roman.cookie.startsWith("mayak_session="));
        assert.equal(roman.payload.user.bio, "Строю локальный мессенджер");
        assert.equal(roman.payload.user.avatarUrl, "");

        const avatarBytes = Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]);
        const avatarUpload = await binaryApi(baseUrl, "/api/auth/avatar", {
          method: "PUT",
          cookie: roman.cookie,
          contentType: "image/png",
          body: avatarBytes,
        });
        assert.equal(avatarUpload.response.status, 200);
        const avatarPayload = JSON.parse(avatarUpload.bytes.toString("utf8"));
        assert.match(
          avatarPayload.user.avatarUrl,
          new RegExp(`/api/users/${roman.payload.user.id}/avatar\\?v=`),
        );

        const avatarDownload = await binaryApi(
          baseUrl,
          avatarPayload.user.avatarUrl,
          { cookie: roman.cookie },
        );
        assert.equal(avatarDownload.response.status, 200);
        assert.equal(
          avatarDownload.response.headers.get("content-type"),
          "image/png",
        );
        assert.deepEqual(avatarDownload.bytes, avatarBytes);

        const profileUpdate = await api(baseUrl, "/api/auth/me", {
          method: "PATCH",
          cookie: roman.cookie,
          body: {
            name: "Роман Орендаренко",
            bio: "Новая строка профиля",
            deviceName: "Mac Романа",
          },
        });
        assert.equal(profileUpdate.status, 200);
        assert.equal(profileUpdate.payload.user.bio, "Новая строка профиля");

        const avatarDelete = await binaryApi(baseUrl, "/api/auth/avatar", {
          method: "DELETE",
          cookie: roman.cookie,
        });
        assert.equal(avatarDelete.response.status, 200);
        const deletedAvatar = JSON.parse(avatarDelete.bytes.toString("utf8"));
        assert.equal(deletedAvatar.user.avatarUrl, "");

        const duplicate = await api(baseUrl, "/api/auth/register", {
          method: "POST",
          body: {
            name: "Другой Роман",
            handle: "roman",
            password: "another-pass",
            deviceId: "other",
          },
        });
        assert.equal(duplicate.status, 409);

        const kolya = await api(baseUrl, "/api/auth/register", {
          method: "POST",
          body: {
            name: "Коля",
            handle: "@kolya",
            password: "kolya-pass-08",
            deviceId: "kolya-iphone",
            deviceName: "iPhone Коли",
          },
        });
        assert.equal(kolya.status, 201);

        const arina = await api(baseUrl, "/api/auth/register", {
          method: "POST",
          body: {
            name: "Арина",
            handle: "@arina",
            password: "arina-pass-08",
            deviceId: "arina-phone",
            deviceName: "Телефон Арины",
          },
        });
        assert.equal(arina.status, 201);

        const direct = await api(baseUrl, "/api/conversations/direct", {
          method: "POST",
          cookie: roman.cookie,
          body: { peerUserId: kolya.payload.user.id },
        });
        assert.equal(direct.status, 201);
        assert.equal(
          direct.payload.conversation.peer.id,
          kolya.payload.user.id,
        );
        const chatId = direct.payload.conversation.id;

        const spoofed = await api(baseUrl, "/api/messages", {
          method: "POST",
          cookie: roman.cookie,
          body: { chatId, text: "Привет, Коля", authorName: "Поддельное имя" },
        });
        assert.equal(spoofed.status, 201);
        assert.equal(spoofed.payload.message.authorName, "Роман Орендаренко");
        assert.equal(spoofed.payload.message.authorId, roman.payload.user.id);

        const kolyaHistory = await api(
          baseUrl,
          `/api/messages?chatId=${encodeURIComponent(chatId)}`,
          { cookie: kolya.cookie },
        );
        assert.equal(kolyaHistory.status, 200);
        assert.equal(kolyaHistory.payload.messages.length, 1);

        const arinaHistory = await api(
          baseUrl,
          `/api/messages?chatId=${encodeURIComponent(chatId)}`,
          { cookie: arina.cookie },
        );
        assert.equal(arinaHistory.status, 403);

        const forbiddenDelete = await api(
          baseUrl,
          `/api/messages/${encodeURIComponent(spoofed.payload.message.id)}`,
          {
            method: "DELETE",
            cookie: kolya.cookie,
          },
        );
        assert.equal(forbiddenDelete.status, 403);
        assert.equal(forbiddenDelete.payload.code, "message_delete_forbidden");

        const deletedMessage = await api(
          baseUrl,
          `/api/messages/${encodeURIComponent(spoofed.payload.message.id)}`,
          {
            method: "DELETE",
            cookie: roman.cookie,
          },
        );
        assert.equal(deletedMessage.status, 200);
        assert.equal(
          deletedMessage.payload.deleted.messageId,
          spoofed.payload.message.id,
        );

        const historyAfterDelete = await api(
          baseUrl,
          `/api/messages?chatId=${encodeURIComponent(chatId)}`,
          { cookie: kolya.cookie },
        );
        assert.equal(historyAfterDelete.payload.messages.length, 0);

        const romanBeforeClear = await api(baseUrl, "/api/messages", {
          method: "POST",
          cookie: roman.cookie,
          body: { chatId, text: "Сообщение до очистки" },
        });
        assert.equal(romanBeforeClear.status, 201);
        const kolyaBeforeClear = await api(baseUrl, "/api/messages", {
          method: "POST",
          cookie: kolya.cookie,
          body: { chatId, text: "Ответ до очистки" },
        });
        assert.equal(kolyaBeforeClear.status, 201);

        const forbiddenClear = await api(
          baseUrl,
          `/api/conversations/${encodeURIComponent(chatId)}/messages`,
          {
            method: "DELETE",
            cookie: arina.cookie,
          },
        );
        assert.equal(forbiddenClear.status, 403);

        const clearedForRoman = await api(
          baseUrl,
          `/api/conversations/${encodeURIComponent(chatId)}/messages`,
          {
            method: "DELETE",
            cookie: roman.cookie,
          },
        );
        assert.equal(clearedForRoman.status, 200);

        const romanClearedHistory = await api(
          baseUrl,
          `/api/messages?chatId=${encodeURIComponent(chatId)}`,
          { cookie: roman.cookie },
        );
        const kolyaUnclearedHistory = await api(
          baseUrl,
          `/api/messages?chatId=${encodeURIComponent(chatId)}`,
          { cookie: kolya.cookie },
        );
        assert.equal(romanClearedHistory.payload.messages.length, 0);
        assert.equal(kolyaUnclearedHistory.payload.messages.length, 2);

        const afterClear = await api(baseUrl, "/api/messages", {
          method: "POST",
          cookie: kolya.cookie,
          body: { chatId, text: "Новое сообщение после очистки" },
        });
        assert.equal(afterClear.status, 201);
        const romanAfterClear = await api(
          baseUrl,
          `/api/messages?chatId=${encodeURIComponent(chatId)}`,
          { cookie: roman.cookie },
        );
        assert.equal(romanAfterClear.payload.messages.length, 1);
        assert.equal(
          romanAfterClear.payload.messages[0].text,
          "Новое сообщение после очистки",
        );

        // Deleting the highest message ID must not cause subsequent messages to
        // reuse an already-cleared sequence number (SQLite v0.8 regression).
        await api(
          baseUrl,
          `/api/conversations/${encodeURIComponent(chatId)}/messages`,
          { method: "DELETE", cookie: roman.cookie },
        );
        for (const message of [
          kolyaBeforeClear.payload.message,
          afterClear.payload.message,
        ]) {
          await api(baseUrl, `/api/messages/${message.id}`, {
            method: "DELETE",
            cookie: kolya.cookie,
          });
        }
        await api(
          baseUrl,
          `/api/messages/${romanBeforeClear.payload.message.id}`,
          { method: "DELETE", cookie: roman.cookie },
        );
        const newest = await api(baseUrl, "/api/messages", {
          method: "POST",
          cookie: kolya.cookie,
          body: { chatId, text: "После удаления всей старой истории" },
        });
        assert.equal(newest.status, 201);
        const visible = await api(baseUrl, `/api/messages?chatId=${chatId}`, {
          cookie: roman.cookie,
        });
        assert.deepEqual(
          visible.payload.messages.map((message) => message.id),
          [newest.payload.message.id],
        );

        const streamAbort = new AbortController();
        const events = await fetch(`${baseUrl}/api/events`, {
          headers: { cookie: roman.cookie },
          signal: streamAbort.signal,
        });
        const reader = events.body.getReader();
        const first = await reader.read();
        assert.match(Buffer.from(first.value).toString(), /event: hello/);

        const logout = await api(baseUrl, "/api/auth/logout", {
          method: "POST",
          cookie: roman.cookie,
          body: {},
        });
        assert.equal(logout.status, 200);
        const afterLogout = await api(baseUrl, "/api/auth/me", {
          cookie: roman.cookie,
        });
        assert.equal(afterLogout.status, 401);
        const drained = (async () => {
          while (!(await reader.read()).done) {}
          return true;
        })();
        let timer;
        assert.equal(
          await Promise.race([
            drained,
            new Promise((resolve) => {
              timer = setTimeout(() => resolve(false), 3000);
            }),
          ]),
          true,
          "Logout closes the already-open SSE session",
        );
        clearTimeout(timer);
        streamAbort.abort();
      } finally {
        await stopChild(child);
        if (postgres) await postgres.close();
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    },
  );
