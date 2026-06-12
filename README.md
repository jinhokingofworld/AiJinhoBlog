# AiJinhoBlog

개인 블로그 기능을 먼저 완성하고, 이후 AI 요약, RAG, MCP, Agent 기능을 확장하는 Next.js 기반 프로젝트입니다.

Phase 1의 구현 범위는 사용자별 블로그 홈, JWT 인증, 프로필/커버 이미지, 게시글, 댓글, 폴더 관리, 일반 키워드 검색, 페이지네이션입니다. Phase 1에서는 OpenAI 호출, RAG 파이프라인, ChromaDB 인덱싱을 실행하지 않습니다.

Phase 2의 구현 범위는 게시글 전처리, chunk 분할, OpenAI embedding 호출, ChromaDB 저장/삭제, AI 요청 로그 기록입니다. 자연어 질문 기반 RAG 검색과 답변 생성은 Phase 3에서 구현합니다.

## 개발 환경

- Node.js: `>=20.9.0`
- npm: `>=10`
- App: `aijinhoblog/`
- DB: MySQL 8.4
- Vector DB: ChromaDB, Phase 2 이후 사용

## 처음 실행

```bash
nvm use
npm run install:all
npm run services:up
npm run prisma:migrate
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

Docker Desktop이 꺼져 있으면 먼저 실행해야 합니다. MySQL 이미지 pull이 지연되거나 실패하면 `Problem.md`의 `19. MySQL 이미지 pull 지연으로 DB 연동 수동 검증 차단`을 확인합니다.

## 주요 라우트

- `/`: 공개 시작 페이지
- `/login`: 로그인
- `/signup`: 회원가입
- `/{username}`: 사용자별 블로그 홈
- `/{username}/posts/new`: 글쓰기, 소유자 전용
- `/{username}/posts/{postId}`: 게시글 상세
- `/{username}/posts/{postId}/edit`: 글 수정, 소유자 전용
- `/{username}/settings/profile`: 프로필 설정, 소유자 전용
- `/{username}/settings/folders`: 폴더 관리, 소유자 전용

## 주요 API

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/users/{username}/profile`
- `PATCH /api/me/profile`
- `POST /api/me/profile-image`
- `POST /api/me/cover-image`
- `GET /api/users/{username}/posts`: `page`, `pageSize`, `sort`, `folderId`, `query`, `tag` 지원
- `GET /api/users/{username}/posts/{postId}`
- `POST /api/me/posts`
- `PATCH /api/me/posts/{postId}`
- `DELETE /api/me/posts/{postId}`
- `GET /api/me/posts/{postId}/vector-index`
- `POST /api/me/posts/{postId}/vector-index`
- `POST /api/posts/{postId}/comments`
- `DELETE /api/comments/{commentId}`
- `GET /api/me/folders`
- `POST /api/me/folders`
- `PATCH /api/me/folders/{folderId}`
- `DELETE /api/me/folders/{folderId}`
- `POST /api/me/folders/{folderId}/merge`

## 검증 명령어

```bash
npm run prisma:validate
npm run prisma:generate
npm run format:check
npm run lint
npm run test
npm run build
```

DB 기반 수동 검증은 MySQL 컨테이너 실행과 migration 적용 이후 진행합니다.

## 서비스 명령어

```bash
npm run services:up
npm run services:down
npm run services:config
```

## 환경 변수

루트와 Next.js 앱 폴더에 기본 `.env` 파일을 추가했습니다.

실제 비밀키는 `.env`에만 넣고, 공유 가능한 기본값은 `.env.example`에 남깁니다.

- `DATABASE_URL`: MySQL 연결 문자열
- `OPENAI_API_KEY`: OpenAI API 키. 비어 있으면 게시글 CRUD는 유지하고 벡터 인덱싱은 `SKIPPED`로 기록
- `OPENAI_EMBEDDING_MODEL`: embedding 모델명
- `CHROMA_URL`: ChromaDB 서버 주소
- `CHROMA_COLLECTION`: ChromaDB 컬렉션 이름
- `DROPBOX_ACCESS_TOKEN`: Dropbox MCP 연동용 토큰, Phase 2 이후 사용
