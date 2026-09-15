import { DurableObject } from 'cloudflare:workers';
import { CareOAuth, oauthPath, oauthChallenge, oauthScopes } from './care-oauth.mjs';

const encoder = new TextEncoder();
const headers = {
  'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...headers, ...extra } });
const hex = bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
const digest = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
const cookieName = 'care_session';
const MAX_BODY = 180000;
const SESSION_SECONDS = 30 * 24 * 60 * 60;
function check(condition, message, status = 400) { if (!condition) throw Object.assign(new Error(message), { status }); }
async function body(request) {
  check(request.headers.get('content-type')?.includes('application/json'), 'JSON 형식이 필요합니다.', 415);
  const reader = request.body?.getReader(); check(reader, '내용이 없습니다.');
  const chunks = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length;
    if (size > MAX_BODY) { await reader.cancel(); check(false, '내용이 너무 큽니다.', 413); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { check(false, 'JSON 내용을 확인해 주세요.'); }
}
function text(value, limit, label) { check(typeof value === 'string' && value.trim().length > 0 && value.length <= limit, `${label} 내용을 확인해 주세요.`); return value.trim(); }
export function validateBriefing(value) {
  check(value && typeof value === 'object', '브리핑이 필요합니다.');
  const date = text(value.date, 10, '날짜');
  check(/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date, '날짜 형식을 확인해 주세요.');
  const title = text(value.title, 160, '제목');
  check(Array.isArray(value.summary) && value.summary.length >= 1 && value.summary.length <= 5, '요약은 1~5개입니다.');
  const summary = value.summary.map(x => text(x, 1000, '요약'));
  check(Array.isArray(value.sections) && value.sections.length >= 1 && value.sections.length <= 20, '본문 구성을 확인해 주세요.');
  const ids = new Set();
  const sections = value.sections.map(s => {
    const id = text(s.id, 64, '주제 ID'); check(/^[a-z0-9-]+$/.test(id) && id !== 'all' && !ids.has(id), '주제 ID는 중복 없이 영문·숫자·하이픈으로 작성합니다.'); ids.add(id);
    return { id, title: text(s.title, 160, '주제 제목'), body: text(s.body, 30000, '본문') };
  });
  check(Array.isArray(value.sources) && value.sources.length >= 1 && value.sources.length <= 60, '출처를 포함해 주세요.');
  const sources = value.sources.map(s => {
    const url = text(s.url, 2000, '출처 링크'); let parsed; try { parsed = new URL(url); } catch { check(false, '출처 주소를 확인해 주세요.'); }
    check(['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password, '출처는 웹 링크여야 합니다.');
    return { title: text(s.title, 240, '출처 제목'), url };
  });
  return { date, title, summary, sections, sources };
}
async function verifyPassword(password, user) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(user.salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  const actual = hex(bits); let diff = actual.length ^ user.hash.length;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ (user.hash.charCodeAt(i) || 0);
  return diff === 0;
}
const publicUser = user => ({ id: user.id, name: user.name });
function usersFrom(env) {
  let users; try { users = JSON.parse(env.CARE_USERS || 'null'); } catch { return null; }
  if (!Array.isArray(users) || users.length !== 2 || new Set(users.map(x => x.id)).size !== 2) return null;
  if (!users.every(x => /^[a-z0-9-]{1,32}$/.test(x.id) && typeof x.name === 'string' && x.name.length <= 40 && typeof x.salt === 'string' && x.salt.length >= 16 && /^[a-f0-9]{64}$/.test(x.hash))) return null;
  return users;
}

export class CareStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env); this.env = env; this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS briefings (date TEXT PRIMARY KEY, payload TEXT NOT NULL, hash TEXT NOT NULL, updated TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, date TEXT NOT NULL, section TEXT NOT NULL, user_id TEXT NOT NULL, author TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS comments_date ON comments(date, created)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, credential TEXT NOT NULL, expires INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)`);
    this.oauth = new CareOAuth(this);
  }
  rows(sql, ...args) { return this.sql.exec(sql, ...args).toArray(); }
  async session(request, users) {
    const token = request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!token || token.length > 100) return null;
    const key = await digest(token);
    const row = this.rows('SELECT * FROM sessions WHERE token = ? AND expires > ?', key, Date.now())[0];
    const user = row && users.find(x => x.id === row.user_id && x.hash === row.credential);
    return user ? { user, key } : null;
  }
  rate(key, limit, seconds) {
    const now = Date.now(); this.sql.exec('DELETE FROM attempts WHERE expires <= ?', now);
    this.sql.exec('INSERT INTO attempts(key, count, expires) VALUES(?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1', key, now + seconds * 1000);
    const row = this.rows('SELECT count FROM attempts WHERE key = ?', key)[0];
    check(row.count <= limit, '잠시 후 다시 시도해 주세요.', 429);
  }
  async publish(input) {
    const payload = validateBriefing(input); const serialized = JSON.stringify(payload);
    check(encoder.encode(serialized).length <= 130000, '브리핑이 너무 큽니다.', 413);
    const hash = await digest(serialized); const old = this.rows('SELECT hash FROM briefings WHERE date = ?', payload.date)[0];
    const updated = new Date().toISOString();
    if (old?.hash !== hash) this.sql.exec('INSERT INTO briefings(date, payload, hash, updated) VALUES(?, ?, ?, ?) ON CONFLICT(date) DO UPDATE SET payload = excluded.payload, hash = excluded.hash, updated = excluded.updated', payload.date, serialized, hash, updated);
    return { date: payload.date, status: old?.hash === hash ? 'unchanged' : old ? 'updated' : 'created', hash, url: `https://hownote.net/care?date=${payload.date}` };
  }
  async fetch(request) {
    try { return await this.handle(request); }
    catch (error) { return json({ error: error.status ? error.message : '요청을 처리하지 못했습니다. 다시 시도해 주세요.' }, error.status || 500); }
  }
  async handle(request) {
    const url = new URL(request.url), path = url.pathname;
    if (oauthPath(path)) return this.oauth.handle(request);
    const publisher = path === '/care/api/publish' || path === '/care/mcp';
    if (publisher) {
      check(this.env.CARE_PUBLISH_TOKEN?.length >= 32, '게시 연결이 준비되지 않았습니다.', 503);
      const auth = request.headers.get('authorization') || '';
      let scopes = oauthScopes;
      const direct = await digest(auth) === await digest(`Bearer ${this.env.CARE_PUBLISH_TOKEN}`);
      if (!direct) {
        const access = auth.startsWith('Bearer ') && auth.length < 600 ? await this.oauth.access(auth.slice(7), url.origin + '/care/mcp') : null;
        if (!access) return json({ error: '게시 인증이 필요합니다.' }, 401, { 'WWW-Authenticate': oauthChallenge(url.origin) });
        scopes = access.scopes;
      }
      if (request.headers.has('origin')) check(request.headers.get('origin') === url.origin, '허용되지 않은 요청입니다.', 403);
      check(request.method === 'POST', 'POST 요청이 필요합니다.', 405);
      if (path === '/care/mcp') return this.mcp(await body(request), scopes, url.origin);
      check(scopes.includes('briefings:write'), '게시 권한이 필요합니다.', 403);
      return json(await this.publish(await body(request)));
    }
    const users = usersFrom(this.env); check(users, '자료실 입장 설정을 준비 중입니다.', 503);
    if (request.method !== 'GET') check(request.headers.get('origin') === url.origin, '페이지를 새로 연 뒤 다시 시도해 주세요.', 403);
    if (path === '/care/api/login' && request.method === 'POST') {
      const ip = await digest(request.headers.get('cf-connecting-ip') || 'local');
      this.rate(`login:${ip}`, 8, 900);
      const input = await body(request); const password = text(input.password, 256, '비밀번호');
      const matches = await Promise.all(users.map(user => verifyPassword(password, user)));
      check(matches.filter(Boolean).length === 1, '비밀번호를 확인해 주세요.', 401);
      const user = users[matches.indexOf(true)]; const token = hex(crypto.getRandomValues(new Uint8Array(32)));
      this.sql.exec('DELETE FROM sessions WHERE expires <= ?', Date.now());
      this.sql.exec('INSERT INTO sessions VALUES(?, ?, ?, ?)', await digest(token), user.id, user.hash, Date.now() + SESSION_SECONDS * 1000);
      this.sql.exec('DELETE FROM attempts WHERE key = ?', `login:${ip}`);
      return json({ user: publicUser(user) }, 200, { 'Set-Cookie': `${cookieName}=${token}; Path=/care; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}` });
    }
    const session = await this.session(request, users); check(session, '로그인이 필요합니다.', 401);
    if (path === '/care/api/me' && request.method === 'GET') return json({ user: publicUser(session.user) });
    if (path === '/care/api/logout' && request.method === 'POST') {
      this.sql.exec('DELETE FROM sessions WHERE token = ?', session.key);
      return json({ ok: true }, 200, { 'Set-Cookie': `${cookieName}=; Path=/care; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
    }
    if (path === '/care/api/briefings' && request.method === 'GET') {
      const q = (url.searchParams.get('q') || '').slice(0, 120);
      const before = url.searchParams.get('before') || '9999-99-99';
      const rows = this.rows("SELECT b.date, b.payload, b.updated, (SELECT count(*) FROM comments c WHERE c.date = b.date) as comments FROM briefings b WHERE b.date < ? AND instr(lower(json_extract(b.payload, '$.title')), lower(?)) > 0 ORDER BY b.date DESC LIMIT 31", before, q);
      return json({ items: rows.slice(0, 30).map(row => { const b = JSON.parse(row.payload); return { date: b.date, title: b.title, summary: b.summary, comments: row.comments, updated: row.updated }; }), next: rows.length > 30 ? rows[29].date : null });
    }
    const match = path.match(/^\/care\/api\/briefings\/(\d{4}-\d{2}-\d{2})(\/comments)?$/);
    if (match) {
      const date = match[1]; const row = this.rows('SELECT payload, updated FROM briefings WHERE date = ?', date)[0]; check(row, '자료를 찾을 수 없습니다.', 404);
      const briefing = JSON.parse(row.payload);
      if (!match[2] && request.method === 'GET') return json({ ...briefing, updated: row.updated, comments: this.rows('SELECT * FROM comments WHERE date = ? ORDER BY created, id', date) });
      if (match[2] && request.method === 'POST') {
        this.rate(`comment:${session.user.id}`, 30, 60);
        const input = await body(request); const content = text(input.body, 3000, '의견');
        const section = input.section || 'all'; check(section === 'all' || briefing.sections.some(s => s.id === section), '주제를 찾을 수 없습니다.');
        const id = text(input.id, 80, '의견 ID'); check(/^[a-zA-Z0-9-]+$/.test(id), '의견 ID를 확인해 주세요.');
        const old = this.rows('SELECT * FROM comments WHERE id = ?', id)[0];
        if (old) { check(old.user_id === session.user.id && old.date === date && old.section === section && old.body === content, '의견 ID가 이미 사용되었습니다.', 409); return json({ comment: old }); }
        const comment = { id, date, section, user_id: session.user.id, author: session.user.name, body: content, created: new Date().toISOString() };
        this.sql.exec('INSERT INTO comments VALUES(?, ?, ?, ?, ?, ?, ?)', ...Object.values(comment));
        return json({ comment }, 201);
      }
    }
    return json({ error: '요청한 경로를 찾을 수 없습니다.' }, 404);
  }
  async mcp(msg, scopes = oauthScopes, origin = 'https://hownote.net') {
    check(msg && msg.jsonrpc === '2.0' && typeof msg.method === 'string', 'JSON-RPC 요청을 확인해 주세요.');
    if (!('id' in msg)) return new Response(null, { status: 202, headers });
    const result = value => json({ jsonrpc: '2.0', id: msg.id, result: value });
    if (msg.method === 'initialize') return result({ protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'hownote-care', version: '1.1.0' } });
    if (msg.method === 'ping') return result({});
    if (msg.method === 'tools/list') return result({ tools: [
      { name: 'publish_briefing', securitySchemes: [{ type: 'oauth2', scopes: ['briefings:write'] }], description: 'Save the completed Korean welfare briefing to the private HowNote library. Preserve the complete report, source URLs, facts and estimates. Same date updates in place and preserves comments. Read back after publishing.', inputSchema: { type: 'object', properties: { briefing: { type: 'object', properties: { date: { type: 'string' }, title: { type: 'string' }, summary: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 }, sections: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } }, required: ['id', 'title', 'body'], additionalProperties: false } }, sources: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, url: { type: 'string' } }, required: ['title', 'url'], additionalProperties: false } } }, required: ['date', 'title', 'summary', 'sections', 'sources'], additionalProperties: false } }, required: ['briefing'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
      { name: 'get_recent_briefings', securitySchemes: [{ type: 'oauth2', scopes: ['briefings:read'] }], description: 'Read the last 7 saved briefings, without partner comments, to verify publication and avoid repeating past research.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, openWorldHint: false } },
    ] });
    if (msg.method === 'tools/call') {
      try {
        let data;
        const needed = msg.params?.name === 'publish_briefing' ? 'briefings:write' : 'briefings:read';
        if (!scopes.includes(needed)) return result({ content: [{type:'text',text:'이 도구의 권한으로 다시 연결해 주세요.'}], isError:true, _meta:{'mcp/www_authenticate':[oauthChallenge(origin) + ', scope="' + needed + '"']} });
        if (msg.params?.name === 'publish_briefing') data = await this.publish(msg.params.arguments?.briefing);
        else if (msg.params?.name === 'get_recent_briefings') data = this.rows('SELECT payload, hash, updated FROM briefings ORDER BY date DESC LIMIT 7').map(r => ({ ...JSON.parse(r.payload), hash: r.hash, updated: r.updated }));
        else return json({ jsonrpc: '2.0', id: msg.id, error: { code: -32602, message: 'Unknown tool' } });
        return result({ content: [{ type: 'text', text: JSON.stringify(data) }], isError: false });
      } catch (e) { return result({ content: [{ type: 'text', text: e.status ? e.message : '게시 처리 실패' }], isError: true }); }
    }
    return json({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found' } });
  }
}
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/care/api/') || path === '/care/mcp' || oauthPath(path)) {
      if (!env.CARE_STORE) return json({ error: '자료실 연결을 준비 중입니다.' }, 503);
      // Buffer bounded request bodies before crossing the Durable Object boundary.
      // This also lets early authentication failures respond without an in-flight upload.
      if (request.method === 'POST') {
        try {
          const reader = request.body?.getReader(); check(reader, '내용이 없습니다.');
          const chunks = []; let length = 0;
          while (true) {
            const { done, value } = await reader.read(); if (done) break;
            length += value.length;
            if (length > MAX_BODY * 2) { await reader.cancel(); return json({ error: '내용이 너무 큽니다.' }, 413); }
            if (length <= MAX_BODY) chunks.push(value);
          }
          if (length > MAX_BODY) return json({ error: '내용이 너무 큽니다.' }, 413);
          const bytes = new Uint8Array(length); let offset = 0;
          for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
          request = new Request(request, { body: bytes });
        } catch { return json({ error: '요청 내용을 읽지 못했습니다.' }, 400); }
      }
      return env.CARE_STORE.get(env.CARE_STORE.idFromName('private-briefings-v1')).fetch(request);
    }
    const response = await env.ASSETS.fetch(request);
    if (path === '/care' || path.startsWith('/care/')) {
      const copy = new Response(response.body, response); copy.headers.set('Cache-Control', 'no-store'); copy.headers.set('X-Robots-Tag', 'noindex, nofollow'); return copy;
    }
    return response;
  },
};
