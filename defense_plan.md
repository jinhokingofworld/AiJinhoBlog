# OWASP Top 10 Defense Plan

작성일: 2026-06-25

기준: [OWASP Top 10:2025](https://owasp.org/Top10/2025/)

## 목적

이 문서는 AiJinhoBlog의 현재 보안 방어 상태를 OWASP Top 10:2025 기준으로 점검하고,
부족한 방어를 구현 가능한 체크리스트로 나눈다. 이후 작업은 체크리스트 순서대로 별도
커밋과 PR을 만들고, 로컬 검증과 GitHub CI 확인 후 `main`에 머지한다.

## 현재 구조 요약

- 인증은 `aijinhoblog/backend/auth/session.ts`의 access/refresh JWT 쿠키 기반이다.
- access/refresh 토큰은 `httpOnly`, `sameSite: "lax"`, production `secure` 쿠키로 내려간다.
- refresh token은 원문이 아니라 SHA-256 hash를 `Session` 테이블에 저장하고, refresh 시 rotation한다.
- 비밀번호는 `aijinhoblog/backend/auth/crypto.ts`에서 salt + PBKDF2 hash로 저장한다.
- 입력 검증은 `aijinhoblog/backend/core/validation.ts`의 parser 계층에서 수행한다.
- 소유자 API는 `getCurrentUserOrRefresh()`와 `ownerId`/`authorId` 조건을 같이 사용한다.
- AI/RAG 계열 고비용 endpoint는 `aijinhoblog/backend/ai/rate-limit.ts`로 사용자별 rate limit을 적용한다.
- 게시글/댓글 본문 렌더링은 React text node와 `whitespace-pre-wrap`을 사용하고, `dangerouslySetInnerHTML`은 쓰지 않는다.
- 이미지 업로드는 MIME allowlist와 5MB 크기 제한을 적용한다.
- Dropbox OAuth state는 signed state로 owner와 returnTo를 묶고, returnTo는 same-origin path로 제한한다.

## OWASP Top 10:2025 대응 표

| OWASP 항목                                 | 현재 적용 상태                                                                                 | 남은 위험                                                                                                         | 방어 솔루션                                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| A01 Broken Access Control                  | 부분 적용. 소유자 API와 공개/비공개 게시글 조건이 서비스/route에 구현되어 있다.                | route별 owner check가 분산되어 회귀 위험이 있다. CSRF가 있으면 사용자의 권한으로 상태 변경 요청이 발생할 수 있다. | owner-scoped helper와 테스트를 유지하고, unsafe method에 same-origin CSRF guard를 추가한다.    |
| A02 Security Misconfiguration              | 부분 적용. Docker/CI/환경 예시가 있고 쿠키 secure 옵션이 production에서 켜진다.                | 보안 헤더가 전역으로 강제되지 않는다. production에서 개발용 JWT secret fallback을 사용할 수 있다.                 | `next.config.ts`에 security headers를 추가하고, production secret guard를 추가한다.            |
| A03 Software Supply Chain Failures         | 부분 적용. lockfile과 CI install/build가 있다.                                                 | CI가 `npm audit`을 강제하지 않는다. Dependabot/라이선스 정책은 없다.                                              | root/app `npm audit` gate를 CI에 추가하고, dependency update 정책을 문서화한다.                |
| A04 Cryptographic Failures                 | 부분 적용. PBKDF2, HMAC JWT, refresh token hash, external token encryption이 있다.             | 개발용 JWT secret fallback이 production에서 허용될 수 있다. 쿠키 scope와 secret length 검증이 없다.               | production secret guard와 secret length 검증을 추가한다. 민감 로그 금지를 문서화한다.          |
| A05 Injection                              | 부분 적용. Prisma query builder와 parser 기반 검증을 사용하고, React가 text escape를 수행한다. | AI/MCP link draft가 외부 URL을 서버에서 fetch하므로 SSRF 성격의 입력 위험이 있다.                                 | URL protocol, hostname, private IP 대역, redirect를 제한하는 server-side URL guard를 추가한다. |
| A06 Insecure Design                        | 부분 적용. 사용자별 외부 지식 연결, vector ownerId 격리, AI rate limit이 설계되어 있다.        | 위협 모델과 보안 경계가 문서화되어 있지 않다. 체크리스트가 코드와 분리되어 있다.                                  | 이 문서를 유지하고, 보안 변경은 checklist/검증/PR 단위로 관리한다.                             |
| A07 Authentication Failures                | 부분 적용. 비밀번호 hash, refresh rotation, logout session delete, httpOnly cookie가 있다.     | login/signup에 별도 rate limit이 없다. 계정 잠금/감지 정책도 없다.                                                | IP + identifier 기반 auth rate limit을 추가하고, 실패 이벤트를 구조화해 기록한다.              |
| A08 Software or Data Integrity Failures    | 부분 적용. OAuth state 서명과 vector sync consistency가 있다.                                  | CI artifact/배포 이미지 무결성 검증은 없다. webhook 등 외부 callback 서명 검증 확장 정책도 없다.                  | CI audit gate, 배포 이미지 provenance TODO, OAuth callback 검증 테스트를 유지한다.             |
| A09 Security Logging and Alerting Failures | 부분 적용. AI request log는 존재한다.                                                          | 인증 실패, CSRF 차단, rate limit, SSRF 차단 같은 보안 이벤트가 별도 로깅되지 않는다.                              | `security-log` helper를 추가하고 주요 차단 이벤트를 남긴다.                                    |
| A10 Mishandling of Exceptional Conditions  | 부분 적용. 일부 route는 사용자 메시지를 감싸지만, helper가 단순하다.                           | 예외 메시지가 그대로 사용자에게 노출될 수 있는 경로가 있고, 일관된 4xx/5xx mapping이 약하다.                      | `safeRoute`/`toErrorResponse` 패턴을 만들고 보안 관련 예외는 안전한 메시지로 변환한다.         |

## 구현 체크리스트

각 항목은 별도 브랜치, 커밋, PR, CI 확인, 머지 순서로 처리한다.

### D0. 보안 계획 문서화

- [x] `defense_plan.md` 작성
- [x] OWASP Top 10:2025 기준 항목 반영
- [x] 현재 적용 상태와 남은 위험 정리
- [x] 구현 체크리스트 정의
- [x] 로컬 검증: `npm run format:check`
- [x] PR 생성, CI 통과 확인, 머지

### D1. 보안 헤더와 production secret guard

- [x] `next.config.ts`에 전역 security headers 추가
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Frame-Options: DENY`
  - `Permissions-Policy`
  - 기본 `Content-Security-Policy`
- [x] `AUTH_JWT_SECRET`/`NEXTAUTH_SECRET`가 production에서 개발 fallback이면 boot 실패
- [x] secret 길이 최소 기준 테스트 추가
- [x] 검증: `npm run lint`, `npm run test`, `npm run build`
- [x] PR 생성, CI 통과 확인, 머지

### D2. CSRF same-origin guard

- [x] unsafe method(`POST`, `PATCH`, `DELETE`, `PUT`) 공통 guard 추가
- [x] `Origin` 또는 `Referer`가 현재 host와 다르면 403 반환
- [x] OAuth callback 같은 외부 redirect GET은 guard 대상에서 제외
- [x] 주요 state-changing API에 guard 적용
- [x] unit test 추가
- [x] 검증: `npm run lint`, `npm run test`, `npm run build`
- [x] PR 생성, CI 통과 확인, 머지

### D3. 인증 endpoint rate limit

- [x] 로그인/회원가입 전용 rate limit helper 추가
- [x] IP + email/username 기준 bucket 설계
- [x] 실패/초과 시 429와 안전한 메시지 반환
- [x] auth route에 적용
- [x] unit test 추가
- [x] 검증: `npm run prisma:generate`, `npm run lint`, `npm run test`, `npm run build`
- [x] PR 생성, CI 통과 확인, 머지

### D4. 서버 측 URL fetch SSRF 방어

- [x] 링크/이미지 초안 생성 URL guard 추가
- [x] `http`/`https`만 허용
- [x] localhost, loopback, private IP, link-local, metadata IP 차단
- [x] redirect 후 최종 URL도 재검증
- [x] unit test 추가
- [x] 검증: `npm run lint`, `npm run test`, `npm run build`
- [x] PR 생성, CI 통과 확인, 머지

### D5. 업로드 파일 시그니처 검증

- [x] MIME type 외에 magic bytes 검증 추가
- [x] 확장자와 실제 파일 signature 불일치 차단
- [x] 삭제 경로 traversal 방어 테스트 추가
- [x] 검증: `npm run lint`, `npm run test`, `npm run build`
- [ ] PR 생성, CI 통과 확인, 머지

### D6. 보안 이벤트 로깅

- [ ] security event logger 추가
- [ ] auth 실패, rate limit, CSRF 차단, SSRF 차단 이벤트 기록
- [ ] 민감정보 마스킹 정책 적용
- [ ] unit test 추가
- [ ] 검증: `npm run lint`, `npm run test`, `npm run build`
- [ ] PR 생성, CI 통과 확인, 머지

### D7. supply-chain CI gate

- [ ] root `npm audit`와 app `npm --prefix aijinhoblog audit`를 CI에 추가
- [ ] 실패 기준 문서화
- [ ] 검증: CI dry-run에 해당하는 로컬 audit 실행
- [ ] PR 생성, CI 통과 확인, 머지

## 운영 원칙

- 보안 기능은 실패 시 안전한 방향으로 동작해야 한다.
- 사용자에게는 민감한 내부 오류를 직접 노출하지 않는다.
- ownerId, authorId, userId 경계는 route와 service 양쪽에서 검증한다.
- 외부 URL, OAuth callback, 파일 업로드, AI tool 입력은 신뢰하지 않는다.
- 각 방어는 테스트와 문서 근거 없이 "적용됨"으로 표시하지 않는다.
