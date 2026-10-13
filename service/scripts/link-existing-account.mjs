// One-time operator migration. Does not issue a login session or merge accounts.
import pg from 'pg';
import {adminConnection} from './postgres-migrate.mjs';
const [email,account]=process.argv.slice(2);
if(!email||email!==email.trim().toLowerCase()||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!account)throw Error('Usage: link-existing-account.mjs normalized-email account-id');
const db=new pg.Client({connectionString:adminConnection()});await db.connect();
try{
 await db.query('BEGIN');
 await db.query("SELECT pg_advisory_xact_lock(hashtextextended('email-login:'||$1,0))",[email]);
 const a=await db.query('SELECT status FROM bytes.accounts WHERE id=$1 FOR UPDATE',[account]);
 if(a.rowCount!==1||!['active','unclaimed'].includes(a.rows[0].status))throw Error('Account unavailable');
 const m=await db.query("SELECT workspace_id FROM bytes.workspace_memberships WHERE account_id=$1 AND role='owner' AND status='active'",[account]);
 if(m.rowCount!==1)throw Error('Expected exactly one existing owner workspace');
 const old=await db.query("SELECT account_id FROM bytes.account_identities WHERE issuer='https://api.bytesskills.com/email' AND subject=$1",[email]);
 if(old.rowCount&&old.rows[0].account_id!==account)throw Error('Email already linked elsewhere; refusing reassignment');
 const other=await db.query("SELECT 1 FROM bytes.account_identities WHERE account_id=$1 AND NOT(issuer='https://api.bytesskills.com/email' AND subject=$2)",[account,email]);
 if(other.rowCount)throw Error('Account already has a different identity; refusing reassignment');
 await db.query("INSERT INTO bytes.account_identities(issuer,subject,account_id) VALUES('https://api.bytesskills.com/email',$1,$2) ON CONFLICT(issuer,subject) DO NOTHING",[email,account]);
 await db.query("UPDATE bytes.accounts SET status='active' WHERE id=$1",[account]);
 await db.query('INSERT INTO bytes.login_invites VALUES($1,true) ON CONFLICT(email) DO UPDATE SET enabled=true',[email]);
 await db.query('COMMIT');console.log('Existing account linked. Email verification is still required; no session issued.');
}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
