// This contract is independent of the legacy date-keyed Care briefing contract.
export const PROJECT_KEY = 'ib-research';
export const categories = ['korea-market', 'subject-research', 'platform-planning', 'development-operations'];
export const materialKinds = ['independent-analysis', 'source-material', 'original-question'];
export const reviewStatuses = ['draft', 'needs-review', 'approved', 'rejected'];
export const rightsStatuses = ['unknown', 'link-only', 'licensed', 'public-domain', 'self-authored'];
export function requireValue(condition, message, status = 400) {
  if (!condition) throw Object.assign(new Error(message), { status });
}
function object(value, allowed, label) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), `${label} 형식을 확인해 주세요.`);
  requireValue(Object.keys(value).every(key => allowed.includes(key)), `${label}에 지원하지 않는 항목이 있습니다.`);
}
function string(value, max, label, optional = false) {
  if (optional && (value === undefined || value === '')) return '';
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `${label}을(를) 확인해 주세요.`);
  return value.trim();
}
function list(value, max, length, label, fallback = []) {
  const entries = value === undefined ? fallback : value;
  requireValue(Array.isArray(entries) && entries.length <= max, `${label} 목록을 확인해 주세요.`);
  const result = entries.map(entry => string(entry, length, label));
  requireValue(new Set(result).size === result.length, `${label}에 중복 항목이 있습니다.`);
  return result;
}
function choice(value, options, label) {
  requireValue(options.includes(value), `${label}을(를) 확인해 주세요.`);
  return value;
}
export function key(value, label = '글 키') {
  const result = string(value, 100, label);
  requireValue(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result), `${label}는 영문 소문자·숫자·하이픈으로 작성해 주세요.`);
  return result;
}
export function date(value, label = '연구 날짜') {
  const result = string(value, 10, label);
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(result) && Number.isFinite(Date.parse(result)) && new Date(result).toISOString().slice(0, 10) === result, `${label}을(를) 확인해 주세요.`);
  return result;
}
function webUrl(value, optional = false) {
  if (optional && !value) return '';
  const result = string(value, 2000, '출처 주소');
  let parsed; try { parsed = new URL(result); } catch { requireValue(false, '출처 주소를 확인해 주세요.'); }
  requireValue(parsed.protocol === 'https:' && !parsed.username && !parsed.password, '출처는 인증 정보가 없는 HTTPS 주소로 기록해 주세요.');
  return result;
}
export function validateResearch(value) {
  object(value, ['schemaVersion','projectKey','contentKey','date','category','materialKind','title','summary','body','subjectKeys','metadata','sources','reviewStatus','reviewNote','relatedKeys'], '연구');
  requireValue(value.schemaVersion === 1, '지원하지 않는 저장 형식입니다.');
  requireValue(value.projectKey === PROJECT_KEY, 'IB 연구 프로젝트만 사용할 수 있습니다.', 403);
  const contentKey = key(value.contentKey);
  const category = choice(value.category, categories, '분류');
  const subjectKeys = list(value.subjectKeys, 20, 100, '과목').map(entry => key(entry, '과목 키')).sort();
  requireValue(category !== 'subject-research' || subjectKeys.length > 0, '과목별 연구에는 과목을 선택해 주세요.');
  const summary = list(value.summary, 5, 1200, '요약');
  requireValue(summary.length > 0, '연구 요약을 한 줄 이상 작성해 주세요.');
  const m = value.metadata ?? {};
  object(m, ['levels','curriculumVersion','examYears','language','units','assessmentSkills','questionTypes','designPrinciples','constraints','markingCriteria','misconceptions','generationInstructions','generationEligibility','generationRationale'], '문항 설계 정보');
  const levels = list(m.levels, 2, 2, '수준').sort();
  requireValue(levels.every(level => ['SL','HL'].includes(level)), '수준은 SL 또는 HL로 선택해 주세요.');
  const examYears = m.examYears ?? [];
  requireValue(Array.isArray(examYears) && examYears.length <= 30 && new Set(examYears).size === examYears.length && examYears.every(year => Number.isInteger(year) && year >= 1900 && year <= 2200), '시험 연도를 확인해 주세요.');
  const metadata = {
    levels, curriculumVersion: string(m.curriculumVersion, 240, '교육과정 버전', true),
    examYears: [...examYears].sort(), language: string(m.language, 80, '언어', true),
    ...Object.fromEntries(['units','assessmentSkills','questionTypes','designPrinciples','constraints','markingCriteria','misconceptions','generationInstructions'].map(field => [field, list(m[field], 30, 4000, field)])),
    generationEligibility: choice(m.generationEligibility ?? 'not-assessed', ['not-assessed','allowed','restricted'], 'AI 생성 이용 판단'),
    generationRationale: string(m.generationRationale, 2000, 'AI 생성 이용 판단 근거', true),
  };
  requireValue(Array.isArray(value.sources) && value.sources.length >= 1 && value.sources.length <= 40, '출처와 이용범위를 한 개 이상 기록해 주세요.');
  const sourceIds = new Set();
  const sources = value.sources.map(source => {
    object(source, ['id','title','url','kind','version','accessedOn','rightsStatus','usageScope','permissionEvidence','generationAllowed'], '출처');
    const id = key(source.id, '출처 키'); requireValue(!sourceIds.has(id), '출처 키가 중복됩니다.'); sourceIds.add(id);
    const rightsStatus = choice(source.rightsStatus, rightsStatuses, '이용권한');
    const kind = choice(source.kind, ['external-reference','self-authored'], '출처 종류');
    requireValue(typeof source.generationAllowed === 'boolean', '출처의 AI 생성 이용 허용 여부를 기록해 주세요.');
    requireValue(!(rightsStatus === 'self-authored' && kind !== 'self-authored'), '자체 작성 권한은 자체 작성 자료에만 사용할 수 있습니다.');
    requireValue(!(kind === 'self-authored' && rightsStatus !== 'self-authored'), '자체 작성 자료의 이용권한을 확인해 주세요.');
    requireValue(!source.generationAllowed || ['self-authored','licensed','public-domain'].includes(rightsStatus), '이용권한 미확인·링크 참조 자료는 AI 생성에 허용할 수 없습니다.');
    const permissionEvidence = string(source.permissionEvidence, 2000, '권한 확인 근거', true);
    requireValue(!['licensed','public-domain'].includes(rightsStatus) || permissionEvidence.length > 0, '라이선스·공개 이용 자료의 권한 확인 근거를 기록해 주세요.');
    return {
      id, title: string(source.title, 240, '출처 제목'), url: webUrl(source.url, kind === 'self-authored'), kind,
      version: string(source.version, 240, '출처 버전'), accessedOn: date(source.accessedOn, '출처 확인 날짜'),
      rightsStatus, usageScope: string(source.usageScope, 2000, '이용범위'), permissionEvidence, generationAllowed: source.generationAllowed,
    };
  });
  requireValue(value.materialKind !== 'original-question' || sources.every(source => source.kind === 'self-authored'), '자체 생성 문항은 자체 작성 출처로 기록해 주세요. 외부 자료 분석은 독자 분석으로 분류합니다.');
  requireValue(metadata.generationEligibility !== 'allowed' || (metadata.generationRationale && sources.every(source => source.generationAllowed)), 'AI 생성 이용 허용에는 모든 출처의 허용 여부와 판단 근거가 필요합니다.');
  const relatedKeys = list(value.relatedKeys, 20, 100, '연결 연구').map(entry => key(entry)).sort();
  requireValue(!relatedKeys.includes(contentKey), '자기 자신을 연결 연구로 지정할 수 없습니다.');
  return {
    schemaVersion: 1, projectKey: PROJECT_KEY, contentKey, date: date(value.date), category,
    materialKind: choice(value.materialKind, materialKinds, '자료 종류'), title: string(value.title, 180, '제목'),
    summary, body: string(value.body, 80000, '본문'), subjectKeys, metadata, sources,
    reviewStatus: choice(value.reviewStatus, reviewStatuses, '검수 상태'), reviewNote: string(value.reviewNote, 2000, '변경·검수 메모'), relatedKeys,
  };
}
export function validateSubject(value) {
  object(value, ['key','name','group','active','order','priorityStatus','priorityEvidence'], '과목');
  requireValue(typeof value.active === 'boolean', '과목 사용 여부를 확인해 주세요.');
  requireValue(Number.isInteger(value.order) && value.order >= 0 && value.order <= 999, '표시 순서는 0~999로 입력해 주세요.');
  const priorityStatus = choice(value.priorityStatus, ['candidate','verified-offering'], '개설 조사 상태');
  const priorityEvidence = webUrl(value.priorityEvidence, priorityStatus === 'candidate');
  return { key: key(value.key, '과목 키'), name: string(value.name, 160, '과목 이름'), group: string(value.group, 160, '과목 그룹'), active: value.active, order: value.order, priorityStatus, priorityEvidence };
}

const str = { type: 'string' };
const strings = { type: 'array', items: str };
const enumOf = values => ({ type: 'string', enum: values });
export const researchInputSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    schemaVersion: {type:'integer',enum:[1]}, projectKey: {type:'string',enum:[PROJECT_KEY]}, contentKey: str,
    date: str, category: enumOf(categories), materialKind: enumOf(materialKinds), title: str, summary: strings, body: str, subjectKeys: strings,
    metadata: { type:'object', additionalProperties:false, properties: {
      levels:{type:'array',items:enumOf(['SL','HL'])}, curriculumVersion:str, examYears:{type:'array',items:{type:'integer'}}, language:str,
      ...Object.fromEntries(['units','assessmentSkills','questionTypes','designPrinciples','constraints','markingCriteria','misconceptions','generationInstructions'].map(field => [field,strings])),
      generationEligibility:enumOf(['not-assessed','allowed','restricted']), generationRationale:str,
    } },
    sources: {type:'array',minItems:1,maxItems:40,items:{type:'object',additionalProperties:false,properties:{
      id:str,title:str,url:str,kind:enumOf(['external-reference','self-authored']),version:str,accessedOn:str,
      rightsStatus:enumOf(rightsStatuses),usageScope:str,permissionEvidence:str,generationAllowed:{type:'boolean'},
    },required:['id','title','kind','version','accessedOn','rightsStatus','usageScope','generationAllowed']}},
    reviewStatus:enumOf(reviewStatuses),reviewNote:str,relatedKeys:strings,
  }, required:['schemaVersion','projectKey','contentKey','date','category','materialKind','title','summary','body','subjectKeys','sources','reviewStatus','reviewNote'],
};
