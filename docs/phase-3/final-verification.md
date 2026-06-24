# Phase 3 최종 검증

작성일: 2026-06-13

## 구현 범위

Phase 3의 목표는 RAG 답변 전에 Dropbox Markdown 문서를 내부 지식 소스로 확보하는 것이다.

이번 단계에서 구현한 범위는 다음과 같다.

- Dropbox Markdown read-only 목록 조회
- Dropbox Markdown 본문 읽기
- Dropbox Markdown 문서 DB 저장
- Markdown 본문 plain text 정규화
- 게시글과 동일한 chunk 분할 기준 적용
- `DROPBOX_MD` source type metadata를 포함한 ChromaDB vector 저장
- Dropbox에서 사라진 Markdown 문서의 vector 삭제 및 DB 문서 정리

## 주요 API와 스크립트

- `GET /api/me/dropbox/markdown`
- `GET /api/me/dropbox/markdown/content?path={path}`
- `POST /api/me/dropbox/markdown/sync`
- `npm --prefix aijinhoblog run dropbox:sync -- --username {username}`

## DB 변경

추가 migration:

```bash
aijinhoblog/prisma/migrations/20260613073000_phase3_dropbox_markdown/migration.sql
```

추가 모델:

- `DropboxMarkdownDocument`
- `DropboxMarkdownVectorIndex`

`AiRequestLog`에는 `dropboxMarkdownDocumentId`를 추가해 Dropbox Markdown embedding, upsert, delete 작업 로그를 연결할 수 있게 했다.

## 실제 환경 검증

아래 명령으로 migration을 적용했다.

```bash
npm --prefix aijinhoblog run prisma:migrate
```

결과:

- `20260613073000_phase3_dropbox_markdown` migration 적용 성공

Dropbox token이 설정된 상태에서 실제 Dropbox 목록 조회를 수행했다.

```bash
npm --prefix aijinhoblog run dropbox:sync -- --dry-run --path /Apps/remotely-save/Vault
```

결과:

- Dropbox 연결 성공
- 원격 Markdown 파일: 479개
- `/Apps/remotely-save/Vault` 하위 디렉터리를 recursive로 탐색해 `.md`, `.markdown` 파일만 필터링됨

실제 Vault 전체 동기화는 479개 문서에 대해 OpenAI embedding 비용과 ChromaDB write가 발생하므로 PR 검증에서는 dry-run으로 Dropbox read-only 범위를 확인했다. OpenAI embedding과 ChromaDB upsert/delete 경로는 임시 Markdown source를 주입해 검증했다.

결과:

- 임시 Markdown 문서 `INDEXED`
- chunk 1개 생성
- OpenAI embedding 성공
- ChromaDB upsert 성공
- 실제 Dropbox sync 재실행 후 임시 vector 삭제 성공
- 최종 `DropboxMarkdownDocument` count: 0
- 최종 `DropboxMarkdownVectorIndex` count: 0

## 검증 명령

아래 명령은 통과했다.

```bash
npm --prefix aijinhoblog run prisma:generate
npm --prefix aijinhoblog run format:check
npm --prefix aijinhoblog run lint
npm --prefix aijinhoblog test
npm --prefix aijinhoblog run prisma:validate
npm --prefix aijinhoblog run build
```

테스트 결과:

- Test Files: 8 passed
- Tests: 40 passed

## 남은 참고 사항

실제 Dropbox Vault에는 Markdown 파일이 확보되어 있다. Phase 4에서는 이 문서와 게시글 chunk를 함께 검색해 자연어 질문 답변 품질을 검증한다.
