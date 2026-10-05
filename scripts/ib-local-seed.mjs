import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export const candidateSubjects=[
  {key:'mathematics-aa',name:'Mathematics: Analysis and Approaches',group:'수학 · 조사 후보',order:10},
  {key:'biology',name:'Biology',group:'과학 · 조사 후보',order:20},
  {key:'economics',name:'Economics',group:'개인과 사회 · 조사 후보',order:30},
  {key:'english-b',name:'English B',group:'언어 · 조사 후보',order:40},
].map(subject=>({...subject,active:true,priorityStatus:'candidate',priorityEvidence:''}));
export async function seedIb(base=process.env.IB_TEST_URL || 'http://127.0.0.1:8787',suppliedCredentials) {
  if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('Synthetic examples may only be seeded locally.');
  const credentials=suppliedCredentials || JSON.parse(readFileSync('.ib-local-credentials.json','utf8'));
  const send=async(path,data)=>{
    const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${credentials.token}`},body:JSON.stringify(data)});
    const result=await r.json();if(!r.ok)throw new Error(`Local seed failed: ${result.error}`);return {result,cookie:r.headers.get('set-cookie')?.split(';')[0]};
  };
  for(const subject of candidateSubjects)await send('/ib/api/publish-subject',{subject,expectedRevision:0,requestId:`seed-subject-${subject.key}`});
  const fixture=JSON.parse(readFileSync('tests/fixtures/ib-research.json','utf8'));
  const variants=[
    fixture,
    {...structuredClone(fixture),contentKey:'sample-biology-design',subjectKeys:['biology'],materialKind:'independent-analysis',title:'자체 작성 예시: 관찰 조건과 해석의 범위 정하기',summary:['측정 조건을 명시하고, 관찰에서 추론할 수 있는 범위를 구분하는 설계 메모입니다.'],body:'## 실험용 자체 작성 메모\n\n같은 크기의 종이 조각 두 개를 서로 다른 밝기 조건에 두는 가상 관찰을 설계한다. 측정 방법과 비교 기준을 먼저 정하고, 관찰 결과를 넘어서는 설명은 별도의 가설로 남긴다. 공식 교육과정 대응은 미확인이다.',metadata:{...fixture.metadata,units:['관찰 설계 · 임시 분류'],assessmentSkills:['변인 구분','해석 범위 설정'],questionTypes:['설계 메모'],designPrinciples:['관찰과 추론을 구분한다.'],constraints:['관찰하지 않은 결과는 단정하지 않는다.'],markingCriteria:[],misconceptions:[],generationInstructions:['비교 조건과 측정 방법을 먼저 명시한다.']}},
    {...structuredClone(fixture),contentKey:'sample-platform-plan',category:'platform-planning',subjectKeys:[],materialKind:'independent-analysis',title:'자체 작성 예시: 한 연구를 여러 과목에 연결하는 방법',summary:['연구는 한 번 저장하고, 과목 화면에서는 같은 고유 키를 참조합니다. 출처와 검수 이력도 함께 유지합니다.'],body:'## 실험용 자체 작성 기획\n\n연구 글과 과목 사이에 참조 관계를 저장한다. 메인과 과목 화면은 동일한 연구를 조회한다. 날짜는 정렬 기준이며, 글의 식별자는 프로젝트 키와 고유 글 키로 구분한다.',metadata:{...fixture.metadata,levels:[],units:[],assessmentSkills:[],questionTypes:[],designPrinciples:['중복 문서를 만들지 않고 참조한다.'],constraints:[],markingCriteria:[],misconceptions:[],generationInstructions:[]}},
    {...structuredClone(fixture),contentKey:'sample-operations-plan',category:'development-operations',subjectKeys:[],materialKind:'independent-analysis',title:'자체 작성 예시: 재시도와 검수 버전의 저장 규칙',summary:['같은 요청 키는 같은 결과를 돌려주고, 수정은 새 버전을 남깁니다. 기존 브리핑과 연구 저장소를 분리합니다.'],body:'## 실험용 자체 작성 운영 메모\n\n저장 요청 키와 글 키를 구분한다. 이전 버전은 수정하지 않고, 검수 메모와 당시 출처를 새 수정본에 함께 남긴다.',metadata:{...fixture.metadata,levels:[],units:[],assessmentSkills:[],questionTypes:[],designPrinciples:['재시도 결과를 보존한다.'],constraints:[],markingCriteria:[],misconceptions:[],generationInstructions:[]}},
    {...structuredClone(fixture),contentKey:'sample-market-research',category:'korea-market',subjectKeys:[],materialKind:'independent-analysis',title:'자체 작성 예시: 한국 개설 과목 조사에서 확인할 항목',summary:['학교별 개설 과목, SL·HL, 조사 날짜와 공식 근거를 확인하는 조사 틀을 준비합니다. 후보 과목의 우선순위는 아직 확정하지 않습니다.'],body:'## 실험용 자체 작성 조사 틀\n\n학교의 공개 자료에서 개설 과목과 수준, 적용 연도, 수업 언어를 확인하고 근거 링크를 남긴다. 확인되지 않은 항목은 미확인으로 유지한다. 이 기록은 실제 개설 현황을 조사한 결과가 아니다.',metadata:{...fixture.metadata,levels:[],units:[],assessmentSkills:[],questionTypes:[],designPrinciples:[],constraints:[],markingCriteria:[],misconceptions:[],generationInstructions:[]}},
  ];
  for(const research of variants)await send('/ib/api/publish',{research,expectedRevision:0,requestId:`seed-study-${research.contentKey}`});
  return {credentials,fixture,variants};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){await seedIb();console.log('Seeded 4 candidate subjects and 5 clearly labelled self-authored studies in the local IB store only.');}
