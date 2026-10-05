export const PROJECT_KEY = 'ib-research';
export const categoryLabels = {
  'korea-market':'한국 IB 시장', 'subject-research':'과목별 연구',
  'platform-planning':'플랫폼 기획', 'development-operations':'개발·운영',
} as const;
export const materialLabels = {
  'independent-analysis':'독자 분석', 'source-material':'원문 자료 기록', 'original-question':'자체 생성 문항',
} as const;
export const reviewLabels = {draft:'초안','needs-review':'검수 대기',approved:'검수 완료',rejected:'반려'} as const;
export const rightsLabels = {unknown:'권한 미확인','link-only':'링크 참조만',licensed:'허가·라이선스 확인','public-domain':'공개 이용권한 확인','self-authored':'자체 작성'} as const;
export const generationLabels = {'not-assessed':'생성 이용 미검토',allowed:'생성 이용 허용',restricted:'생성 이용 제한'} as const;
export const designFields = {
  units:'단원', assessmentSkills:'평가 역량', questionTypes:'문항 유형', designPrinciples:'설계 원리',
  constraints:'조건과 제약', markingCriteria:'채점 기준', misconceptions:'오개념', generationInstructions:'생성 지침',
} as const;
export type Category = keyof typeof categoryLabels;
export type MaterialKind = keyof typeof materialLabels;
export type ReviewStatus = keyof typeof reviewLabels;
export type RightsStatus = keyof typeof rightsLabels;
export type GenerationEligibility = keyof typeof generationLabels;
export type DesignField = keyof typeof designFields;
export type User = {id:string;name:string;role:'reader'|'researcher'|'admin'};
export interface Subject {
  key:string; name:string; group:string; active:boolean; order:number;
  priorityStatus:'candidate'|'verified-offering'; priorityEvidence:string; revision:number; updated?:string;
}
export type Metadata = Record<DesignField,string[]> & {
  levels:('SL'|'HL')[]; curriculumVersion:string; examYears:number[]; language:string;
  generationEligibility:GenerationEligibility; generationRationale:string;
};
export interface Source {
  id:string;title:string;url:string;kind:'external-reference'|'self-authored';version:string;accessedOn:string;
  rightsStatus:RightsStatus;usageScope:string;permissionEvidence:string;generationAllowed:boolean;
}
export interface Research {
  schemaVersion:1;projectKey:typeof PROJECT_KEY;contentKey:string;date:string;category:Category;
  materialKind:MaterialKind;title:string;summary:string[];body:string;subjectKeys:string[];
  metadata:Metadata;sources:Source[];reviewStatus:ReviewStatus;reviewNote:string;relatedKeys:string[];
}
export interface ResearchSummary extends Pick<Research,'projectKey'|'contentKey'|'date'|'category'|'materialKind'|'title'|'summary'|'subjectKeys'|'reviewStatus'> {
  levels:('SL'|'HL')[];generationEligibility:GenerationEligibility;revision:number;updated:string;
}
export interface SavedResearch {
  research:Research;revision:number;hash:string;created:string;updated:string;
  history:{revision:number;actor:string;created:string;hash:string;reviewStatus:ReviewStatus;reviewNote:string}[];
}
export function emptyMetadata():Metadata {
  return {levels:[],curriculumVersion:'',examYears:[],language:'',units:[],assessmentSkills:[],questionTypes:[],designPrinciples:[],constraints:[],markingCriteria:[],misconceptions:[],generationInstructions:[],generationEligibility:'not-assessed',generationRationale:''};
}
