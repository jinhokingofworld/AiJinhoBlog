# Phase 5 최종 검증

작성일: 2026-06-13

## 구현 범위

Phase 5의 목표는 자체 MCP 서버를 제공하고, MCP client가 블로그 게시글 CRUD와 외부 입력 기반 초안 생성을 수행할 수 있게 하는 것이다.

이번 단계에서 구현한 범위는 다음과 같다.

- 공식 TypeScript MCP SDK 도입
- stdio 기반 MCP 서버 실행 스크립트 추가
- MCP owner 해석 기준 추가
- 게시글 목록 조회 tool
- 게시글 상세 조회 tool
- 게시글 생성 tool
- 게시글 수정 tool
- 게시글 삭제 tool
- 외부 링크 분석 후 비공개 임시저장 초안 생성 tool
- 이미지 URL 분석 후 비공개 임시저장 초안 생성 tool
- MCP tool이 HTTP API와 같은 게시글 서비스 경계를 사용하도록 게시글 CRUD 로직 분리

## 주요 명령

```bash
npm --prefix aijinhoblog run mcp:server
npm --prefix aijinhoblog run mcp:smoke
```

## MCP tool

- `blog_list_posts`
- `blog_get_post`
- `blog_create_post`
- `blog_update_post`
- `blog_delete_post`
- `blog_create_draft_from_link`
- `blog_create_draft_from_image`

## 완료 기준 대응

- MCP client가 블로그 게시글 CRUD를 제어할 수 있다.
  - `blog_list_posts`, `blog_get_post`, `blog_create_post`, `blog_update_post`, `blog_delete_post` tool을 등록했다.
  - 게시글 생성, 수정, 삭제는 기존 웹 API와 같은 backend service를 호출한다.
- 외부 링크나 이미지가 입력되면 AI가 내용을 정리하고 초안으로 저장할 수 있다.
  - `blog_create_draft_from_link`는 URL 본문을 추출하고 OpenAI로 초안을 생성해 `DRAFT`/`PRIVATE` 게시글로 저장한다.
  - `blog_create_draft_from_image`는 이미지 URL을 vision-capable chat input으로 전달하고 초안을 생성해 `DRAFT`/`PRIVATE` 게시글로 저장한다.

## 검증 결과

아래 명령은 통과했다.

```bash
npm --prefix aijinhoblog run format
npm --prefix aijinhoblog run lint
npm --prefix aijinhoblog test
npm --prefix aijinhoblog run prisma:validate
npm --prefix aijinhoblog run prisma:generate
npm --prefix aijinhoblog run mcp:smoke
npm --prefix aijinhoblog run build
```

MCP smoke 결과:

- MCP tools registered: 7

## 잠재 문제와 판단

`npm audit --omit=dev` 결과 moderate 취약점 5개가 보고되었다.

- `@hono/node-server`는 Prisma dev tooling 전이 의존성 경로에서 보고됨
- `postcss`는 Next.js 전이 의존성 경로에서 보고됨
- `npm audit fix`는 non-force로 해결하지 못함
- `npm audit fix --force`는 Prisma 또는 Next의 breaking 변경을 유도하므로 이번 Phase에서는 적용하지 않음

현재 Phase 5 MCP 구현 자체의 기능 검증, lint, test, build, MCP smoke는 통과했다. 취약점은 별도 dependency-upgrade 이슈로 추적하는 것이 적절하다.
