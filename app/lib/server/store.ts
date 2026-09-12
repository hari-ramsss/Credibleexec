import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AppError, type Commitment } from "@credibleexec/domain";
import type { Compilation, Context } from "@credibleexec/mandate";

let instance: DatabaseSync | undefined;
export function db() {
  if (instance) return instance;
  const file = path.resolve(
    process.env.DATABASE_PATH ?? ".local/credibleexec.sqlite",
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  instance = new DatabaseSync(file);
  instance.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, signer TEXT NOT NULL, nonce INTEGER NOT NULL, raw TEXT NOT NULL, hash TEXT NOT NULL, UNIQUE(signer,nonce));
    CREATE TABLE IF NOT EXISTS locks (id TEXT PRIMARY KEY, holder TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS executions (hash TEXT PRIMARY KEY, commitment_id TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS rate_limits (id TEXT PRIMARY KEY, window INTEGER NOT NULL, count INTEGER NOT NULL);
  `);
  return instance;
}
export interface Draft {
  id: string;
  userId: string;
  request: string;
  context: Context;
  result?: Compilation;
  createdAt: number;
}
export interface Job {
  id: string;
  owner: string;
  phase: "compile" | "fund" | "settle";
  ref: string;
  expires: number;
  stage: number;
  done: boolean;
}
export function put(id: string, owner: string, kind: string, value: unknown) {
  db()
    .prepare(
      "INSERT INTO records VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value WHERE records.owner=excluded.owner AND records.kind=excluded.kind",
    )
    .run(
      id,
      owner,
      kind,
      JSON.stringify(value, (_, v) =>
        typeof v === "bigint" ? v.toString() : v,
      ),
    );
}
export function read<T>(id: string, owner?: string): T {
  const row = db()
    .prepare("SELECT owner,value FROM records WHERE id=?")
    .get(id) as { owner: string; value: string } | undefined;
  if (!row || (owner !== undefined && row.owner !== owner))
    throw new AppError("NOT_FOUND", "This record was not found.", 404);
  return JSON.parse(row.value) as T;
}
export function list(owner: string): Commitment[] {
  return (
    db()
      .prepare(
        "SELECT value FROM records WHERE owner=? AND kind='commitment' ORDER BY rowid DESC LIMIT 100",
      )
      .all(owner) as { value: string }[]
  ).map((r) => JSON.parse(r.value));
}
export function save(c: Commitment) {
  put(c.id, c.userId, "commitment", c);
}
export async function locked<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const holder = randomUUID(),
    now = Date.now();
  const result = db()
    .prepare(
      "INSERT INTO locks VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET holder=excluded.holder,expires=excluded.expires WHERE locks.expires<?",
    )
    .run(id, holder, now + 180000, now);
  if (result.changes !== 1)
    throw new AppError(
      "BUSY",
      "This step is already running. Refresh its status shortly.",
      409,
    );
  const timer = setInterval(
    () =>
      db()
        .prepare("UPDATE locks SET expires=? WHERE id=? AND holder=?")
        .run(Date.now() + 180000, id, holder),
    30000,
  );
  try {
    return await fn();
  } finally {
    clearInterval(timer);
    db().prepare("DELETE FROM locks WHERE id=? AND holder=?").run(id, holder);
  }
}
export function rateLimit(id: string, limit = 30) {
  const window = Math.floor(Date.now() / 60000);
  const row = db()
    .prepare(
      "INSERT INTO rate_limits VALUES(?,?,1) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count",
    )
    .get(id, window) as { count: number };
  if (row.count > limit)
    throw new AppError(
      "RATE_LIMIT",
      "Too many requests. Please wait a minute.",
      429,
    );
}
