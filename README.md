# AiJinhoBlog

개인 블로그와 AI 기능을 결합하는 Next.js 기반 프로젝트입니다.

## 개발 환경

- Node.js: `>=20.9.0`
- npm: `>=10`
- App: `aijinhoblog/`

## 처음 실행

```bash
nvm use
npm run install:all
npm run services:up
npm run dev
```

브라우저에서 `http://localhost:3000`을 열면 Next.js 앱을 확인할 수 있습니다.

## 환경 변수

루트와 Next.js 앱 폴더에 기본 `.env` 파일을 추가했습니다.

실제 비밀키는 `.env`에만 넣고, 공유 가능한 기본값은 `.env.example`에 남깁니다.

주요 변수는 다음과 같습니다.

- `DATABASE_URL`: MySQL 연결 문자열
- `OPENAI_API_KEY`: OpenAI API 키
- `CHROMA_URL`: ChromaDB 서버 주소
- `CHROMA_COLLECTION`: ChromaDB 컬렉션 이름
- `DROPBOX_ACCESS_TOKEN`: Dropbox MCP 연동용 토큰

## 자주 쓰는 명령어

```bash
npm run dev
npm run lint
npm run format:check
npm run build
npm run start
```

로컬 MySQL과 ChromaDB는 Docker Compose로 실행합니다.

```bash
npm run services:up
npm run services:down
```
