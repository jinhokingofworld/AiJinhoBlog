# AiJinhoBlog App

Next.js App Router 기반 블로그 앱입니다. 루트 README의 개발 절차를 기준으로 실행합니다.

## 실행

```bash
npm run prisma:generate
npm run dev
```

루트에서 실행할 때는 다음 명령을 사용합니다.

```bash
npm run dev
```

## 검증

```bash
npm run prisma:validate
npm run prisma:generate
npm run format:check
npm run lint
npm run test
npm run build
```

## Phase 1 범위

- JWT httpOnly cookie 인증
- 사용자별 블로그 홈
- 프로필과 커버 이미지 설정
- 게시글 목록, 상세, 작성, 수정
- 댓글 작성과 삭제 권한
- 폴더 생성, 이름 변경, 순서 변경, 삭제, 병합
- AI 호출, RAG, ChromaDB 인덱싱은 Phase 2 이후로 분리
