import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const persist = mkdtempSync(join(tmpdir(), 'care-check-'));
const dev = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--ip', '127.0.0.1', '--port', '8787', '--persist-to', persist], {env:process.env,stdio:['ignore','pipe','pipe']});
let ready=false;
const timeout=setTimeout(()=>{dev.kill();process.exitCode=1;console.error('Local server startup timed out');},60000);
dev.stdout.on('data', chunk => {
  if (!ready && chunk.toString().includes('Ready on')) {
    ready=true; clearTimeout(timeout);
    const test=spawn(process.execPath,['tests/care-integration.mjs'],{stdio:'inherit',env:{...process.env,CARE_TEST_URL:'http://127.0.0.1:8787'}});
    test.on('exit', code=>{process.exitCode=code || 0;dev.kill('SIGTERM');});
  }
});
dev.stderr.on('data', chunk=>{if(chunk.toString().includes('ERROR')) process.stderr.write(chunk);});
dev.on('exit', code=>{clearTimeout(timeout);if(!ready)process.exitCode=code||1;rmSync(persist,{recursive:true,force:true});});
