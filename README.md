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
- `GET /api/me/dropbox/markdown`: Dropbox Markdown 파일 목록 조회
- `GET /api/me/dropbox/markdown/content?path={path}`: Dropbox Markdown 파일 본문 읽기
- `POST /api/me/dropbox/markdown/sync`: Dropbox Markdown 문서 저장 및 ChromaDB 색인
- `POST /api/me/rag/search`: 게시글과 Dropbox Markdown 통합 유사 검색
- `POST /api/me/rag/answer`: 검색 근거 기반 내 기억 Q&A 답변 생성
- `POST /api/me/rag/duplicates`: 게시글 발행 전 유사 자료 후보 확인
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

## Dropbox Markdown 동기화

Phase 3 이후에는 `DROPBOX_ACCESS_TOKEN`이 설정된 환경에서 Dropbox Markdown 파일을 내부 지식 소스로 동기화할 수 있습니다.

```bash
npm --prefix aijinhoblog run dropbox:sync -- --username {username}
```

동기화는 Dropbox의 `.md`, `.markdown` 파일을 읽고, Markdown 본문을 plain text로 정규화한 뒤 OpenAI embedding과 ChromaDB vector 저장까지 수행합니다. 먼저 대상 파일만 확인하려면 `--dry-run`을 사용합니다.

## 내 기억 Q&A

Phase 4 이후에는 `/{username}/memory`에서 게시글 chunk와 Dropbox Markdown chunk를 함께 검색해 자연어 질문에 답할 수 있습니다. 답변에는 근거가 된 게시글 링크 또는 Dropbox 문서 경로가 함께 표시됩니다.

글쓰기 화면에서는 게시 전 유사 자료를 확인할 수 있습니다. 유사한 게시글이나 Dropbox Markdown 문서가 있으면 후보를 먼저 보여주고, 사용자는 확인 후 그대로 게시할 수 있습니다.

## 환경 변수

환경 변수는 루트 `.env` 하나만 사용합니다.

실제 비밀키는 `.env`에만 넣고, 공유 가능한 기본값은 `.env.example`에 남깁니다.

- `DATABASE_URL`: MySQL 연결 문자열
- `OPENAI_API_KEY`: OpenAI API 키. 비어 있으면 게시글 CRUD는 유지하고 벡터 인덱싱은 `SKIPPED`로 기록
- `OPENAI_EMBEDDING_MODEL`: embedding 모델명
- `OPENAI_RAG_MODEL`: RAG 답변 생성 모델명
- `CHROMA_URL`: ChromaDB 서버 주소
- `CHROMA_COLLECTION`: ChromaDB 컬렉션 이름
- `DROPBOX_ACCESS_TOKEN`: Dropbox Markdown 목록 조회와 파일 본문 읽기에 사용하는 read-only 토큰, Phase 3A 이후 사용
