// Run interactively on the owner's machine. No secret is printed or committed.
import { randomBytes, pbkdf2Sync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
const rl = createInterface({ input: process.stdin, output: process.stdout });
const name = (await rl.question('파트너 표시 이름: ')).trim() || '파트너'; rl.close();
async function hidden(prompt) {
  if (!process.stdin.isTTY) throw new Error('Run this command in an interactive terminal.');
  process.stdout.write(prompt); process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => { let value = '';
    const listener = chunk => { for (const ch of chunk.toString()) {
      if (ch === '\u0003') { cleanup(); reject(new Error('Cancelled')); return; }
      if (ch === '\r' || ch === '\n') { cleanup(); resolve(value); return; }
      if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1); else if (ch >= ' ') value += ch;
    } };
    function cleanup() { process.stdin.off('data', listener); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); }
    process.stdin.on('data', listener);
  });
}
const users = []; const passwords = [];
for (const [id, display] of [['andy', 'Andy'], ['partner', name]]) {
  const password = await hidden(`${display} 비밀번호 (4자 이상, 화면에 표시되지 않음): `);
  if (password.length < 4 || password.length > 256 || password !== password.trim()) throw new Error('Use 4–256 characters without leading/trailing spaces.');
  if (await hidden('한 번 더 입력: ') !== password) throw new Error('Passwords do not match.');
  if (passwords.includes(password)) throw new Error('The two people must use different passwords.'); passwords.push(password);
  const salt = randomBytes(16).toString('hex');
  users.push({id, name:display, salt, hash:pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex')});
}
const token = await hidden('게시 도구용 긴 비밀값 (32자 이상, 비밀번호 관리자에서 생성): ');
if (token.length < 32 || token !== token.trim()) throw new Error('Publishing secret must contain at least 32 characters without surrounding spaces.');
for (const [key, value] of [['CARE_USERS', JSON.stringify(users)], ['CARE_PUBLISH_TOKEN', token]]) {
  const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'secret', 'put', key], { input:value, stdio:['pipe','inherit','inherit'] });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('Credentials configured. Store the publishing secret in the authenticated connector, never in the scheduled prompt.');
