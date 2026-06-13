# Phase 2 구현 계획

작성일: 2026-06-13

## 목표

Phase 2의 목표는 블로그 게시글을 AI 기능에서 사용할 수 있는 지식 기반 데이터로 동기화하는 것이다. Phase 1에서 완성한 게시글 CRUD 흐름에 전처리, chunk 분할, OpenAI embedding 호출, ChromaDB 저장/삭제, AI 작업 로그를 연결한다.

Phase 2는 RAG 답변 기능 자체를 만들지 않는다. 질문을 받아 관련 chunk를 검색하고 답변을 생성하는 기능은 Phase 3에서 구현한다.

## 구현 범위

### 1. 게시글 텍스트 전처리

- Markdown/HTML에 섞인 태그와 마크업을 제거하고 검색 가능한 일반 텍스트로 정규화한다.
- 제목, 요약, 본문을 하나의 인덱싱 입력으로 구성한다.
- 긴 본문은 일정 길이 기준으로 chunk 단위로 나눈다.
- 각 chunk에는 `postId`, `authorId`, `status`, `visibility`, `folderId`, `chunkIndex`, `contentHash` 메타데이터를 붙인다.

### 2. 임베딩 생성

- `OPENAI_API_KEY`가 있을 때 OpenAI embedding API를 호출한다.
- embedding model은 `OPENAI_EMBEDDING_MODEL` 환경 변수로 바꿀 수 있게 하고 기본값을 둔다.
- API key가 없으면 게시글 저장 자체는 실패시키지 않고 인덱싱 상태를 `SKIPPED`로 기록한다.
- OpenAI 호출 실패는 사용자와 개발자가 이해할 수 있는 메시지로 정리해 로그와 응답에 남긴다.

### 3. ChromaDB 저장

- `CHROMA_URL`, `CHROMA_COLLECTION`을 사용해 ChromaDB에 chunk와 embedding을 저장한다.
- 게시글 작성 시 새 chunk를 저장한다.
- 게시글 수정 시 기존 chunk를 삭제하고 새 chunk를 저장한다.
- 게시글 삭제 시 ChromaDB의 관련 chunk를 삭제한다.
- ChromaDB가 내려가 있거나 저장에 실패하면 MySQL의 인덱싱 상태와 AI 요청 로그에 실패 이유를 남긴다.

### 4. MySQL 상태 기록

- 게시글별 벡터 인덱싱 상태를 저장하는 테이블을 추가한다.
- AI 작업 로그 테이블을 추가해 목적, provider, model, status, token 사용량, 실패 메시지를 기록한다.
- 게시글 수정/삭제 시 오래된 벡터 상태가 남지 않도록 `contentHash`와 chunk id를 갱신한다.

### 5. 운영/검증 API

- 로그인한 사용자가 자기 게시글의 인덱싱 상태를 확인할 수 있는 API를 제공한다.
- 로그인한 사용자가 자기 게시글을 수동 재인덱싱할 수 있는 API를 제공한다.
- API 응답은 성공, 실패, 스킵 상태를 구분한다.

## 구현 후 보완 필요 사항

아래 항목은 Phase 2의 기본 골격 구현 이후 추가로 확인하거나 보완해야 하는 내용이다. 현재 구현은 게시글 CRUD와 AI 인덱싱 파이프라인의 연결은 갖추었지만, 실제 운영 수준의 안정성과 검증은 아직 부족하다.

### 1. 실제 OpenAI 및 ChromaDB 성공 경로 검증

- `OPENAI_API_KEY`가 설정된 환경에서 실제 OpenAI embedding 호출이 성공하는지 확인한다.
- 로컬 ChromaDB가 실행 중인 상태에서 실제 upsert/delete 요청이 성공하는지 확인한다.
  > OpenAI key를 추가하였다.
- 게시글 작성 시 `PostVectorIndex.status`가 `INDEXED`로 저장되는지 확인한다.
- 게시글 수정 시 기존 chunk가 삭제되고 새 chunk id와 `contentHash`가 저장되는지 확인한다.
- 게시글 삭제 시 ChromaDB chunk 삭제가 실제로 수행되는지 확인한다.
- ChromaDB collection 생성, 조회, upsert, delete endpoint가 현재 adapter와 호환되는지 확인한다.
  > 실제 테스트를 진행해서 확인해줘

### 2. 재시도, timeout, 장애 격리 정책 보완

- OpenAI embedding 호출에 timeout을 둔다.
- ChromaDB upsert/delete 호출에 timeout을 둔다.
- 일시적인 네트워크 오류나 5xx 응답에 대해 제한된 횟수의 retry/backoff 정책을 적용한다.
- 재시도 후에도 실패하면 `FAILED` 상태와 실패 원인을 `AiRequestLog`에 남긴다.
- 게시글 저장 API가 외부 AI 서비스 지연 때문에 과도하게 느려지지 않도록 동기 처리 유지 여부를 검토한다.
- 필요하면 인덱싱 작업을 비동기 job 형태로 분리하는 방안을 별도 Phase 또는 보완 이슈로 분리한다.
  > 승인

### 3. 비용 관리 보완

- OpenAI embedding 응답의 token 사용량은 저장하되, 모델별 예상 비용 계산은 아직 추가로 설계해야 한다.
- `AiRequestLog`에 비용 추정치를 저장할지, 별도 비용 집계 테이블을 만들지 결정한다.
- 모델별 단가가 바뀔 수 있으므로 비용 계산 기준을 코드 상수로 둘지, 설정값으로 둘지 결정한다.
- 사용자별, 게시글별, 일별 AI 호출 비용을 조회할 필요가 있는지 검토한다.
  > Phase3 진입 전에는 token 기록까지만 유지

### 4. 기존 게시글 backfill 및 bulk reindex 보완

- Phase 2 도입 전에 이미 존재하던 게시글을 한 번에 인덱싱하는 경로가 필요하다.
- 관리자용 bulk reindex API를 만들지, 로컬/운영 스크립트로 처리할지 결정한다.
- 실패한 게시글만 다시 인덱싱하는 필터가 필요한지 검토한다.
- `SKIPPED`, `FAILED`, `INDEXED` 상태별로 재인덱싱 대상을 선택할 수 있어야 하는지 검토한다.
- 대량 게시글 처리 시 OpenAI rate limit과 ChromaDB 처리량 제한을 고려한다.
  > 관리자 API 말고 개발용 script로 backfill하는 방식을 사용하자.

### 5. 벡터 교체 원자성 보완

- 현재 방식은 게시글 수정 시 기존 chunk를 먼저 삭제한 뒤 새 chunk를 저장한다.
- 새 embedding 또는 ChromaDB upsert가 실패하면 오래된 벡터도 없고 새 벡터도 없는 상태가 될 수 있다.
- 오래된 벡터가 남지 않는 것을 우선할지, 장애 시 이전 벡터 검색 가능성을 유지할지 정책을 결정한다.
- 필요하면 새 chunk를 먼저 저장하고 성공 후 기존 chunk를 삭제하는 방식으로 교체 순서를 바꾼다.
- 교체 실패 시 rollback 또는 `STALE` 같은 별도 상태가 필요한지 검토한다.
  > 새 벡터 저장 성공 후 기존 벡터 삭제
  > 중간 상태는 만들지 않는게 좋을 것 같다

### 6. Markdown/HTML 전처리 정확도 보완

- 현재 전처리는 regex 기반이므로 복잡한 HTML, 코드블록, 표, 중첩 Markdown에서 품질이 떨어질 수 있다.
- Markdown parser 또는 HTML parser 도입 여부를 검토한다.
- 코드블록, 링크, 이미지 alt, 목록, 인용문을 인덱싱 텍스트에 어떻게 반영할지 정한다.
- 전처리 결과 snapshot 테스트를 추가해 글 형식별 품질을 확인한다.
  > Markdown parser를 넣는걸 부탁해

### 7. ChromaDB 운영 설정 보완

- ChromaDB 인증이 필요한 환경을 고려해 header 또는 token 설정을 지원할지 검토한다.
- ChromaDB heartbeat 또는 healthcheck API를 추가할지 검토한다.
- collection 이름, tenant, database 설정값이 로컬과 운영에서 어떻게 달라지는지 정리한다.
- ChromaDB adapter에 대한 통합 테스트를 추가한다.
  > CHROMA_URL=http://localhost:8000
  > CHROMA_COLLECTION=blog_posts
  > CHROMA_TENANT=default_tenant
  > CHROMA_DATABASE=default_database
  > 기본값으로 확정하고 가자

### 8. 로그 품질 보완

- 실패 로그의 `provider`가 `pipeline`으로 뭉뚱그려지는 경우를 줄인다.
- OpenAI 실패, ChromaDB upsert 실패, ChromaDB delete 실패, DB 기록 실패를 구분해 남긴다.
- 사용자가 볼 메시지와 개발자가 볼 상세 오류를 분리할지 검토한다.
- `AiRequestLog.metadata`에 retry 횟수, chunk id, content hash, latency를 남길지 결정한다.
  > 임의대로 정하고 구조만 잘 남기면 될 것 같다

## 사용자 확인 필요 사항

아래 항목은 구현자가 임의로 확정하지 않고 사용자 확인 후 진행한다.

- 실제 OpenAI API key를 사용해 Phase 2 성공 경로 검증을 진행해도 되는지 확인한다.
- OpenAI embedding model 기본값을 계속 `text-embedding-3-small`로 둘지 확인한다.
- ChromaDB endpoint, tenant, database, collection 이름을 현재 설정값으로 유지할지 확인한다.
- 게시글 수정 중 인덱싱 실패 시 이전 벡터를 보존할지, 오래된 벡터 삭제를 우선할지 결정한다.
- 인덱싱을 게시글 저장 API 안에서 동기 처리할지, 비동기 job으로 분리할지 결정한다.
- 기존 게시글 backfill을 관리자 API로 만들지, CLI/script로 만들지 결정한다.
- 비용 관리를 token 기록 수준으로 둘지, 원화 또는 달러 기준 예상 비용까지 저장할지 결정한다.
- ChromaDB 인증이 필요한 운영 환경을 당장 고려할지 결정한다.

## 제외 범위

- 자연어 질문 기반 RAG 답변 생성
- 관련 chunk 검색 API
- AI 요약 생성
- MCP 서버와 Agent 기능
- Dropbox 연동

## 완료 기준

- 게시글 작성 시 전처리, chunk 분할, embedding 생성, ChromaDB 저장 흐름이 호출된다.
- 게시글 수정 시 이전 chunk가 삭제되고 현재 본문 기준 chunk가 다시 저장된다.
- 게시글 삭제 시 ChromaDB의 관련 chunk 삭제가 호출된다.
- OpenAI API key가 없는 개발 환경에서도 게시글 CRUD는 동작하고, 인덱싱 상태는 `SKIPPED`로 남는다.
- AI 호출 또는 ChromaDB 저장 실패 시 `FAILED` 상태와 오류 메시지가 남는다.
- AI 요청 로그에 목적, provider, model, token 사용량, 성공/실패 상태가 기록된다.
- 단위 테스트에서 전처리, chunk 분할, content hash, 인덱싱 성공/스킵/실패 흐름을 검증한다.
- `npm run format:check`, `npm run lint`, `npm run test`, `npm run build`가 통과한다.

## 보완 완료 기준

- 실제 OpenAI API key와 ChromaDB를 사용한 작성/수정/삭제 성공 경로가 검증된다.
- OpenAI 또는 ChromaDB 장애 상황에서 retry, timeout, 최종 실패 기록이 일관되게 동작한다.
- 실패 provider와 실패 단계가 `AiRequestLog`에서 구분된다.
- 기존 게시글을 재인덱싱할 수 있는 backfill 또는 bulk reindex 경로가 준비된다.
- 게시글 수정 중 인덱싱 실패 시 벡터 교체 정책이 문서와 코드에 동일하게 반영된다.
- 비용 관리 범위가 token 기록인지 예상 비용 저장인지 확정되고 구현에 반영된다.
- ChromaDB adapter 통합 테스트 또는 수동 검증 절차가 문서화된다.
- 보완 후 `npm run format:check`, `npm run lint`, `npm run test`, `npm run build`가 통과한다.

## 작업 순서

1. Prisma schema에 인덱싱 상태와 AI 요청 로그 모델을 추가한다.
2. migration SQL을 추가하고 Prisma Client를 재생성한다.
3. 텍스트 전처리와 chunk 분할 유틸을 구현한다.
4. OpenAI embedding adapter와 ChromaDB vector store adapter를 구현한다.
5. 게시글 작성/수정/삭제 API에 인덱싱 동기화를 연결한다.
6. 인덱싱 상태 조회와 수동 재인덱싱 API를 추가한다.
7. 단위 테스트와 검증 문서를 작성한다.
8. 이슈 체크리스트를 완료 처리하고 커밋/PR/병합/브랜치 삭제까지 진행한다.
