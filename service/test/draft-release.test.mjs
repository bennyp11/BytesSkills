import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findRelease, verifyDraftTarget } from '../scripts/draft-release-state.mjs';
const commit = 'a'.repeat(40);
const draft = {id:1,tag_name:'v0.8.1',draft:true,target_commitish:commit};
test('draft discovery searches all authenticated release pages without tag endpoint',()=>{
  assert.equal(findRelease([[{tag_name:'v0.7.0'}],[draft]],'v0.8.1'),draft);
  assert.equal(findRelease([[draft]],'v9.0.0'),undefined);
  assert.throws(()=>findRelease([[draft],[draft]],'v0.8.1'),/Multiple/);
});
test('draft retry accepts absent tag only when the target is the exact commit',()=>{
  verifyDraftTarget(draft,commit);
  verifyDraftTarget({...draft,target_commitish:'mvp'},commit,commit);
  assert.throws(()=>verifyDraftTarget({...draft,target_commitish:'mvp'},commit),/different commit/);
  assert.throws(()=>verifyDraftTarget(draft,commit,'b'.repeat(40)),/different commit/);
  assert.throws(()=>verifyDraftTarget({...draft,draft:false},commit,commit),/already published/);
});
