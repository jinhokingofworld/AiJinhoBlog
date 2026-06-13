# Phase 4 최종 검증

작성일: 2026-06-13

## 구현 범위

Phase 4의 목표는 게시글과 Dropbox Markdown 문서를 함께 검색하고, 자연어 질문에 근거 source를 포함한 답변을 제공하는 것이다.

이번 단계에서 구현한 범위는 다음과 같다.

- ChromaDB query 지원
- 질문 embedding 생성
- 게시글 vector와 Dropbox Markdown vector 통합 검색
- 검색 결과의 게시글 제목, 게시글 링크, Dropbox 문서명, Dropbox 경로 보강
- OpenAI chat completion 기반 내 기억 Q&A 답변 생성
- RAG 요청 로그 저장
- `/{username}/memory` 화면 추가
- 글 작성 화면의 게시 전 유사 자료 확인

## 주요 API와 화면

- `GET /{username}/memory`
- `POST /api/me/rag/search`
- `POST /api/me/rag/answer`
- `POST /api/me/rag/duplicates`

## 완료 기준 대응

- 사용자가 자연어 질문으로 게시글과 Dropbox Markdown 기반 답변을 받을 수 있다.
  - `/{username}/memory`에서 질문을 입력하면 `/api/me/rag/answer`가 질문 embedding, ChromaDB 검색, 답변 생성을 수행한다.
- 답변에는 어떤 게시글 또는 Markdown 문서를 근거로 삼았는지 표시된다.
  - 게시글은 `/{username}/posts/{postId}` 링크로 표시한다.
  - Dropbox Markdown은 Dropbox path를 표시한다.
- 새 글 발행 전 유사한 게시글이나 Markdown 문서가 있으면 알림이 표시된다.
  - 글쓰기/수정 폼에서 `/api/me/rag/duplicates`를 호출해 유사 후보를 보여준다.
  - 후보가 있으면 게시를 한 번 멈추고, 사용자가 확인 후 무시하고 게시할 수 있다.

## 검증 명령

아래 명령은 통과해야 한다.

```bash
npm --prefix aijinhoblog run format:check
npm --prefix aijinhoblog run lint
npm --prefix aijinhoblog test
npm --prefix aijinhoblog run prisma:validate
npm --prefix aijinhoblog run prisma:generate
npm --prefix aijinhoblog run build
```

## 실제 데이터 검증 기준

Phase 4 품질 검증은 작은 Dropbox 경로부터 시작한다.

```bash
npm --prefix aijinhoblog run dropbox:sync -- --username {username} --path /Apps/remotely-save/Vault/정글 웹개발 집중캠프
```

이후 `/{username}/memory`에서 해당 문서 주제에 대한 질문을 입력해 다음을 확인한다.

- 관련 Dropbox Markdown source가 근거에 표시된다.
- 이미 색인된 게시글이 있으면 게시글 source도 함께 표시된다.
- 답변은 근거 범위 안에서 생성된다.
