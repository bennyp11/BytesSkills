// Administrative pilot enrollment. Never run with the runtime credential.
import pg from 'pg';
import {adminConnection} from './postgres-migrate.mjs';
const email=(process.argv[2]??'').trim().toLowerCase(),enabled=process.argv[3]!=='--disable';
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw Error('Usage: node scripts/invite.mjs email [--disable]');
const db=new pg.Client({connectionString:adminConnection()});await db.connect();
try{await db.query('INSERT INTO bytes.login_invites(email,enabled) VALUES($1,$2) ON CONFLICT(email) DO UPDATE SET enabled=excluded.enabled',[email,enabled]);console.log(enabled?'Pilot invitation enabled.':'Future email logins disabled. Existing sessions must be revoked separately.');}finally{await db.end();}
