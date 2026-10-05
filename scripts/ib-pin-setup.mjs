// Owner-run LOCAL setup only. Does not publish, create tokens, or contact a service.
import { readFileSync, writeFileSync, existsSync, lstatSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createReaderCredential, validPin } from '../worker/ib-reader-auth.mjs';
export async function saveLocalPin(file,pin,confirmation) {
  if(!validPin(pin))throw new Error('숫자 4자리 PIN을 입력해 주세요.');
  if(pin!==confirmation)throw new Error('두 PIN이 다릅니다. 저장하지 않았습니다.');
  if(existsSync(file) && (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()))throw new Error('일반 로컬 설정 파일이 필요합니다.');
  const previous=existsSync(file)?readFileSync(file,'utf8'):'';
  const pattern=/^IB_READER_CREDENTIAL\s*=.*$/gm;
  if([...previous.matchAll(pattern)].length>1)throw new Error('중복된 PIN 설정을 먼저 확인해 주세요.');
  const credential=await createReaderCredential(pin);
  const newline=previous.includes('\r\n')?'\r\n':'\n';
  const line=`IB_READER_CREDENTIAL='${JSON.stringify(credential)}'`;
  const next=pattern.test(previous)?previous.replace(pattern,match=>line+(match.endsWith('\r')?'\r':'')):previous+(previous && !previous.endsWith('\n')?newline:'')+line+newline;
  writeFileSync(file,next,{mode:0o600});
  return credential;
}
async function hidden(prompt) {
  process.stdout.write(prompt);process.stdin.setRawMode(true);process.stdin.resume();
  return new Promise((resolveValue,reject)=>{
    let value='';
    const cleanup=()=>{process.stdin.off('data',listener);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');};
    const listener=chunk=>{for(const ch of chunk.toString()){
      if(ch==='\u0003'){cleanup();reject(new Error('취소했습니다. 저장하지 않았습니다.'));return;}
      if(ch==='\r'||ch==='\n'){cleanup();resolveValue(value);return;}
      if(ch==='\u007f'||ch==='\b')value=value.slice(0,-1);else if(ch>=' ')value+=ch;
    }};
    process.stdin.on('data',listener);
  });
}
export async function setupPin() {
  if(!process.stdin.isTTY || typeof process.stdin.setRawMode!=='function')throw new Error('본인 PC의 대화형 터미널에서 실행해 주세요.');
  const pin=await hidden('새 읽기 PIN (숫자 4자리, 화면에 표시되지 않음): ');
  const confirmation=await hidden('같은 PIN 다시 입력: ');
  const file=resolve(dirname(fileURLToPath(import.meta.url)),'..','.dev.vars');
  await saveLocalPin(file,pin,confirmation);
  console.log('로컬 읽기 PIN을 저장했습니다. PIN 원문은 저장하지 않았습니다. npm run ib:dev를 재시작해 주세요.');
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)setupPin().catch(error=>{console.error(error.message);process.exitCode=1;});
