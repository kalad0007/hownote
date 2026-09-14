// Local-only fixture setup. Never writes production credentials or publishes remotely.
import { randomBytes, pbkdf2Sync } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
if (existsSync('.dev.vars')) throw new Error('.dev.vars already exists; keep existing credentials.');
const users = [['andy', 'Andy'], ['partner', '파트너']].map(([id, name]) => {
  const password = randomBytes(18).toString('base64url'), salt = randomBytes(16).toString('hex');
  return { id, name, password, salt, hash: pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex') };
});
const token = randomBytes(32).toString('hex');
writeFileSync('.dev.vars', `CARE_USERS='${JSON.stringify(users.map(({password, ...u}) => u))}'\nCARE_PUBLISH_TOKEN=${token}\n`, { mode: 0o600 });
writeFileSync('.care-local-credentials.json', JSON.stringify({ users, token }), { mode: 0o600 });
console.log('Local-only credentials created in ignored files. No values printed.');
