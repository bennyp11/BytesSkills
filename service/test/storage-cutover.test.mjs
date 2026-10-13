import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkStorageCutover } from '../scripts/storage-cutover.mjs';
test('automatic release refuses incompatible live storage contract before migration',()=>{
  const migrations={'0005_workspace_isolation.sql':'checksum'};
  assert.throws(()=>checkStorageCutover({release:'0.8.1'},migrations),/maintenance cutover/);
  assert.throws(()=>checkStorageCutover({storage_contract:'unknown'},migrations),/maintenance cutover/);
  assert.doesNotThrow(()=>checkStorageCutover({storage_contract:'workspace-v1'},migrations));
  assert.doesNotThrow(()=>checkStorageCutover({},{}));
});

test('PostgreSQL cutover and rollback require explicit verified migration',()=>{
 assert.throws(()=>checkStorageCutover({storage_contract:'workspace-v1'},{},'postgres'),/maintenance cutover/);
 assert.doesNotThrow(()=>checkStorageCutover({storage_contract:'postgres-rls-v1'},{'0005_workspace_isolation.sql':'old'},'postgres'));
 assert.throws(()=>checkStorageCutover({storage_contract:'postgres-rls-v1'},{},'d1'),/stale D1/);
});
