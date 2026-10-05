import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { startRuntime } from '../scripts/local-private-runtime.mjs';
import { TEST_PIN, TEST_PUBLISH_TOKEN } from './fixtures/ib-reader.mjs';
const port=await new Promise(resolve=>{const server=createServer();server.listen(0,'127.0.0.1',()=>{const number=server.address().port;server.close(()=>resolve(number));});});
const runtime=await startRuntime(port,{pinCredential:null});let count=0;
const ok=(condition,message)=>{assert(condition,message);count++;console.log('PASS',message);};
try {
  for(const path of ['/ib/api/login','/ib/api/setup','/ib/api/pin/setup','/ib/api/pin']) {
    const response=await fetch(runtime.base+path,{method:'POST',headers:{Origin:runtime.base,'Content-Type':'application/json'},body:JSON.stringify({pin:TEST_PIN})});
    ok(response.status===503&&!response.headers.has('set-cookie'),'Unconfigured PIN cannot be claimed through '+path);
  }
  const response=await fetch(runtime.base+'/ib/mcp',{method:'POST',headers:{Authorization:`Bearer ${TEST_PUBLISH_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
  ok(response.status===200&&(await response.json()).result.tools.length===5,'Separate publication tools work independently of reader PIN setup');
} finally {runtime.stop();}
console.log(`${count} IB unconfigured-reader checks passed on an isolated local runtime.`);
