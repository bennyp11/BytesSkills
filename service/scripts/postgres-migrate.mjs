import pg from 'pg';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export function adminConnection(value=process.env.BYTES_POSTGRES_ADMIN_URL) {
 if(!value)throw Error('Set BYTES_POSTGRES_ADMIN_URL through a secret environment variable');
 const url=new URL(value);
 if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('Expected PostgreSQL connection URL');
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname) && url.searchParams.get('sslmode')!=='verify-full')
  throw Error('Remote administrator connections require sslmode=verify-full');
 return value;
}
export async function migrate(client) {
 await client.query('BEGIN');
 try {
  await client.query('SELECT pg_advisory_xact_lock(17491,2)');
  await client.query(`CREATE TABLE IF NOT EXISTS public.bytes_schema_migrations(
   name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`);
  await client.query('REVOKE ALL ON public.bytes_schema_migrations FROM PUBLIC');
  const dir=new URL('../postgres/migrations/',import.meta.url);
  for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort()) {
   const sql=await readFile(new URL(name,dir),'utf8'),hash=createHash('sha256').update(sql).digest('hex');
   const old=await client.query('SELECT sha256 FROM public.bytes_schema_migrations WHERE name=$1',[name]);
   if(old.rowCount){if(old.rows[0].sha256!==hash)throw Error('Applied migration changed: '+name);continue;}
   await client.query(sql);
   await client.query('INSERT INTO public.bytes_schema_migrations(name,sha256) VALUES($1,$2)',[name,hash]);
  }
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const client=new pg.Client({connectionString:adminConnection()});await client.connect();
 try{await migrate(client);console.log('PostgreSQL schema migrations verified/applied.');}finally{await client.end();}
}
