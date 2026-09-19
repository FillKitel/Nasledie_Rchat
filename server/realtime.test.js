const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { startApp, postgresFixture } = require("./test-helpers");

async function stream(url, cookie) {
  const controller = new AbortController();
  const response = await fetch(url + "/api/events", {
    headers: { cookie },
    signal: controller.signal,
  });
  assert.equal(response.status, 200);
  const events = [];
  const decoder = new TextDecoder();
  const task = (async () => {
    let buffer = "";
    try {
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let end;
        while ((end = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const type = frame.match(/^event: (.+)$/m)?.[1];
          const data = frame.match(/^data: (.+)$/m)?.[1];
          if (type && data) events.push({ type, data: JSON.parse(data) });
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    }
  })();
  return {
    events,
    async wait(type, predicate = () => true) {
      for (let i = 0; i < 200; i++) {
        const event = events.find(
          (item) => item.type === type && predicate(item.data),
        );
        if (event) return event.data;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`Missing ${type} event`);
    },
    async close() {
      controller.abort();
      await task;
    },
  };
}

for (const kind of ["sqlite", "postgres"])
  test(
    `${kind}: live delivery, private event scope and concurrent history changes`,
    { timeout: 60000 },
    async () => {
      const pg = kind === "postgres" ? await postgresFixture() : null;
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mayak-realtime-"));
      let app;
      const streams = [];
      try {
        app = await startApp({
          NODE_ENV: "test",
          MAYAK_MODE: "local",
          DATABASE_URL: pg?.url || "",
          MAYAK_DB_PATH: "",
          MAYAK_DATA_DIR: dir,
          REGISTRATION_CODE: "",
          // PGlite multiplexes one PostgreSQL connection; CI runs a real 3-connection pool.
          DATABASE_POOL_SIZE: process.env.TEST_POSTGRES_URL ? "3" : "1",
        });
        const api = async (cookie, route, method = "GET", body) => {
          const response = await fetch(app.url + route, {
            method,
            headers: {
              cookie,
              ...(body ? { "content-type": "application/json" } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
          });
          assert.ok(response.ok, `${method} ${route}: ${response.status}`);
          return {
            ...(await response.json()),
            cookie: response.headers.get("set-cookie")?.split(";")[0],
          };
        };
        const users = [];
        for (const name of ["alice", "bob", "eve"]) {
          users.push(
            await api("", "/api/auth/register", "POST", {
              name,
              handle: name,
              password: "test-password-09",
            }),
          );
        }
        const [alice, bob, eve] = users;
        const alicePhone = await api("", "/api/auth/login", "POST", {
          handle: "alice",
          password: "test-password-09",
          deviceId: "phone",
        });
        for (const user of [alice, alicePhone, bob, eve]) {
          const connected = await stream(app.url, user.cookie);
          streams.push(connected);
          await connected.wait("hello");
        }
        const [a, phone, b, e] = streams;
        const { conversation } = await api(
          alice.cookie,
          "/api/conversations/direct",
          "POST",
          { peerUserId: bob.user.id },
        );
        const chatId = conversation.id;
        const aliceConversations = await api(
          alice.cookie,
          "/api/conversations",
        );
        const aliceDirect = aliceConversations.conversations.find(
          (item) => item.id === chatId,
        );
        assert.equal(aliceDirect.peer.online, true);
        assert.ok(aliceDirect.peer.lastSeenAt);
        const sent = await api(alice.cookie, "/api/messages", "POST", {
          chatId,
          text: "Private message",
        });
        for (const s of [a, phone, b])
          assert.equal((await s.wait("message")).id, sent.message.id);
        assert.ok(sent.message.sequence > 0);
        const read = await api(
          bob.cookie,
          `/api/conversations/${chatId}/read`,
          "POST",
          {},
        );
        assert.equal(read.receipt.lastReadSequence, sent.message.sequence);
        assert.equal(
          (await a.wait("messages_read")).lastReadSequence,
          sent.message.sequence,
        );
        const aliceReadHistory = await api(
          alice.cookie,
          `/api/messages?chatId=${chatId}`,
        );
        assert.ok(aliceReadHistory.messages[0].readAt);
        const cleared = await api(
          alice.cookie,
          `/api/conversations/${chatId}/messages`,
          "DELETE",
        );
        for (const s of [a, phone])
          assert.equal(
            (await s.wait("chat_cleared")).beforeSequence,
            sent.message.sequence,
          );
        assert.equal(cleared.cleared.beforeSequence, sent.message.sequence);
        assert.equal(
          (await api(alice.cookie, `/api/messages?chatId=${chatId}`)).messages
            .length,
          0,
        );
        assert.equal(
          (await api(bob.cookie, `/api/messages?chatId=${chatId}`)).messages
            .length,
          1,
        );
        await api(alice.cookie, `/api/messages/${sent.message.id}`, "DELETE");
        for (const s of [a, phone, b])
          assert.equal(
            (await s.wait("message_deleted")).messageId,
            sent.message.id,
          );
        const writes = Array.from({ length: 6 }, (_, i) =>
          api(bob.cookie, "/api/messages", "POST", {
            chatId,
            text: `Concurrent ${i}`,
          }),
        );
        const [clear, ...messages] = await Promise.all([
          api(alice.cookie, `/api/conversations/${chatId}/messages`, "DELETE"),
          ...writes,
        ]);
        const expected = messages
          .map((item) => item.message)
          .filter((item) => item.sequence > clear.cleared.beforeSequence)
          .sort((x, y) => x.sequence - y.sequence);
        const history = await api(
          alice.cookie,
          `/api/messages?chatId=${chatId}`,
        );
        assert.deepEqual(
          history.messages.map((item) => item.id),
          expected.map((item) => item.id),
        );
        assert.ok(
          messages.every(
            (item) => item.message.sequence > sent.message.sequence,
          ),
        );
        assert.equal(
          (await api(bob.cookie, `/api/messages?chatId=${chatId}`)).messages
            .length,
          6,
        );
        const publicMessage = await api(bob.cookie, "/api/messages", "POST", {
          chatId: "live",
          text: "Delivery barrier",
        });
        for (const s of streams)
          await s.wait(
            "message",
            (item) => item.id === publicMessage.message.id,
          );
        assert.equal(
          e.events.some((item) => item.data.chatId === chatId),
          false,
          "Outsider must not receive private message, deletion or clear",
        );
        assert.equal(
          b.events.some((item) => item.type === "chat_cleared"),
          false,
          "Clear is personal, not for the peer",
        );
        await b.close();
        const bobOffline = await a.wait(
          "user_presence",
          (item) => item.userId === bob.user.id && item.online === false,
        );
        assert.ok(bobOffline.lastSeenAt);
        const reconnected = await stream(app.url, alice.cookie);
        streams.push(reconnected);
        assert.ok(
          (await reconnected.wait("snapshot")).messages.some(
            (item) => item.id === publicMessage.message.id,
          ),
        );
      } finally {
        await Promise.all(streams.map((item) => item.close()));
        if (app) await app.close();
        if (pg) await pg.close();
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );
