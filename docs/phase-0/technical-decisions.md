# 기술 선택 확정

## 1. 목적

이 문서는 Phase 1 이후 구현에서 사용할 기본 기술 선택을 확정한다.

기준은 다음과 같다.

- 로컬에서 빠르게 검증할 수 있어야 한다.
- MVP 구현 속도를 늦추는 운영 의존성을 피한다.
- 이후 운영 환경에서 더 통합된 인프라로 전환할 수 있는 선택지를 남긴다.
- 데이터 저장, 벡터 검색, AI 호출의 책임 경계를 명확히 둔다.

## 2. 최종 선택 요약

| 영역      | MVP 기본 선택              | 운영 전환 후보                 | 결정           |
| --------- | -------------------------- | ------------------------------ | -------------- |
| Frontend  | Next.js, React, TypeScript | 유지                           | 확정           |
| Styling   | Tailwind CSS               | 유지                           | 확정           |
| Database  | MySQL                      | MySQL HeatWave                 | MySQL 유지     |
| ORM       | Prisma                     | Drizzle, 직접 SQL              | Prisma 기본    |
| Vector DB | ChromaDB                   | MySQL HeatWave Vector Store    | ChromaDB 기본  |
| Embedding | OpenAI Embedding API       | MySQL HeatWave GenAI Embedding | OpenAI 기본    |
| RAG       | 자체 경량 파이프라인       | LangChain, LlamaIndex          | 자체 구현 우선 |
| MCP       | TypeScript MCP SDK         | 추후 대체 가능                 | 공식 SDK 우선  |
| Agent     | 자체 서비스 레이어         | LangGraph 등                   | 자체 구현 우선 |

## 3. Next.js 프로젝트 구조

### 결정

현재 구조를 유지한다.

```text
AiJinhoBlog/
  README.md
  Project.md
  Plan.md
  Problem.md
  docs/
  package.json
  aijinhoblog/
    app/
    public/
    package.json
```

### 이유

- 루트는 문서, 프로젝트 운영, 공통 명령어를 관리한다.
- 실제 Next.js 앱은 `aijinhoblog/` 아래에서 관리한다.
- 루트 `package.json`은 `npm --prefix aijinhoblog ...` 방식으로 앱 명령을 위임한다.
- 향후 MCP 서버, 배치 작업, 스크립트가 추가되어도 앱 코드와 분리할 수 있다.

### 후속 기준

- `aijinhoblog/app`은 Next.js URL 라우트 엔트리포인트로 유지한다.
- React UI와 client component는 `aijinhoblog/frontend` 아래에 둔다.
- 인증, Prisma, 도메인 로직, API helper, 서버 액션은 `aijinhoblog/backend` 아래에 둔다.
- Phase 1에서 Prisma를 도입할 때 `aijinhoblog/prisma/schema.prisma`를 기준으로 관리한다.

## 4. MySQL 접근 방식

### 결정

MySQL 접근은 Prisma를 기본으로 한다.

### 이유

- MySQL 스키마와 migration을 코드로 관리할 수 있다.
- TypeScript 기반 Next.js 앱에서 타입 안정성을 얻을 수 있다.
- 사용자, 게시글, 댓글, 태그처럼 관계가 명확한 CRUD 모델에 적합하다.
- 학습과 협업 관점에서 직접 SQL보다 변경 이력을 추적하기 쉽다.

### 후속 기준

- Phase 1에서 `User`, `Post`, `Comment`, `Tag`, `PostTag` 모델을 Prisma schema로 정의한다.
- 권한 검사는 API 레이어에서 처리한다.
- 대량 검색이나 복잡한 통계가 필요해지면 raw SQL 사용을 허용한다.

## 5. Vector DB와 RAG 선택

### 결정

MVP 기본 Vector DB는 ChromaDB로 확정한다.

MySQL AI 또는 MySQL HeatWave Vector Store는 운영 전환 후보로만 둔다.

### 이유

- ChromaDB는 로컬 개발에서 독립적으로 실행하고 검증하기 쉽다.
- 현재 `.env.example`과 루트 패키지에는 ChromaDB 연결을 전제로 한 값이 이미 준비되어 있다.
- MySQL HeatWave GenAI는 MySQL 안에서 Vector Store, 임베딩 생성, RAG를 제공할 수 있지만 OCI/HeatWave 환경 의존성이 있다.
- MVP는 빠른 기능 검증이 우선이므로, 운영 인프라 의존성이 적은 ChromaDB를 먼저 사용한다.

### MySQL AI / HeatWave 판단

MySQL HeatWave Vector Store는 문서를 파싱하고, chunk로 나누고, vector embedding을 생성해 `VECTOR` 타입으로 저장할 수 있다. 또한 MySQL HeatWave GenAI의 `ML_EMBED_ROW`는 테이블 텍스트를 임베딩하고 `DISTANCE()`를 이용한 유사도 검색에 사용할 수 있다.

다만 `DISTANCE()` 같은 vector function은 MySQL HeatWave on OCI 또는 MySQL AI 사용자에게 제공되며, 일반 MySQL Community 기준 기능으로 가정하면 안 된다.

따라서 이 프로젝트에서는 다음 기준을 사용한다.

- 로컬 MVP: MySQL + ChromaDB + OpenAI Embedding
- 운영 전환 후보: MySQL HeatWave GenAI + MySQL HeatWave Vector Store
- 전환 조건: OCI/HeatWave 사용 가능, 비용 검토 완료, RAG 품질 검증 완료

### RAG 초기 구현

RAG는 프레임워크를 먼저 도입하지 않고 자체 경량 파이프라인으로 시작한다.

```text
게시글 저장
-> 본문 정규화
-> chunk 분할
-> embedding 생성
-> ChromaDB 저장
-> 질문 embedding 생성
-> ChromaDB 유사 검색
-> 근거 chunk와 함께 답변 생성
```

### 이유

- MVP에서는 데이터 흐름을 직접 이해하고 검증하는 것이 중요하다.
- LangChain이나 LlamaIndex는 후속 복잡도가 커질 때 도입해도 늦지 않다.
- 직접 구현하면 게시글 수정/삭제와 벡터 데이터 동기화 규칙을 명확히 만들 수 있다.

## 6. MCP 선택

### 결정

MCP는 TypeScript 기반 공식 MCP SDK를 우선 사용한다.

### 이유

- 프로젝트의 주 언어가 TypeScript다.
- 블로그 자체 MCP 서버가 제공해야 할 tool은 게시글 CRUD 중심이므로 TypeScript 서버와 자연스럽게 연결된다.
- Dropbox MCP 연동도 앱 서버와 같은 인증, 에러 처리, 로그 기준을 공유할 수 있다.

### 후속 기준

- 자체 MCP 서버 tool은 게시글 목록 조회, 상세 조회, 생성, 수정, 삭제부터 만든다.
- 외부 링크와 이미지 분석 tool은 게시글 초안 생성 기능과 연결한다.
- MCP tool이 DB를 직접 만지기보다 서비스 레이어를 호출하게 한다.

## 7. Agent 선택

### 결정

Agent 기능은 별도 Agent framework 없이 자체 서비스 레이어로 시작한다.

### 이유

- MVP의 Agent 기능은 글감 추천, 문체 변환, 리팩토링 비교처럼 범위가 비교적 명확하다.
- 초기부터 복잡한 agent graph를 도입하면 디버깅 비용이 커진다.
- 먼저 입력, 검색 근거, 프롬프트, 출력, 비용 로그를 명확히 남기는 구조가 중요하다.

### 후속 기준

- Agent 기능은 API 또는 server action에서 직접 LLM을 호출하지 않고 서비스 함수로 분리한다.
- 모든 AI 요청은 로그 테이블에 요청 목적, 모델, 토큰 또는 비용 추정치, 성공 여부를 남긴다.
- 추천과 재작성 결과는 사용자가 수정 가능한 초안으로 제공한다.

## 8. 결정 보류 항목

다음 항목은 Phase 1 구현 전에 세부 이슈에서 결정한다.

- 인증 세션 방식: cookie session, JWT, NextAuth/Auth.js 중 선택
- OpenAI embedding model과 generation model
- ChromaDB 실행 방식: Docker Compose 또는 로컬 서버
- MySQL 로컬 실행 방식: Docker Compose 또는 로컬 설치
- AI 요청 로그 테이블 상세 컬럼

## 9. 참고 자료

- MySQL HeatWave Vector Store: https://dev.mysql.com/doc/heatwave/en/mys-hw-genai-vector-store-overview.html
- MySQL HeatWave Generate Vector Embeddings: https://dev.mysql.com/doc/heatwave/en/mys-hw-genai-generate-embeddings.html
- MySQL VECTOR Type: https://dev.mysql.com/doc/refman/9.7/en/vector.html
- MySQL Vector Functions: https://dev.mysql.com/doc/refman/9.7/en/vector-functions.html
