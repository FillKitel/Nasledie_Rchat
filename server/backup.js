const fs = require("node:fs/promises");
const path = require("node:path");
const { openDatabase, reseedMessages } = require("./database");

// Sessions are deliberately excluded: restored users must sign in again.
const tables = [
  "users",
  "conversations",
  "conversation_members",
  "messages",
  "metadata",
];

async function exportBackup(db, file) {
  const data = await db.transaction(async () => {
    if (db.kind === "postgres")
      await db.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    const rows = {};
    for (const table of tables) {
      rows[table] = await db.prepare(`SELECT * FROM ${table}`).all();
    }
    for (const user of rows.users)
      if (user.avatar_blob)
        user.avatar_blob = Buffer.from(user.avatar_blob).toString("base64");
    return {
      format: "mayak-backup-v1",
      createdAt: new Date().toISOString(),
      tables: rows,
    };
  });
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  // Refuse to overwrite an existing backup; keep private by default.
  await fs.writeFile(file, JSON.stringify(data), { flag: "wx", mode: 0o600 });
}

async function importBackup(db, file) {
  const data = JSON.parse(await fs.readFile(file, "utf8"));
  if (
    data.format !== "mayak-backup-v1" ||
    !tables.every((table) => Array.isArray(data.tables?.[table]))
  )
    throw new Error("Invalid backup format");
  await db.transaction(async () => {
    if (db.kind === "postgres") {
      // Import only into an unused database; block concurrent registrations/writes.
      await db.exec(
        "LOCK TABLE users, sessions, conversations, conversation_members, messages, metadata IN ACCESS EXCLUSIVE MODE",
      );
    }
    for (const table of [
      "users",
      "sessions",
      "messages",
      "conversation_members",
      "metadata",
    ]) {
      if (
        Number(
          (await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get())
            .count,
        )
      )
        throw new Error("Restore requires an empty database");
    }
    if (
      Number(
        (
          await db
            .prepare(
              "SELECT COUNT(*) AS count FROM conversations WHERE id != 'live'",
            )
            .get()
        ).count,
      )
    )
      throw new Error("Restore requires an empty database");
    await db.exec("DELETE FROM conversations WHERE id = 'live'");
    for (const table of tables) {
      const columns =
        db.kind === "postgres"
          ? (
              await db
                .prepare(
                  "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ?",
                )
                .all(table)
            ).map((row) => row.name)
          : (await db.prepare(`PRAGMA table_info(${table})`).all()).map(
              (row) => row.name,
            );
      for (const item of data.tables[table]) {
        const row = { ...item };
        if (table === "users" && row.avatar_blob)
          row.avatar_blob = Buffer.from(row.avatar_blob, "base64");
        const keys = Object.keys(row);
        if (!keys.length || keys.some((key) => !columns.includes(key)))
          throw new Error("Invalid backup columns");
        await db
          .prepare(
            `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
          )
          .run(...keys.map((key) => row[key]));
      }
    }
    await reseedMessages(db);
  });
}

if (require.main === module) {
  (async () => {
    const [, , action, file, confirm] = process.argv;
    if (
      !["export", "import"].includes(action) ||
      !file ||
      (action === "import" && confirm !== "--into-empty-database")
    ) {
      throw new Error(
        "Usage: node server/backup.js export FILE | import FILE --into-empty-database",
      );
    }
    const db = await openDatabase();
    try {
      if (action === "export") await exportBackup(db, path.resolve(file));
      else await importBackup(db, path.resolve(file));
      console.log(
        action === "export"
          ? "Private backup saved. Keep it outside Git and shared folders."
          : "Backup restored. Users must sign in again.",
      );
    } finally {
      await db.close();
    }
  })().catch((error) => {
    console.error(error.code || error.message);
    process.exitCode = 1;
  });
}

module.exports = { exportBackup, importBackup };
