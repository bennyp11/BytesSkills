import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const dir=await mkdtemp(join(tmpdir(),'bytes-format-test-'));
await build({stdin:{contents:`export {formatCodeForDisplay} from './src/code-format';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:join(dir,'format.mjs')});
const {formatCodeForDisplay:format}=await import(pathToFileURL(join(dir,'format.mjs')));
test.after(()=>rm(dir,{recursive:true,force:true}));

test('formats JavaScript files for display',async()=>{
 const formatted=await format('example.js','text/markdown','const answer={ok:true,n:42,description:"This value is long enough to show how the formatter lays out a wider object."};');
 assert.match(formatted,/const answer = \{/);
 assert.match(formatted,/\n  ok: true,/);
});
test('formats JSON artifacts identified by media type',async()=>{
 const formatted=await format('record','application/json','{"name":"Bytes","enabled":true,"description":"This value is long enough to show how the formatter lays out a wider object."}');
 assert.match(formatted,/\n  "name": "Bytes",/);
});
test('formats fenced code inside Markdown but leaves ordinary prose alone',async()=>{
 const prose='# A note\n\nThis is plain text.';
 assert.equal(await format('note','text/markdown',prose),prose);
 const markdown='Example:\n\n```js\nconst x={a:1};\n```';
 const formatted=await format('note','text/markdown',markdown);
 assert.match(formatted,/const x = \{ a: 1 \};/);
});
test('falls back to source for unsupported, invalid, or oversized input',async()=>{
 const plain='This should remain unchanged.';
 assert.equal(await format('note.txt','text/plain',plain),plain);
 const invalid='const = ;';
 assert.equal(await format('broken.js','text/markdown',invalid),invalid);
 const large='x'.repeat(100_001);
 assert.equal(await format('large.js','text/markdown',large),large);
});
