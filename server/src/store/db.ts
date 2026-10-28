// Adaptador mínimo de banco: o PgStore só usa query e transação.
// Em produção: node-postgres (Supabase). Nos testes: PGlite (Postgres em memória).
import pg from "pg";

export interface Db {
  query<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  end(): Promise<void>;
}

/** Conexão com o Postgres do Supabase (use a URL do "Session pooler"). */
export function connectPostgres(url: string): Db {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  // O Supabase exige TLS; o certificado é da própria plataforma.
  const clean = url.replace(/[?&]sslmode=[^&]*/g, "");
  const pool = new pg.Pool({
    connectionString: clean,
    ssl: local ? undefined : { rejectUnauthorized: false },
    max: 5,
  });
  pool.on("error", (err) => console.error("[db] erro na conexão:", err.message));

  const wrap = (q: pg.Pool | pg.PoolClient): Db => ({
    query: async (sql, params) => {
      const r = await q.query(sql, params as unknown[]);
      return { rows: r.rows };
    },
    transaction: () => {
      throw new Error("transação aninhada");
    },
    end: async () => {},
  });

  return {
    ...wrap(pool),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const out = await fn(wrap(client));
        await client.query("commit");
        return out;
      } catch (err) {
        await client.query("rollback").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    end: () => pool.end(),
  };
}
