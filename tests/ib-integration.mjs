import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seedIb, candidateSubjects } from '../scripts/ib-local-seed.mjs';
const base=process.env.IB_TEST_URL || 'http://127.0.0.1:8787';
assert(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Local runtime only');
import { TEST_PIN, TEST_PUBLISH_TOKEN as token, TEST_READ_TOKEN as readToken } from './fixtures/ib-reader.mjs';
const care=JSON.parse(readFileSync('.care-local-credentials.json','utf8'));
let count=0;
function ok(condition,message){assert(condition,message);count++;console.log('PASS',message);}
async function req(path,{data,cookie,bearer,origin=base,method,ip}={}) {
  const response=await fetch(base+path,{method:method || (data===undefined?'GET':'POST'),headers:{...(data===undefined?{}:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})}),...(cookie?{Cookie:cookie}:{}),...(bearer?{Authorization:`Bearer ${bearer}`} : {}),...(ip?{'CF-Connecting-IP':ip}:{})},body:data===undefined?undefined:JSON.stringify(data),redirect:'manual'});
  const text=await response.text();let json;try{json=JSON.parse(text);}catch{}
  return {status:response.status,headers:response.headers,json,text,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
const login=async(cookie)=>{const r=await req('/ib/api/login',{cookie,data:{pin:TEST_PIN}});ok(r.status===200&&r.json.user.role==='reader'&&r.json.user.id==='pin-reader','PIN login always grants reader access');return r.cookie;};
const list=async(cookie,extra='')=>req(`/ib/api/research?projectKey=ib-research${extra}`,{cookie});
const detail=async(key,cookie,revision)=>req(`/ib/api/research/${key}${revision?`/revisions/${revision}`:''}?projectKey=ib-research`,{cookie});
const publish=async(research,options={})=>req('/ib/api/publish',{bearer:token,data:{research,expectedRevision:0,requestId:crypto.randomUUID(),...options}});
const rpc=async(name,args,bearer=token)=>req('/ib/mcp',{bearer,data:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}}});
const rpcData=r=>JSON.parse(r.json.result.content[0].text);

let r=await req('/ib/api/research?projectKey=ib-research');ok(r.status===401,'Anonymous cannot read IB studies');
for(const path of ['/ib/api/subjects','/ib/api/research/sample-linear-model?projectKey=ib-research','/ib/api/research/sample-linear-model/revisions/1?projectKey=ib-research']) {r=await req(path);ok(r.status===401,`Anonymous boundary: ${path}`);}
const fixture=JSON.parse(readFileSync('tests/fixtures/ib-research.json','utf8'));
for(const path of ['/ib','/ib/research','/ib/edit','/ib/subjects']) {r=await req(path);ok(r.status===200&&!r.text.includes(fixture.title),'Static shell contains no saved research: '+path);ok(r.headers.get('cache-control')==='no-store'&&r.headers.get('x-robots-tag')?.includes('noindex'),'Private shell headers: '+path);}
r=await req('/ib/api/login',{data:{pin:TEST_PIN},origin:'https://other.invalid'});ok(r.status===403,'Cross-origin login rejected');
r=await req('/ib/api/login',{data:{pin:'1111'}});ok(r.status===401,'Incorrect IB PIN rejected');
let reader=await login();
const previousReader=reader;reader=await login(reader);
r=await req('/ib/api/me',{cookie:previousReader});ok(r.status===401,'Re-authentication replaces the old browser session');
r=await req('/ib/api/login',{data:{pin:TEST_PIN}});ok(/HttpOnly/.test(r.headers.get('set-cookie'))&&/Secure/.test(r.headers.get('set-cookie'))&&/SameSite=Strict/.test(r.headers.get('set-cookie'))&&/Path=\/ib/.test(r.headers.get('set-cookie')),'IB session flags and path isolation');
ok(/Max-Age=43200/.test(r.headers.get('set-cookie')),'PIN session has a fixed 12-hour browser lifetime');
const careSession=await req('/care/api/login',{data:{password:care.users[0].password}});
const careBefore=await req('/care/api/briefings/2026-09-14',{cookie:careSession.cookie});ok(careBefore.status===200&&careBefore.json.comments.length>=2,'Existing Care fixture and comments present before IB writes');
r=await req('/ib/api/me',{cookie:careSession.cookie});ok(r.status===401,'Care reader session grants no IB access');
r=await req('/care/api/me',{cookie:reader});ok(r.status===401,'IB session grants no Care access');
r=await req('/ib/api/publish',{bearer:care.token,data:{research:fixture,expectedRevision:0,requestId:crypto.randomUUID()}});ok(r.status===401,'Care publishing token grants no IB access');
r=await req('/care/api/publish',{bearer:token,data:JSON.parse(readFileSync('tests/fixtures/care-briefing.json','utf8'))});ok(r.status===401,'IB publishing token grants no Care access');
r=await req('/care/mcp',{bearer:care.token,data:{jsonrpc:'2.0',id:1,method:'tools/list'}});ok(r.json.result.tools.length===2&&r.json.result.tools.map(t=>t.name).join(',')==='publish_briefing,get_recent_briefings','Legacy MCP tool schemas and names preserved');

await seedIb(base,{token});
r=await list(reader);ok(r.json.items.length===5,'Multiple studies on one date are retained');
ok(r.json.items.every(item=>item.date===fixture.date),'Same-date records use independent content keys');
r=await list(reader,'&subject=mathematics-aa');ok(r.json.items.length===1&&r.json.items[0].contentKey===fixture.contentKey,'Subject filter resolves one shared research record');
r=await list(reader,'&subject=economics');ok(r.json.items.length===1&&r.json.items[0].contentKey===fixture.contentKey,'Second subject refers to the same record without copying');
for(const [filter,expected] of [['category=platform-planning',1],['category=development-operations',1],['category=korea-market',1],['level=SL',2],['materialKind=original-question',1],['reviewStatus=needs-review',5],['q='+encodeURIComponent('선형'),1]]) {r=await list(reader,'&'+filter);ok(r.status===200&&r.json.items.length===expected,'Filter '+filter);}
let cursor=null,paged=[];
do {r=await list(reader,'&limit=1'+(cursor?'&cursor='+encodeURIComponent(cursor):''));ok(r.status===200,'Stable date/key pagination');paged.push(...r.json.items.map(item=>item.contentKey));cursor=r.json.next;}while(cursor);
ok(paged.length===5&&new Set(paged).size===5,'Same-date pagination has no gaps or duplicate keys');
r=await list(reader,'&cursor=not-valid');ok(r.status===400,'Malformed cursor rejected');
r=await req('/ib/api/research?projectKey=care',{cookie:reader});ok(r.status===403,'Cross-project list rejected');
r=await req('/ib/api/research/sample-linear-model?projectKey=care',{cookie:reader});ok(r.status===403,'Cross-project detail rejected');
r=await req('/ib/api/research',{cookie:reader,data:{research:fixture,expectedRevision:1,requestId:crypto.randomUUID()}});ok(r.status===403,'Reader cannot write research');
r=await req('/ib/api/subjects',{cookie:reader,data:{subject:candidateSubjects[0],expectedRevision:1,requestId:crypto.randomUUID()}});ok(r.status===403,'PIN reader cannot change subject taxonomy');
r=await req('/ib/api/research',{cookie:reader,data:{research:fixture,expectedRevision:1,requestId:crypto.randomUUID()},origin:'https://other.invalid'});ok(r.status===403,'Cross-origin research write rejected');
r=await req('/ib/api/research',{cookie:reader,data:{research:fixture,expectedRevision:1,requestId:crypto.randomUUID()},origin:null});ok(r.status===403,'Browser write requires same-origin proof');


for(const input of [{pin:'123'},{pin:1234},{password:'legacy-admin-password'},{pin:TEST_PIN,role:'admin'}]) {
  r=await req('/ib/api/login',{data:input,ip:'192.0.2.'+(40+count)});ok(r.status===400&&!r.cookie,'PIN login rejects malformed, legacy password and role-spoofed fields');
}
r=await req('/ib/api/me',{cookie:'ib_session='+'f'.repeat(64)});ok(r.status===401,'Invented session token cannot authenticate');
for(const path of ['/ib/api/research','/ib/api/subjects','/ib/api/research/sample-linear-model','/ib/api/subjects/mathematics-aa','/ib/api/pin','/ib/api/setup']) {
  for(const method of ['POST','PUT','PATCH','DELETE']) {
    r=await req(path,{cookie:reader,method,data:{actor:{role:'admin'},pin:TEST_PIN}});
    ok(r.status===403,'PIN session blocks '+method+' '+path+' (status '+r.status+')');
  }
}
for(const path of ['/ib/api/publish','/ib/api/publish-subject','/ib/mcp']) {
  r=await req(path,{cookie:reader,data:{}});ok(r.status===401,'PIN cookie grants no publishing authority at '+path);
  r=await req(path,{bearer:TEST_PIN,data:{}});ok(r.status===401,'Four-digit PIN grants no bearer authority at '+path);
}

const first=await detail(fixture.contentKey,reader);ok(first.json.revision===1&&first.json.research.metadata.designPrinciples.length===2,'Full structured research stored and read back');
const requestId='integration-retry-original',fresh={...structuredClone(fixture),contentKey:'retry-study'};
r=await publish(fresh,{requestId});const original=r.json;ok(r.status===200&&original.revision===1,'Publisher creates independent record');
r=await publish(fresh,{requestId});assert.deepEqual(r.json,original);ok(true,'Exact request retry returns its original result');
r=await publish({...fresh,title:'different body'},{requestId});ok(r.status===409,'Reused request ID with different content rejected');
r=await publish({...fresh,title:'edit v2',reviewNote:'Second revision preserves source v1'},{expectedRevision:1});ok(r.json.revision===2,'Optimistic update appends a new revision');
r=await publish(fresh,{requestId});assert.deepEqual(r.json,original);ok(true,'Delayed retry does not roll back a later revision');
r=await detail('retry-study',reader);ok(r.json.revision===2&&r.json.research.title==='edit v2'&&r.json.history.length===2,'Retry leaves current revision intact');
r=await publish({...fresh,title:'stale change'},{expectedRevision:1});ok(r.status===409,'Stale update cannot overwrite a newer revision');
const edit={...structuredClone(fixture),title:'검수 실험용 수정 제목',reviewStatus:'approved',reviewNote:'자체 작성 문항 설계 검수 실험'};
edit.sources[0].version='실험 v2';edit.metadata.constraints.push('수정본에 추가한 조건');
r=await publish(edit,{expectedRevision:1});ok(r.status===403,'Connector cannot approve a study');
r=await req('/ib/api/research',{cookie:reader,data:{research:edit,expectedRevision:1,requestId:crypto.randomUUID()}});ok(r.status===403,'PIN reader cannot spoof reviewer approval');
r=await publish({...edit,reviewStatus:'needs-review'},{expectedRevision:1});ok(r.status===200&&r.json.revision===2,'Publisher revises design metadata without self-approving');
r=await detail(fixture.contentKey,reader,1);ok(r.json.research.title===fixture.title&&r.json.research.sources[0].version==='실험 v1'&&r.json.research.reviewStatus==='needs-review','Original source, body and review snapshot preserved');
r=await detail(fixture.contentKey,reader);ok(r.json.history[0].actor==='token-ib_publish_token'&&r.json.history[0].reviewStatus==='needs-review'&&r.json.research.metadata.constraints.at(-1)==='수정본에 추가한 조건','Review history records authenticated actor and design changes');
const contenders=[1,2].map(index=>publish({...fresh,title:`concurrent-${index}`},{expectedRevision:2}));
const concurrent=await Promise.all(contenders);ok(concurrent.filter(x=>x.status===200).length===1&&concurrent.filter(x=>x.status===409).length===1,'Concurrent compare-and-swap commits exactly one update');

const countBeforeInvalid=(await list(reader,'&limit=30')).json.items.length;
for(const [label,mutate,status=400] of [
  ['invalid date',x=>x.date='2026-02-30'],['invalid key',x=>x.contentKey='Bad_Key'],['wrong project',x=>x.projectKey='care',403],
  ['unknown subject',x=>x.subjectKeys=['missing-subject']],['unsafe source URL',x=>{x.sources[0].kind='external-reference';x.sources[0].rightsStatus='link-only';x.sources[0].url='javascript:alert(1)';}],
  ['external source labelled original',x=>{x.sources[0].kind='external-reference';x.sources[0].rightsStatus='licensed';x.sources[0].url='https://example.com';x.sources[0].permissionEvidence='local synthetic permission';}],
  ['missing license evidence',x=>{x.materialKind='independent-analysis';x.sources[0].kind='external-reference';x.sources[0].rightsStatus='licensed';x.sources[0].url='https://example.com';x.sources[0].permissionEvidence='';}],
  ['link-only generation permission',x=>{x.materialKind='independent-analysis';x.sources[0].kind='external-reference';x.sources[0].rightsStatus='link-only';x.sources[0].url='https://example.com';}],
  ['unconfirmed generation eligibility',x=>{x.sources[0].generationAllowed=false;}],['spoofed review actor',x=>x.reviewActor='admin'],
]) {const bad=structuredClone(fixture);bad.contentKey=`bad-study-${count}`;mutate(bad);r=await publish(bad);ok(r.status===status,'Validation rejects '+label);}
r=await publish({...structuredClone(fixture),contentKey:'too-large',body:'x'.repeat(190000)});ok(r.status===413,'Oversized upload bounded before storage');
r=await list(reader,'&limit=30');ok(r.json.items.length===countBeforeInvalid,'Failed validation does not create research');
const archived={...candidateSubjects[0],active:false,name:'Mathematics AA · 이름 수정'};
r=await req('/ib/api/publish-subject',{bearer:token,data:{subject:archived,expectedRevision:1,requestId:crypto.randomUUID()}});ok(r.status===200&&r.json.revision===2,'Subject rename/archive appends revision');
r=await list(reader,'&subject=mathematics-aa');ok(r.json.items.some(item=>item.contentKey===fixture.contentKey),'Archived subject retains existing study references');
r=await publish({...structuredClone(fixture),contentKey:'archived-new'});ok(r.status===400,'New links to archived subjects rejected');
const current=(await detail(fixture.contentKey,reader)).json;
r=await req('/ib/api/publish',{bearer:token,data:{research:{...current.research,reviewNote:'기존 보관 과목 참조 보존 확인'},expectedRevision:current.revision,requestId:crypto.randomUUID()}});ok(r.status===200,'Existing references remain editable after subject archive');
r=await req('/ib/api/subjects/mathematics-aa/history',{cookie:reader});ok(r.json.items.length===2&&r.json.items[1].payload.name===candidateSubjects[0].name,'Subject version history preserved');

r=await req('/ib/mcp',{bearer:token,data:{jsonrpc:'2.0',id:1,method:'tools/list'}});ok(r.json.result.tools.length===5&&r.json.result.tools[0].inputSchema.properties.research.properties.projectKey.enum[0]==='ib-research','IB MCP advertises project-aware schema');
r=await rpc('list_research',{projectKey:'ib-research',subject:'economics'},readToken);ok(!r.json.result.isError&&rpcData(r).items.length>=1,'Read-only connector can filter research');
r=await rpc('get_research',{projectKey:'ib-research',contentKey:fixture.contentKey,revision:1},readToken);ok(!r.json.result.isError&&rpcData(r).research.sources[0].version==='실험 v1','MCP retrieves immutable full detail');
r=await rpc('list_subjects',{projectKey:'ib-research'});ok(rpcData(r).items.every(subject=>subject.priorityStatus==='candidate'),'Candidate subjects never become a claimed verified ranking');
r=await rpc('get_research',{projectKey:'care',contentKey:fixture.contentKey});ok(r.json.result.isError,'MCP cross-project access rejected');
r=await rpc('publish_research',{requestId:crypto.randomUUID(),expectedRevision:0,research:{...fixture,contentKey:'readonly-write'}},readToken);ok(r.json.result.isError,'Read-only connector cannot write');
r=await rpc('upsert_subject',{requestId:crypto.randomUUID(),expectedRevision:0,subject:{...candidateSubjects[1],key:'mcp-candidate'}},readToken);ok(r.json.result.isError,'Read-only MCP token cannot manage subjects');
r=await rpc('upsert_subject',{requestId:'mcp-subject-retry',expectedRevision:0,subject:{...candidateSubjects[1],key:'mcp-candidate'}});const subjectFirst=rpcData(r);ok(!r.json.result.isError&&subjectFirst.revision===1,'Separate MCP publisher manages subject candidates');
r=await rpc('upsert_subject',{requestId:'mcp-subject-retry',expectedRevision:0,subject:{...candidateSubjects[1],key:'mcp-candidate'}});assert.deepEqual(rpcData(r),subjectFirst);ok(true,'Subject publication retry is idempotent');
const mcpStudy={...structuredClone(fixture),contentKey:'mcp-study',subjectKeys:['economics']},mcpArgs={requestId:crypto.randomUUID(),expectedRevision:0,research:mcpStudy};
r=await rpc('publish_research',mcpArgs);const mcpFirst=rpcData(r);ok(!r.json.result.isError&&mcpFirst.status==='created','MCP publication reaches only IB storage');
r=await rpc('publish_research',mcpArgs);assert.deepEqual(rpcData(r),mcpFirst);ok(true,'MCP publication retry is idempotent');
const careAfter=await req('/care/api/briefings/2026-09-14',{cookie:careSession.cookie});assert.deepEqual(careAfter.json,careBefore.json);ok(true,'Care full report, update timestamp and comments unchanged after all IB writes');
r=await req('/ib/api/logout',{cookie:reader,data:{}});ok(r.status===200,'IB logout revokes session');
r=await req('/ib/api/me',{cookie:reader});ok(r.status===401,'Revoked IB session cannot be reused');

for(let i=0;i<5;i++) {r=await req('/ib/api/login',{data:{pin:'1111'},ip:'192.0.2.124'});ok(r.status===401,'First five wrong PIN attempts are accounted for');}
r=await req('/ib/api/login',{data:{pin:TEST_PIN},ip:'192.0.2.124'});ok(r.status===429&&Number(r.headers.get('retry-after'))>0&&r.json.retryAfter<=900,'IP cooldown blocks even a correct PIN with Retry-After');
r=await req('/ib/api/login',{data:{pin:TEST_PIN},ip:'192.0.2.124'});ok(r.status===429,'Repeated requests do not clear the PIN cooldown');
const distributedBurst=await Promise.all(Array.from({length:21},(_,i)=>req('/ib/api/login',{data:{pin:'1111'},ip:'198.51.100.'+(i+1)})));
ok(distributedBurst.every(response=>[401,429].includes(response.status))&&distributedBurst.filter(response=>response.status===401).length<=20&&distributedBurst.some(response=>response.status===429),'Concurrent distributed PIN guesses respect the global attempt budget');
r=distributedBurst.find(response=>response.status===429);
ok(r.json.retryAfter<=3600&&Number(r.headers.get('retry-after'))>0,'Global PIN budget returns an actionable cooldown for different IPs');
r=await req('/ib/api/login',{data:{pin:TEST_PIN},ip:'203.0.113.250'});ok(r.status===429&&Number(r.headers.get('retry-after'))>900,'Fresh IP and correct PIN cannot bypass global cooldown');
r=await req('/ib/mcp',{bearer:token,data:{jsonrpc:'2.0',id:1,method:'tools/list'}});ok(r.status===200,'PIN cooldown leaves separate publication access intact');
r=await req('/care/api/me',{cookie:careSession.cookie});ok(r.status===200,'PIN cooldown leaves the existing Care session intact');

console.log(`${count} IB integration checks passed against the real local Cloudflare Durable Object runtime.`);
