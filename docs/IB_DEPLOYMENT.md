# IB 운영 게시와 인증 인수

2026-10-05에 사이트 운영 게시가 승인되었다. 대상은 Cloudflare의 기존 `hownote` Worker와 `https://hownote.net/ib`다. 기존 main Git 연동으로 검증한 코드를 배포한다. 실제 운영 반영의 판정은 `/version.json`, HTML의 `hownote-build`, 같은 main SHA의 Production Smoke 결과로 한다.

## 변경과 보존 범위

- `IB_STORE / IbStore / ib-v1`은 새 SQLite Durable Object 클래스 추가다. 기존 `CareStore`, 인스턴스 키, 테이블, 댓글 처리, OAuth 코드는 유지한다.
- Care 운영 namespace는 `dcb4ad6266584551ba24a04cd12d8149`이며 배포 전후 같은 namespace를 확인한다. 기존 `CARE_USERS`, `CARE_PUBLISH_TOKEN` secret을 보존한다.
- 연구 원문은 인증한 읽기 API에만 있다. 공개 HTML은 PIN 입력과 비어 있는 화면 shell이며 연구 데이터·로컬 예시·테스트 자격증명을 포함하지 않는다.
- PIN 세션은 읽기 전용이고 게시 API와 MCP는 별도 인증이다. 최초 가입·설정 경로는 열지 않는다.
- 운영 seed, 로컬 테스트 데이터 업로드, 기존 저장소 교체·삭제는 하지 않는다. 실제 PIN, 새 장기 게시 토큰, 새 OAuth 권한은 이번 사이트 게시 과정에서 생성하거나 입력하지 않는다.
- 일일 조사 예약과 대량 자료 수집은 실행하지 않는다.

## 배포 전후 검증

배포 전 `npm install --no-audit --no-fund`, `npm run validate`, `npm run check:ib`, `npm run test:private`, `npm run test:ib-ui`를 다시 통과했다. 개인 저장소 테스트 246건과 브라우저 5개 흐름이며 Care/OAuth 보존을 포함한다.

기존 Production Smoke workflow 다음 단계에 `scripts/ib-production-check.mjs`를 추가했다. 같은 운영 SHA의 IB shell 4개, 연구·과목·이력 비인증 차단, POST/PUT/PATCH/DELETE와 공개 first-claim 차단, 별도 게시 API/MCP 차단, Care 비인증 차단, robots와 sitemap을 검증한다.

```powershell
$env:EXPECTED_SHA='<운영 main 커밋 40자리>'
$env:SMOKE_ATTEMPTS='1'
node scripts/smoke-production.mjs
node scripts/ib-production-check.mjs
```

실제 사용자 PIN을 넣는 로그인 검증은 사용자 설정 후에만 가능하다. 설정되지 않은 운영 독자 API의 503은 닫힌 상태이며 공개 설정으로 선점할 수 없다. 운영 Care 보고서는 기존 연결의 읽기 도구로 배포 전후 대조한다. 댓글의 운영 직접 조회는 기존 독자 세션 없이 수행하지 않으며, 동일 namespace와 변경 없는 Care 코드 및 로컬 댓글 회귀가 보존 근거다.

## 사용자가 직접 설정할 읽기 PIN

로컬 `npm run ib:pin`은 사용자 본인 PC 터미널에서 PIN을 두 번 입력받아 `.dev.vars`의 `IB_READER_CREDENTIAL`만 만든다. 이것은 운영 설정이 아니다.

운영은 Cloudflare → Workers & Pages → hownote → Settings → Variables and Secrets에서 사용자가 직접 `IB_READER_CREDENTIAL`을 **Secret**으로 추가·제출해야 한다. 값은 사용자 PIN에서 만든 `{schemaVersion:1,salt,hash}` JSON이며 PIN 평문이 아니다. 로컬 전체 `.dev.vars`나 Care 설정을 운영에 복사하지 않는다. 실제 값은 채팅이나 Git에 보내지 않는다. Codex는 실제 PIN을 대신 입력하거나 제출하지 않는다.

## 별도 승인이 필요한 도비 게시 연결

준비된 MCP 주소는 `https://hownote.net/ib/mcp`다. 현재 Care 플러그인의 두 도구와 OAuth scope는 그대로다. IB 연결은 자동으로 생기지 않는다.

다음 지속 접근 작업은 별도 액션 승인이 필요하며 사이트 배포와 구분한다.

1. 기존 hownote Worker에 `IB_PUBLISH_TOKEN` secret을 생성·등록. 독립 IB 연구와 과목 후보를 추가·수정·보관하고 조회할 수 있다. Care에는 접근하지 않으며 게시자가 검수 완료·반려를 스스로 부여할 수 없다.
2. 해당 인증으로 IB 전용 플러그인/MCP를 등록·연결. 도구는 publish_research, list_research, get_research, list_subjects, upsert_subject의 5개다.
3. OAuth가 필수라면 IB 전용 audience와 read/write scope, 사용자 동의 화면을 구현하고 별도로 승인한다. 기존 Care OAuth를 확장하거나 재사용하지 않는다.

연결과 사용자 PIN 설정 이후 허용된 자체 연구 글을 실제 게시하고 조회하는 검증을 수행할 수 있다. 일일 예약은 추가 요청 전에는 만들지 않는다.
