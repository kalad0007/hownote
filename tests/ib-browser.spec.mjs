import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { TEST_PIN, TEST_PUBLISH_TOKEN } from './fixtures/ib-reader.mjs';
const fixture=JSON.parse(readFileSync('tests/fixtures/ib-research.json','utf8'));
const artifacts='artifacts/ib-pin';
test.beforeAll(()=>mkdirSync(artifacts,{recursive:true}));
async function login(page) {
  await page.goto('/ib');await expect(page.locator('#login-view')).toBeVisible();
  await page.getByLabel('4자리 PIN',{exact:true}).fill(TEST_PIN);
  await page.getByRole('button',{name:'연구실 열기',exact:true}).click();
  await expect(page.locator('#workspace')).toBeVisible();await expect(page.locator('#pin')).toHaveValue('');
}
async function publish(request,research,expectedRevision=0,requestId=crypto.randomUUID()) {
  const response=await request.post('/ib/api/publish',{headers:{Authorization:`Bearer ${TEST_PUBLISH_TOKEN}`},data:{requestId,expectedRevision,research}});
  expect(response.ok()).toBeTruthy();return response.json();
}
async function subject(request,subject,expectedRevision=0) {
  const response=await request.post('/ib/api/publish-subject',{headers:{Authorization:`Bearer ${TEST_PUBLISH_TOKEN}`},data:{requestId:crypto.randomUUID(),expectedRevision,subject}});
  expect(response.ok()).toBeTruthy();return response.json();
}
async function overflow(page) {expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
async function noEditing(page) {
  await expect(page.locator('a[href^="/ib/edit"],#research-form,#subject-form,.writer-only')).toHaveCount(0);
}
async function fieldContrast(page) {
  const ratios=await page.locator('#search').evaluate(input=>{
    const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{const c=x/255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;});
    const light=value=>{const c=rgb(value);return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];};
    const contrast=(a,b)=>(Math.max(light(a),light(b))+0.05)/(Math.min(light(a),light(b))+0.05);
    const style=getComputedStyle(input),placeholder=getComputedStyle(input,'::placeholder');
    return {border:contrast(style.borderTopColor,style.backgroundColor),placeholder:contrast(placeholder.color,style.backgroundColor)};
  });
  expect(ratios.border).toBeGreaterThanOrEqual(3);expect(ratios.placeholder).toBeGreaterThanOrEqual(4.5);
}
test('blank PIN screen, numeric form and private desktop/mobile research reading',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});await page.goto('/ib');
  await expect(page.getByLabel('4자리 PIN',{exact:true})).toHaveAttribute('inputmode','numeric');
  await expect(page.locator('#pin')).toHaveAttribute('type','password');
  await expect(page.locator('#pin')).toHaveAttribute('maxlength','4');
  await expect(page.locator('#pin')).toHaveValue('');
  await page.screenshot({path:`${artifacts}/login-desktop.png`,fullPage:true});
  await page.setViewportSize({width:390,height:844});await overflow(page);
  await page.screenshot({path:`${artifacts}/login-mobile.png`,fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await login(page);
  await expect(page.locator('#research-list article')).toHaveCount(5);await noEditing(page);await fieldContrast(page);
  await page.screenshot({path:`${artifacts}/desktop.png`,fullPage:true});await overflow(page);
  await page.getByRole('link',{name:'과목별 연구',exact:true}).click();
  await page.locator('#subject-tabs').getByRole('link',{name:'Mathematics: Analysis and Approaches',exact:true}).click();
  await expect(page.locator('#research-list article')).toHaveCount(1);
  const firstHref=await page.locator('#research-list h2 a').getAttribute('href');
  await page.locator('#subject-tabs').getByRole('link',{name:'Economics',exact:true}).click();
  await expect(page.locator('#research-list article')).toHaveCount(1);
  expect(await page.locator('#research-list h2 a').getAttribute('href')).toBe(firstHref);
  await page.locator('#research-list h2 a').click();await noEditing(page);
  await expect(page.locator('.history-list')).toContainText('도비');
  await expect(page.locator('.history-list')).not.toContainText('token-ib_publish_token');
  await expect(page.getByRole('heading',{name:'문항 설계 기록',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'출처와 이용범위',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'변경·검수 이력',exact:true})).toBeVisible();
  await page.screenshot({path:`${artifacts}/detail-desktop.png`,fullPage:true});
  await page.setViewportSize({width:390,height:844});await overflow(page);
  await page.screenshot({path:`${artifacts}/detail-mobile.png`,fullPage:true});
  await page.goto('/ib');await expect(page.locator('#research-list article')).toHaveCount(5);
  await page.screenshot({path:`${artifacts}/mobile.png`,fullPage:true});
  await page.setViewportSize({width:360,height:780});await overflow(page);
  await page.locator('#material-kind').selectOption('original-question');await expect(page.locator('#research-list article')).toHaveCount(1);
  await page.locator('#level').selectOption('HL');await expect(page.getByRole('heading',{name:'아직 연결된 연구가 없습니다.',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'초기화',exact:true}).click();await expect(page.locator('#research-list article')).toHaveCount(5);
  await page.reload();await expect(page.locator('#workspace')).toBeVisible();expect(errors).toEqual([]);
});
test('separate publication, idempotent retry and revision readback through the reader UI',async({page,request})=>{
  const research={...structuredClone(fixture),contentKey:'browser-publisher-study',title:'자체 작성 예시: 도비 게시와 개인 열람'};
  const requestId='browser-publisher-idempotent';const first=await publish(request,research,0,requestId);
  expect(await publish(request,research,0,requestId)).toEqual(first);
  await login(page);await page.goto('/ib/research?key=browser-publisher-study');
  await expect(page.getByRole('heading',{name:research.title,exact:true})).toBeVisible();await noEditing(page);
  const revision={...research,title:'자체 작성 예시: 도비가 수정한 연구',reviewNote:'자체 작성 테스트의 두 번째 버전'};
  expect((await publish(request,revision,1)).revision).toBe(2);
  await page.reload();await expect(page.getByRole('heading',{name:revision.title,exact:true})).toBeVisible();
  await expect(page.locator('.history-list li')).toHaveCount(2);
  await page.getByRole('link',{name:'v1',exact:true}).click();
  await expect(page.getByRole('heading',{name:research.title,exact:true})).toBeVisible();await noEditing(page);
  const denied=await page.evaluate(async()=>{const r=await fetch('/ib/api/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actor:{role:'admin'}})});return r.status;});
  expect(denied).toBe(403);
  const approval=await request.post('/ib/api/publish',{headers:{Authorization:`Bearer ${TEST_PUBLISH_TOKEN}`},data:{research:{...revision,reviewStatus:'approved'},expectedRevision:2,requestId:crypto.randomUUID()}});
  expect(approval.status()).toBe(403);
});
test('subject guidance can be read after separate publication and archiving',async({page,request})=>{
  const candidate={key:'browser-candidate',name:'자체 작성 과목 후보',group:'검증용 후보',order:80,active:true,priorityStatus:'candidate',priorityEvidence:''};
  await subject(request,candidate);await login(page);await page.getByRole('link',{name:'과목 안내',exact:true}).click();await noEditing(page);
  await expect(page.getByRole('heading',{name:candidate.name,exact:true})).toBeVisible();
  await subject(request,{...candidate,active:false,name:'자체 작성 과목 후보 — 보관'},1);
  await page.reload();const row=page.locator('.subject-row').filter({has:page.getByRole('heading',{name:'자체 작성 과목 후보 — 보관',exact:true})});
  await expect(row).toContainText('한국 개설 미확인');await expect(row).toContainText('보관');
  await row.locator('summary').click();await expect(row.locator('.subject-history li')).toHaveCount(2);
  await page.setViewportSize({width:390,height:844});await overflow(page);
  await page.goto('/ib/edit');await expect(page.getByRole('heading',{name:'연구 기록은 도비가 정리합니다.',exact:true})).toBeVisible();
  await expect(page.locator('#research-form,#subject-form')).toHaveCount(0);
  const denied=await page.evaluate(async()=>{const r=await fetch('/ib/api/publish-subject',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});return r.status;});expect(denied).toBe(401);
});
test('unsafe Markdown, empty filter state and logout stay read only',async({page,request})=>{
  const malicious={...structuredClone(fixture),contentKey:'browser-markdown-test',title:'자체 작성 예시: 안전한 본문 표시',body:'<script>window.ibInjected = true</script>\n\n[unsafe](javascript:alert(1))\n\n<img src=x onerror="window.ibInjected = true">'};
  await publish(request,malicious);await login(page);await page.goto('/ib/research?key=browser-markdown-test');
  await expect(page.getByRole('heading',{name:malicious.title,exact:true})).toBeVisible();await noEditing(page);
  expect(await page.evaluate(()=>window.ibInjected)).toBeUndefined();
  expect(await page.locator('.prose script,.prose img,.prose a[href^="javascript:"]').count()).toBe(0);
  await page.goto('/ib');await page.getByLabel('연구 검색',{exact:true}).fill('찾을수없는고유한검색어');
  await page.getByRole('button',{name:'검색',exact:true}).click();
  await expect(page.getByRole('heading',{name:'아직 연결된 연구가 없습니다.',exact:true})).toBeVisible();await noEditing(page);
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();await expect(page.locator('#login-view')).toBeVisible();
  await page.reload();await expect(page.locator('#login-view')).toBeVisible();await expect(page.locator('#pin')).toHaveValue('');
  await page.route('**/ib/api/login',route=>route.abort('connectionfailed'));
  await page.getByLabel('4자리 PIN',{exact:true}).fill(TEST_PIN);await page.getByRole('button',{name:'연구실 열기',exact:true}).click();
  await expect(page.locator('#login-error')).toContainText('연결을 확인하고 다시 시도');
  await expect(page.locator('#login-error')).not.toContainText('저장');await expect(page.locator('#pin')).toHaveValue('');
});
test('excess PIN guesses show the server cooldown and cannot retry by reloading',async({page})=>{
  await page.goto('/ib');await expect(page.locator('#login-view')).toBeVisible();
  for(let i=0;i<5;i++){
    await page.getByLabel('4자리 PIN',{exact:true}).fill('1111');await page.getByRole('button',{name:'연구실 열기',exact:true}).click();
    await expect(page.locator('#login-error')).toContainText('PIN을 확인');await expect(page.locator('#pin')).toHaveValue('');
  }
  await page.getByLabel('4자리 PIN',{exact:true}).fill(TEST_PIN);await page.getByRole('button',{name:'연구실 열기',exact:true}).click();
  await expect(page.locator('#login-error')).toContainText('로그인 시도가 많습니다');
  await expect(page.locator('#pin')).toBeDisabled();await expect(page.getByRole('button',{name:'연구실 열기',exact:true})).toBeDisabled();
  await expect(page.locator('#pin')).toHaveValue('');
  await page.reload();await page.getByLabel('4자리 PIN',{exact:true}).fill(TEST_PIN);await page.getByRole('button',{name:'연구실 열기',exact:true}).click();
  await expect(page.locator('#login-error')).toContainText('로그인 시도가 많습니다');await expect(page.locator('#workspace')).toBeHidden();
});
