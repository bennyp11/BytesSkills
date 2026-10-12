import pg from 'pg';
import { ApiError, type Env } from './common';

export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{results:T[]}>;
  run(): Promise<unknown>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown>;
}
export interface Principal { accountId: string; workspaceId: string; legacyOwner?: boolean }
export type DatabaseRole = 'runtime' | 'publisher' | 'identity';

/** D1 is only the pre-cutover compatibility backend. Never fail over to it. */
export function database(env: Env, principal?: Principal, role: DatabaseRole = 'runtime'): Database {
  if (env.STORAGE_BACKEND === undefined || env.STORAGE_BACKEND === 'd1') {
    if (!env.DB) throw new ApiError(503, 'Database binding unavailable');
    return env.DB;
  }
  if (env.STORAGE_BACKEND !== 'postgres') throw new ApiError(503, 'Unsupported storage backend');
  const binding = role === 'publisher' ? env.PUBLISHER_DB : role === 'identity' ? env.IDENTITY_DB : env.POSTGRES;
  if (!binding) throw new ApiError(503, 'Database binding unavailable');
  return new PostgresDatabase(binding.connectionString, principal, role);
}

/** Only translates parameter markers, never SQL dialect or untrusted SQL. */
export function postgresParameters(sql: string): string {
  let n = 0;
  return sql.replace(/'(?:''|[^'])*'|\?/g, token => token === '?' ? `$${++n}` : token);
}

export class PostgresDatabase implements Database {
  constructor(private connectionString: string, private principal?: Principal,
    private role: DatabaseRole = 'runtime') {}
  prepare(sql: string): Statement { return new PostgresStatement(this, sql); }
  async batch(statements: Statement[]) {
    if (statements.some(s => !(s instanceof PostgresStatement) || s.db !== this))
      throw new Error('Statements must belong to the same database context');
    return this.execute(statements as PostgresStatement[]);
  }
  async execute(statements: PostgresStatement[]) {
    // One client per operation; Hyperdrive provides the pool. Never retain a client
    // across Worker requests, and never set identity outside this transaction.
    const client = new pg.Client({connectionString: this.connectionString, connectionTimeoutMillis: 10000});
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL search_path = bytes, pg_catalog");
      await client.query("SET LOCAL statement_timeout = '15s'");
      await client.query("SET LOCAL lock_timeout = '5s'");
      const check = await client.query(`SELECT current_user AS name,rolsuper,rolbypassrls,rolcreaterole,
        EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='bytes' AND pg_has_role(current_user,c.relowner,'MEMBER')) AS owns_data
        FROM pg_roles WHERE rolname=current_user`);
      const r = check.rows[0];
      if (r?.name !== `bytes_${this.role}` || r.rolsuper || r.rolbypassrls || r.rolcreaterole || r.owns_data)
        throw new Error('Unsafe database runtime role');
      await client.query(`SELECT set_config('bytes.account_id',$1,true),
        set_config('bytes.workspace_id',$2,true),set_config('bytes.legacy_owner',$3,true)`,
        [this.principal?.accountId ?? '', this.principal?.workspaceId ?? '', this.principal?.legacyOwner ? 'true' : 'false']);
      // Publishers serialize with adoption writes. Tenant writes serialize within
      // one workspace, closing revision/parent-cycle races without global writes.
      await client.query(this.role === 'publisher'
        ? 'SELECT pg_advisory_xact_lock(17491,1)'
        : 'SELECT pg_advisory_xact_lock_shared(17491,1)');
      const writing = statements.some(s => !/^\s*SELECT\b/i.test(s.sql));
      if (writing && this.principal)
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [this.principal.workspaceId]);
      const results = [];
      for (const s of statements) {
        const result = await client.query(postgresParameters(s.sql), s.values);
        results.push({results:result.rows, meta:{changes:result.rowCount ?? 0}});
      }
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { await client.end(); }
  }
}
class PostgresStatement implements Statement {
  constructor(readonly db: PostgresDatabase, readonly sql: string, readonly values: unknown[] = []) {}
  bind(...values: unknown[]) { return new PostgresStatement(this.db, this.sql, values); }
  async all<T>() { return (await this.db.execute([this]))[0] as {results:T[]}; }
  async first<T>() { return (await this.all<T>()).results[0] ?? null; }
  async run() { return (await this.db.execute([this]))[0]; }
}
