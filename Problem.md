# 문제 기록

프로젝트 진행 중 발생한 문제와 원인, 해결 방법을 기록한다.

## 1. PR 자기 승인 불가

### 문제 정의

작성자와 동일한 GitHub 계정으로 Pull Request를 승인하려고 하면 승인 리뷰를 생성할 수 없다.

### 발생 원인

GitHub는 Pull Request 작성자가 자신의 PR을 승인하는 것을 허용하지 않는다. 현재 작업 계정이 저장소 소유자이자 PR 작성자이므로 `gh pr review --approve` 명령이 거절된다.

### 해결 방법

자동화 담당자는 PR 상태 확인, 검증, merge, 브랜치 삭제까지 처리한다. 다만 "승인" 자체는 다른 GitHub 계정의 리뷰가 필요하다. 저장소 설정에서 승인 필수가 아니라면, 검증 결과를 확인한 뒤 merge로 진행한다.

## 2. 이슈 자동 종료 키워드 누락

### 문제 정의

PR 본문을 한글로 수정하면서 `Closes #이슈번호` 예약어가 빠지면 GitHub가 자동 종료 대상 이슈를 인식하지 못한다.

### 발생 원인

GitHub의 이슈 자동 종료 기능은 `Closes`, `Fixes`, `Resolves` 같은 영어 예약어를 기준으로 동작한다. PR 본문을 모두 한글로 바꾸면 `closingIssuesReferences`가 비어 있을 수 있다.

### 해결 방법

이슈와 PR 설명은 한글로 작성하되, 자동 종료 연결은 `Closes #이슈번호` 형식으로 유지한다. PR 생성 후 `gh pr view --json closingIssuesReferences`로 자동 종료 연결 여부를 확인한다.

## 3. dev 브랜치가 main보다 뒤처짐

### 문제 정의

`origin/dev`가 `origin/main`보다 뒤처져 있어, dev 기준 PR을 만들면 이미 main에 병합된 초기 설정 변경사항이 다시 PR diff에 섞일 수 있다.

### 발생 원인

초기 PR이 `main` 기준으로 병합된 뒤 `dev` 브랜치가 최신 main 변경사항을 반영하지 않았다.

### 해결 방법

Phase 0 정리 작업은 현재 `main` 기준으로 진행한다. 이후 `dev`를 통합 브랜치로 사용할 경우, 먼저 `dev`를 `main`과 동기화한 뒤 후속 작업 브랜치를 생성한다.

## 4. npm registry DNS 실패

### 문제 정의

샌드박스 안에서 `npm --prefix aijinhoblog install --save-dev prettier`를 실행했을 때 npm registry에 연결하지 못했다.

### 발생 원인

작업 환경의 기본 샌드박스는 외부 네트워크 접근이 제한되어 있어 `registry.npmjs.org` DNS 조회가 실패했다.

### 해결 방법

동일 명령을 네트워크 접근이 허용된 컨텍스트에서 다시 실행해 Prettier를 설치했다.

## 5. npm audit moderate 경고

### 문제 정의

Prettier 설치 후 `npm --prefix aijinhoblog audit --audit-level=moderate`에서 `postcss` 관련 moderate 취약점 2개가 보고되었다.

### 발생 원인

현재 `next@16.2.9` 내부 의존성 경로에서 취약한 `postcss` 버전이 보고되었다. npm은 `npm audit fix --force`를 제안하지만, 이 경우 `next@9.3.3` 설치를 유도하는 breaking change가 발생한다.

### 해결 방법

강제 수정은 적용하지 않는다. Next.js 버전 다운그레이드는 프로젝트를 깨뜨릴 가능성이 높으므로 보류하고, 후속 의존성 업데이트 이슈에서 Next.js 공식 패치 또는 안전한 업그레이드 경로를 확인한다.

## 6. Prettier 도입 후 format check 실패

### 문제 정의

Prettier 설정을 추가한 뒤 `npm run format:check`가 일부 기존 파일의 포맷 차이로 실패했다.

### 발생 원인

프로젝트에 Prettier가 없던 상태에서 작성된 Markdown, YAML, TSX 파일이 새 Prettier 규칙과 완전히 일치하지 않았다.

### 해결 방법

`npm run format`을 실행해 Prettier 기준으로 파일을 정리했다. 이후 `npm run format:check`로 같은 문제가 재발하지 않는지 확인한다.

## 7. Next.js build 중 Google Fonts fetch 실패

### 문제 정의

`npm run build` 실행 시 `next/font/google`이 Google Fonts CSS를 가져오지 못해 빌드가 실패했다.

### 발생 원인

기본 `create-next-app` 템플릿의 `Geist`, `Geist Mono` 설정이 빌드 중 `fonts.googleapis.com`에 접근한다. 샌드박스나 CI 환경에서 외부 네트워크 접근이 제한되면 빌드가 실패할 수 있다.

### 해결 방법

`aijinhoblog/app/layout.tsx`에서 `next/font/google` 의존성을 제거하고, `aijinhoblog/app/globals.css`에서 시스템 폰트 스택을 사용하도록 변경했다. 이후 `npm run build`로 네트워크 없이 빌드 가능한지 확인한다.

## 8. Turbopack build의 샌드박스 포트 바인딩 실패

### 문제 정의

기본 샌드박스 안에서 `npm run build`를 실행했을 때 Turbopack 내부 작업이 포트 바인딩을 시도하면서 `Operation not permitted` 오류가 발생했다.

### 발생 원인

Next.js 16 Turbopack build 과정에서 CSS 처리와 worker 실행 중 내부 프로세스가 포트를 바인딩하려고 한다. 현재 기본 샌드박스는 이 동작을 제한한다.

### 해결 방법

동일한 `npm run build`를 포트 바인딩이 허용된 컨텍스트에서 다시 실행했고, 빌드가 정상 완료되었다. 코드 변경이 필요한 문제는 아니며, 로컬 터미널 또는 CI 환경에서는 정상 동작할 수 있다.

## 9. Prisma 7 설정 파일의 DATABASE_URL 조회 실패

### 문제 정의

`npm run prisma:validate` 실행 시 `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL` 오류가 발생했다.

### 발생 원인

Prisma 7의 `prisma.config.ts`에서 `env("DATABASE_URL")`를 직접 호출하면 설정 파일 로드 시점에 환경변수가 반드시 존재해야 한다. 현재 검증 명령은 `.env`를 먼저 로드하지 않은 상태로 실행되어 `DATABASE_URL`을 찾지 못했다.

### 해결 방법

`prisma.config.ts`에서 `process.env.DATABASE_URL`을 우선 사용하고, 값이 없으면 Docker Compose 기본 MySQL URL을 사용하도록 변경했다. 실제 배포나 로컬 운영에서는 `DATABASE_URL` 환경변수를 지정하면 그 값이 우선 적용된다.

## 10. Vitest의 TypeScript 경로 별칭 미인식

### 문제 정의

`npm run test` 실행 시 `Cannot find package '@/lib/auth-crypto'` 오류로 테스트 파일을 로드하지 못했다.

### 발생 원인

Next.js와 TypeScript는 `tsconfig.json`의 `@/*` 경로 별칭을 사용하지만, Vitest는 별도 설정이 없으면 이 별칭을 자동으로 해석하지 못한다.

### 해결 방법

`vitest.config.ts`에 `resolve.alias`를 추가하여 `@`가 앱 루트 디렉터리를 가리키도록 설정했다.

## 11. Prisma 7 Client 생성자 옵션 누락

### 문제 정의

샌드박스 밖에서 `npm run build`를 실행했을 때 `PrismaClient needs to be constructed with a non-empty, valid PrismaClientOptions` 오류가 발생했다.

### 발생 원인

Prisma 7의 기본 client engine은 `new PrismaClient()`만으로는 실행되지 않고, DB 드라이버 어댑터나 Accelerate URL이 필요하다. MySQL provider를 사용하는 현재 프로젝트는 MySQL 호환 드라이버 어댑터를 명시해야 한다.

### 해결 방법

공식 MySQL/MariaDB 호환 어댑터인 `@prisma/adapter-mariadb`를 설치하고, `lib/prisma.ts`에서 `new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) })` 형태로 Prisma Client를 생성하도록 변경했다.

## 12. 로컬 Docker 데몬 미실행

### 문제 정의

Phase 1 구현 후 MySQL/ChromaDB 컨테이너 상태 확인을 위해 `docker compose ps`를 실행했지만 Docker API 소켓에 연결하지 못했다.

### 발생 원인

현재 로컬 환경에서 Docker Desktop 또는 Docker 데몬이 실행 중이 아니어서 `/Users/j/.docker/run/docker.sock` 소켓이 존재하지 않았다.

### 해결 방법

코드 레벨 검증은 `prisma validate`, `prisma generate`, `lint`, `format:check`, `test`, `build`로 완료했다. 실제 회원가입/게시글 작성 같은 DB 연동 E2E 확인은 Docker 데몬을 실행한 뒤 `npm run services:up`과 Prisma 마이그레이션 적용 후 진행해야 한다.

## 13. Prisma 7 migrate diff 옵션 변경

### 문제 정의

초기 migration SQL 생성을 위해 `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`를 실행했지만 옵션 제거 오류가 발생했다.

### 발생 원인

Prisma 7에서 `--to-schema-datamodel` 옵션이 제거되었고, 같은 용도에는 `--to-schema` 옵션을 사용해야 한다.

### 해결 방법

`prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`로 명령을 변경해 초기 MySQL migration SQL을 생성했다.

## 14. 루트 워크스페이스의 Prettier 실행 지연

### 문제 정의

`npm exec prettier -- --write plan1-review-draft.md`를 실행했지만 출력 없이 장시간 대기했고, 문서 포맷 적용 여부를 확인할 수 없어 명령을 중단했다.

### 발생 원인

루트 워크스페이스에는 `node_modules/.bin/prettier`가 없었다. 이 상태에서 `npm exec`가 패키지 해결 또는 다운로드를 시도하면서 네트워크 제한 환경에서 멈춘 것으로 판단된다.

### 해결 방법

명령을 중단하고 루트 `package.json`에 이미 정의된 `npm run format`을 사용했다. 이 스크립트는 `aijinhoblog/node_modules/.bin/prettier`를 직접 호출하므로 추가 네트워크 접근 없이 루트 문서까지 포맷할 수 있다. 이후 `npm run format:check`로 재검증한다.

## 15. codex 슬래시 브랜치 생성 실패

### 문제 정의

`git switch -c codex/issue-18-phase1-routing-jwt` 실행 시 `cannot lock ref` 오류가 발생했고, 이어서 일반 브랜치 생성도 기본 샌드박스에서 `.git` lock 파일을 만들지 못했다.

### 발생 원인

현재 실행 환경은 기본 샌드박스에서 `.git/refs` 쓰기를 제한한다. 또한 `codex/...` 형태의 슬래시 브랜치 생성은 refs 하위 디렉터리를 만들어야 하므로 제한 환경에서 먼저 실패했다.

### 해결 방법

충돌 가능성이 낮은 `codex-issue-18-phase1-routing-jwt` 브랜치명을 사용하고, Git refs 쓰기가 허용된 컨텍스트에서 `git switch -c`를 다시 실행해 브랜치를 생성했다.

## 16. 댓글 작성 응답의 author 타입 오류

### 문제 정의

`npm run build` 실행 시 `serializeComment`가 요구하는 `author.username` 필드가 댓글 작성 API 응답 include에 없어 타입 검사가 실패했다.

### 발생 원인

Phase 1 라우팅 작업에서 `User.username`을 필수 필드로 추가하고 공통 author 직렬화 타입에도 반영했지만, `app/api/posts/[id]/comments/route.ts`의 댓글 생성 include는 기존 `id`, `email`, `name`만 선택하고 있었다.

### 해결 방법

댓글 작성 API의 `author.select`에 `username: true`를 추가했다. 이후 권한 허용 컨텍스트에서 `npm run build`를 다시 실행해 타입 검사가 다음 단계로 진행되는지 확인했다.

## 17. 로그인 페이지 useSearchParams Suspense 오류

### 문제 정의

`npm run build` 실행 시 `/login` 페이지에서 `useSearchParams()`가 Suspense boundary 없이 사용되어 prerender 오류가 발생했다.

### 발생 원인

Next.js App Router에서 `useSearchParams()`를 사용하는 클라이언트 컴포넌트는 정적 렌더링 시 Suspense boundary가 필요하다. 로그인 페이지에서는 단순히 `created=1` 완료 메시지만 읽기 위해 해당 훅을 사용하고 있었다.

### 해결 방법

`useSearchParams()` 의존성을 제거하고, 클라이언트 lazy state 초기화에서 `window.location.search`를 읽도록 변경했다. 이후 `npm run build`가 성공했다.
