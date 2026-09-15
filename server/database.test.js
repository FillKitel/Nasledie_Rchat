const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { openDatabase } = require("./database");
const { exportBackup, importBackup } = require("./backup");
const { postgresFixture } = require("./test-helpers");

test("SQLite v0.8 migration backs up original data and keeps a monotonic message sequence", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mayak-migration-"));
  const file = path.join(dir, "mayak.sqlite");
  let db;
  try {
    const old = new DatabaseSync(file);
    const oldSchema = fs
      .readFileSync(path.join(__dirname, "schema.sql"), "utf8")
      .replace(
        "  rowid INTEGER PRIMARY KEY AUTOINCREMENT,\n  id TEXT NOT NULL UNIQUE,",
        "  id TEXT PRIMARY KEY,",
      )
      .replace(
        /^CREATE INDEX IF NOT EXISTS messages_conversation_rowid_idx.*$/m,
        "",
      );
    old.exec(oldSchema);
    old.exec(
      "INSERT INTO users (id, handle, display_name, password_salt, password_hash, created_at, updated_at) VALUES ('u', 'u', 'User', 'salt', 'hash', 'now', 'now')",
    );
    old.exec(
      "INSERT INTO conversations (id, kind, title, created_at) VALUES ('live', 'room', 'Local', 'now')",
    );
    old.exec(
      "INSERT INTO conversation_members (conversation_id, user_id, joined_at, cleared_before_rowid) VALUES ('live', 'u', 'now', 50)",
    );
    old.exec(
      "INSERT INTO messages (id, conversation_id, author_name, text, created_at, received_at) VALUES ('old', 'live', 'User', 'kept', 'now', 'now')",
    );
    old.close();
    db = await openDatabase({ file, url: "" });
    assert.equal(
      (await db.prepare("SELECT text FROM messages WHERE id = 'old'").get())
        .text,
      "kept",
    );
    assert.equal(
      fs.readdirSync(dir).filter((name) => name.endsWith(".bak")).length,
      1,
    );
    await db
      .prepare(
        "INSERT INTO messages (id, conversation_id, author_name, text, created_at, received_at) VALUES ('new', 'live', 'User', 'visible', 'now', 'now')",
      )
      .run();
    assert.ok(
      (await db.prepare("SELECT rowid FROM messages WHERE id = 'new'").get())
        .rowid > 50,
    );
    const count = (
      await db.prepare("SELECT COUNT(*) AS count FROM messages").get()
    ).count;
    await assert.rejects(
      db.transaction(async () => {
        await db.prepare("DELETE FROM messages").run();
        throw new Error("rollback-test");
      }),
    );
    assert.equal(
      (await db.prepare("SELECT COUNT(*) AS count FROM messages").get()).count,
      count,
    );
    await db.close();
    db = null;
    db = await openDatabase({ file, url: "" });
    assert.equal(
      (await db.prepare("SELECT COUNT(*) AS count FROM messages").get()).count,
      count,
    );
  } finally {
    if (db) await db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test(
  "private backup transfers SQLite to PostgreSQL and back without overwriting existing data",
  { timeout: 60000 },
  async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mayak-backup-"));
    const postgres = await postgresFixture();
    const source = await openDatabase({
      file: path.join(dir, "source.sqlite"),
      url: "",
    });
    const target = await openDatabase({ url: postgres.url });
    const restored = await openDatabase({
      file: path.join(dir, "restored.sqlite"),
      url: "",
    });
    try {
      await source
        .prepare(
          "INSERT INTO users (id, handle, display_name, avatar_blob, password_salt, password_hash, created_at, updated_at) VALUES ('u', 'user', 'Имя', ?, 'salt', 'hash', 'now', 'now')",
        )
        .run(Buffer.from([1, 2, 3]));
      await source.exec(
        "INSERT INTO conversations (id, kind, created_at) VALUES ('live', 'room', 'now')",
      );
      await source.exec(
        "INSERT INTO conversation_members (conversation_id, user_id, joined_at, cleared_before_rowid) VALUES ('live', 'u', 'now', 100)",
      );
      await source.exec(
        "INSERT INTO messages (id, conversation_id, author_name, text, created_at, received_at) VALUES ('m', 'live', 'Имя', 'Текст', 'now', 'now')",
      );
      const first = path.join(dir, "first.backup.json");
      await exportBackup(source, first);
      assert.equal(fs.statSync(first).mode & 0o777, 0o600);
      await assert.rejects(exportBackup(source, first));
      await importBackup(target, first);
      await assert.rejects(importBackup(target, first), /empty database/);
      const second = path.join(dir, "second.backup.json");
      await exportBackup(target, second);
      await importBackup(restored, second);
      assert.equal(
        (await restored.prepare("SELECT text FROM messages").get()).text,
        "Текст",
      );
      assert.deepEqual(
        Buffer.from(
          (await restored.prepare("SELECT avatar_blob FROM users").get())
            .avatar_blob,
        ),
        Buffer.from([1, 2, 3]),
      );
      await target.exec(
        "INSERT INTO messages (id, conversation_id, author_name, text, created_at, received_at) VALUES ('new', 'live', 'Имя', 'Новый', 'now', 'now')",
      );
      assert.ok(
        Number(
          (
            await target
              .prepare("SELECT rowid FROM messages WHERE id = 'new'")
              .get()
          ).rowid,
        ) > 100,
      );
    } finally {
      await Promise.all([source.close(), target.close(), restored.close()]);
      await postgres.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);
