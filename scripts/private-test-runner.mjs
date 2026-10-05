import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { startRuntime } from './local-private-runtime.mjs';
const port=await new Promise(resolve=>{const server=createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
const runtime=await startRuntime(port);
try {
  for(const file of ['tests/ib-reader-auth.mjs','tests/care-integration.mjs','tests/ib-integration.mjs','tests/ib-pin-no-setup.mjs']) {
    const code=await new Promise(resolve=>{const test=spawn(process.execPath,[file],{env:{...process.env,CARE_TEST_URL:runtime.base,IB_TEST_URL:runtime.base},stdio:'inherit'});test.on('exit',resolve);});
    if(code!==0){process.exitCode=code || 1;break;}
  }
} finally {runtime.stop();}
