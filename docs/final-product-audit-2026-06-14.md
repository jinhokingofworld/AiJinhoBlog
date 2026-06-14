# Final Product Audit - 2026-06-14

## 결론

현재 제품은 기존 감사에서 발견된 릴리즈 차단 항목을 모두 개선했고, `npm` 기준 정적 검증, 단위 테스트, audit, 프로덕션 빌드를 통과한다.

핵심 개선은 게시글 생성/수정/삭제와 ChromaDB vector 상태의 자동 일관성을 서비스 계층에 연결한 것이다. 일반 API, MCP tool, 링크/이미지 초안 생성, Agent 리팩토링 반영 경로가 같은 게시글 서비스를 사용하므로 같은 vector sync 정책을 공유한다.

## 검증 결과

실행 위치: `/Users/j/Desktop/Jungle/week15-16/AiJinhoBlog`

| 명령                                           | 결과                     |
| ---------------------------------------------- | ------------------------ |
| `npm --prefix aijinhoblog run prisma:validate` | 통과                     |
| `npm --prefix aijinhoblog run format:check`    | 통과                     |
| `npm --prefix aijinhoblog run lint`            | 통과                     |
| `npm --prefix aijinhoblog run test`            | 통과: 13 files, 55 tests |
| `npm --prefix aijinhoblog run build`           | 통과                     |
| `npm --prefix aijinhoblog audit`               | 실패: moderate 5건       |

### 개선 후 재검증

| 명령                                           | 결과                     |
| ---------------------------------------------- | ------------------------ |
| `npm --prefix aijinhoblog run prisma:generate` | 통과                     |
| `npm --prefix aijinhoblog run prisma:validate` | 통과                     |
| `npm --prefix aijinhoblog run format:check`    | 통과                     |
| `npm --prefix aijinhoblog run lint`            | 통과                     |
| `npm --prefix aijinhoblog run test`            | 통과: 14 files, 58 tests |
| `npm --prefix aijinhoblog audit`               | 통과: 0 vulnerabilities  |
| `npm --prefix aijinhoblog run build`           | 통과                     |

`npm audit` 상세:

- `@hono/node-server <1.19.13`: `@prisma/dev` -> `prisma` 경유 moderate advisory
- `postcss <8.5.10`: `next` 경유 moderate advisory
- 자동 non-breaking `npm audit fix`는 실패했지만, transitive `postcss`와 `@hono/node-server`를 npm `overrides`로 안전한 버전에 고정해 audit을 통과시켰다.

## Plan.md 요구사항 충족 여부

| 범위                                 | 판단        | 근거                                                                                                                                       |
| ------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase 0 프로젝트 기준/환경           | 충족        | `docs/phase-0/*`, `.env.example`, README, Docker Compose, Prisma/Chroma 설정 존재.                                                         |
| Phase 1 인증                         | 대체로 충족 | 회원가입/로그인/로그아웃 API와 UI, httpOnly cookie session 구현. 보호 페이지는 소유자 검증 또는 redirect/notFound 처리.                    |
| Phase 1 게시글 CRUD                  | 충족        | 게시글 CRUD와 vector sync가 서비스 계층에서 함께 처리된다.                                                                                 |
| Phase 1 댓글/태그/탐색               | 충족        | 댓글 작성/삭제 권한, 태그 저장, 페이징, 검색, 태그 필터 구현. 검색은 제목/요약/본문을 포함한다.                                            |
| Phase 2 AI 데이터 파이프라인         | 충족        | embedding, ChromaDB upsert/delete, AI log, 재시도/오류 기록이 구현되어 있고 게시글 CRUD 및 리팩토링 apply와 연결된다.                      |
| Phase 3 Dropbox Markdown 확보/색인   | 대체로 충족 | 사용자 토큰 기반 목록/본문/sync와 stale document vector 정리 구현.                                                                         |
| Phase 4 RAG                          | 충족        | 게시글/Dropbox/Notion-ready source hydration, Q&A, 중복 후보 확인 UI/API 구현. 게시글 vector가 자동 갱신된다.                              |
| Phase 5 MCP                          | 충족        | MCP 게시글 CRUD 및 링크/이미지 초안 tool이 같은 vector sync 정책을 사용한다.                                                               |
| Phase 6 AI Agent                     | 충족        | 글감 추천, 문체 프로파일, 문체 재작성, 리팩토링/Before-After/apply 구현. 리팩토링 apply 후 vector 재색인도 수행한다.                       |
| Phase 7 품질/배포                    | 충족        | 검증 명령, audit, rate limit, 배포 문서가 갱신되었다.                                                                                      |
| Phase 8 사용자별 Dropbox/Notion 준비 | 충족        | Dropbox OAuth/token 전환/연결 해제 cleanup 구현. Notion provider를 위한 DB 모델과 RAG source type/hydration 확장 지점이 코드에 반영되었다. |

## 발견 사항

### P0. 게시글 CRUD가 vector DB와 자동 동기화되지 않음

상태: 해결 완료.

요구사항:

- `docs/Plan.md:25`: 게시글 저장 시 벡터 DB 인덱싱
- `docs/Plan.md:159-161`: 생성 시 저장, 수정 시 재생성, 삭제 시 vector 삭제
- `docs/Plan.md:168-172`: 게시글 CRUD와 벡터 DB 상태 일관성

기존 감사 당시 구현:

- `aijinhoblog/app/api/me/posts/route.ts:27-31`은 `createOwnerPost`만 호출한다.
- `aijinhoblog/app/api/me/posts/[postId]/route.ts:34-38`은 `updateOwnerPost`만 호출한다.
- `aijinhoblog/app/api/me/posts/[postId]/route.ts:56-61`은 `deleteOwnerPost`만 호출한다.
- `aijinhoblog/backend/posts.ts:304-328`, `331-382`, `385-411`도 DB 게시글/태그만 처리한다.
- 실제 vector sync는 `aijinhoblog/app/api/me/posts/[postId]/vector-index/route.ts:72-92`의 별도 수동 API에만 있다.

영향:

- 새 글 발행 직후 RAG/중복 검사/유사 글 탐색에 해당 글이 반영되지 않을 수 있다.
- 글 수정 후 ChromaDB에는 이전 내용 vector가 남아 있을 수 있다.
- 글 삭제 후 ChromaDB vector가 남아 RAG 결과에 죽은 source가 섞이거나, hydration에서 누락되어 검색 품질이 낮아질 수 있다.
- MCP 게시글 생성/수정/삭제와 Agent 리팩토링 반영도 같은 게시글 서비스를 사용하므로 같은 문제가 전파된다.

권장 조치:

- `createOwnerPost`, `updateOwnerPost`, `deleteOwnerPost` 또는 API route에서 `syncPostVectorIndex`/`deletePostVectorIndex`를 호출한다.
- 게시글 DB transaction과 외부 vector 작업의 실패 경계를 명확히 정한다. 예: 게시글 저장은 성공시키되 vector 상태를 `FAILED`로 기록하고 UI/API에 `aiPipeline` 상태를 함께 반환.
- 리팩토링 apply와 MCP draft 생성 후에도 동일한 재색인 정책을 적용한다.

조치 결과:

- `createOwnerPost`, `updateOwnerPost`, `deleteOwnerPost`가 `aiPipeline` 결과를 함께 반환한다.
- create/update는 게시글 저장 후 `syncPostVectorIndex`를 호출한다.
- delete는 `deletePostVectorIndex` 성공 후 DB 게시글을 삭제한다. vector 삭제 실패 시 게시글 삭제를 막고 사용자에게 502를 반환한다.
- API와 MCP tool 응답에 `aiPipeline`이 포함된다.

### P1. Agent 리팩토링 반영 후 vector가 재색인되지 않음

상태: 해결 완료.

요구사항:

- `docs/Plan.md:288-301`: 리팩토링 결과 저장, Before/After, 사용자가 결과를 게시글에 반영
- `docs/Plan.md:159-161`: 게시글 수정 시 vector 재생성

기존 감사 당시 구현:

- `aijinhoblog/backend/writing-agent.ts:461-469`는 게시글 `content`를 `result.revisedText`로 업데이트한다.
- 같은 함수에서 `syncPostVectorIndex` 호출이 없다.

영향:

- 사용자가 리팩토링 결과를 실제 글에 반영해도 RAG/중복 검사에 반영되는 지식은 이전 본문일 수 있다.

권장 조치:

- `applyRefactorResult`가 게시글 업데이트 후 해당 게시글의 vector를 재색인하도록 연결한다.

조치 결과:

- `applyRefactorResult`가 게시글 본문 반영 후 `syncPostVectorIndex`를 호출하고 `post + aiPipeline`을 반환한다.

### P1. Dropbox 연결 해제 후 동기화 문서/vector 처리 정책이 코드에 없음

상태: 해결 완료.

요구사항:

- `docs/Plan.md:357-362`: 연결 해제 시 토큰과 동기화 문서 처리 정책 구현

기존 감사 당시 구현:

- `aijinhoblog/app/api/me/connections/dropbox/route.ts:15`는 `ExternalKnowledgeConnection`만 삭제한다.
- Dropbox 문서 삭제/오래된 vector 정리는 sync 중 원격 파일이 사라졌을 때만 수행된다. `aijinhoblog/backend/dropbox-indexing.ts:701-733`
- RAG 검색은 연결 상태 확인 없이 `ownerId` 기준 Dropbox vector를 검색한다. `aijinhoblog/backend/rag.ts:359-373`

영향:

- 사용자가 Dropbox 연결을 해제해도 이미 sync된 Markdown 본문과 vector가 DB/ChromaDB에 남고 RAG 결과로 계속 사용될 수 있다.
- 개인정보 관점에서 "연결 해제"의 의미가 불명확하다.

권장 조치:

- 연결 해제 정책을 제품 요구로 확정한다.
- 권장 기본값은 연결 해제 시 해당 사용자의 Dropbox 문서와 vector를 삭제하는 것이다.
- 보존 정책을 택한다면 UI와 문서에 "연결만 끊고 기존 지식은 유지"를 명확히 표시하고, 별도 "동기화 데이터 삭제" 기능을 제공한다.

조치 결과:

- 제품 정책을 "연결 해제 시 해당 사용자의 Dropbox Markdown 캐시와 vector 삭제"로 확정했다.
- `deleteOwnerDropboxMarkdownKnowledge`를 추가했다.
- Dropbox 연결 해제 API는 cleanup 성공 후에만 connection을 삭제한다.

### P1. Notion provider 구조가 실제 구현까지 확장되지 않음

상태: 해결 완료.

요구사항:

- `docs/Plan.md:31`: Notion 문서 연결을 추가할 수 있는 외부 지식 소스 구조
- `docs/Plan.md:382-399`: `NOTION_PAGE` source type, provider별 hydration adapter, 인증/모델/색인 정책 문서화

기존 감사 당시 구현:

- Prisma enum에는 `NOTION` provider가 있다. `aijinhoblog/prisma/schema.prisma:71-74`
- UI는 Notion을 "준비 중" disabled 상태로만 표시한다. `aijinhoblog/frontend/features/settings/external-connections-client.tsx:114-126`
- 실제 RAG source type은 `POST | DROPBOX_MD`뿐이고, hydration도 두 타입에 고정되어 있다. `aijinhoblog/backend/rag.ts:160-211`
- `docs/phase-8/notion-provider-plan.md:49-105`는 Notion 구현 방향을 계획 문서로 남기지만 실제 table/adapter/API는 없다.

영향:

- "Notion을 추가할 수 있는 provider 구조가 준비된다"는 요구를 문서 수준 이상으로 충족했다고 보기 어렵다.

권장 조치:

- 최소한 `KnowledgeSourceType`/hydration을 provider adapter 형태로 분리하고, source type 확장 지점에 `NOTION_PAGE`를 반영한다.
- Notion 구현 전이라도 DB model 또는 provider-neutral document abstraction 중 하나는 코드에 포함시킨다.

조치 결과:

- `NotionPageDocument`, `NotionPageVectorIndex` 모델과 migration을 추가했다.
- RAG `KnowledgeSourceType`에 `NOTION_PAGE`를 추가했다.
- RAG hydration은 Notion page title/url을 hydrate할 수 있다.

### P2. 본문 키워드 검색 요구와 실제 검색 범위가 불일치

상태: 해결 완료.

요구사항:

- `docs/Plan.md:139`: 제목 및 본문 키워드 검색

기존 감사 당시 구현:

- `createPostListFilterWhere`는 keyword 검색을 `title`과 `excerpt`에만 적용한다. `aijinhoblog/backend/posts.ts:148-167`

영향:

- 본문에만 있는 키워드로 공개 글 목록 검색이 되지 않는다.

권장 조치:

- MySQL text search 전략을 정한다. MVP에서는 `content contains`를 추가할 수 있지만, 운영 데이터가 커질 경우 full-text index나 별도 search strategy를 문서화해야 한다.

조치 결과:

- `createPostListFilterWhere` keyword 검색 조건에 `content contains`를 추가했다.
- 테스트 기대값도 제목/요약/본문 검색으로 갱신했다.

### P2. AI endpoint rate limit이 없음

상태: 해결 완료.

요구사항:

- `docs/Plan.md:320-330`: 성능 및 비용 점검, 캐싱 또는 rate limit 필요성 검토, AI 실패/지연/비용 대응

기존 감사 당시 구현/문서:

- `docs/phase-7/final-verification.md:53-56`과 `docs/deployment.md:68-74` 모두 per-user AI rate limit이 아직 없다고 기록한다.

영향:

- `/api/me/rag/answer`, `/api/me/rag/search`, `/api/me/rag/duplicates`, `/api/me/agent/*`, vector-index API가 비용 폭주와 abuse에 취약하다.

권장 조치:

- 사용자/endpoint별 rate limit과 daily quota를 추가한다.
- 최소 구현은 DB 또는 Redis 기반 `userId + endpoint + window` 카운터와 429 응답이다.

조치 결과:

- `AiRateLimitBucket` 모델과 migration을 추가했다.
- `enforceAiRateLimit`를 추가해 `userId + endpoint + windowStart` 기준으로 제한한다.
- 게시글 create/update/delete, 수동 vector indexing, Dropbox sync, RAG, Agent API에 적용했다.

### P2. 의존성 moderate advisory 5건

상태: 해결 완료.

기존 감사 당시 상태:

- `npm --prefix aijinhoblog audit`가 moderate 5건으로 실패한다.
- `@hono/node-server` advisory는 Prisma dev dependency 경유다.
- `postcss` advisory는 Next 경유다.
- 자동 수정은 breaking change를 동반한다.

영향:

- 즉시 악용 가능성은 사용 경로에 따라 다르지만, 프로덕션 릴리즈 전 추적 이슈로만 남기기에는 최종 감사 기준상 미해결 위험이다.

권장 조치:

- Next/Prisma의 안전한 패치 버전 또는 upstream 릴리즈를 확인하고 별도 dependency upgrade PR로 해결한다.
- 해결 전 배포한다면 advisory별 실제 노출 경로를 문서화한다.

조치 결과:

- `package.json` `overrides`로 `postcss@8.5.15`, `@hono/node-server@1.19.13`을 고정했다.
- `npm --prefix aijinhoblog audit`가 `found 0 vulnerabilities`로 통과한다.

### P3. `.DS_Store`가 앱 디렉터리에 존재함

상태: 해결 완료.

기존 감사 당시 상태:

- `aijinhoblog/app/[username]/.DS_Store` 파일이 존재한다.

영향:

- 빌드에는 실패하지 않았지만, 배포 산출물/저장소 위생 관점에서 제거해야 한다.

권장 조치:

- 파일 삭제 후 `.gitignore`에 `.DS_Store`가 누락되어 있다면 추가한다.

조치 결과:

- `aijinhoblog/app/[username]/.DS_Store`를 삭제했다.
- 루트와 앱 `.gitignore` 모두 `.DS_Store`를 이미 ignore하고 있음을 확인했다.

## 코드상 양호한 부분

- `app/`은 라우트/페이지 엔트리포인트 중심이고, UI는 `frontend/`, 서버/도메인 로직은 `backend/`로 분리되어 있다.
- 인증 cookie는 httpOnly, sameSite lax, production secure 설정을 사용한다.
- 게시글 읽기 권한은 owner 또는 public/published 조건으로 제한된다.
- 댓글 삭제는 댓글 작성자 또는 게시글 작성자만 가능하다.
- RAG source hydration은 `authorId`/`ownerId`로 DB 재검증을 수행한다.
- Dropbox OAuth token은 사용자별로 암호화 저장된다.
- AI/Chroma/OpenAI 외부 호출은 timeout/retry와 `AiRequestLog` 기록을 갖는다.
- MCP owner resolution은 owner identifier 없이 첫 사용자를 암묵적으로 선택하지 않는다.

## 최종 판단

프로덕션 빌드 가능한 상태이며 주요 화면/API와 감사 지적 항목의 개선이 완료되었다. 다음 항목은 후속 고도화로 남길 수 있다.

1. 실제 Notion OAuth/list/read/sync adapter 구현
2. 검색 데이터가 커질 때 MySQL full-text index 또는 별도 검색 엔진 도입
3. MCP stdio tool의 사용자별 rate limit 정책 세분화
