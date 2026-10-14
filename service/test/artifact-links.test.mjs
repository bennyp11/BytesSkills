import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:"export * from './src/artifact-links';export {destination} from './src/login-destination';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});
const {artifactUrl,withArtifactLinks,destination}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const env={APP_URL:'https://app.example',BASE_URL:'https://api.example'};
const pointer='@brief/12345678-1234-4234-8234-123456789abc:v7';
test('links preserve exact revisions, use configured app origin and leave stored data untouched',()=>{
 const record={pointer,record_checksum:'unchanged',metadata:{pointer}};
 const linked=withArtifactLinks(record,env);
 assert.equal(linked.web_url,'https://app.example/app/artifact?pointer='+encodeURIComponent(pointer));
 assert.equal(withArtifactLinks(record,{}).web_url,undefined);assert.equal(record.web_url,undefined);assert.equal(linked.record_checksum,'unchanged');assert.equal(linked.metadata,record.metadata);
 const listing=withArtifactLinks({items:[record],next_cursor:'cursor'},env);
 assert.equal(listing.items[0].web_url,linked.web_url);assert.equal(listing.next_cursor,'cursor');
 assert.equal(withArtifactLinks({pointer:'@brief/12345678'},env).web_url,undefined);
 assert.throws(()=>artifactUrl(env,'//evil.example'),/exact/);
});
test('login destinations preserve artifact links and filters without allowing external redirects',()=>{
 const target='/app/artifact?pointer='+encodeURIComponent(pointer);
 assert.equal(destination(target),target);assert.equal(destination('/app?type=brief'),'/app?type=brief');
 assert.equal(destination('/authorize?client_id=x'),'/authorize?client_id=x');
 for(const unsafe of ['https://evil.example','//evil.example','/\\evil.example','javascript:alert(1)','/app#fragment','/auth/logout','/app/../auth/logout'])assert.equal(destination(unsafe),'/app');
});
