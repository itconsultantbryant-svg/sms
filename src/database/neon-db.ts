/**
 * better-sqlite3 shaped client over Neon Postgres.
 * Route code stays synchronous; queries run on a worker thread so the
 * main thread can wait without freezing the Postgres client.
 */
import { MessageChannel, MessagePort, Worker, receiveMessageOnPort } from 'worker_threads';
import { Client } from 'pg';

void Client;

type QueryResult = { rows: any[]; rowCount: number; error?: string };

const WORKER_SOURCE = `
const { parentPort, workerData } = require('worker_threads');
const { Client } = require('pg');

const flag = new Int32Array(workerData.flag);
let replyPort = null;
let client = null;

function reply(payload) {
  replyPort.postMessage(payload);
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0, 1);
}

async function ensureClient() {
  if (client) return client;
  client = new Client({
    connectionString: workerData.connectionString,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 15000,
    statement_timeout: 20000,
    query_timeout: 20000,
  });
  await client.connect();
  return client;
}

parentPort.on('message', async (msg) => {
  try {
    if (msg.type === 'init') {
      replyPort = msg.port;
      await ensureClient();
      reply({ ok: true });
      return;
    }
    const db = await ensureClient();
    if (msg.type === 'exec') {
      await db.query(msg.sql);
      reply({ ok: true, rows: [], rowCount: 0 });
      return;
    }
    const result = await db.query(msg.sql, msg.params || []);
    reply({ rows: result.rows || [], rowCount: result.rowCount || 0 });
  } catch (err) {
    try {
      reply({ error: err && err.message ? err.message : String(err), rows: [], rowCount: 0 });
    } catch (replyErr) {
      console.error('Neon worker reply failed', replyErr);
    }
  }
});
`;

function splitSql(sql: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const next = sql[i + 1];
    if (lineComment) {
      current += char;
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      current += char;
      if (char === '*' && next === '/') {
        current += next;
        i += 1;
        blockComment = false;
      }
      continue;
    }
    if (!inSingle && !inDouble && char === '-' && next === '-') {
      lineComment = true;
      current += char;
      continue;
    }
    if (!inSingle && !inDouble && char === '/' && next === '*') {
      blockComment = true;
      current += char;
      continue;
    }
    if (char === "'" && !inDouble) {
      current += char;
      if (inSingle && next === "'") {
        current += next;
        i += 1;
        continue;
      }
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      current += char;
      continue;
    }
    if (char === ';' && !inSingle && !inDouble) {
      const statement = current.trim();
      if (statement.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim()) {
        parts.push(statement);
      }
      current = '';
      continue;
    }
    current += char;
  }
  const tail = current.trim();
  if (tail.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim()) parts.push(tail);
  return parts;
}

function mapOutsideStrings(sql: string, mapper: (chunk: string) => string): string {
  let out = '';
  let inSingle = false;
  let chunk = '';
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const next = sql[i + 1];
    if (char === "'" && !inSingle) {
      out += mapper(chunk);
      chunk = '';
      inSingle = true;
      out += char;
      continue;
    }
    if (char === "'" && inSingle) {
      out += char;
      if (next === "'") {
        out += next;
        i += 1;
        continue;
      }
      inSingle = false;
      continue;
    }
    if (inSingle) out += char;
    else chunk += char;
  }
  return out + mapper(chunk);
}

export function translateSqlite(sql: string): string {
  if (/sqlite_master/i.test(sql)) {
    return `SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name NOT LIKE 'pg_%'`;
  }

  let out = sql;
  out = out.replace(
    /datetime\s*\(\s*'now'\s*,\s*'-'\s*\|\|\s*\?\s*\|\|\s*' days'\s*\)/gi,
    "((CURRENT_TIMESTAMP - ((?::text) || ' days')::interval))::text"
  );
  out = out.replace(/datetime\s*\(\s*'now'\s*\)/gi, "(CURRENT_TIMESTAMP)::text");
  out = out.replace(
    /date\s*\(\s*'now'\s*,\s*'([+-]?\d+)\s+(day|days|month|months|year|years)'\s*\)/gi,
    (_match, amount, unit) => `((CURRENT_DATE + INTERVAL '${amount} ${unit}'))::text`
  );
  out = out.replace(/date\s*\(\s*'now'\s*\)/gi, "(CURRENT_DATE)::text");
  out = out.replace(/\bdate\s*\(\s*([A-Za-z_][\w.]*)\s*\)/gi, 'substring(($1)::text from 1 for 10)');
  out = out.replace(/strftime\s*\(\s*'%Y-%m'\s*,\s*'now'\s*\)/gi, "to_char(CURRENT_DATE, 'YYYY-MM')");
  out = out.replace(/strftime\s*\(\s*'%Y-%m'\s*,\s*([^)]+)\)/gi, 'substring(($1)::text from 1 for 7)');
  out = out.replace(/\bAUTOINCREMENT\b/gi, '');
  out = out.replace(/\bCOLLATE\s+NOCASE\b/gi, '');
  out = out.replace(/\bWITHOUT\s+ROWID\b/gi, '');

  const ignore = /^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(out);
  const replace = /^\s*INSERT\s+OR\s+REPLACE\s+INTO\b/i.test(out);
  out = out.replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO/i, 'INSERT INTO');
  out = out.replace(/^\s*INSERT\s+OR\s+REPLACE\s+INTO/i, 'INSERT INTO');

  if (ignore && !/\bon\s+conflict\b/i.test(out)) {
    out = out.replace(/;?\s*$/, '') + ' ON CONFLICT DO NOTHING';
  }
  if (replace && !/\bon\s+conflict\b/i.test(out)) {
    const columns = out.match(/INSERT\s+INTO\s+\S+\s*\(([^)]+)\)/i);
    if (columns) {
      const names = columns[1].split(',').map((name) => name.trim()).filter(Boolean);
      const assignments = names.map((name) => `${name} = EXCLUDED.${name}`).join(', ');
      out = out.replace(/;?\s*$/, '') + ` ON CONFLICT (${names[0]}) DO UPDATE SET ${assignments}`;
    }
  }

  let placeholder = 0;
  out = mapOutsideStrings(out, (chunk) => chunk
    .replace(/\bLIKE\b/g, 'ILIKE')
    .replace(/\?/g, () => {
      placeholder += 1;
      return `$${placeholder}`;
    })
    // Postgres cannot infer a type for `$n IS NULL` when that placeholder is not
    // also compared to a column. Cast those checks; value comparisons stay typed.
    .replace(/\$(\d+)(?=\s+IS\s+(?:NOT\s+)?NULL\b)/gi, (_match, index) => `$${index}::text`));
  return out;
}

function pragmaTable(sql: string, kind: 'table_info' | 'foreign_key_list'): string | null {
  const match = sql.match(new RegExp(`PRAGMA\\s+${kind}\\s*\\(\\s*"?([A-Za-z0-9_]+)"?\\s*\\)`, 'i'));
  return match ? match[1] : null;
}

class NeonDatabase {
  private worker: Worker;
  private port: MessagePort;
  private flag: Int32Array;
  private depth = 0;
  private ready = false;

  constructor(connectionString: string) {
    const shared = new SharedArrayBuffer(4);
    this.flag = new Int32Array(shared);
    const channel = new MessageChannel();
    this.port = channel.port1;
    this.worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: { connectionString, flag: shared, cwd: process.cwd() },
    });
    this.worker.on('error', (err) => {
      console.error('Neon database worker error:', err);
    });
    this.call({ type: 'init', port: channel.port2 }, [channel.port2]);
    this.ready = true;
  }

  private call(message: any, transfer: any[] = []): QueryResult {
    Atomics.store(this.flag, 0, 0);
    this.worker.postMessage(message, transfer);
    const status = Atomics.wait(this.flag, 0, 0, 120000);
    if (status === 'timed-out') {
      throw new Error('Neon query timed out');
    }
    const received = receiveMessageOnPort(this.port);
    const payload = (received?.message || {}) as QueryResult;
    if (payload.error) {
      const error = new Error(payload.error);
      (error as any).code = 'NEON_QUERY';
      throw error;
    }
    return payload;
  }

  private query(sql: string, params: any[] = []): QueryResult {
    const cleaned = params.map((value) => (value === undefined ? null : value));
    return this.call({ type: 'query', sql, params: cleaned });
  }

  exec(sql: string): this {
    const statements = splitSql(sql);
    const failed: Array<{ sql: string; error: string }> = [];
    statements.forEach((statement, index) => {
      if (index === 0 || index % 40 === 0) {
        console.log(`Neon schema ${index + 1}/${statements.length}`);
      }
      const translated = translateSqlite(statement);
      try {
        this.call({ type: 'exec', sql: translated });
      } catch (err: any) {
        if (!/already exists/i.test(err.message || '')) {
          failed.push({ sql: translated, error: err.message || String(err) });
        }
      }
    });
    const remaining: Array<{ sql: string; error: string }> = [];
    for (const item of failed) {
      try {
        this.call({ type: 'exec', sql: item.sql });
      } catch (err: any) {
        if (!/already exists/i.test(err.message || '')) {
          remaining.push({ sql: item.sql.slice(0, 220), error: err.message || String(err) });
        }
      }
    }
    if (remaining.length) {
      console.error(`Neon schema: ${remaining.length} statement(s) still failing`);
      remaining.slice(0, 12).forEach((item) => console.error('-', item.error, '\n ', item.sql));
      throw new Error(`Database schema initialization failed (${remaining.length} statements)`);
    }
    return this;
  }

  prepare(sql: string) {
    const tableInfo = pragmaTable(sql, 'table_info');
    if (tableInfo) {
      const load = () => this.query(
        `SELECT c.ordinal_position - 1 AS cid,
                c.column_name AS name,
                c.data_type AS type,
                CASE WHEN c.is_nullable = 'NO' THEN 1 ELSE 0 END AS notnull,
                c.column_default AS dflt_value,
                CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END AS pk
         FROM information_schema.columns c
         LEFT JOIN (
           SELECT kcu.column_name
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
           WHERE tc.table_schema = 'public'
             AND tc.table_name = $1
             AND tc.constraint_type = 'PRIMARY KEY'
         ) pk ON pk.column_name = c.column_name
         WHERE c.table_schema = 'public' AND c.table_name = $1
         ORDER BY c.ordinal_position`,
        [tableInfo]
      ).rows;
      return { all: () => load(), get: () => load()[0], run: () => ({ changes: 0, lastInsertRowid: 0 }) };
    }

    const foreignKeys = pragmaTable(sql, 'foreign_key_list');
    if (foreignKeys) {
      const load = () => this.query(
        `SELECT kcu.column_name AS "from",
                ccu.table_name AS "table",
                ccu.column_name AS "to",
                rc.update_rule AS on_update,
                rc.delete_rule AS on_delete
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
         JOIN information_schema.referential_constraints rc
           ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
         JOIN information_schema.constraint_column_usage ccu
           ON rc.unique_constraint_name = ccu.constraint_name
          AND rc.unique_constraint_schema = ccu.table_schema
         WHERE tc.constraint_type = 'FOREIGN KEY'
           AND tc.table_schema = 'public'
           AND tc.table_name = $1`,
        [foreignKeys]
      ).rows;
      return { all: () => load(), get: () => load()[0], run: () => ({ changes: 0, lastInsertRowid: 0 }) };
    }

    const translated = translateSqlite(sql);
    return {
      all: (...params: any[]) => this.query(translated, params).rows,
      get: (...params: any[]) => this.query(translated, params).rows[0],
      run: (...params: any[]) => {
        const result = this.query(translated, params);
        return { changes: result.rowCount || 0, lastInsertRowid: 0 };
      },
    };
  }

  private control(sql: string) {
    this.call({ type: 'exec', sql });
  }

  transaction<T extends (...args: any[]) => any>(fn: T): T {
    const database = this;
    const wrapped = ((...args: any[]) => {
      const level = database.depth;
      database.depth += 1;
      database.control(level === 0 ? 'BEGIN' : `SAVEPOINT sp_${level}`);
      try {
        const result = fn(...args);
        database.depth -= 1;
        database.control(level === 0 ? 'COMMIT' : `RELEASE SAVEPOINT sp_${level}`);
        return result;
      } catch (err) {
        database.depth -= 1;
        try {
          database.control(level === 0 ? 'ROLLBACK' : `ROLLBACK TO SAVEPOINT sp_${level}`);
        } catch (rollbackErr) {
          console.error('Neon rollback failed', rollbackErr);
        }
        throw err;
      }
    }) as T;
    return wrapped;
  }

  pragma(source?: string, options?: { simple?: boolean }) {
    if (options?.simple) return 1;
    if (source && /=/.test(source)) return [];
    return [];
  }

  close() {
    if (this.ready) this.worker.terminate();
  }
}

let neonDb: NeonDatabase | null = null;

export function usesNeon(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getNeonDatabase(): NeonDatabase {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }
  if (!neonDb) neonDb = new NeonDatabase(process.env.DATABASE_URL);
  return neonDb;
}
