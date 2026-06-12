# Phase 1 통합 검증 기록

작성일: 2026-06-12

## 구현 범위

`plan1-review-draft.md`의 승인값 기준으로 Phase 1은 기본 블로그 기능만 구현했다.

- `/`, `/login`, `/signup`, `/{username}` 라우팅 분리
- JWT access token과 refresh token을 httpOnly cookie로 관리
- 사용자별 블로그 홈, 프로필, 커버 이미지
- 게시글 목록, 상세, 작성, 수정
- 공개 여부, 임시저장 상태, 폴더 선택
- 댓글 작성과 삭제 권한
- 폴더 1:N 게시글 관계, 폴더 생성/이름 변경/순서 변경/삭제/병합
- 첫 로그인 직후 기본 폴더와 기본 글 생성

## 승인값 대비 점검

| 항목             | 승인값                                                      | 구현 상태 |
| ---------------- | ----------------------------------------------------------- | --------- |
| 기본 진입        | `/` 공개 시작 페이지                                        | 구현 완료 |
| 인증 라우트      | `/login`, `/signup`                                         | 구현 완료 |
| 사용자 홈        | `/{username}`                                               | 구현 완료 |
| 글 작성          | `/{username}/posts/new`                                     | 구현 완료 |
| 글 상세          | `/{username}/posts/{postId}`                                | 구현 완료 |
| 글 수정          | `/{username}/posts/{postId}/edit`                           | 구현 완료 |
| 프로필 설정      | `/{username}/settings/profile`                              | 구현 완료 |
| 폴더 관리        | `/{username}/settings/folders`                              | 구현 완료 |
| 게시글 API       | `/api/users/{username}/posts`, `/api/me/posts` 계열         | 구현 완료 |
| 댓글 API         | `/api/posts/{postId}/comments`, `/api/comments/{commentId}` | 구현 완료 |
| 폴더 API         | `/api/me/folders` 계열                                      | 구현 완료 |
| AI 요약 fallback | 직접 AI 호출 없이 본문/요약 문자열 표시                     | 구현 완료 |

## 검증 명령

아래 명령은 통과했다.

```bash
npm run prisma:validate
npm run prisma:generate
npm run format:check
npm run lint
npm run test
npm run build
```

## 브라우저 확인

DB 없이 확인 가능한 보호 라우트 리다이렉트를 확인했다.

- 비로그인 상태에서 `/jinho/posts/new` 접근 시 `/login`으로 이동
- 비로그인 상태에서 `/jinho/settings/folders` 접근 시 `/login`으로 이동

## DB 수동 검증 상태

Docker Desktop 실행 후 `docker pull mysql:8.4`로 이미지를 받은 뒤 `docker compose up -d mysql`을 실행했다. MySQL healthcheck가 `healthy` 상태가 된 뒤 Prisma migration을 적용했다.

```bash
docker pull mysql:8.4
docker compose up -d mysql
npm run prisma:migrate
```

`npm run prisma:migrate`는 기본 sandbox에서 로컬 Prisma 캐시 접근 권한 문제로 실패했고, 권한 허용 컨텍스트에서 재실행해 성공했다. 상세 내용은 `Problem.md`의 `20. Prisma migrate 로컬 캐시 권한 문제`에 기록했다.

## DB 기반 수동 E2E 결과

검증 사용자: `phase1-mqat761q`

| 흐름                     | 결과 |
| ------------------------ | ---- |
| 회원가입                 | 201  |
| 로그인                   | 200  |
| 현재 사용자 조회         | 200  |
| 기본 폴더 조회           | 200  |
| 첫 로그인 기본 글 조회   | 200  |
| 폴더 생성                | 201  |
| 폴더 이름 변경           | 200  |
| 폴더 순서 변경           | 200  |
| 게시글 작성              | 201  |
| 게시글 수정              | 200  |
| 폴더별 게시글 목록       | 200  |
| 게시글 상세              | 200  |
| 댓글 작성                | 201  |
| 댓글 삭제                | 200  |
| 폴더 병합                | 200  |
| 삭제용 폴더 생성         | 201  |
| 폴더 삭제 시 글까지 삭제 | 200  |
| 블로그 홈 렌더링         | 200  |

DB 기반 수동 검증을 진행하려면 아래 순서가 필요하다.

```bash
open -a Docker
npm run services:up
npm run prisma:migrate
npm run dev
```

## AI 기능 점검

Phase 1 런타임 코드에서는 OpenAI, ChromaDB, RAG, embedding, LLM 호출을 구현하지 않았다.

확인 명령:

```bash
rg -n "OpenAI|Chroma|RAG|embedding|embed|LLM|AI 요약|chromadb|chroma" aijinhoblog/app aijinhoblog/lib aijinhoblog/prisma --glob '!aijinhoblog/lib/generated/**'
```

결과: 매칭 없음.
