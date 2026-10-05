// Shared by the Worker and the owner-run offline PIN setup. Never accepts write roles.
export const PIN_ITERATIONS = 100000;
export const PIN_SESSION_SECONDS = 12 * 60 * 60;
export const PIN_READER = Object.freeze({id:'pin-reader',name:'개인 연구실',role:'reader'});
const encoder = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('');
export const validPin = pin => typeof pin==='string' && /^[0-9]{4}$/.test(pin);
export function readerCredential(value) {
  let credential;try {credential=JSON.parse(value || 'null');} catch {return null;}
  return credential && !Array.isArray(credential) && Object.keys(credential).length===3 && credential.schemaVersion===1 && typeof credential.salt==='string' && typeof credential.hash==='string' && /^[a-f0-9]{32}$/.test(credential.salt) && /^[a-f0-9]{64}$/.test(credential.hash) ? credential : null;
}
async function derive(pin,salt) {
  const key=await crypto.subtle.importKey('raw',encoder.encode(pin),'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:PIN_ITERATIONS,hash:'SHA-256'},key,256));
}
export async function createReaderCredential(pin) {
  if(!validPin(pin))throw new Error('숫자 4자리 PIN을 입력해 주세요.');
  const salt=hex(crypto.getRandomValues(new Uint8Array(16)));
  return {schemaVersion:1,salt,hash:await derive(pin,salt)};
}
export async function pinMatches(pin,credential) {
  if(!validPin(pin) || !credential)return false;
  const actual=await derive(pin,credential.salt);let difference=actual.length^credential.hash.length;
  for(let i=0;i<actual.length;i++)difference|=actual.charCodeAt(i)^(credential.hash.charCodeAt(i)||0);
  return difference===0;
}
export const pinSignature = credential => `pin-v1:${credential.salt}:${credential.hash}`;
export function pinSessionUser(row,credential,now=Date.now()) {
  return row && credential && row.expires>now && row.user_id===PIN_READER.id && row.credential===pinSignature(credential) ? PIN_READER : null;
}
