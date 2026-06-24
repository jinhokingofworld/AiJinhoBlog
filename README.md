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
- `/{username}/agent`: 글감 추천, 문체 변환, 출판 리팩토링 Agent, 소유자 전용
- `/{username}/settings/connections`: Dropbox 등 외부 지식 소스 연결 관리, 소유자 전용
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
- `GET /api/me/connections`: 로그인 사용자의 외부 지식 소스 연결 상태 조회
- `GET /api/me/connections/dropbox/start`: Dropbox OAuth 연결 시작
- `GET /api/me/connections/dropbox/callback`: Dropbox OAuth callback 처리
- `DELETE /api/me/connections/dropbox`: Dropbox 연결 해제
- `GET /api/me/dropbox/config`: Dropbox OAuth 앱 설정 상태와 redirect URI 조회
- `GET /api/me/dropbox/markdown`: Dropbox Markdown 파일 목록 조회
- `GET /api/me/dropbox/markdown/content?path={path}`: Dropbox Markdown 파일 본문 읽기
- `POST /api/me/dropbox/markdown/sync`: Dropbox Markdown 문서 저장 및 ChromaDB 색인
- `POST /api/me/rag/search`: 게시글과 Dropbox Markdown 통합 유사 검색
- `POST /api/me/rag/answer`: 검색 근거 기반 내 기억 Q&A 답변 생성
- `POST /api/me/rag/duplicates`: 게시글 발행 전 유사 자료 후보 확인
- `GET /api/me/agent/insights`: 최근 글 기반 글감 추천과 주제 인사이트
- `GET /api/me/agent/style-profile`: 사용자 문체 프로파일 조회
- `POST /api/me/agent/style-profile`: 사용자 문체 프로파일 갱신
- `POST /api/me/agent/rewrite`: 외부 텍스트를 사용자 문체로 재작성
- `POST /api/me/agent/refactor`: 게시글 또는 입력 본문을 출판 품질로 리팩토링
- `POST /api/me/agent/refactor/{resultId}/apply`: 리팩토링 결과를 원 게시글에 반영
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

배포 준비와 운영 환경 구성은 [docs/deployment.md](/Users/j/Desktop/Jungle/week15-16/AiJinhoBlog/docs/deployment.md)를 기준으로 확인합니다.

## 서비스 명령어

```bash
npm run services:up
npm run services:down
npm run services:config
```

## Dropbox Markdown 동기화

Phase 8 이후 앱 안의 Dropbox Markdown 목록 조회와 동기화는 `/{username}/settings/connections`에서 연결한 로그인 사용자의 Dropbox OAuth 토큰으로만 실행됩니다. 저장된 문서와 ChromaDB vector metadata는 `ownerId`로 격리됩니다.

글쓰기 화면의 `외부에서 글 가져오기` 탭에서는 사용자가 Dropbox에 로그인하고 앱 접근을 승인한 뒤 Markdown 파일을 본문으로 가져올 수 있습니다. 가져온 글을 게시글로 저장하면 기존 게시글 vector indexing 파이프라인을 통해 사용자별 RAG에 반영됩니다. 로컬 `.md`, `.markdown`, `.txt` 파일은 브라우저에서 바로 본문으로 가져올 수 있습니다.

운영자는 Dropbox 개발자 콘솔의 앱 설정에 글쓰기 탭에 표시되는 Redirect URI를 정확히 등록해야 합니다. 로컬 기본값은 `http://localhost:3000/api/me/connections/dropbox/callback`이며, `localhost`와 `127.0.0.1`, `http`와 `https`, path 차이도 모두 다른 값으로 처리됩니다.

개발용 CLI sync는 기존처럼 `DROPBOX_ACCESS_TOKEN`을 사용할 수 있습니다.

```bash
npm --prefix aijinhoblog run dropbox:sync -- --username {username}
```

동기화는 Dropbox의 `.md`, `.markdown` 파일을 읽고, Markdown 본문을 plain text로 정규화한 뒤 OpenAI embedding과 ChromaDB vector 저장까지 수행합니다. 먼저 대상 파일만 확인하려면 `--dry-run`을 사용합니다.

## 내 기억 Q&A

Phase 4 이후에는 `/{username}/memory`에서 게시글 chunk와 Dropbox Markdown chunk를 함께 검색해 자연어 질문에 답할 수 있습니다. 답변에는 근거가 된 게시글 링크 또는 Dropbox 문서 경로가 함께 표시됩니다.

글쓰기 화면에서는 게시 전 유사 자료를 확인할 수 있습니다. 유사한 게시글이나 Dropbox Markdown 문서가 있으면 후보를 먼저 보여주고, 사용자는 확인 후 그대로 게시할 수 있습니다.

게시글 생성, 수정, 삭제와 리팩토링 결과 반영은 ChromaDB vector 상태를 자동으로 갱신합니다. Dropbox 연결 해제 시에는 해당 사용자의 Dropbox Markdown 캐시와 vector도 함께 삭제합니다.

## 글쓰기 Agent

Phase 6 이후에는 `/{username}/agent`에서 최근 글 기반 글감 추천, 사용자 문체 프로파일, 외부 텍스트 문체 변환, 기존 글의 출판 품질 리팩토링을 실행할 수 있습니다. 리팩토링 결과는 Before/After로 비교되며, 변경된 문장은 강조 표시되고 사용자가 원 게시글에 선택적으로 반영할 수 있습니다.

문체 프로파일은 과거 게시글의 어조, 문장 길이, 자주 쓰는 표현을 저장하며 7일 이상 지난 프로파일은 문체 변환 시 자동 갱신됩니다.

## MCP 서버

Phase 5 이후에는 stdio 기반 자체 MCP 서버를 실행할 수 있습니다.

```bash
npm --prefix aijinhoblog run mcp:server
```

MCP owner는 tool 입력의 `ownerUsername`, `ownerEmail`, `ownerId`로 지정하거나 아래 환경 변수 중 하나로 지정합니다.

- `AIJINHOBLOG_MCP_OWNER_USERNAME`
- `AIJINHOBLOG_MCP_OWNER_EMAIL`
- `AIJINHOBLOG_MCP_OWNER_ID`

제공 tool:

- `blog_list_posts`
- `blog_get_post`
- `blog_create_post`
- `blog_update_post`
- `blog_delete_post`
- `blog_create_draft_from_link`
- `blog_create_draft_from_image`

## 환경 변수

환경 변수는 루트 `.env` 하나만 사용합니다.

실제 비밀키는 `.env`에만 넣고, 공유 가능한 기본값은 `.env.example`에 남깁니다.

- `DATABASE_URL`: MySQL 연결 문자열
- `OPENAI_API_KEY`: OpenAI API 키. 비어 있으면 게시글 CRUD는 유지하고 벡터 인덱싱은 `SKIPPED`로 기록
- `OPENAI_EMBEDDING_MODEL`: embedding 모델명
- `OPENAI_RAG_MODEL`: RAG 답변 생성 모델명
- `AI_RATE_LIMIT_WINDOW_MS`: 사용자별 AI endpoint 제한 시간 창, 기본값 `60000`
- `AI_RATE_LIMIT_REQUESTS`: 사용자별 endpoint/window 요청 허용 수, 기본값 `20`
- `AUTH_RATE_LIMIT_WINDOW_MS`: IP와 email 기준 인증 endpoint 제한 시간 창, 기본값 `900000`
- `AUTH_RATE_LIMIT_REQUESTS`: 인증 endpoint/window 요청 허용 수, 기본값 `10`
- `CHROMA_URL`: ChromaDB 서버 주소
- `CHROMA_COLLECTION`: ChromaDB 컬렉션 이름
- `DROPBOX_APP_KEY`: 서버 공통 Dropbox OAuth app key
- `DROPBOX_APP_SECRET`: 서버 공통 Dropbox OAuth app secret
- `DROPBOX_OAUTH_REDIRECT_URI`: Dropbox app에 등록한 OAuth redirect URI
- `DROPBOX_OAUTH_SCOPES`: Dropbox read-only scope 목록, 기본값 `files.metadata.read files.content.read`
- `EXTERNAL_CONNECTION_ENCRYPTION_KEY`: 외부 provider access token과 refresh token 암호화 키
- `DROPBOX_ACCESS_TOKEN`: 개발용 CLI Dropbox sync fallback token

Notion은 `ExternalKnowledgeConnection`, `NotionPageDocument`, `NotionPageVectorIndex` 기반의 provider 확장 지점이 준비되어 있으며, 실제 Notion OAuth/sync adapter는 후속 구현 범위입니다.
