import MarkdownIt from 'markdown-it';
import { PROJECT_KEY, categoryLabels, materialLabels, reviewLabels, rightsLabels, generationLabels, designFields } from '../data/ib';
import type { User, Subject, Research, ResearchSummary, SavedResearch, Category, ReviewStatus, DesignField } from '../data/ib';

class ApiError extends Error { constructor(message:string,public status:number,public retryAfter=0) {super(message);} }
let subjects:Subject[]=[];
let initializedUserId='';
const el=<T extends HTMLElement=HTMLElement>(id:string):T=>{
  const result=document.getElementById(id);if(!result)throw new Error(`Missing element: ${id}`);return result as T;
};
function node<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string,className?:string):HTMLElementTagNameMap[K] {
  const result=document.createElement(tag);if(text!==undefined)result.textContent=text;if(className)result.className=className;return result;
}
function link(label:string,href:string,className?:string) {const result=node('a',label,className);result.href=href;return result;}
const formString=(form:HTMLFormElement,name:string)=>String(new FormData(form).get(name) ?? '').trim();
const studyUrl=(key:string,revision?:number)=>`/ib/research?key=${encodeURIComponent(key)}${revision?`&revision=${revision}`:''}`;
const subjectName=(key:string)=>subjects.find(subject=>subject.key===key)?.name || key;
function dateLabel(value:string) {return new Intl.DateTimeFormat('ko-KR',{dateStyle:'long',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`));}
function timestamp(value:string) {return new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(value))+' UTC';}
function notice(message:string) {el('notice').textContent=message;}
function showLogin(message='') {
  el('loading').hidden=true;el('workspace').hidden=true;el('identity').hidden=true;el('private-label').hidden=false;
  el('login-view').hidden=false;el('login-error').textContent=message;
}
async function api<T>(path:string,data?:unknown):Promise<T> {
  let response:Response;
  try {response=await fetch(`/ib/api/${path}`,{credentials:'same-origin',cache:'no-store',...(data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})});}
  catch {throw new ApiError('연결하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.',0);}
  let result;try {result=await response.json();}catch {throw new ApiError('서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',response.status);}
  if(!response.ok) {
    if(response.status===401) showLogin('로그인이 만료됐습니다. 다시 로그인해 주세요.');
    throw new ApiError(result.error || '요청을 처리하지 못했습니다.',response.status,Number(result.retryAfter || response.headers.get('Retry-After') || 0));
  }
  return result as T;
}
function setValue(form:HTMLFormElement,name:string,value:string) {
  const control=form.elements.namedItem(name);if(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)control.value=value;
}
function reviewTag(status:ReviewStatus) {const tag=node('span',reviewLabels[status],'status-tag');tag.dataset.status=status;return tag;}
const actorLabel=(actor:string)=>actor==='token-ib_publish_token'?'도비':actor.startsWith('token-')?'자료 게시':actor;
function meta(r:Pick<Research,'category'|'materialKind'|'reviewStatus'>) {
  const result=node('div',undefined,'entry-meta');result.append(node('span',categoryLabels[r.category],'entry-category'),node('span',materialLabels[r.materialKind]),reviewTag(r.reviewStatus));return result;
}
function empty(container:HTMLElement,title:string,description:string) {
  const section=node('section',undefined,'empty-state');section.append(node('h2',title),node('p',description));container.replaceChildren(section);return section;
}
async function startWorkspace(currentUser:User) {
  subjects=(await api<{items:Subject[]}>('subjects')).items;
  el('loading').hidden=true;el('login-view').hidden=true;el('private-label').hidden=true;el('workspace').hidden=false;el('identity').hidden=false;
  el('reader-name').textContent='읽기 전용';
  const category=new URLSearchParams(location.search).get('category') || 'all';
  document.querySelectorAll<HTMLAnchorElement>('[data-category]').forEach(a=>{if(a.dataset.category===category && document.body.dataset.page==='index')a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  if(document.body.dataset.page==='subjects')el('subjects-nav').setAttribute('aria-current','page');
  if(initializedUserId===currentUser.id)return;
  try {
    if(document.body.dataset.page==='index')await initList();
    if(document.body.dataset.page==='research')await initDetail();
    if(document.body.dataset.page==='subjects')await initSubjects();
    initializedUserId=currentUser.id;
  } catch(error) {notice((error as Error).message);}
}
let loginCooldown=0;
let cooldownTimer:ReturnType<typeof setInterval> | undefined;
function coolDown(seconds:number) {
  loginCooldown=Date.now()+Math.max(1,seconds)*1000;
  const button=el('login-form').querySelector<HTMLButtonElement>('button[type=submit]')!,input=el<HTMLInputElement>('pin');
  if(cooldownTimer)clearInterval(cooldownTimer);
  const tick=()=>{
    const remaining=Math.ceil((loginCooldown-Date.now())/1000);
    button.disabled=remaining>0;input.disabled=remaining>0;
    if(remaining>0)el('login-error').textContent=`로그인 시도가 많습니다. 약 ${Math.ceil(remaining/60)}분 후 다시 열어보세요.`;
    else {clearInterval(cooldownTimer);loginCooldown=0;el('login-error').textContent='PIN을 다시 입력할 수 있습니다.';}
  };
  tick();cooldownTimer=setInterval(tick,1000);
}
el<HTMLFormElement>('login-form').onsubmit=async event=>{
  event.preventDefault();if(loginCooldown>Date.now())return;
  const button=el('login-form').querySelector<HTMLButtonElement>('button[type=submit]')!,input=el<HTMLInputElement>('pin');
  button.disabled=true;el('login-error').textContent='';
  try {const result=await api<{user:User}>('login',{pin:input.value});await startWorkspace(result.user);}
  catch(error) {showLogin((error as Error).message);if(error instanceof ApiError && error.status===429)coolDown(error.retryAfter);}
  finally {input.value='';if(loginCooldown<=Date.now())button.disabled=false;}
};
el('logout').onclick=async()=>{try{await api('logout',{});location.replace('/ib');}catch(error){notice((error as Error).message);}};

async function initList() {
  const params=new URLSearchParams(location.search),category=params.get('category') as Category | null;
  const descriptions:Record<Category,string>={
    'korea-market':'학교 개설 현황과 이용 환경을 근거로 연구합니다. 과목 우선순위는 후속 조사에서 확인합니다.',
    'subject-research':'과목과 수준을 따라 문항 설계 기록을 탐색합니다. 같은 연구를 여러 과목에서 참조할 수 있습니다.',
    'platform-planning':'문항 데이터와 연구 지식을 어떻게 연결하고 활용할지 기록합니다.',
    'development-operations':'저장 구조, 검수 흐름, 서비스 운영의 근거와 결정을 기록합니다.',
  };
  if(category && categoryLabels[category]) {el('page-title').textContent=categoryLabels[category];el('page-description').textContent=descriptions[category];}
  const tabs=el('subject-tabs');tabs.replaceChildren();tabs.hidden=category!=='subject-research';
  if(!tabs.hidden) {
    const all=link('전체 과목','/ib?category=subject-research');if(!params.get('subject'))all.setAttribute('aria-current','page');tabs.append(all);
    for(const subject of subjects.filter(subject=>subject.active || subject.key===params.get('subject'))) {
      const tab=link(subject.name+(subject.active?'':' · 보관'),`/ib?category=subject-research&subject=${encodeURIComponent(subject.key)}`);
      if(params.get('subject')===subject.key)tab.setAttribute('aria-current','page');tabs.append(tab);
    }
    if(!subjects.some(subject=>subject.active)) notice('등록된 과목이 없습니다. 과목 연구가 올라오면 이곳에서 찾아볼 수 있습니다.');
  }
  const form=el<HTMLFormElement>('filters');for(const name of ['q','level','materialKind','reviewStatus'])setValue(form,name,params.get(name) || '');
  let cursor:string | null=null,entries:ResearchSummary[]=[],sequence=0;
  const list=el('research-list'),more=el<HTMLButtonElement>('load-more');
  const render=()=>{
    list.replaceChildren();
    if(!entries.length) {
      empty(list,'아직 연결된 연구가 없습니다.','검색 조건을 바꾸어 보세요. 새 연구가 올라오면 이곳에서 읽을 수 있습니다.');return;
    }
    const groups=new Map<string,ResearchSummary[]>();for(const entry of entries)groups.set(entry.date,[...(groups.get(entry.date)||[]),entry]);
    for(const [date,items] of groups) {
      const group=node('section',undefined,'date-group');group.setAttribute('aria-label',dateLabel(date));
      const time=node('time',`${date.slice(0,4)}.${date.slice(5,7)}`,'date-label');time.dateTime=date;time.append(node('span',date.slice(8,10)));group.append(time);
      const articles=node('div');
      for(const r of items) {
        const article=node('article',undefined,'research-entry'),heading=node('h2');heading.append(link(r.title,studyUrl(r.contentKey)));article.append(meta(r),heading);
        for(const summary of r.summary)article.append(node('p',summary));
        const parts=[...r.subjectKeys.map(subjectName),...r.levels,generationLabels[r.generationEligibility]];
        article.append(node('div',parts.join(' · '),'entry-foot'));articles.append(article);
      }
      group.append(articles);list.append(group);
    }
  };
  const load=async(append=false)=>{
    const current=++sequence;more.disabled=true;el('list-status').textContent='연구를 불러오고 있습니다…';
    const query=new URLSearchParams(location.search);query.set('projectKey',PROJECT_KEY);query.delete('cursor');query.delete('limit');
    if(append && cursor)query.set('cursor',cursor);
    try {
      const result=await api<{items:ResearchSummary[];next:string|null}>(`research?${query}`);if(current!==sequence)return;
      entries=append?[...entries,...result.items]:result.items;cursor=result.next;render();more.hidden=!cursor;
      el('list-status').textContent=`현재 ${entries.length}개의 연구${cursor?' · 이전 기록이 더 있습니다':''}`;notice('');
    } catch(error) {if(current===sequence){notice((error as Error).message);el('list-status').textContent='연구를 불러오지 못했습니다. 검색 버튼으로 다시 시도해 주세요.';}}
    finally{if(current===sequence)more.disabled=false;}
  };
  form.onsubmit=event=>{
    event.preventDefault();const query=new URLSearchParams(location.search);query.delete('cursor');
    for(const name of ['q','level','materialKind','reviewStatus']) {const value=formString(form,name);if(value)query.set(name,value);else query.delete(name);}
    history.replaceState(null,'',`${location.pathname}${query.size?'?'+query:''}`);void load();
  };
  form.onchange=event=>{if(event.target instanceof HTMLSelectElement)form.requestSubmit();};
  el('reset-filters').onclick=()=>{form.reset();form.requestSubmit();};
  more.onclick=()=>void load(true);
  await load();
}

function fact(dl:HTMLDListElement,label:string,value:string) {const row=node('div');row.append(node('dt',label),node('dd',value || '미기록'));dl.append(row);}
const markdown=new MarkdownIt({html:false,linkify:false,typographer:false});
async function initDetail() {
  const params=new URLSearchParams(location.search),contentKey=params.get('key');
  const container=el('research-detail');container.replaceChildren();
  if(!contentKey){empty(container,'연구를 선택해 주세요.','목록에서 제목을 누르면 연구 본문과 설계 정보를 볼 수 있습니다.');return;}
  const revision=params.get('revision');
  const saved=await api<SavedResearch>(`research/${encodeURIComponent(contentKey)}${revision?`/revisions/${encodeURIComponent(revision)}`:''}?projectKey=${PROJECT_KEY}`),r=saved.research;
  document.title=`${r.title} · HowNote`;
  const heading=node('header',undefined,'detail-heading');heading.append(meta(r),node('h1',r.title));
  heading.append(node('p',`${dateLabel(r.date)} · ${r.subjectKeys.map(subjectName).join(' · ') || '공통 연구'} · v${saved.revision}`,'muted small'));
  if(revision) {
    const note=node('p',`이전 기록 v${saved.revision}을 보고 있습니다. `,'context-note');note.append(link('현재 버전 보기',studyUrl(contentKey)));heading.append(note);
  }
  container.append(heading);
  const summary=node('section',undefined,'detail-summary');summary.setAttribute('aria-label','연구 요약');for(const line of r.summary)summary.append(node('p',line));container.append(summary);
  const prose=node('article',undefined,'prose');prose.setAttribute('aria-label','연구 본문');
  // Only MarkdownIt output with raw HTML disabled enters innerHTML. All metadata uses textContent.
  prose.innerHTML=markdown.render(r.body);
  prose.querySelectorAll('a').forEach(a=>{a.rel='noopener noreferrer';a.target='_blank';});
  prose.querySelectorAll('table').forEach(table=>{const wrap=node('div',undefined,'table-scroll');wrap.tabIndex=0;wrap.setAttribute('aria-label','표 가로 스크롤');table.replaceWith(wrap);wrap.append(table);});container.append(prose);
  const design=node('section',undefined,'record-section');design.append(node('h2','문항 설계 기록'));
  const facts=node('dl',undefined,'facts-grid');
  for(const [label,value] of [['과목',r.subjectKeys.map(subjectName).join(' · ')],['수준',r.metadata.levels.join(' · ')],['교육과정 버전',r.metadata.curriculumVersion],['시험 연도',r.metadata.examYears.join(', ')],['언어',r.metadata.language],['AI 생성 이용 판단',generationLabels[r.metadata.generationEligibility]]])fact(facts,label!,value!);
  design.append(facts);
  if(r.metadata.generationRationale)design.append(node('p',`생성 이용 판단 근거: ${r.metadata.generationRationale}`));
  const lists=node('div',undefined,'design-list');
  for(const [field,label] of Object.entries(designFields)) {
    const section=node('section');section.append(node('h3',label));const entries=r.metadata[field as DesignField];
    if(entries.length){const ul=node('ul');for(const entry of entries)ul.append(node('li',entry));section.append(ul);}else section.append(node('p','미기록','muted small'));lists.append(section);
  }
  design.append(lists);container.append(design);
  const sources=node('section',undefined,'record-section');sources.append(node('h2','출처와 이용범위'));
  const ol=node('ol',undefined,'source-list');
  for(const source of r.sources) {
    const li=node('li'),h=node('h3');h.append(source.url?link(source.title,source.url):node('span',source.title));
    h.querySelectorAll('a').forEach(a=>{a.rel='noopener noreferrer';a.target='_blank';});li.append(h);
    li.append(node('p',`${source.kind==='self-authored'?'자체 작성 자료':'외부 자료 참조'} · ${rightsLabels[source.rightsStatus]}`),node('p',`버전: ${source.version} · 확인 날짜: ${source.accessedOn}`,'muted'),node('p',`이용범위: ${source.usageScope}`));
    if(source.permissionEvidence)li.append(node('p',`권한 확인 근거: ${source.permissionEvidence}`));
    li.append(node('p',source.generationAllowed?'출처의 AI 생성 이용권한 확인':'이 출처의 AI 생성 이용은 허용되지 않음','muted'));ol.append(li);
  }
  sources.append(ol);container.append(sources);
  if(r.relatedKeys.length){const related=node('section',undefined,'record-section');related.append(node('h2','연결 연구'));const ul=node('ul');for(const key of r.relatedKeys){const li=node('li');li.append(link(key,studyUrl(key)));ul.append(li);}related.append(ul);container.append(related);}
  const history=node('section',undefined,'record-section');history.append(node('h2','변경·검수 이력'),node('p','각 수정본은 당시 본문, 문항 설계 정보, 출처와 이용권한을 함께 보존합니다.'));
  const versions=node('ol',undefined,'history-list');
  for(const entry of saved.history) {
    const li=node('li');li.append(link(`v${entry.revision}`,studyUrl(contentKey,entry.revision)),node('span',` · ${reviewLabels[entry.reviewStatus]} · ${actorLabel(entry.actor)} · ${timestamp(entry.created)}`),node('p',entry.reviewNote));versions.append(li);
  }
  history.append(versions,node('p',`프로젝트: ${r.projectKey} · 글 키: ${r.contentKey}`,'muted small'));container.append(history);
}


async function initSubjects() {
  const list=el('subject-list');list.replaceChildren();
  if(!subjects.length){empty(list,'과목 목록이 아직 없습니다.','과목 연구가 올라오면 분류와 확인된 근거를 이곳에서 볼 수 있습니다.');return;}
  for(const subject of subjects) {
    const row=node('section',undefined,'subject-row'),content=node('div');
    content.append(node('h2',subject.name),node('p',`${subject.group} · ${subject.active?'사용 중':'보관'} · ${subject.priorityStatus==='candidate'?'조사 후보 — 한국 개설 미확인':'한국 개설 근거 확인'}`));
    if(subject.active)content.append(link('이 과목 연구 읽기',`/ib?category=subject-research&subject=${encodeURIComponent(subject.key)}`,'small'));
    if(subject.priorityEvidence)content.append(link('개설 근거',subject.priorityEvidence,'small'));
    const details=node('details'),summary=node('summary','과목 변경 이력');details.append(summary);let loaded=false;
    details.ontoggle=async()=>{
      if(!details.open || loaded)return;
      try {
        const history=await api<{items:{revision:number;actor:string;created:string;payload:Subject}[]}>(`subjects/${subject.key}/history`);
        const ol=node('ol',undefined,'subject-history');
        for(const item of history.items)ol.append(node('li',`v${item.revision} · ${item.payload.name} · ${item.payload.active?'사용':'보관'} · ${timestamp(item.created)}`));
        details.append(ol);loaded=true;
      }catch(error){notice((error as Error).message);}
    };
    content.append(details);row.append(content);list.append(row);
  }
}
try {const result=await api<{user:User}>('me');await startWorkspace(result.user);}catch(error){if(error instanceof ApiError && [401,503].includes(error.status))showLogin(error.status===503?error.message:'');else{el('loading').hidden=true;showLogin((error as Error).message);}}
