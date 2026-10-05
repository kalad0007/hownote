import { DurableObject } from 'cloudflare:workers';
import { PROJECT_KEY, categories, materialKinds, reviewStatuses, requireValue as need, key, date, validateResearch, validateSubject, researchInputSchema } from './ib-schema.mjs';
import { PIN_SESSION_SECONDS, PIN_READER, validPin, readerCredential, pinMatches, pinSignature, pinSessionUser } from './ib-reader-auth.mjs';

const encoder = new TextEncoder();
const MAX_BODY = 180000;
const commonHeaders = {
  'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Robots-Tag':'noindex, nofollow',
  'X-Content-Type-Options':'nosniff', 'X-Frame-Options':'DENY', 'Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",
};
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers:commonHeaders });
const hex = bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2,'0')).join('');
const digest = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const cookie = (token, seconds) => `ib_session=${token}; Path=/ib; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
const identity = user => ({id:user.id,name:user.name,role:user.role});
async function requestBody(request) {
  need(request.headers.get('content-type')?.includes('application/json'), 'JSON 형식으로 요청해 주세요.',415);
  const reader = request.body?.getReader(); need(reader,'요청 내용이 없습니다.');
  let size=0; const chunks=[];
  while (true) {
    const {done,value}=await reader.read(); if(done) break;
    size += value.length;
    if (size > MAX_BODY) { await reader.cancel(); need(false,'연구 자료가 너무 큽니다. 나누어 저장해 주세요.',413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset=0;
  for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length;}
  try {return JSON.parse(new TextDecoder().decode(bytes));} catch {need(false,'JSON 형식을 확인해 주세요.');}
}
function envelope(input, field) {
  need(input && typeof input === 'object' && Object.keys(input).every(name => ['requestId','expectedRevision',field].includes(name)), '저장 요청 형식을 확인해 주세요.');
  need(typeof input.requestId === 'string' && /^[a-zA-Z0-9-]{8,100}$/.test(input.requestId), '재시도용 요청 키를 확인해 주세요.');
  need(Number.isSafeInteger(input.expectedRevision) && input.expectedRevision >= 0, '현재 수정 버전을 지정해 주세요.');
}
function project(value) { need(value === PROJECT_KEY,'IB 연구 프로젝트만 사용할 수 있습니다.',403); }

export class IbStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx,env); this.env=env; this.storage=ctx.storage; this.sql=ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS ib_subjects (key TEXT PRIMARY KEY, payload TEXT NOT NULL, revision INTEGER NOT NULL, updated TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ib_subject_revisions (key TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, actor TEXT NOT NULL, created TEXT NOT NULL, PRIMARY KEY(key,revision));
      CREATE TABLE IF NOT EXISTS ib_research (content_key TEXT PRIMARY KEY, date TEXT NOT NULL, category TEXT NOT NULL, material_kind TEXT NOT NULL, review_status TEXT NOT NULL, payload TEXT NOT NULL, hash TEXT NOT NULL, revision INTEGER NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS ib_research_date ON ib_research(date DESC,content_key DESC);
      CREATE TABLE IF NOT EXISTS ib_research_subjects (content_key TEXT NOT NULL REFERENCES ib_research(content_key), subject_key TEXT NOT NULL REFERENCES ib_subjects(key), PRIMARY KEY(content_key,subject_key));
      CREATE INDEX IF NOT EXISTS ib_research_subject ON ib_research_subjects(subject_key,content_key);
      CREATE TABLE IF NOT EXISTS ib_revisions (content_key TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, hash TEXT NOT NULL, actor TEXT NOT NULL, created TEXT NOT NULL, PRIMARY KEY(content_key,revision));
      CREATE TABLE IF NOT EXISTS ib_requests (request_id TEXT PRIMARY KEY, hash TEXT NOT NULL, actor TEXT NOT NULL, response TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ib_sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, credential TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS ib_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
    `);
  }
  rows(sql,...args) { return this.sql.exec(sql,...args).toArray(); }
  rate(key,limit,seconds) {
    this.sql.exec('DELETE FROM ib_attempts WHERE expires<=?',Date.now());
    const current=this.rows('SELECT count,expires FROM ib_attempts WHERE key=?',key)[0];
    if(current?.count>=limit) {
      const error=new Error('요청이 많습니다. 잠시 후 다시 시도해 주세요.');error.status=429;error.retryAfter=Math.max(1,Math.ceil((current.expires-Date.now())/1000));throw error;
    }
    this.sql.exec('INSERT INTO ib_attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1',key,Date.now()+seconds*1000);
  }
  async session(request,credential) {
    const token=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('ib_session='))?.slice(11);
    if(!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const tokenHash=await digest(token);
    const row=this.rows('SELECT * FROM ib_sessions WHERE token=? AND expires>?',tokenHash,Date.now())[0];
    const user=pinSessionUser(row,credential);
    return user ? {user,tokenHash} : null;
  }
  subjects() { return this.rows("SELECT * FROM ib_subjects ORDER BY json_extract(payload,'$.order'),key").map(row=>({...JSON.parse(row.payload),revision:row.revision,updated:row.updated})); }
  detail(contentKey,revision) {
    const row=revision === undefined ? this.rows('SELECT * FROM ib_research WHERE content_key=?',key(contentKey))[0] : this.rows('SELECT * FROM ib_revisions WHERE content_key=? AND revision=?',key(contentKey),revision)[0];
    need(row,'연구를 찾을 수 없습니다.',404);
    const history=this.rows('SELECT revision,actor,created,payload,hash FROM ib_revisions WHERE content_key=? ORDER BY revision DESC',contentKey).map(entry=>{
      const payload=JSON.parse(entry.payload);
      return {revision:entry.revision,actor:entry.actor,created:entry.created,hash:entry.hash,reviewStatus:payload.reviewStatus,reviewNote:payload.reviewNote};
    });
    return {research:JSON.parse(row.payload),revision:row.revision,hash:row.hash,created:row.created,updated:row.updated || row.created,history};
  }
  list(query) {
    project(query.projectKey);
    need(Object.keys(query).every(name=>['projectKey','category','subject','level','materialKind','reviewStatus','q','cursor','limit'].includes(name)), '지원하지 않는 검색 조건입니다.');
    const clauses=[],args=[];
    for(const [field,column,allowed] of [['category','category',categories],['materialKind','material_kind',materialKinds],['reviewStatus','review_status',reviewStatuses]]) {
      if(query[field]) {need(allowed.includes(query[field]),'검색 조건을 확인해 주세요.');clauses.push(`${column}=?`);args.push(query[field]);}
    }
    if(query.subject) {clauses.push('EXISTS(SELECT 1 FROM ib_research_subjects s WHERE s.content_key=r.content_key AND s.subject_key=?)');args.push(key(query.subject,'과목 키'));}
    if(query.level) {need(['SL','HL'].includes(query.level),'수준을 확인해 주세요.');clauses.push("EXISTS(SELECT 1 FROM json_each(r.payload,'$.metadata.levels') WHERE value=?)");args.push(query.level);}
    if(query.q) {need(typeof query.q==='string' && query.q.length<=120,'검색어는 120자 이내로 입력해 주세요.');clauses.push("instr(lower(json_extract(payload,'$.title') || ' ' || json_extract(payload,'$.summary')),lower(?))>0");args.push(query.q);}
    if(query.cursor) {
      let parsed;try {parsed=JSON.parse(atob(query.cursor));} catch {need(false,'다음 페이지 정보를 확인해 주세요.');}
      need(Array.isArray(parsed) && parsed.length===2,'다음 페이지 정보를 확인해 주세요.');
      const d=date(parsed[0]),k=key(parsed[1]);clauses.push('(r.date<? OR (r.date=? AND r.content_key<?))');args.push(d,d,k);
    }
    const limit=Number(query.limit || 20);need(Number.isInteger(limit) && limit>=1 && limit<=30,'페이지 크기는 1~30입니다.');
    const rows=this.rows(`SELECT r.* FROM ib_research r ${clauses.length?'WHERE '+clauses.join(' AND '):''} ORDER BY r.date DESC,r.content_key DESC LIMIT ?`,...args,limit+1);
    const items=rows.slice(0,limit).map(row=>{
      const r=JSON.parse(row.payload);
      return {projectKey:PROJECT_KEY,contentKey:r.contentKey,date:r.date,category:r.category,materialKind:r.materialKind,title:r.title,summary:r.summary,subjectKeys:r.subjectKeys,levels:r.metadata.levels,reviewStatus:r.reviewStatus,generationEligibility:r.metadata.generationEligibility,revision:row.revision,updated:row.updated};
    });
    const last=items.at(-1);
    return {items,next:rows.length>limit?btoa(JSON.stringify([last.date,last.contentKey])):null};
  }
  async write(input,actor,kind='research') {
    need(actor.role!=='reader','연구 작성 권한이 필요합니다.',403);
    if(kind==='subject') need(actor.role==='admin' || actor.id==='token-ib_publish_token','과목 변경에는 별도 게시 권한이 필요합니다.',403);
    envelope(input,kind);
    const payload=kind==='research'?validateResearch(input.research):validateSubject(input.subject);
    if(kind==='research' && actor.role!=='admin') need(['draft','needs-review'].includes(payload.reviewStatus),'검수 완료·반려 처리는 관리자만 할 수 있습니다.',403);
    const serialized=JSON.stringify(payload);need(encoder.encode(serialized).length<=140000,'연구 자료가 너무 큽니다.',413);
    const hash=await digest(serialized),requestHash=await digest(JSON.stringify({kind,payload,expectedRevision:input.expectedRevision}));
    // All conflict checks, subject references, revision and retry rows commit together.
    return this.storage.transactionSync(()=>{
      const retry=this.rows('SELECT * FROM ib_requests WHERE request_id=?',input.requestId)[0];
      if(retry) {need(retry.hash===requestHash && retry.actor===actor.id,'요청 키가 다른 저장에 사용됐습니다. 새 요청 키로 다시 저장해 주세요.',409);return JSON.parse(retry.response);}
      const now=new Date().toISOString(),isResearch=kind==='research',contentKey=isResearch?payload.contentKey:payload.key;
      const old=this.rows(isResearch?'SELECT * FROM ib_research WHERE content_key=?':'SELECT * FROM ib_subjects WHERE key=?',contentKey)[0];
      const same=old && (isResearch?old.hash===hash:old.payload===serialized);
      if(!same) need(input.expectedRevision===(old?.revision || 0),'다른 수정이 먼저 저장됐습니다. 최신 버전을 확인한 후 다시 저장해 주세요.',409);
      if(isResearch) {
        for(const subjectKey of payload.subjectKeys) {
          const subject=this.rows('SELECT payload FROM ib_subjects WHERE key=?',subjectKey)[0];need(subject,'등록되지 않은 과목입니다. 먼저 과목을 추가해 주세요.');
          // Existing references remain editable after an administrator archives a subject.
          need(JSON.parse(subject.payload).active || (old && JSON.parse(old.payload).subjectKeys.includes(subjectKey)),'보관한 과목에는 새 연구를 연결할 수 없습니다.');
        }
        for(const relatedKey of payload.relatedKeys) need(this.rows('SELECT 1 FROM ib_research WHERE content_key=?',relatedKey).length,'연결할 연구를 먼저 저장해 주세요.');
      }
      const revision=same?old.revision:(old?.revision || 0)+1;
      if(!same && isResearch) {
        this.sql.exec('INSERT INTO ib_research VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(content_key) DO UPDATE SET date=excluded.date,category=excluded.category,material_kind=excluded.material_kind,review_status=excluded.review_status,payload=excluded.payload,hash=excluded.hash,revision=excluded.revision,updated=excluded.updated',contentKey,payload.date,payload.category,payload.materialKind,payload.reviewStatus,serialized,hash,revision,old?.created || now,now);
        this.sql.exec('INSERT INTO ib_revisions VALUES(?,?,?,?,?,?)',contentKey,revision,serialized,hash,actor.id,now);
        this.sql.exec('DELETE FROM ib_research_subjects WHERE content_key=?',contentKey);
        for(const subjectKey of payload.subjectKeys) this.sql.exec('INSERT INTO ib_research_subjects VALUES(?,?)',contentKey,subjectKey);
      } else if(!same) {
        this.sql.exec('INSERT INTO ib_subjects VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated=excluded.updated',contentKey,serialized,revision,now);
        this.sql.exec('INSERT INTO ib_subject_revisions VALUES(?,?,?,?,?)',contentKey,revision,serialized,actor.id,now);
      }
      const response={projectKey:PROJECT_KEY,contentKey,status:same?'unchanged':old?'updated':'created',revision,hash,...(isResearch?{url:`https://hownote.net/ib/research?key=${contentKey}`}:{})};
      this.sql.exec('INSERT INTO ib_requests VALUES(?,?,?,?)',input.requestId,requestHash,actor.id,JSON.stringify(response));
      return response;
    });
  }
  async publisher(request) {
    const auth=request.headers.get('authorization') || '';
    if(!auth.startsWith('Bearer ') || auth.length>600) return null;
    const authHash=await digest(auth);
    for(const [secret,role] of [['IB_PUBLISH_TOKEN','researcher'],['IB_READ_TOKEN','reader']]) {
      if(this.env[secret]?.length>=32 && authHash===await digest(`Bearer ${this.env[secret]}`)) return {id:`token-${secret.toLowerCase()}`,name:'IB connector',role};
    }
    return null;
  }
  async fetch(request) {
    try {return await this.handle(request);} catch(error) {
      const response=json({error:error.status?error.message:'요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',...(error.retryAfter?{retryAfter:error.retryAfter}:{})},error.status || 500);
      if(error.retryAfter)response.headers.set('Retry-After',String(error.retryAfter));return response;
    }
  }
  async handle(request) {
    const url=new URL(request.url),path=url.pathname;
    const publishing=['/ib/mcp','/ib/api/publish','/ib/api/publish-subject'].includes(path);
    if(request.method!=='GET') need(request.headers.get('origin')===url.origin || (!request.headers.has('origin') && publishing),'HowNote 화면에서 다시 요청해 주세요.',403);
    if(publishing) {
      need(request.method==='POST','POST 요청이 필요합니다.',405);
      const actor=await this.publisher(request);need(actor,'별도 IB 게시 인증이 필요합니다.',401);
      this.rate(actor.id,120,60);
      const input=await requestBody(request);
      return path==='/ib/mcp'?this.mcp(input,actor):json(await this.write(input,actor,path==='/ib/api/publish-subject'?'subject':'research'));
    }
    const credential=readerCredential(this.env.IB_READER_CREDENTIAL);need(credential,'개인 연구실 열람 설정이 준비되지 않았습니다.',503);
    if(path==='/ib/api/login' && request.method==='POST') {
      const ip=await digest(request.headers.get('cf-connecting-ip') || 'local');this.rate(`pin:${ip}`,5,900);this.rate('pin:global',20,3600);
      const input=await requestBody(request);need(input && !Array.isArray(input) && Object.keys(input).length===1 && validPin(input.pin),'숫자 4자리 PIN을 입력해 주세요.');
      need(await pinMatches(input.pin,credential),'PIN을 확인해 주세요.',401);
      const user=PIN_READER,token=random(),previous=await this.session(request,credential);
      this.sql.exec('DELETE FROM ib_sessions WHERE expires<=?',Date.now());
      if(previous)this.sql.exec('DELETE FROM ib_sessions WHERE token=?',previous.tokenHash);
      this.sql.exec('INSERT INTO ib_sessions VALUES(?,?,?,?)',await digest(token),user.id,pinSignature(credential),Date.now()+PIN_SESSION_SECONDS*1000);
      this.sql.exec('DELETE FROM ib_attempts WHERE key=?',`pin:${ip}`);
      const response=json({user:identity(user)});response.headers.set('Set-Cookie',cookie(token,PIN_SESSION_SECONDS));return response;
    }
    const session=await this.session(request,credential);need(session,'로그인이 필요합니다.',401);
    if(path==='/ib/api/me' && request.method==='GET') return json({user:identity(session.user)});
    if(path==='/ib/api/logout' && request.method==='POST') {
      this.sql.exec('DELETE FROM ib_sessions WHERE token=?',session.tokenHash);
      const response=json({ok:true});response.headers.set('Set-Cookie',cookie('',0));return response;
    }
    // Browser PIN sessions can only read. Even spoofed actors, methods and old admin cookies cannot write.
    need(request.method==='GET','개인 연구실은 읽기 전용입니다.',403);
    if(path==='/ib/api/subjects') {
      if(request.method==='GET') return json({items:this.subjects()});
    }
    const subjectHistory=path.match(/^\/ib\/api\/subjects\/([a-z0-9-]+)\/history$/);
    if(subjectHistory && request.method==='GET') return json({items:this.rows('SELECT * FROM ib_subject_revisions WHERE key=? ORDER BY revision DESC',key(subjectHistory[1])).map(row=>({...row,payload:JSON.parse(row.payload)}))});
    if(path==='/ib/api/research') {
      if(request.method==='GET') return json(this.list(Object.fromEntries(url.searchParams)));
    }
    const match=path.match(/^\/ib\/api\/research\/([a-z0-9-]+)(?:\/revisions\/([1-9][0-9]*))?$/);
    if(match && request.method==='GET') {project(url.searchParams.get('projectKey'));return json(this.detail(match[1],match[2]?Number(match[2]):undefined));}
    return json({error:'요청한 경로를 찾을 수 없습니다.'},404);
  }
  async mcp(msg,actor) {
    need(msg?.jsonrpc==='2.0' && typeof msg.method==='string','JSON-RPC 형식을 확인해 주세요.');
    if(!('id' in msg)) return new Response(null,{status:202,headers:commonHeaders});
    const result=value=>json({jsonrpc:'2.0',id:msg.id,result:value});
    if(msg.method==='initialize') return result({protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'hownote-ib',version:'1.0.0'}});
    if(msg.method==='ping') return result({});
    if(msg.method==='tools/list') return result({tools:ibTools});
    if(msg.method==='tools/call') {
      try {
        const name=msg.params?.name,args=msg.params?.arguments;
        need(args && typeof args==='object','도구 인수를 확인해 주세요.');
        let data;
        if(name==='publish_research') data=await this.write(args,actor);
        else if(name==='upsert_subject') data=await this.write(args,actor,'subject');
        else if(name==='list_research') data=this.list(args);
        else if(name==='get_research') {project(args.projectKey);need(Object.keys(args).every(k=>['projectKey','contentKey','revision'].includes(k)),'조회 인수를 확인해 주세요.');need(args.revision===undefined || (Number.isSafeInteger(args.revision) && args.revision>=1),'수정 버전을 확인해 주세요.');data=this.detail(args.contentKey,args.revision);}
        else if(name==='list_subjects') {project(args.projectKey);need(Object.keys(args).length===1,'과목 조회 인수를 확인해 주세요.');data={items:this.subjects()};}
        else return json({jsonrpc:'2.0',id:msg.id,error:{code:-32602,message:'Unknown tool'}});
        return result({content:[{type:'text',text:JSON.stringify(data)}],isError:false});
      } catch(error) {return result({content:[{type:'text',text:error.status?error.message:'IB 연구 처리 실패'}],isError:true});}
    }
    return json({jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'Method not found'}});
  }
}
const str={type:'string'},projectSchema={type:'string',enum:[PROJECT_KEY]};
const tool=(name,description,properties,required,write=false)=>({name,description,inputSchema:{type:'object',additionalProperties:false,properties,required},annotations:{readOnlyHint:!write,destructiveHint:false,idempotentHint:true,openWorldHint:false}});
export const ibTools=[
  tool('publish_research','Save one IB study in its independent project. Use a stable contentKey and requestId for retries, expectedRevision 0 to create or the retrieved revision to revise. Preserve provenance, rights and review metadata. Same date allows multiple keys. The publisher can request review; only a human administrator can approve.',{requestId:str,expectedRevision:{type:'integer',minimum:0},research:researchInputSchema},['requestId','expectedRevision','research'],true),
  tool('list_research','Read IB studies with subject, category, SL/HL, material-kind and review filters. Follow next cursor for more entries.',{projectKey:projectSchema,category:{type:'string',enum:categories},subject:str,level:{type:'string',enum:['SL','HL']},materialKind:{type:'string',enum:materialKinds},reviewStatus:{type:'string',enum:reviewStatuses},q:str,cursor:str,limit:{type:'integer',minimum:1,maximum:30}},['projectKey']),
  tool('get_research','Read the full IB study, structured question-design metadata, sources and immutable review history. Optional revision retrieves an earlier snapshot.',{projectKey:projectSchema,contentKey:str,revision:{type:'integer',minimum:1}},['projectKey','contentKey']),
  tool('list_subjects','Read managed candidate subjects and their offering-verification status. Display order is editorial order, never verified popularity.',{projectKey:projectSchema},['projectKey']),
  tool('upsert_subject','Create or revise a managed subject using the separate publishing credential. Preserve candidate status until evidence is verified; order never claims popularity. Archive without deleting old research references.',{requestId:str,expectedRevision:{type:'integer',minimum:0},subject:{type:'object',additionalProperties:false,properties:{key:str,name:str,group:str,active:{type:'boolean'},order:{type:'integer',minimum:0,maximum:999},priorityStatus:{type:'string',enum:['candidate','verified-offering']},priorityEvidence:str},required:['key','name','group','active','order','priorityStatus','priorityEvidence']}},['requestId','expectedRevision','subject'],true),
];
export async function fetchIb(request,env) {
  const path=new URL(request.url).pathname;
  if(path.startsWith('/ib/api/') || path==='/ib/mcp') {
    if(!env.IB_STORE) return json({error:'IB 연구 저장소 설정이 필요합니다.'},503);
    // Bound uploads in the outer worker before forwarding to a Durable Object.
    if(request.method==='POST' || request.body) {
      try {
        const reader=request.body?.getReader();need(reader,'요청 내용이 없습니다.');let size=0;const chunks=[];
        while(true) {const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BODY){await reader.cancel();return json({error:'요청 내용이 너무 큽니다.'},413);}chunks.push(value);}
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        request=new Request(request,{body:bytes});
      } catch {return json({error:'요청 내용을 읽지 못했습니다.'},400);}
    }
    return env.IB_STORE.get(env.IB_STORE.idFromName('private-ib-research-v1')).fetch(request);
  }
  const response=await env.ASSETS.fetch(request),copy=new Response(response.body,response);
  copy.headers.set('Cache-Control','no-store');copy.headers.set('X-Robots-Tag','noindex, nofollow');return copy;
}
