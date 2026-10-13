import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('account migration preserves legacy records and constrains private ownership', async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',
    compatibilityDate:'2026-10-01',d1Databases:['DB']}));
  try {
    const db = await mf.getD1Database('DB');
    const migrate = async name => db.exec((await readFile('migrations/'+name,'utf8'))
      .replace(/--[^\n]*/g,'').replace(/\n/g,' '));
    await migrate('0001_artifacts.sql');
    await migrate('0002_skill_releases.sql');
    await migrate('0003_website_waitlist.sql');
    const record = JSON.stringify({id:'fixture',type:'concept',revision:1,workspace_id:'acc3351e-d092-433c-a7e1-8fc3e807ebd4',pointer:'@concept/fixture:v1',title:'Private fixture'});
    await db.prepare('INSERT INTO revisions VALUES(?,?,?,?,?,?)')
      .bind('@concept/fixture:v1','fixture','concept',1,'fixture-checksum',record).run();
    await db.prepare('INSERT INTO heads VALUES(?,?,?,?,?,?,?,?,?)')
      .bind('fixture','@concept/fixture:v1','concept',1,'Private fixture','draft',null,null,'2026-01-01').run();
    await db.exec("INSERT INTO tags VALUES('fixture','legacy-tag'); INSERT INTO search VALUES('fixture','Private fixture','legacy text'); INSERT INTO edges VALUES('@concept/fixture:v1','links','@concept/fixture:v1'); INSERT INTO requests VALUES('legacy-request','fp','@concept/fixture:v1','now'); INSERT INTO skill_releases VALUES('help','1.0.0',1,'checksum','{}','now'); INSERT INTO workflow_sessions VALUES('legacy-workflow','fp','help','1.0.0','/bytes help','now','later'); INSERT INTO library_decisions VALUES('legacy-decision','fp','{}','now');");
    const snapshots = {};
    for (const table of ['heads','tags','edges','requests','workflow_sessions','library_decisions','search'])
      snapshots[table] = (await db.prepare('SELECT * FROM '+table).all()).results;
    const before = await db.prepare('SELECT * FROM revisions').all();
    const state = await db.prepare('SELECT * FROM library_state').all();
    await migrate('0004_accounts.sql');
    assert.deepEqual((await db.prepare('SELECT * FROM revisions').all()).results,before.results);
    assert.deepEqual((await db.prepare('SELECT * FROM library_state').all()).results,state.results);
    assert.equal((await db.prepare('SELECT status FROM accounts WHERE id=?').bind('legacy-owner').first()).status,'unclaimed');
    assert.equal((await db.prepare('SELECT count(*) AS n FROM account_identities').first()).n,0);
    const legacy = await db.prepare('SELECT * FROM workspace_memberships').first();
    assert.equal(legacy.workspace_id,'acc3351e-d092-433c-a7e1-8fc3e807ebd4');
    assert.equal(legacy.account_id,'legacy-owner');
    await db.exec("INSERT INTO accounts(id,status) VALUES('alice','active'),('bob','active'); INSERT INTO workspace VALUES('alice-workspace','Alice');");
    await db.prepare('INSERT INTO workspace_memberships(workspace_id,account_id,role,status) VALUES(?,?,?,?)')
      .bind('alice-workspace','alice','owner','active').run();
    for (const values of [[legacy.workspace_id,'alice','owner','active'],['missing','alice','owner','active'],
      ['alice-workspace','missing','owner','revoked'],['alice-workspace','bob','admin','revoked']]) {
      await assert.rejects(db.prepare('INSERT INTO workspace_memberships(workspace_id,account_id,role,status) VALUES(?,?,?,?)').bind(...values).run());
    }
    await db.prepare('INSERT INTO account_identities(issuer,subject,account_id) VALUES(?,?,?)').bind('https://identity.example','subject-a','alice').run();
    await assert.rejects(db.prepare('INSERT INTO account_identities(issuer,subject,account_id) VALUES(?,?,?)').bind('https://identity.example','subject-a','bob').run());
    await assert.rejects(db.prepare('INSERT INTO account_identities(issuer,subject,account_id) VALUES(?,?,?)').bind('https://identity.example','unknown','missing').run());
    await db.prepare('INSERT INTO account_identities(issuer,subject,account_id) VALUES(?,?,?)').bind('https://other.example','subject-a','bob').run();
    assert.equal((await db.prepare('SELECT count(*) AS n FROM account_identities').first()).n,2);
    await migrate('0005_workspace_isolation.sql');
    assert.deepEqual((await db.prepare('SELECT pointer,id,type,revision,checksum,record FROM revisions').all()).results,before.results);
    for (const [table, rows] of Object.entries(snapshots)) {
      const current = (await db.prepare('SELECT * FROM '+table).all()).results.map(({workspace_id,...rest})=>rest);
      assert.deepEqual(current,rows,table+' migration must preserve all values');
    }
    const {workspace_id,...adoption} = await db.prepare('SELECT * FROM library_state WHERE workspace_id=?').bind(legacy.workspace_id).first();
    const {id,...oldAdoption}=state.results[0];
    assert.deepEqual(adoption,oldAdoption);
    assert.equal((await db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE '%_legacy'").first()).n,0);
    assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
  } finally { await mf.dispose(); }
});
