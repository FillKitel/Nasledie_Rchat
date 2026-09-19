const net = require("node:net");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const path = require("node:path");

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function postgresFixture() {
  if (process.env.TEST_POSTGRES_URL) {
    const { Client } = require("pg");
    const admin = new Client({
      connectionString: process.env.TEST_POSTGRES_URL,
    });
    await admin.connect();
    const name = `mayak_test_${crypto.randomBytes(8).toString("hex")}`;
    await admin.query(`CREATE DATABASE ${name}`);
    const url = new URL(process.env.TEST_POSTGRES_URL);
    url.pathname = `/${name}`;
    return {
      url: url.toString(),
      async close() {
        await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
        await admin.end();
      },
    };
  }
  const { PGlite } = require("@electric-sql/pglite");
  const { PGLiteSocketServer } = require("@electric-sql/pglite-socket");
  const engine = await PGlite.create();
  const port = await freePort();
  const server = new PGLiteSocketServer({
    db: engine,
    host: "127.0.0.1",
    port,
    maxConnections: 8,
  });
  await server.start();
  return {
    url: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`,
    async close() {
      await server.stop();
      await engine.close();
    },
  };
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  await new Promise((resolve) => {
    child.once("close", resolve);
    child.kill("SIGTERM");
  });
}

module.exports = { freePort, postgresFixture, stopChild };

async function startApp(env = {}) {
  const port = await freePort();
  const child = spawn(
    process.execPath,
    ["--no-warnings=ExperimentalWarning", path.join(__dirname, "index.js")],
    {
      env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), ...env },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  let errors = "";
  child.stderr.on("data", (chunk) => {
    errors += chunk;
  });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`App exited: ${errors}`);
    try {
      if ((await fetch(url + "/api/health")).ok)
        return { child, url, close: () => stopChild(child) };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await stopChild(child);
  throw new Error(`App failed to start: ${errors}`);
}

module.exports.startApp = startApp;
