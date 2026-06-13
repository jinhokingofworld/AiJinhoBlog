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

## 작업 순서

1. Prisma schema에 인덱싱 상태와 AI 요청 로그 모델을 추가한다.
2. migration SQL을 추가하고 Prisma Client를 재생성한다.
3. 텍스트 전처리와 chunk 분할 유틸을 구현한다.
4. OpenAI embedding adapter와 ChromaDB vector store adapter를 구현한다.
5. 게시글 작성/수정/삭제 API에 인덱싱 동기화를 연결한다.
6. 인덱싱 상태 조회와 수동 재인덱싱 API를 추가한다.
7. 단위 테스트와 검증 문서를 작성한다.
8. 이슈 체크리스트를 완료 처리하고 커밋/PR/병합/브랜치 삭제까지 진행한다.
