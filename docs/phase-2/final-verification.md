# Phase 2 통합 검증 기록

작성일: 2026-06-13

## 구현 범위

`Plan.md`의 Phase 2 기준으로 AI 데이터 파이프라인을 구현했다.

- 게시글 제목, 요약, 본문 전처리
- Markdown/HTML 마크업 제거와 일반 텍스트 정규화
- 긴 텍스트 chunk 분할
- 게시글 content hash 생성
- OpenAI embedding API adapter
- ChromaDB v2 REST upsert/delete adapter
- 게시글 작성, 수정, 삭제 시 벡터 인덱싱 동기화
- 게시글별 벡터 인덱싱 상태 테이블
- AI 요청 로그 테이블
- 게시글 인덱싱 상태 조회 API
- 게시글 수동 재인덱싱 API

## 제외 범위

아래 기능은 Phase 3 이후 범위다.

- 자연어 질문 기반 RAG 검색
- 검색된 chunk를 근거로 한 답변 생성
- AI 요약 생성
- MCP 서버
- Agent 기능

## 추가 API

- `GET /api/me/posts/{postId}/vector-index`
- `POST /api/me/posts/{postId}/vector-index`

## DB 변경

추가 migration:

```bash
aijinhoblog/prisma/migrations/20260613021000_phase2_ai_pipeline/migration.sql
```

추가 모델:

- `PostVectorIndex`
- `AiRequestLog`
- `VectorIndexStatus`
- `AiRequestStatus`

## 검증 명령

아래 명령은 통과했다.

```bash
npm run prisma:validate
npm run prisma:generate
npm run format:check
npm run lint
npm run test
npm run build
```

테스트 결과:

- Test Files: 4 passed
- Tests: 27 passed

## DB migration 검증

MySQL 컨테이너가 healthy 상태인 것을 확인한 뒤 migration을 적용했다.

```bash
docker compose ps
npm run prisma:migrate
```

결과:

- `20260613021000_phase2_ai_pipeline` migration 적용 완료
- 전체 6개 migration 적용 상태 확인

## 런타임 API 검증

검증 서버:

```bash
npm --prefix aijinhoblog run dev -- -p 3010
```

검증 사용자:

- `phase2mqb7l38f`

검증 결과:

| 흐름                      | 결과    |
| ------------------------- | ------- |
| 회원가입                  | 201     |
| 로그인                    | 200     |
| 게시글 작성               | 201     |
| 작성 후 인덱싱 상태       | SKIPPED |
| 인덱싱 상태 조회          | 200     |
| 수동 재인덱싱             | 200     |
| 게시글 수정               | 200     |
| 수정 후 content hash 변경 | 확인    |
| 게시글 삭제               | 200     |
| 삭제 시 벡터 상태         | DELETED |

현재 로컬 환경에는 `OPENAI_API_KEY`가 설정되어 있지 않으므로 embedding 호출은 실행하지 않고 `SKIPPED`로 기록되는 경로를 검증했다. 게시글 CRUD는 정상 유지되고, `PostVectorIndex`와 `AiRequestLog`에 상태와 사유가 남는다.

## ChromaDB 동작 방식

ChromaDB adapter는 앱 패키지에 별도 JS client 의존성을 추가하지 않고 v2 REST API를 직접 호출한다.

- collection 생성/조회: `get_or_create`
- 저장: collection `upsert`
- 삭제: collection `delete`

OpenAI key와 ChromaDB 서버가 준비된 환경에서는 같은 인덱싱 서비스가 실제 embedding과 vector upsert/delete를 수행한다.

## Phase 2 보완 검증 기록

작성일: 2026-06-13

Issue #32 기준으로 Phase 2 AI 데이터 파이프라인 보완 작업을 진행했다.

### 보완 구현 범위

- OpenAI embedding 호출에 timeout과 retry/backoff 적용
- ChromaDB collection/upsert/delete 호출에 timeout과 retry/backoff 적용
- 실패 provider와 실패 단계를 `AiRequestLog`에 구분해 기록
- 게시글 수정 시 새 content hash 기반 chunk id를 만들고, 새 벡터 저장 성공 후 기존 chunk 삭제
- 새 벡터 저장 실패 시 기존 chunk id와 content hash 보존
- Markdown parser 기반 텍스트 전처리 적용
- 기존 게시글 backfill 개발용 script 추가
- 앱 패키지 `format:check`가 생성된 Prisma Client를 검사하지 않도록 `.prettierignore` 추가

### 추가 명령

```bash
npm --prefix aijinhoblog run ai:backfill -- --dry-run --limit 1
```

결과:

- backfill 대상 게시글 1개 확인
- dry-run 정상 실행

### 검증 명령

아래 명령은 통과했다.

```bash
npm run format:check
npm --prefix aijinhoblog run prisma:validate
npm --prefix aijinhoblog run lint
npm --prefix aijinhoblog run test
npm --prefix aijinhoblog run build
```

테스트 결과:

- Test Files: 5 passed
- Tests: 30 passed

### 남은 실제 환경 검증

아래 항목은 최초 보완 작업 시점에는 환경 조건이 맞지 않아 완료하지 못했다.

- `OPENAI_API_KEY` 값이 비어 있어 실제 OpenAI embedding 호출 검증을 수행하지 못했다.
- ChromaDB 컨테이너가 실행 중이지 않았고, `chromadb/chroma` 이미지 pull이 완료되지 않아 실제 ChromaDB upsert/delete 검증을 수행하지 못했다.

Phase 3에 들어가기 전 실제 성공 경로를 확인하려면 `.env`의 `OPENAI_API_KEY` 값을 채우고 ChromaDB 컨테이너를 실행한 뒤 게시글 작성/수정/삭제 흐름을 다시 검증해야 한다.

## Phase 2 실제 성공 경로 검증 완료

작성일: 2026-06-13

`.env`에 `OPENAI_API_KEY`가 설정된 것을 확인했고, ChromaDB 컨테이너를 실행한 뒤 실제 API 경로로 Phase 2 AI 데이터 파이프라인을 검증했다.

### 환경 확인

```bash
docker compose ps
curl -sS http://localhost:8000/api/v2/heartbeat
```

결과:

- MySQL 컨테이너 healthy
- ChromaDB 컨테이너 running
- ChromaDB v2 heartbeat 응답 확인

### 실제 API 검증

검증 서버:

```bash
http://127.0.0.1:3000
```

검증 사용자:

- `phase2real-mqbt5r08@example.com`

검증 게시글:

- `cmqbt5r8u0005ymr66k6ncs61`

검증 결과:

| 흐름                     | HTTP 상태 | AI 파이프라인 상태 | 추가 확인                                        |
| ------------------------ | --------- | ------------------ | ------------------------------------------------ |
| 회원가입                 | 201       | -                  | 성공                                             |
| 로그인                   | 200       | -                  | session cookie 발급                              |
| 게시글 작성              | 201       | `INDEXED`          | chunk 1개 저장                                   |
| 작성 후 인덱싱 상태 조회 | 200       | `INDEXED`          | `PostVectorIndex.chunkCount = 1`                 |
| 게시글 수정              | 200       | `INDEXED`          | content hash 변경 확인                           |
| 수정 후 인덱싱 상태 조회 | 200       | `INDEXED`          | OpenAI embedding, Chroma upsert/delete 로그 확인 |
| 게시글 삭제              | 200       | `DELETED`          | ChromaDB chunk 삭제 성공                         |

content hash:

- 작성 후: `cf073cea7582244092bd1ef6f061e4cbb4ba9d9602e6510fd72b5126e357b439`
- 수정 후: `57805b83f1b61bd2fbe625f7820e16fd261d7b3a62d7dcc51cf45278ad770983`

수정 후 최근 AI 로그:

- `chromadb:POST_VECTOR_DELETE:SUCCESS`
- `chromadb:POST_VECTOR_UPSERT:SUCCESS`
- `openai:POST_EMBEDDING:SUCCESS`
- `chromadb:POST_VECTOR_UPSERT:SUCCESS`

### 결론

Phase 2 누락 항목이었던 실제 OpenAI embedding 호출, ChromaDB upsert, 수정 시 이전 chunk 삭제, 삭제 시 ChromaDB chunk 삭제 경로를 모두 확인했다.
