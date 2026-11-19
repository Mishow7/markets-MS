#!/usr/bin/env node
/**
 * MS Commerce database migrator — zero dependencies except `pg` (a production dep).
 * Runs during the Vercel build (see vercel.json) so deployments are self-sufficient
 * and never depend on drizzle-kit at build time.
 *
 * - Applies pending *.sql files from drizzle/ in order, each in a transaction.
 * - Tracks applied migrations in the `_migrations` table.
 * - Baseline: if core tables already exist but _migrations is missing (DB created
 *   earlier via drizzle-kit push), marks existing files as applied without running.
 *
 * Local workflow for future schema changes:
 *   1. Edit src/db/schema.ts
 *   2. npx drizzle-kit generate   (creates a new drizzle/NNNN_*.sql)
 *   3. Commit + push → Vercel applies it automatically on next deploy
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import dotenv from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });
const dir = path.join(root, "drizzle");
const url = process.env.DATABASE_URL;

function fail(msg) {
  console.error(`\n[MS Commerce migrate] ERROR: ${msg}\n`);
  process.exit(1);
}

if (!url) {
  fail(
    "DATABASE_URL is not set.\n" +
      "  - Locally: add it to your .env file.\n" +
      "  - Vercel: Project → Settings → Environment Variables → add DATABASE_URL\n" +
      "    (use the POOLED connection string from Neon) for Production, Preview and Development,\n" +
      "    then redeploy."
  );
}
if (!fs.existsSync(dir)) fail(`migrations directory not found: ${dir} (is your GitHub repo complete? It must contain drizzle/*.sql)`);
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
if (files.length === 0) fail(`no *.sql migrations found in ${dir} (incomplete checkout?)`);

const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 15000 });
const client = await pool.connect().catch((e) => fail(`cannot connect to database: ${e.message}\nCheck DATABASE_URL (use the pooled Neon string, it contains "-pooler").`));
try {
  await client.query(`CREATE TABLE IF NOT EXISTS _migrations (name varchar(200) PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const { rows: done } = await client.query(`SELECT name FROM _migrations`);
  const applied = new Set(done.map((r) => r.name));

  // Baseline adoption: DB already has tables (created via drizzle-kit push) but no history.
  if (applied.size === 0) {
    const { rows } = await client.query(`SELECT to_regclass('public.users') AS t`);
    if (rows[0]?.t) {
      console.log("[MS Commerce migrate] existing tables detected without history → recording baseline (no SQL executed).");
      for (const f of files) await client.query(`INSERT INTO _migrations(name) VALUES($1) ON CONFLICT DO NOTHING`, [f]);
      console.log(`[MS Commerce migrate] baseline recorded: ${files.length} file(s). Done.`);
      process.exit(0);
    }
  }

  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log(`[MS Commerce migrate] up to date (${files.length} migration(s) applied).`);
    process.exit(0);
  }
  for (const f of pending) {
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    console.log(`[MS Commerce migrate] applying ${f} ...`);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(`INSERT INTO _migrations(name) VALUES($1)`, [f]);
      await client.query("COMMIT");
      console.log(`[MS Commerce migrate] ✓ ${f}`);
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      fail(`migration ${f} failed: ${e.message}`);
    }
  }
  console.log("[MS Commerce migrate] all migrations applied. Done.");
  process.exit(0);
} finally {
  client.release();
  await pool.end();
}
