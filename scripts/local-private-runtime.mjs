import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, realpathSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { TEST_READER_CREDENTIAL, TEST_PUBLISH_TOKEN, TEST_READ_TOKEN } from '../tests/fixtures/ib-reader.mjs';
export async function startRuntime(port,{pinCredential=TEST_READER_CREDENTIAL}={}) {
  const tempRoot=realpathSync(tmpdir()),persist=mkdtempSync(join(tempRoot,'hownote-private-'));
  // Only this temporary runtime gets synthetic test authentication. Never edit the owner's .dev.vars.
  const config=readFileSync('wrangler.jsonc','utf8').replace(/"main"\s*:\s*"[^"]+"/,`"main":${JSON.stringify(resolve('worker/care.mjs'))}`).replace(/"directory"\s*:\s*"(?:\.\/)?dist"/,`"directory":${JSON.stringify(resolve('dist'))}`);
  writeFileSync(join(persist,'wrangler.jsonc'),config);
  const previous=readFileSync('.dev.vars','utf8').replace(/^IB_(?:READER_CREDENTIAL|PUBLISH_TOKEN|READ_TOKEN)\s*=.*\r?\n?/gm,'');
  const testVars=`\nIB_PUBLISH_TOKEN=${TEST_PUBLISH_TOKEN}\nIB_READ_TOKEN=${TEST_READ_TOKEN}\n`+(pinCredential?`IB_READER_CREDENTIAL='${JSON.stringify(pinCredential)}'\n`:'');
  writeFileSync(join(persist,'.dev.vars'),previous+testVars,{mode:0o600});
  const dev=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--config',join(persist,'wrangler.jsonc'),'--local','--ip','127.0.0.1','--port',String(port),'--persist-to',join(persist,'state')],{env:{...process.env,WRANGLER_SEND_METRICS:'false'},stdio:['pipe','pipe','pipe']});
  let logs='',closed=false;
  const stop=()=>{
    if(closed)return;closed=true;
    // Kill only this known test process and its descendants; never an unrelated server.
    try{if(process.platform==='win32')execFileSync('taskkill.exe',['/PID',String(dev.pid),'/T','/F'],{stdio:'ignore'});else dev.kill('SIGTERM');}catch{}
    if(dirname(realpathSync(persist))!==tempRoot)throw new Error('Temporary cleanup boundary mismatch');
    try{rmSync(persist,{recursive:true,force:true,maxRetries:3,retryDelay:100});}catch{}
  };
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{stop();reject(new Error('Local runtime startup timed out\n'+logs));},60000);
    dev.stdout.on('data',chunk=>{const text=chunk.toString();logs=(logs+text).slice(-8000);if(text.includes('Ready on')){clearTimeout(timeout);resolve();}});
    dev.stderr.on('data',chunk=>logs=(logs+chunk.toString()).slice(-8000));
    dev.once('error',error=>{clearTimeout(timeout);stop();reject(error);});
    dev.once('exit',code=>{clearTimeout(timeout);if(!closed)reject(new Error(`Local runtime exited ${code}\n${logs}`));});
  });
  return {base:`http://127.0.0.1:${port}`,stop,dev};
}
