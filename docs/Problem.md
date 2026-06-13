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

## 18. Prisma Client 재생성 후 dev 서버 미재시작

### 문제 정의

Issue #20 작업 중 `Post.status`, `Post.visibility`, `User.blogTitle`, `User.intro`를 사용하는 페이지가 `npm run build`에서는 통과했지만, 이미 실행 중이던 `npm run dev` 서버에서 `/jinho` 접근 시 500 오류가 발생했다.

### 발생 원인

dev 서버가 이전 Prisma Client 모듈을 메모리에 들고 있었다. `npm run prisma:generate`로 파일은 갱신됐지만, 실행 중인 Next.js dev 프로세스는 새 Prisma Client 타입/런타임을 다시 로드하지 않아 `blogTitle`, `intro` 같은 필드를 알 수 없었다.

### 해결 방법

Prisma 스키마와 generated client를 변경한 뒤에는 dev 서버를 재시작한다. 이번 작업에서는 기존 `npm run dev` 프로세스를 중지한 뒤 새로 실행해 변경된 Prisma Client가 로드되도록 처리했다.

## 19. MySQL 이미지 pull 지연으로 DB 연동 수동 검증 차단

### 문제 정의

Issue #20의 게시글 작성/수정/상세/댓글 수동 검증을 위해 Docker Desktop을 실행하고 `docker compose up -d mysql`을 재시도했지만, `mysql:8.4` 이미지 pull 단계에서 장시간 결과가 나오지 않았고 컨테이너가 생성되지 않았다.

### 발생 원인

Docker 데몬은 정상 실행됐지만 로컬에 `mysql:8.4` 이미지가 없었고, Docker Hub 이미지 다운로드가 현재 네트워크 상태에서 진행되지 않았다. `docker compose ps`와 `docker image ls mysql` 확인 결과 MySQL 컨테이너와 이미지가 모두 없는 상태였다.

### 해결 방법

장시간 대기를 피하기 위해 최초 pull 명령은 중단했다. 이후 Docker Desktop을 다시 실행하고 `docker pull mysql:8.4`를 직접 실행했을 때 이미지 다운로드가 정상 진행되어 해결됐다. 그 다음 `docker compose up -d mysql`로 MySQL 컨테이너를 실행했다.

## 20. Prisma migrate 로컬 캐시 권한 문제

### 문제 정의

MySQL 컨테이너가 healthy 상태가 된 뒤 `npm run prisma:migrate`를 기본 sandbox에서 실행했지만 `Schema engine error`만 출력되고 migration이 적용되지 않았다.

### 발생 원인

`DEBUG=prisma:* npx prisma migrate deploy`로 확인했을 때 Prisma CLI가 `/Users/j/Library/Caches/checkpoint-nodejs/...` 경로에 접근하다가 `EPERM` 오류를 만났다. DB 연결이나 migration SQL 자체 문제가 아니라 로컬 캐시/설정 파일 접근 권한 제한 때문에 schema engine이 실패한 것으로 판단했다.

### 해결 방법

동일한 `npm run prisma:migrate` 명령을 권한 허용 컨텍스트에서 다시 실행했다. 이후 5개 migration이 모두 적용됐고, 회원가입, 로그인, 기본 폴더/글, 게시글 작성/수정, 폴더 관리, 댓글 작성/삭제, 블로그 홈 렌더링까지 DB 기반 수동 검증을 완료했다.

## 21. GitHub CLI 토큰 만료로 이슈 생성 차단

### 문제 정의

Phase 1 일반 키워드 검색과 페이지네이션 보강 작업을 시작하기 전에 `gh`로 GitHub 이슈를 생성하려 했지만 `gh auth status`에서 로그인 실패가 발생했다.

### 발생 원인

`gh`에 저장된 `jinhokingofworld` 계정 토큰이 invalid 상태였다. `gh auth login -h github.com`을 실행했지만 대화형 인증 프롬프트가 현재 실행 환경에서 정상적으로 다음 단계로 진행되지 않아 이슈 생성까지 완료하지 못했다.

### 해결 방법

로컬 구현과 검증은 별도 브랜치에서 진행하고, GitHub 이슈 생성, 이슈 체크리스트 갱신, PR 생성은 `gh auth login -h github.com`으로 인증을 복구한 뒤 이어서 처리한다.

## 22. 기본 샌드박스의 Git ref 쓰기 제한

### 문제 정의

`git switch -c codex/phase1-keyword-search-pagination` 명령이 기본 실행 컨텍스트에서 `cannot lock ref` 오류로 실패했다.

### 발생 원인

현재 기본 샌드박스는 `.git/refs` 쓰기를 제한한다. 브랜치 생성은 Git ref 파일 또는 디렉터리를 생성해야 하므로 기본 컨텍스트에서 실패했다.

### 해결 방법

동일한 브랜치 생성 명령을 Git ref 쓰기가 허용된 컨텍스트에서 다시 실행해 `codex/phase1-keyword-search-pagination` 브랜치를 생성했다.

## 23. 페이지네이션 helper의 prefer-const lint 오류

### 문제 정의

Phase 1 일반 키워드 검색과 페이지네이션 보강 후 `npm run lint`를 실행했을 때 `aijinhoblog/lib/posts.ts`의 `createPageWindow` 함수에서 `end` 변수에 대해 `prefer-const` 오류가 발생했다.

### 발생 원인

페이지 번호 창 계산 과정에서 `start`는 끝 페이지 기준으로 보정되지만, `end`는 최초 계산 이후 재할당되지 않는다. 그런데 구현 시 두 변수를 모두 `let`으로 선언했다.

### 해결 방법

재할당되는 `start`는 `let`으로 유지하고, 재할당되지 않는 `end`는 `const`로 변경했다. 이후 lint를 다시 실행해 확인한다.

## 24. Turbopack build의 로컬 포트 바인딩 권한 문제

### 문제 정의

Phase 1 일반 키워드 검색과 페이지네이션 보강 후 `npm run build`를 기본 sandbox에서 실행했을 때 Turbopack 내부 오류가 발생했다. 오류 메시지는 `app/globals.css` 처리 중 `creating new process`, `binding to a port`, `Operation not permitted`였다.

### 발생 원인

Next.js 16 Turbopack 빌드 과정에서 CSS 처리를 위해 내부 프로세스가 로컬 포트를 바인딩하려 했지만, 기본 sandbox 실행 컨텍스트가 해당 동작을 허용하지 않았다. 애플리케이션 타입 오류가 아니라 실행 권한 문제로 판단했다.

### 해결 방법

동일한 `npm run build` 명령을 권한 허용 컨텍스트에서 재실행했다. 빌드와 TypeScript 검사, 정적 페이지 생성이 모두 성공했다.

## 25. 로컬 dev 서버 API 호출의 sandbox 네트워크 제한

### 문제 정의

브라우저 수동 확인용 테스트 데이터를 만들기 위해 `http://localhost:3001`의 회원가입/로그인/게시글 작성 API를 호출했지만 기본 sandbox에서 `fetch failed`, `EPERM` 오류가 발생했다.

### 발생 원인

현재 기본 실행 컨텍스트는 로컬 네트워크 연결도 제한한다. Next.js dev 서버는 실행 중이었지만, 기본 sandbox에서 해당 포트로 연결할 권한이 없어 API 호출이 실패했다.

### 해결 방법

동일한 로컬 API 호출을 권한 허용 컨텍스트에서 재실행해 브라우저 확인용 테스트 사용자 `searchmqb6czfg`와 공개 게시글 6개를 생성했다.

## 26. 앱 패키지의 ChromaDB 모듈 resolve 실패

### 문제 정의

Phase 2에서 `chromadb` JS client를 동적 import하는 Chroma adapter를 구현한 뒤 `npm run build`를 실행했을 때 `Module not found: Can't resolve 'chromadb'` 오류가 발생했다.

### 발생 원인

`chromadb`는 루트 패키지 의존성에는 있었지만 `aijinhoblog` 앱 패키지 의존성에는 없었다. Next.js 빌드는 앱 패키지 기준으로 모듈을 해석하므로 서버 route에서 `chromadb` import를 resolve하지 못했다.

### 해결 방법

별도 앱 의존성을 추가하지 않고 ChromaDB v2 REST API를 직접 호출하는 방식으로 adapter를 변경했다. collection은 `get_or_create` 요청으로 준비하고, 반환된 collection id로 upsert/delete endpoint를 호출한다.

## 27. Prisma JSON 입력 타입 오류

### 문제 정의

Phase 2 build 중 `AiRequestLog.metadata`에 `Record<string, unknown>` 값을 전달한 부분에서 TypeScript 오류가 발생했다.

### 발생 원인

Prisma Client의 JSON 입력 필드는 `Prisma.InputJsonValue` 타입을 요구한다. 일반 `Record<string, unknown>`은 JSON으로 직렬화 가능한 값이라는 보장이 타입상 부족해 빌드가 실패했다.

### 해결 방법

AI 작업 로그 metadata와 vector chunk id 배열을 Prisma JSON 입력 타입으로 명시했다. 이후 `npm run build`가 TypeScript 검사를 통과했다.

## 28. 기존 Next dev 서버 충돌로 Phase 2 API 검증 서버 종료

### 문제 정의

Phase 2 런타임 API 검증을 위해 `next dev -p 3010`을 실행했지만 기존 `http://localhost:3001` dev 서버가 같은 앱 디렉터리에서 실행 중이라 새 서버가 종료됐다.

### 발생 원인

Next.js는 같은 프로젝트 디렉터리에서 이미 실행 중인 dev 서버를 감지하면 추가 dev 서버 실행을 막는다. 기존 서버는 Phase 1 검증 때 띄운 프로세스였다.

### 해결 방법

기존 Next dev 서버 프로세스를 종료한 뒤 `next dev -p 3010`을 다시 실행했다. 이후 Phase 2 회원가입, 로그인, 게시글 생성, 벡터 인덱싱 상태 조회, 수동 재인덱싱, 수정, 삭제 API 흐름을 검증했다.

## 29. npm install의 sandbox 네트워크 대기

### 문제 정의

Phase 2 보완 작업에서 Markdown parser와 backfill script 실행기를 추가하기 위해 `npm --prefix aijinhoblog install marked`를 기본 sandbox에서 실행했지만, 명령이 출력 없이 장시간 대기했다.

### 발생 원인

패키지 설치는 npm registry 네트워크 접근이 필요하다. 현재 기본 sandbox는 외부 네트워크 접근이 제한되어 있어 설치 명령이 진행되지 못한 것으로 판단했다.

### 해결 방법

멈춘 설치 명령을 중단한 뒤 권한 허용 컨텍스트에서 `npm --prefix aijinhoblog install marked`와 `npm --prefix aijinhoblog install -D tsx`를 다시 실행했다. 두 명령 모두 완료되어 `package.json`과 `package-lock.json`이 갱신되었다.

## 30. Phase 2 실제 성공 경로 검증 환경 미충족

### 문제 정의

Phase 2 보완 작업 후 실제 OpenAI embedding과 ChromaDB upsert/delete 성공 경로를 검증하려 했지만, 로컬 `.env`의 `OPENAI_API_KEY` 값이 비어 있었고 ChromaDB 컨테이너도 실행 중이지 않았다.

### 발생 원인

OpenAI key는 파일에 항목만 있고 값이 설정되지 않은 상태였다. Docker에서는 MySQL 컨테이너만 healthy 상태였고, `docker compose up -d chroma`를 실행했지만 `chromadb/chroma` 이미지 pull 단계에서 장시간 완료되지 않았다.

### 해결 방법

이번 작업에서는 실제 OpenAI 호출 검증과 ChromaDB 실서버 검증을 완료하지 못했다. 대신 ChromaDB adapter와 OpenAI adapter에 retry/timeout을 적용하고, 관련 단위 테스트와 build 검증을 우선 수행한다. 추후 `OPENAI_API_KEY` 값을 채우고 ChromaDB 이미지 pull이 완료되는 환경에서 실제 작성/수정/삭제 성공 경로를 다시 검증해야 한다.

### 추가 해결

이후 `.env`에 `OPENAI_API_KEY`가 설정된 것을 확인했고, `docker compose up -d chroma`로 ChromaDB 이미지를 pull하고 컨테이너를 실행했다. `http://localhost:8000/api/v2/heartbeat` 응답을 확인한 뒤 실제 Next API 경로로 회원가입, 로그인, 게시글 작성, 인덱싱 상태 조회, 게시글 수정, 게시글 삭제를 검증했다.

검증 결과 게시글 작성과 수정은 `INDEXED`, 삭제는 `DELETED`로 응답했다. 수정 후 AI 작업 로그에는 `openai:POST_EMBEDDING:SUCCESS`, `chromadb:POST_VECTOR_UPSERT:SUCCESS`, `chromadb:POST_VECTOR_DELETE:SUCCESS`가 기록되어 실제 OpenAI embedding과 ChromaDB 저장/삭제 경로가 동작함을 확인했다.

## 31. tsx 실행기의 sandbox IPC 권한 문제

### 문제 정의

Phase 2 backfill script 검증을 위해 `npm --prefix aijinhoblog run ai:backfill -- --dry-run --limit 1`을 기본 sandbox에서 실행했지만 `listen EPERM` 오류가 발생했다.

### 발생 원인

`tsx` 실행기는 내부적으로 임시 IPC pipe를 생성한다. 현재 기본 sandbox에서는 해당 pipe listen 동작이 허용되지 않아 script가 시작되기 전에 실패했다.

### 해결 방법

동일한 dry-run 명령을 권한 허용 컨텍스트에서 재실행했다. script는 정상 실행되어 backfill 대상 게시글 1개를 출력했다.

## 32. 전역 계정 바 이동 후 블로그 홈 로그아웃 액션 참조 오류

### 문제 정의

큰 화면 계정 상태 UI를 모든 페이지에서 보이게 하기 위해 블로그 홈 내부 계정 바를 `RootLayout` 전역 컴포넌트로 이동한 뒤, 로그인 상태로 자기 블로그 홈에 접근하면 500 응답이 발생했다. RSC 에러에는 `ReferenceError: logoutAction is not defined`가 기록되었다.

### 발생 원인

블로그 홈 상단 계정 바를 제거하면서 해당 파일 안에 있던 `logoutAction` 서버 액션도 함께 제거했다. 하지만 모바일 햄버거 메뉴는 여전히 같은 `logoutAction`을 사용하고 있었기 때문에, 로그인 상태에서 해당 분기가 렌더링될 때 정의되지 않은 함수를 참조했다.

### 해결 방법

로그아웃 서버 액션을 `app/auth-actions.ts` 공용 파일로 분리했다. 전역 큰 화면 계정 바와 블로그 홈 모바일 햄버거 메뉴가 같은 `logoutAction`을 import하도록 변경했고, 로그인 쿠키를 붙인 상태에서 `/`, `/login`, `/{username}`, `/{username}/settings`가 모두 200 응답하며 계정 메뉴를 렌더링하는 것을 확인했다.

## 33. 전역 계정 상태 UI의 max-width 이탈

### 문제 정의

큰 화면 전역 계정 상태 바를 `fixed right-4`로 배치한 뒤, 1200px 화면에서 계정 상태 UI가 블로그 헤더와 본문 컨테이너의 `max-w-[1120px]` 우측선을 넘어갔다.

### 발생 원인

계정 상태 바가 페이지 컨테이너 안에 있지 않고 viewport 기준 `right-4`에 직접 고정되어 있었다. 블로그 본문은 `px-4 sm:px-6` 패딩과 `max-w-[1120px]` 중앙 정렬을 함께 사용하기 때문에, viewport 기준 고정 위치와 본문 우측선이 일치하지 않았다.

### 해결 방법

전역 계정 상태 바의 outer 영역은 `fixed inset-x-0`으로 두고, 내부에 본문과 같은 `px-4 sm:px-6` 및 `max-w-[1120px]` 컨테이너를 추가했다. 1200px 화면에서 계정 바 내부 컨테이너, 실제 계정 UI, 본문 컨테이너의 오른쪽 끝이 모두 같은 `1160px` 좌표에 맞는 것을 브라우저로 확인했다.

추가로 `/{username}/posts` URL은 별도 페이지가 없어 404 화면으로 떨어졌고, 이 경우 블로그 max-width 기준 컨테이너가 존재하지 않아 정렬 기준이 달라졌다. `/{username}/posts` 라우트를 추가해 `/{username}` 블로그 홈으로 리다이렉트하도록 변경했고, `/jinhokingoftheworld/posts` 접근 시 `/jinhokingoftheworld`로 이동해 같은 `1160px` 우측선에 맞는 것을 확인했다.

## 34. 페이지별 JSX 중복으로 인한 구조 해석 불가

### 문제 정의

블로그 홈, 게시글 상세, 글쓰기, 설정 페이지가 각자 `<main>`, max-width, 헤더, 프로필 카드, 폴더 드롭다운 같은 구조를 직접 정의하고 있었다. 이 때문에 한 화면을 수정해도 다른 화면의 기준이 달라지고, React 컴포넌트를 재사용하는 장점이 살아나지 않았다.

### 발생 원인

페이지 파일이 데이터 로딩과 화면 구조 정의를 동시에 맡고 있었다. 공통 프레임과 반복 UI를 컴포넌트로 분리하지 않았기 때문에, 페이지마다 `max-w-*`, padding, header, profile card markup이 조금씩 달라졌다.

### 해결 방법

`app/_components/page-frame.tsx`에 공통 `PageFrame`, `pageFramePaddingClass`, `pageFrameMaxWidthClass`를 만들고, `app/_components/blog-components.tsx`에 `BlogHeroHeader`, `ProfileSummaryCard`, `FolderDropdown`, `Pagination`을 분리했다. 블로그 홈, 게시글 상세, 글쓰기/수정, 설정 허브와 하위 설정 페이지가 이 공통 프레임을 사용하도록 변경했다. 전역 계정 상태 바도 같은 프레임 상수를 import해 기준이 한 곳에서 관리되도록 했다.
