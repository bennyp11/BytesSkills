import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitForDeployment } from '../scripts/deployment-health.mjs';
const ready = {service:'BytesSkills',status:'ok',release:'0.8.2',commit:'expected'};
const stale = {...ready,release:'0.8.1',commit:'old'};
function harness(read) {
  let time = 0, calls = 0;
  const budgets = [];
  return {options:{target:'0.8.2',commit:'expected',now:()=>time,
    wait:async ms=>{time+=ms;},log:()=>{},
    readHealth:async budget=>{budgets.push(budget);return read(calls++,ms=>{time+=ms;});}},
    state:()=>({time,calls,budgets})};
}
test('immediate match needs no wait; stale and legacy health converge before publication',async()=>{
  for (const sequence of [[ready],[stale,{service:'BytesSkills',status:'ok'},ready]]) {
    const h=harness(i=>sequence[i]);
    assert.deepEqual(await waitForDeployment(h.options),ready);
    assert.equal(h.state().calls,sequence.length);
    assert.equal(h.state().time,(sequence.length-1)*5000);
  }
});
test('persistent stale deployment times out with expected and observed identities',async()=>{
  const h=harness(()=>stale);
  await assert.rejects(waitForDeployment(h.options),/60 seconds; expected 0.8.2 at expected; last observed 0.8.1 at old/);
  assert.equal(h.state().time,60000);
  assert.equal(h.state().budgets.at(-1),5000);
});
test('request time counts against deadline and late matches do not pass',async()=>{
  const h=harness((i,advance)=>{advance(60001);return ready;});
  await assert.rejects(waitForDeployment(h.options),/timed out/);
  assert.equal(h.state().calls,1);
});
test('conflicting deployments, invalid health and request errors fail immediately',async()=>{
  for (const result of [{...ready,release:'0.9.0'},{...ready,commit:'wrong'},
    {...ready,service:'other'},{...ready,status:'error'},{...ready,release:'invalid'}]) {
    const h=harness(()=>result);
    await assert.rejects(waitForDeployment(h.options));
    assert.equal(h.state().calls,1);
    assert.equal(h.state().time,0);
  }
  const h=harness(()=>{throw Error('HTTP 403');});
  await assert.rejects(waitForDeployment(h.options),/HTTP 403/);
  assert.equal(h.state().calls,1);
});
