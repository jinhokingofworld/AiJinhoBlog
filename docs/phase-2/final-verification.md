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
