import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
const base=process.env.CARE_TEST_URL||'http://localhost:8787';
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const {token,users}=JSON.parse(readFileSync('.care-local-credentials.json','utf8'));
let n=0; const ok=(v,msg)=>{assert(v,msg);n++;console.log('PASS OAuth',msg);};
async function req(path,{method='GET',data,form,cookie,auth,origin=base}={}) {
 const r=await fetch(base+path,{method,redirect:'manual',headers:{...(data?{'Content-Type':'application/json'}:{}),...(form?{'Content-Type':'application/x-www-form-urlencoded'}:{}),Origin:origin,...(cookie?{Cookie:cookie}:{}),...(auth?{Authorization:'Bearer '+auth}:{})},body:data?JSON.stringify(data):form?new URLSearchParams(form):undefined});
 const text=await r.text();let j;try{j=JSON.parse(text);}catch{}
 return {status:r.status,headers:r.headers,text,j};
}
const post=(path,data)=>req(path,{method:'POST',data});
let r=await req('/.well-known/oauth-authorization-server');ok(r.j.issuer===base&&r.j.code_challenge_methods_supported[0]==='S256','issuer discovery and S256');
r=await req('/.well-known/oauth-protected-resource/care/mcp');ok(r.j.resource===base+'/care/mcp','path-specific resource discovery');
r=await req('/care/mcp',{method:'POST',data:{jsonrpc:'2.0',id:1,method:'initialize'}});ok(r.status===401&&r.headers.get('www-authenticate').includes('/care/mcp'),'unauthenticated MCP advertises OAuth');
for(const uri of ['https://evil.example/callback','https://chatgpt.com.evil.example/connector_platform_oauth_redirect','https://chatgpt.com/connector_platform_oauth_redirect?next=evil','https://chatgpt.com/other']) {
 r=await post('/care/oauth/register',{redirect_uris:[uri]});ok(r.status===400,'reject unsafe callback '+uri);
}
const redirect_uri='https://chatgpt.com/connector_platform_oauth_redirect';
r=await post('/care/oauth/register',{client_name:'ChatGPT <test>',redirect_uris:[redirect_uri],token_endpoint_auth_method:'none'});
ok(r.status===201&&r.j.client_id&&!r.j.client_secret,'public client registered');const client_id=r.j.client_id;
const resource=base+'/care/mcp';
const verifier=randomBytes(32).toString('base64url'); const code_challenge=createHash('sha256').update(verifier).digest('base64url');
const params={client_id,redirect_uri,response_type:'code',code_challenge,code_challenge_method:'S256',state:'test-state',resource,scope:'briefings:read briefings:write'};
const begin=async p=>req('/care/oauth/authorize?'+new URLSearchParams({...params,...p}));
r=await begin({code_challenge_method:'plain'});ok(r.status===400,'plain PKCE rejected');
r=await begin({resource:'https://evil.example/mcp'});ok(r.status===400,'wrong resource rejected');
r=await begin({scope:'comments:read'});ok(r.status===400,'unadvertised scope rejected');
r=await begin({redirect_uri:'https://chatgpt.com/connector/oauth/unregistered'});ok(r.status===400,'exact registered callback enforced');
async function consent(scope=params.scope){
 const r=await begin({scope});assert.equal(r.status,200);
 return {cookie:r.headers.get('set-cookie').split(';')[0],form:{pending:r.text.match(/name="pending" value="([a-f0-9]+)"/)[1],publisher_key:token},page:r};
}
let c=await consent();
const other=await consent();
const sharedCookies=c.cookie+'; '+other.cookie;
ok(c.cookie.split('=')[0]!==other.cookie.split('=')[0],'independent consent flows have independent cookies');
c.cookie=sharedCookies;ok(c.page.text.includes('&lt;test&gt;')&&!c.page.text.includes(token),'consent escapes client name and never embeds credential');
ok(c.page.headers.get('content-security-policy').includes("form-action 'self'")&&c.page.headers.get('set-cookie').includes('HttpOnly'),'consent form and cookie protected');
const approve=options=>req('/care/oauth/authorize',{method:'POST',...options});
ok(c.page.headers.get('referrer-policy')==='same-origin','HTML consent preserves Origin on same-origin form POST');
ok(c.page.headers.get('content-security-policy').includes(redirect_uri),'form policy permits the validated OAuth callback redirect');
r=await approve({...c,origin:'null'});ok(r.status===403&&r.j.error_description.startsWith('consent_origin_mismatch:'),'null Origin remains rejected');
r=await approve({form:c.form});ok(r.status===403&&r.j.error_description.startsWith('consent_cookie_missing:'),'consent requires browser CSRF cookie with actionable error');
r=await approve({...c,origin:'https://evil.example'});ok(r.status===403,'cross-origin consent rejected');
r=await approve({...c,form:{...c.form,publisher_key:users[0].password}});ok(r.status===403,'reader password cannot authorize publisher');
r=await approve(c);ok(r.status===303,'owner credential grants consent');
const location=new URL(r.headers.get('location'));ok(location.origin==='https://chatgpt.com'&&location.searchParams.get('state')==='test-state'&&location.searchParams.get('iss')===base,'callback carries code state and issuer');
r=await approve(c);ok(r.status===403,'consent cannot be replayed');
const grant={grant_type:'authorization_code',client_id,redirect_uri,resource,code:location.searchParams.get('code'),code_verifier:verifier};
const exchange=form=>req('/care/oauth/token',{method:'POST',form});
r=await exchange({...grant,code_verifier:'x'.repeat(43)});ok(r.status===400,'incorrect PKCE verifier rejected');
r=await exchange({...grant,resource:'https://evil.example/mcp'});ok(r.status===400,'token audience enforced');
const pair=await Promise.all([exchange(grant),exchange(grant)]);ok(pair.filter(x=>x.status===200).length===1&&pair.filter(x=>x.status===400).length===1,'concurrent code redemption succeeds once');
let tokens=pair.find(x=>x.status===200).j;
const rpc=(auth,name,args={})=>req('/care/mcp',{method:'POST',auth,data:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}}});
r=await req('/care/mcp',{method:'POST',auth:tokens.access_token,data:{jsonrpc:'2.0',id:1,method:'tools/list'}});ok(r.j.result.tools.every(t=>t.securitySchemes[0].type==='oauth2'),'MCP tools declare OAuth scopes');
const briefing=JSON.parse(readFileSync('tests/fixtures/care-briefing.json','utf8'));
r=await rpc(tokens.access_token,'publish_briefing',{briefing});ok(!r.j.result.isError,'OAuth publishes briefing');
r=await rpc(tokens.access_token,'get_recent_briefings');ok(!r.j.result.isError&&JSON.parse(r.j.result.content[0].text)[0].date===briefing.date,'OAuth reads back stored briefing');
r=await req('/care/api/me',{auth:tokens.access_token});ok(r.status===401,'OAuth cannot impersonate a reader');
const old=tokens.refresh_token;
r=await exchange({grant_type:'refresh_token',client_id,resource,refresh_token:old});ok(r.status===200&&r.j.refresh_token!==old,'refresh rotates token');tokens=r.j;
r=await rpc(tokens.access_token,'get_recent_briefings');ok(!r.j.result.isError,'refreshed token works');
r=await exchange({grant_type:'refresh_token',client_id,resource,refresh_token:old});ok(r.status===400,'refresh replay rejected');
r=await rpc(tokens.access_token,'get_recent_briefings');ok(r.status===401,'refresh replay revokes family');
c=await consent('briefings:read');r=await approve(c);const code=new URL(r.headers.get('location')).searchParams.get('code');
r=await exchange({...grant,code});tokens=r.j;
r=await rpc(tokens.access_token,'publish_briefing',{briefing});ok(r.j.result.isError&&r.j.result._meta['mcp/www_authenticate'],'read-only grant cannot publish');
r=await req('/care/api/publish',{method:'POST',auth:tokens.access_token,data:briefing});ok(r.status===403,'REST also enforces write scope');
r=await req('/care/oauth/revoke',{method:'POST',form:{client_id,token:tokens.refresh_token}});ok(r.status===200,'revocation succeeds');
r=await rpc(tokens.access_token,'get_recent_briefings');ok(r.status===401,'revocation removes access');
console.log(`${n} OAuth integration checks passed.`);
