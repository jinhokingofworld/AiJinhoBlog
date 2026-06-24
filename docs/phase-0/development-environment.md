# 개발 환경 구성

## 1. 목적

이 문서는 AiJinhoBlog를 로컬에서 개발하기 위한 기본 실행 방법을 정리한다.

Phase 0 기준 로컬 개발환경은 다음 조합을 기본으로 한다.

- Next.js 앱: `aijinhoblog/`
- 관계형 데이터베이스: MySQL
- Vector DB: ChromaDB
- 패키지 매니저: npm
- 코드 품질 확인: ESLint, Prettier
- CI: GitHub Actions

## 2. 사전 준비

다음 도구가 필요하다.

- Node.js `>=20.9.0`
- npm
- Docker Desktop 또는 Docker Engine
- GitHub CLI

Node 버전은 `.nvmrc` 기준으로 맞춘다.

```bash
nvm use
```

## 3. 의존성 설치

루트에서 한 번에 설치한다.

```bash
npm run install:all
```

이 명령은 루트 패키지와 `aijinhoblog/` 앱 패키지 의존성을 모두 설치한다.

## 4. 환경 변수

공유 가능한 기본값은 루트 `.env.example`에 둔다.

실제 비밀값은 루트 `.env`에만 작성하고 커밋하지 않는다.

기본 로컬 값은 다음과 같다.

```bash
DATABASE_URL=mysql://aijinho:aijinho_password@localhost:3306/aijinhoblog
CHROMA_URL=http://localhost:8000
CHROMA_COLLECTION=blog_posts
```

## 5. MySQL과 ChromaDB 실행

루트에서 Docker Compose를 실행한다.

```bash
docker compose up -d
```

서비스별 기본 포트는 다음과 같다.

| 서비스   |   포트 | 용도                                    |
| -------- | -----: | --------------------------------------- |
| MySQL    | `3306` | 사용자, 게시글, 댓글, 태그 저장         |
| ChromaDB | `8000` | 게시글 chunk embedding 저장과 유사 검색 |

설정 파일 정합성은 다음 명령으로 확인한다.

```bash
docker compose config
```

서비스를 내릴 때는 다음 명령을 사용한다.

```bash
docker compose down
```

볼륨까지 삭제해야 할 때만 다음 명령을 사용한다.

```bash
docker compose down -v
```

## 6. 개발 서버 실행

루트에서 실행한다.

```bash
npm run dev
```

브라우저에서 `http://localhost:3000`을 연다.

## 7. 품질 확인 명령어

```bash
npm run lint
npm run format:check
npm run build
```

코드 포맷을 자동 적용할 때는 다음 명령을 사용한다.

```bash
npm run format
```

## 8. CI 파이프라인

`.github/workflows/ci.yml`은 Pull Request와 `main`, `dev` 브랜치 push에서 실행된다.

CI는 다음 순서로 검증한다.

1. 루트 의존성 설치
2. Next.js 앱 의존성 설치
3. ESLint 실행
4. Prettier format check
5. Next.js build

## 9. 후속 작업

Phase 1에서 다음 작업을 이어간다.

- Prisma 설치와 schema 작성
- MySQL 연결 확인 API 추가
- ChromaDB heartbeat 확인 API 추가
- 게시글 저장 시 ChromaDB 인덱싱 흐름 구현
