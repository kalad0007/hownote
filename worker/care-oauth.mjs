// Private publisher OAuth: authorization code + S256 PKCE, public DCR clients.
// No remote client-metadata fetches; redirects are restricted to ChatGPT callbacks.
const enc = new TextEncoder();
const random = () => [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join('');
const hash = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map(x => x.toString(16).padStart(2, '0')).join('');
const challenge = async s => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const safe = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const oauthScopes = ['briefings:read', 'briefings:write'];
const common = {'Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
const json = (v, status = 200, extra = {}) => new Response(JSON.stringify(v), {status,headers:{...common,'Content-Type':'application/json; charset=utf-8',...extra}});
function need(ok, error = 'invalid_request', status = 400, description) { if (!ok) throw Object.assign(new Error(error), {status, oauth:true, description}); }
function unique(p) { for (const k of p.keys()) need(p.getAll(k).length === 1); return Object.fromEntries(p); }
function redirectAllowed(s) {
  try { const u = new URL(s); return u.origin === 'https://chatgpt.com' && !u.username && !u.password && !u.search && !u.hash &&
    (u.pathname === '/connector_platform_oauth_redirect' || /^\/connector\/oauth\/[a-zA-Z0-9_-]+$/.test(u.pathname)); } catch { return false; }
}
export function oauthPath(path) { return path.startsWith('/care/oauth/') || ['/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/care/mcp'].includes(path); }
export function oauthChallenge(origin) { return `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/care/mcp"`; }
export class CareOAuth {
  constructor(store) {
    this.store=store; this.sql=store.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS care_oauth (kind TEXT NOT NULL, key TEXT NOT NULL, payload TEXT NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(kind,key))');
  }
  get(kind,key) { const r=this.store.rows('SELECT payload FROM care_oauth WHERE kind=? AND key=? AND expires>?',kind,key,Date.now())[0]; return r ? JSON.parse(r.payload) : null; }
  put(kind,key,value,expires) { this.sql.exec('INSERT OR REPLACE INTO care_oauth VALUES(?,?,?,?)',kind,key,JSON.stringify(value),expires); }
  del(kind,key) { this.sql.exec('DELETE FROM care_oauth WHERE kind=? AND key=?',kind,key); }
  async credential() { need(this.store.env.CARE_PUBLISH_TOKEN?.length>=32,'temporarily_unavailable',503); return hash(this.store.env.CARE_PUBLISH_TOKEN); }
  async access(token,resource) {
    const cred=await this.credential(), key=await hash(token);
    const a=this.get('access',key); if(!a || a.resource!==resource) return null;
    const f=this.get('family',a.family); return f && f.credential===cred && f.resource===resource ? {scopes:f.scope.split(' ')} : null;
  }
  async handle(request) {
    try { return await this.route(request); } catch(e) { return json({error:e.oauth ? e.message : e.status===429 ? 'temporarily_unavailable' : 'server_error', ...(e.oauth && e.description ? {error_description:e.description} : {})},e.status||500); }
  }
  async route(request) {
    const u=new URL(request.url), origin=u.origin, resource=origin+'/care/mcp', path=u.pathname;
    // Production discovery never trusts an arbitrary Host alias.
    need(origin==='https://hownote.net' || ['localhost','127.0.0.1'].includes(u.hostname),'invalid_request');
    if(path.startsWith('/.well-known/')) {
      need(request.method==='GET','invalid_request',405);
      if(path.startsWith('/.well-known/oauth-protected-resource')) return json({resource,authorization_servers:[origin],scopes_supported:oauthScopes,bearer_methods_supported:['header'],resource_name:'HowNote 비공개 브리핑'});
      return json({issuer:origin,authorization_endpoint:origin+'/care/oauth/authorize',token_endpoint:origin+'/care/oauth/token',registration_endpoint:origin+'/care/oauth/register',revocation_endpoint:origin+'/care/oauth/revoke',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],token_endpoint_auth_methods_supported:['none'],revocation_endpoint_auth_methods_supported:['none'],code_challenge_methods_supported:['S256'],scopes_supported:oauthScopes,authorization_response_iss_parameter_supported:true});
    }
    const credential=await this.credential();
    this.sql.exec('DELETE FROM care_oauth WHERE expires<=?',Date.now());
    const ip=await hash(request.headers.get('cf-connecting-ip')||'local');
    if(path==='/care/oauth/register') {
      need(request.method==='POST','invalid_request',405);
      this.store.rate('oauth-register:'+ip,20,3600);
      need(request.headers.get('content-type')?.includes('application/json'));
      const b=await request.json();
      need(Array.isArray(b.redirect_uris) && b.redirect_uris.length>=1 && b.redirect_uris.length<=5 && b.redirect_uris.every(redirectAllowed),'invalid_redirect_uri');
      need(!b.token_endpoint_auth_method || b.token_endpoint_auth_method==='none','invalid_client_metadata');
      need(!b.grant_types || (Array.isArray(b.grant_types) && b.grant_types.every(x=>['authorization_code','refresh_token'].includes(x))),'invalid_client_metadata');
      need(!b.response_types || (Array.isArray(b.response_types) && b.response_types.length===1 && b.response_types[0]==='code'),'invalid_client_metadata');
      const client_id=random(); const client={client_id,client_name:typeof b.client_name==='string'?b.client_name.slice(0,120):'ChatGPT',redirect_uris:b.redirect_uris,token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']};
      // Unused registrations expire; authorized clients live as long as the grant.
      this.put('client',client_id,client,Date.now()+86400000);
      return json({...client,client_id_issued_at:Math.floor(Date.now()/1000)},201);
    }
    if(path==='/care/oauth/authorize' && request.method==='GET') {
      this.store.rate('oauth-authorize:'+ip,30,600);
      const p=unique(u.searchParams), client=this.get('client',p.client_id);
      need(client && client.redirect_uris.includes(p.redirect_uri),'invalid_client');
      need(p.response_type==='code' && p.code_challenge_method==='S256' && /^[A-Za-z0-9_-]{43}$/.test(p.code_challenge||''));
      need(p.resource===resource,'invalid_target');
      need(typeof p.state==='string' && p.state.length>0 && p.state.length<=2048);
      const scopes=[...new Set((p.scope||oauthScopes.join(' ')).split(' '))];
      need(scopes.length>0 && scopes.every(s=>oauthScopes.includes(s)),'invalid_scope');
      const pending=random(), csrf=random();
      this.put('pending',await hash(pending),{...p,scope:scopes.join(' '),csrf:await hash(csrf),credential},Date.now()+600000);
      const perms=scopes.map(s=>`<li>${s==='briefings:read'?'최근 브리핑 읽기':'브리핑 작성 및 같은 날짜의 글 수정'}</li>`).join('');
      return new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HowNote 게시 연결</title><style>body{font:17px/1.65 system-ui,sans-serif;margin:0;background:#f4f6f5;color:#17332d}main{max-width:460px;margin:6vh auto;padding:28px;background:white;border-radius:18px}h1{font-size:25px}label,input,button{display:block;box-sizing:border-box;width:100%}input{font:inherit;padding:12px;margin:8px 0 20px;border:1px solid #93a69f;border-radius:8px}button{font:inherit;padding:14px;background:#175d49;color:white;border:0;border-radius:8px}small{display:block;color:#53665f;margin-top:16px}@media(max-width:520px){main{margin:16px;padding:22px}}</style><main><h1>HowNote 게시 연결</h1><p>연결 요청: ${safe(client.client_name)}</p><ul>${perms}</ul><p>파트너 코멘트와 열람 비밀번호는 제공되지 않습니다.</p><form method="post" action="/care/oauth/authorize"><input type="hidden" name="pending" value="${pending}"><label for="key">게시 인증키</label><input id="key" name="publisher_key" type="password" required minlength="32" maxlength="512" autocomplete="off"><button type="submit">위 권한으로 연결 허용</button></form><small>Cloudflare에 등록한 64자리 게시 인증키를 입력해 주세요. 자료실 열람 비밀번호가 아닙니다. 창을 닫으면 연결하지 않습니다.</small></main></html>`,{headers:{...common,'Referrer-Policy':'same-origin','Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${p.redirect_uri}; frame-ancestors 'none'; base-uri 'none'`,'Set-Cookie':`care_oauth_csrf_${pending}=${csrf}; Path=/care/oauth/authorize; HttpOnly; Secure; SameSite=Lax; Max-Age=600`}});
    }
    need(request.method==='POST','invalid_request',405);
    need(request.headers.get('content-type')?.includes('application/x-www-form-urlencoded'));
    const raw=await request.text(); need(raw.length<=12000);
    const p=unique(new URLSearchParams(raw));
    if(path==='/care/oauth/authorize') {
      need(request.headers.get('origin')===origin,'invalid_request',403,'consent_origin_mismatch: HowNote 연결 화면에서 다시 제출해 주세요.');
      this.store.rate('oauth-consent:'+ip,8,900);
      need(/^[a-f0-9]{64}$/.test(p.pending||''),'invalid_request',403,'consent_request_missing: ChatGPT에서 연결을 다시 시작해 주세요.');
      const key=await hash(p.pending), cookieName='care_oauth_csrf_'+p.pending;
      const csrf=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
      const pending=this.get('pending',key);
      need(pending,'invalid_request',403,'consent_expired: 연결 화면이 만료됐거나 이미 사용됐습니다. ChatGPT에서 다시 연결해 주세요.');
      need(csrf,'invalid_request',403,'consent_cookie_missing: 연결 확인 쿠키가 전달되지 않았습니다. 기본 브라우저의 새 창에서 ChatGPT 연결을 다시 시작해 주세요.');
      const csrfHash=await hash(csrf), supplied=await hash(p.publisher_key||'');
      need(pending.csrf===csrfHash,'invalid_request',403,'consent_cookie_mismatch: 연결 확인 정보가 일치하지 않습니다. ChatGPT에서 다시 연결해 주세요.');
      need(pending.credential===credential,'invalid_request',403,'consent_key_changed: 연결 화면을 연 뒤 서버 인증키가 변경됐습니다. ChatGPT에서 다시 연결해 주세요.');
      need(supplied===credential,'access_denied',403);
      // No await between consuming the request and inserting its single-use code.
      const code=random(), codeHash=await hash(code);
      need(this.get('pending',key),'invalid_request',403); this.del('pending',key);
      this.put('code',codeHash,pending,Date.now()+120000);
      const redirect=new URL(pending.redirect_uri); redirect.searchParams.set('code',code); redirect.searchParams.set('state',pending.state); redirect.searchParams.set('iss',origin);
      return new Response(null,{status:303,headers:{...common,Location:redirect.href,'Set-Cookie':`${cookieName}=; Path=/care/oauth/authorize; HttpOnly; Secure; SameSite=Lax; Max-Age=0`}});
    }
    const client=this.get('client',p.client_id); need(client,'invalid_client',401);
    this.store.rate('oauth-token:'+ip,120,60);
    if(path==='/care/oauth/revoke') {
      const key=await hash(p.token||''), t=this.get('refresh',key)||this.get('access',key);
      if(t){const f=this.get('family',t.family);if(f?.client_id===p.client_id)this.del('family',t.family);}
      return json({});
    }
    need(path==='/care/oauth/token','invalid_request',404);
    need(p.resource===resource,'invalid_target');
    const access=random(), refresh=random(), ah=await hash(access), rh=await hash(refresh);
    let family,grant,until;
    if(p.grant_type==='authorization_code') {
      need(/^[A-Za-z0-9._~-]{43,128}$/.test(p.code_verifier||''),'invalid_grant');
      const ch=await challenge(p.code_verifier), key=await hash(p.code||'');
      const c=this.get('code',key);
      need(c && c.client_id===p.client_id && c.redirect_uri===p.redirect_uri && c.resource===resource && c.code_challenge===ch && c.credential===credential,'invalid_grant');
      this.del('code',key); family=random(); until=Date.now()+90*86400000;
      grant={client_id:p.client_id,resource,scope:c.scope,credential,refresh:rh,until};
    } else if(p.grant_type==='refresh_token') {
      const key=await hash(p.refresh_token||''), r=this.get('refresh',key);
      grant=r && this.get('family',r.family);
      need(grant && grant.client_id===p.client_id && grant.resource===resource && grant.credential===credential,'invalid_grant');
      if(grant.refresh!==key){this.del('family',r.family);need(false,'invalid_grant');}
      if(p.scope) need(p.scope===grant.scope,'invalid_scope');
      family=r.family; until=grant.until; grant={...grant,refresh:rh};
    } else need(false,'unsupported_grant_type');
    // Atomic within one synchronous DO turn: refresh replay revokes the family.
    this.put('family',family,grant,until);
    this.put('client',p.client_id,client,until);
    this.put('access',ah,{family,resource},Math.min(Date.now()+3600000,until));
    this.put('refresh',rh,{family},until);
    return json({access_token:access,token_type:'Bearer',expires_in:Math.min(3600,Math.floor((until-Date.now())/1000)),refresh_token:refresh,scope:grant.scope});
  }
}
