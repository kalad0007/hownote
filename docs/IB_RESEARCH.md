# IB 연구실 구현과 운영 인수

2026-10-04, DESIGNER의 `C:\Users\kalad\Documents\Codex\2026-10-04\task\hownote`에서 로컬 구현했다. 기준 커밋은 `913ac9a47ee5acc4efb84c0c3bf28bef46321343`, 작업 브랜치는 `feat/ib-research-local`이다. 당시 커밋·push·PR·운영 배포는 실행하지 않았다. 2026-10-05 사이트 운영 게시가 승인되어 기존 main 배포 절차로 진행한다. 후속 운영 검증과 인증 인수 범위는 [IB_DEPLOYMENT.md](IB_DEPLOYMENT.md)를 참조한다.

## 현재 사용자 화면

사용자 의도에 따라 **개인 읽기 전용 연구실**로 변경했다. 사용자는 숫자 4자리 PIN으로 연구를 읽는다. 글과 과목 분류는 도비가 별도 게시 API/MCP 권한으로 기록한다.

- `/ib`: 날짜별 블로그 목록, 한국 IB 시장·과목별 연구·플랫폼 기획·개발·운영 분류.
- `/ib?category=subject-research&subject=…`: 과목 탭. 여러 과목에서 동일 연구의 고유 키를 참조한다.
- `/ib/research?key=…`: 본문, 구조화한 문항 설계 정보, 출처·이용권한, 수정·검수 이력.
- `/ib/research?key=…&revision=1`: 이전 버전의 본문·출처·설계 정보를 함께 읽는다.
- `/ib/subjects`: 과목 후보·개설 근거·보관·변경 이력을 읽는 안내 화면.
- `/ib/edit`: 과거 주소를 보존하는 읽기 안내 페이지. 편집 폼은 없다.

사용자 화면의 작성·수정·과목 관리 폼과 버튼, 해당 브라우저 코드 경로를 제거했다. 게시자 이력은 내부 토큰 식별자 대신 “도비”로 표시하며 원래 actor 값은 저장 이력에 유지한다. 모바일 분류·과목 탭과 데스크톱 사이드 메뉴를 지원한다. 후보 표시 순서는 정리 순서이며 검증된 한국 개설 우선순위나 인기 순위가 아니다.

## 독립 저장과 버전

기존 `CareStore`의 `private-briefings-v1`, `briefings(date PRIMARY KEY)`, 코멘트, 로그인과 OAuth 구현은 유지합니다. `worker/care.mjs`에는 새 IB 라우팅·클래스 export만 추가했습니다.

IB는 새 SQLite Durable Object 클래스 `IbStore`, 바인딩 `IB_STORE`, 인스턴스 키 `private-ib-research-v1`을 사용합니다. `wrangler.jsonc`에는 기존 `care-v1` 뒤에 **새 `ib-v1` 클래스 생성 설정**을 준비했습니다. 이 설정을 운영에 적용하는 배포는 별도 단계입니다. Care 테이블을 변환·복사·삭제하는 SQL은 없습니다.

| 저장 항목 | 의미 |
| --- | --- |
| `schemaVersion: 1` | 저장 계약 버전 |
| `projectKey: ib-research` + `contentKey` | 독립 영역과 고유 글 식별자. 다른 프로젝트 키는 거절 |
| `date` | 목록 정렬 날짜. 같은 날짜에 다른 글 키를 여러 개 저장 가능 |
| `subjectKeys` | 안정적인 과목 키의 참조 목록. 본문을 과목별로 복제하지 않음 |
| `metadata` | SL/HL, 교육과정 버전, 시험 연도, 언어, 단원, 평가 역량, 문항 유형, 설계 원리, 조건·제약, 채점 기준, 오개념, 생성 지침과 생성 이용 판단 |
| `sources` | 출처 ID·제목·링크·자료 종류·버전·확인 날짜·권한 상태·이용범위·권한 확인 근거·AI 생성 허용 여부 |
| `reviewStatus`, `reviewNote` | 초안 / 검수 대기 / 검수 완료 / 반려, 매 수정의 이유 |
| `relatedKeys` | 이미 저장한 연결 연구 참조 |
| `revision`, `hash`, 이력의 `actor`, `created` | 수정 버전·내용 해시·서버가 결정한 작성자·저장 시각 |

현재 연구, 과목 참조, 전체 수정 스냅샷과 요청 재시도 결과를 `transactionSync`로 함께 저장합니다. `expectedRevision: 0`은 새 글이며, 수정은 조회한 현재 버전을 전달해야 합니다. 오래된 버전의 수정 요청은 409로 거절합니다. 같은 내용을 다시 저장하면 새 버전을 만들지 않습니다.

**같은 `requestId`와 요청 내용은 최초 저장 결과를 반환합니다.** 이후 새 수정본이 생겨도 지연된 재시도가 현재 버전을 되돌리지 않습니다. 같은 요청 키를 다른 내용·사용자에게 재사용하면 409입니다. 도비 게시 요청은 응답을 잃은 재시도에도 같은 요청 키와 내용을 전달해야 합니다. 브라우저에는 작성 폼이 없으며 PIN 입력은 로그인 시도 후 지웁니다.

이전 본문, 출처 버전·권한, 설계 정보, 검수 메모는 `ib_revisions`에서 읽을 수 있으며 수정·삭제 API는 없습니다. 과목 변경도 `ib_subject_revisions`에 남습니다. 과목 보관은 기존 참조를 제거하지 않으며, 보관된 과목에 새 참조를 추가하는 것은 거절합니다.

검수 완료와 생성 이용권한은 독립적입니다. 링크 참조만 가능한 자료와 권한 미확인 자료를 AI 생성 허용으로 바꿀 수 없습니다. 허가·공개 이용 자료는 권한 근거를 기록해야 합니다. 전체 연구를 생성 이용 허용으로 표시하려면 모든 출처의 생성 이용 허용과 판단 근거가 필요합니다. 자체 생성 문항에는 자체 작성 출처만 사용합니다. 자료를 자동 다운로드·복제·번역하는 경로는 없습니다.

## 읽기 PIN과 게시 권한 경계

읽기 인증 설정은 `IB_READER_CREDENTIAL`이다. 값은 `{schemaVersion:1,salt,hash}` JSON이며 PIN 원문을 포함하지 않는다. PBKDF2-SHA256 100,000회, 무작위 16바이트 salt와 32바이트 hash를 사용한다.

- 정확히 ASCII 숫자 4자리만 받으며 앞의 0을 보존한다.
- 웹 로그인은 항상 고정 `pin-reader / reader` 세션을 만든다. 요청에 role·actor·옛 password 필드를 넣어도 관리자 권한을 얻지 못한다.
- 브라우저 세션은 조회와 로그아웃만 허용한다. 연구·과목의 POST/PUT/PATCH/DELETE는 서버가 403으로 차단한다.
- PIN 및 PIN 쿠키는 게시 API/MCP 인증으로 사용할 수 없다. 별도 게시 Bearer 권한이 필요하다.
- 기존 IB 다중 사용자용 `IB_USERS`는 더 이상 IB 웹 인증에 사용하지 않는다. 옛 관리자 세션도 PIN 세션으로 인정하지 않는다. 기존 로컬 파일은 수정하거나 삭제하지 않았다.
- 세션은 무작위 256비트 토큰으로 만들고 DB에는 토큰의 SHA-256만 저장한다. `ib_session; Path=/ib; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`이며 서버에서 12시간 후 만료한다.
- 같은 브라우저의 재로그인은 이전 세션을 폐기한다. 로그아웃 및 PIN 재설정으로도 이전 세션을 사용할 수 없게 된다. PIN이 같아도 재설정 시 salt가 바뀐다.
- IP별 최대 5회/15분, 연구실 전체 최대 20회/1시간의 로그인 시도 예산을 함께 적용한다. 올바른 PIN도 예산을 소진하면 대기해야 한다. IP별 예산은 성공 시 초기화하고 전체 예산은 유지한다.
- 시도 예산은 hash 계산 전에 SQLite에서 예약한다. 서로 다른 IP의 동시 요청에도 전체 제한이 적용된다. 429에는 `Retry-After`를 돌려주며 화면은 남은 대기 시간과 입력·버튼 비활성화를 표시한다. 새로고침으로 서버 제한을 해제할 수 없다.
- 로그인 PIN은 성공·실패·연결 오류 뒤 입력칸에서 지우고 브라우저 저장소에 남기지 않는다.
- **공개 최초 설정·가입·PIN 변경 API가 없다.** PIN 미설정 시 웹 인증은 503으로 닫혀 있다. 외부인이 최초 설정을 선점할 수 없다.

기존 Care 사용자 인증·세션·게시 토큰·OAuth audience·scope·grant에는 변경을 가하지 않았다. 읽기 PIN의 제한과 Care의 제한은 별도 저장 영역에서 처리한다.

## 사용자가 직접 하는 로컬 PIN 설정

기존 체크아웃에서 사용자가 해야 할 입력은 두 번뿐이다.

```powershell
cd C:\Users\kalad\Documents\Codex\2026-10-04\task\hownote
npm run ib:pin
```

새 4자리 PIN과 확인 PIN을 본인 터미널에서 입력한다. 입력은 표시되지 않는다. 일치하는 PIN만 프로젝트의 Git 제외 파일 `.dev.vars`에 **`IB_READER_CREDENTIAL` 한 필드**로 저장한다. 나머지 Care 설정·게시 토큰·읽기 토큰을 그대로 보존하며 새 토큰을 만들지 않는다. 부정확하거나 일치하지 않는 입력, 비대화형 실행에는 설정을 쓰지 않는다.

저장 후 실행 중인 `npm run ib:dev`를 종료하고 같은 명령으로 재시작한다. `http://127.0.0.1:8787/ib`에서 본인이 정한 PIN을 입력한다. Codex에서 유지 중인 로컬 서버라면 파일 저장 후 그 서버만 재시작하면 된다. 새 PIN을 대화로 전달할 필요가 없다.

`ib:local-setup`과 `ib:prepare-credentials`는 호환용 명령 별칭으로 같은 PIN 도구를 호출한다. 기존 다중 사용자·게시 토큰 생성 도구를 제거했다. `.ib-local-credentials.json`은 이전 실험 기록일 뿐 PIN 인증의 기준이 아니며 수정할 필요가 없다.

**이번 작업에서 실제 사용자 PIN을 입력·설정하지 않았고, 게시 토큰·운영 인증정보도 생성하거나 변경하지 않았다.** 설정 도구 자체를 실제 체크아웃에서 실행하지 않았다. PIN 준비와 파일 보존 검사는 임시 파일의 명시적인 실험 값으로만 수행했다.

## API와 MCP 확장 지점

브라우저의 읽기 API:

- `POST /ib/api/login`: 정확히 `{pin: "숫자 네 자리"}`.
- `GET /ib/api/me`, `POST /ib/api/logout`.
- `GET /ib/api/subjects`, `GET /ib/api/subjects/:key/history`.
- `GET /ib/api/research?projectKey=ib-research&subject=…`: category·level·materialKind·reviewStatus·q·cursor·limit.
- `GET /ib/api/research/:contentKey?projectKey=ib-research`.
- `GET /ib/api/research/:contentKey/revisions/:revision?projectKey=ib-research`.

별도 도비 게시 API는 긴 Bearer 토큰만 받는다.

- `POST /ib/api/publish`: `{requestId,expectedRevision,research}`.
- `POST /ib/api/publish-subject`: `{requestId,expectedRevision,subject}`.
- `POST /ib/mcp`: initialize·tools/list·tools/call 지원.
- `IB_PUBLISH_TOKEN`: 연구 초안·검수 요청 및 과목 후보 추가·수정·보관.
- 선택적인 `IB_READ_TOKEN`: MCP 조회만 허용. 게시·과목 변경은 거부.

MCP 도구는 `publish_research`, `list_research`, `get_research`, `list_subjects`, `upsert_subject`의 5개다. 기존 Care의 `publish_briefing`, `get_recent_briefings`와 날짜 기반 게시 계약은 유지한다. 연구와 과목의 안정적인 고유 키·requestId·expectedRevision으로 중복·덮어쓰기를 방지한다.

도비 게시자가 스스로 검수 완료·반려 상태로 올릴 수는 없다. 구조와 과거 검수 이력은 보존하며, 전문가의 승인 경로는 후속 권한 설계 대상으로 남긴다. 사용자 읽기 화면에 관리 권한을 다시 부여하지 않는다.

현재 연결된 Care 플러그인은 IB 도구를 자동으로 얻지 않는다. 별도 IB 목적지·도구·인증의 플러그인 등록/재배포가 필요하다. OAuth 전용 연결이라면 IB 전용 audience·read/write scope·동의 화면을 별도로 구현해야 한다. 기존 Care OAuth 권한으로 IB 게시를 승인하지 않는다.

## 로컬 검증과 화면 근거

```powershell
$env:ASTRO_TELEMETRY_DISABLED='1'
npm run validate
npm run check:ib
npm run test:private
npm run test:ib-ui
```

검사는 소스 기반 Worker와 임시 SQLite DO를 사용한다. 실제 `.dev.vars`를 수정하지 않고, 임시 설정·저장 경로에 공개된 합성 테스트 인증만 주입한다. 실제 사용자 PIN이나 게시 토큰을 생성·변경하지 않는다. 기본 로컬 미리보기의 `.wrangler` 데이터와도 분리한다. CI는 기존 Care 테스트 설정을 준비하고 IB는 테스트 전용 fixture를 사용한다.

검증 결과는 다음과 같다.

- 빌드: 기존 공개 20개 경로, HTML 26개, Purchase Note 안전성·리비전·IB 4개 비공개 shell 검증 통과.
- IB 타입 검사: 대상 8개 파일, 오류·경고·힌트 0.
- `test:private`: PIN 설정·세션 검사 30개, Care 31개, OAuth 39개, IB 저장·권한 검사 141개, 미설정 PIN 검사 5개, **총 246개**.
- `test:ib-ui`: Chrome의 5개 흐름. 빈 PIN 화면과 모바일 숫자 입력, 읽기·필터·참조·상세, 별도 게시/재시도/버전 조회, 과목 안내·보관 이력, 위험한 Markdown 차단, 로그아웃, 실제 시도 제한·새로고침, 읽기용 연결 오류 안내.
- IB 통합 검사는 POST/PUT/PATCH/DELETE 쓰기 차단, 게시 API/MCP 분리, 동시 분산 PIN 추측 제한, 이전 세션 폐기, 같은 날짜 복수 글·필터·중복 방지·권한·출처·수정 이력, Care 원문·타임스탬프·댓글 보존을 포함한다.
- PIN 만료·재설정은 시각을 주입하는 세션 검증 단위 검사로 확인했다. 12시간 실시간 대기를 한 결과는 아니다.
- 화면 캡처는 `artifacts/ib-pin/`의 login-desktop.png·login-mobile.png·desktop.png·mobile.png·detail-desktop.png·detail-mobile.png. 로그인 입력칸이 비어 있는 상태와 자체 작성 예시만 캡처했다.
- 화면 근거는 Playwright와 설치된 Chrome이다. Computer Use·스크린리더·전체 접근성 인증은 수행하지 않았다.
- 전체 `npx astro check`에는 기존 `src/components/PurchaseNoteHandoff.astro:41` implicit-any 오류 1건이 있다. 이번 IB 범위 검사는 통과하며 기존 공개 기능은 수정하지 않았다.

기존 `artifacts/ib/` 캡처·패키지는 PIN 변경 전 화면을 기록한 이전 결과물이다. 현재 결과물은 `artifacts/ib-pin/`을 사용한다. 이 문서의 검증 수치는 최종 명령 결과 및 manifest와 대조한다.

## 별도 승인 후 운영 반영

1. 최종 diff를 검토한다. 필요하면 commit/push와 draft PR을 준비한다.
2. 운영의 읽기 PIN은 소유자가 직접 확정한다. 운영 secret `IB_READER_CREDENTIAL` 등록은 별도 승인 단계이며 이 로컬 설정 도구는 원격 secret을 등록하지 않는다.
3. 도비 게시를 위한 운영 `IB_PUBLISH_TOKEN`과 필요한 경우 별도 `IB_READ_TOKEN`은 승인 후 따로 준비·등록한다. 이번에 생성·설정하지 않았다. Care 인증 설정을 유지한다.
4. 새 `IB_STORE` 바인딩·`ib-v1` 저장 클래스와 코드를 승인된 배포 절차로 반영한다. Care 저장 데이터를 이전·변환하는 SQL은 필요하지 않는다. 운영 DB 작업·배포는 아직 미실행이다.
5. 정확한 운영 커밋의 `/version.json`과 HTML build marker, 공개 경로·Care 회귀, IB 익명/읽기/쓰기 권한 경계·시도 제한·게시 후 조회·재시도 보존을 운영에서 검증한다.
6. 별도 IB 플러그인 등록·인증 연결을 완료한다. OAuth가 필수라면 IB 전용 OAuth 및 새 동의가 추가로 필요하다.
7. 실제 과목 개설 조사, 허용된 자료 연구, 자동 게시 예약은 후속 승인 범위다. 대량 수집·유료 자료 다운로드·무단 복제/번역·자동 조사 예약·외부 공유는 실행하지 않았다.

설계 근거: [Cloudflare SQLite 저장 API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), [Cloudflare 요청 헤더](https://developers.cloudflare.com/fundamentals/reference/http-headers/), [OWASP 로그인 시도 제한](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#login-throttling). 구체적인 횟수와 세션 시간은 이번 개인 열람 모델의 구현 정책이며 이 기준들의 인증 등급을 충족한다는 주장으로 사용하지 않는다.
