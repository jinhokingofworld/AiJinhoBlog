# Project Plan

## 1. 목표와 진행 원칙

이 프로젝트의 목표는 기본 블로그 기능 위에 RAG, MCP, AI Agent 기능을 단계적으로 결합하여, 사용자의 과거 글과 Dropbox Markdown 문서를 개인 지식 기반으로 활용하는 AI 블로그 플랫폼을 완성하는 것이다.

진행 원칙은 다음과 같다.

- 먼저 블로그의 핵심 CRUD와 데이터 모델을 안정화한다.
- 게시글 데이터가 쌓이고 관리될 수 있는 구조를 만든 뒤 AI 기능을 연결한다.
- 자연어 RAG 답변을 만들기 전에 Dropbox Markdown 문서를 먼저 확보하고 내부 지식 소스로 색인한다.
- RAG, MCP, Agent는 한 번에 통합하지 않고, 작은 검증 기능부터 붙인다.
- GitHub Projects에서는 `Main Issue > Medium Issue > Detailed Issue` 구조를 유지한다.
- 브랜치는 Medium Issue 기준으로 생성하고, Detailed Issue 단위로 `dev` 브랜치에 PR을 보낸다.

## 2. MVP 범위

초기 완성 기준은 다음 기능이 실제로 동작하는 상태다.

- 회원가입, 로그인, 로그아웃
- 게시글 작성, 조회, 수정, 삭제
- 댓글 작성, 삭제
- 태그 추가, 게시글 페이징, 키워드 검색
- 게시글 저장 시 벡터 DB 인덱싱
- 과거 글 기반 Q&A
- 제목 또는 본문 기준 유사 게시글 탐색
- 중복 작성 가능성 알림
- Dropbox MCP를 통한 외부 Markdown 문서 확보 및 색인
- 게시글과 Dropbox Markdown 문서를 함께 사용하는 RAG 검색
- 자체 MCP 서버를 통한 게시글 CRUD 제어
- 외부 링크 또는 이미지 분석 후 게시글 초안 저장
- 최근 글 기반 글감 추천
- 사용자 문체 기반 글 재작성
- 리팩토링 전후 비교 화면

## 3. 단계별 실행 계획

### Phase 0. 프로젝트 기준 정리

#### Main Issue: 프로젝트 범위 및 개발 기준 확정

1. Medium Issue: MVP 요구사항 정리
   - Detailed Issue: 핵심 사용자 흐름 정리
   - Detailed Issue: MVP와 Future Scope 경계 확정
   - Detailed Issue: 기능별 완료 조건 작성
   - 산출물: `docs/phase-0/mvp-requirements.md`

2. Medium Issue: 기술 선택 확정
   - Detailed Issue: Next.js 프로젝트 구조 결정
   - Detailed Issue: MySQL 접근 방식 결정
   - Detailed Issue: RAG Framework 후보 비교
   - Detailed Issue: MCP Framework 후보 비교
   - Detailed Issue: Agent Framework 후보 비교
   - 산출물: `docs/phase-0/technical-decisions.md`

3. Medium Issue: 개발 환경 구성
   - Detailed Issue: Next.js, React, TypeScript 프로젝트 생성
   - Detailed Issue: ESLint, Prettier, 경로 alias 설정
   - Detailed Issue: `.env.example` 작성
   - Detailed Issue: MySQL, ChromaDB 로컬 실행 방식 구성
   - Detailed Issue: 기본 CI 파이프라인 구성
   - 산출물: `docs/phase-0/development-environment.md`

완료 기준:

- 로컬에서 앱, MySQL, ChromaDB를 실행할 수 있다.
- 개발자가 `.env.example`만 보고 환경 변수를 구성할 수 있다.
- 기술 선택 사유가 README 또는 별도 문서에 남아 있다.

### Phase 1. 기본 블로그 기반 구현

#### Main Issue: 인증 및 사용자 관리

1. Medium Issue: 사용자 데이터 모델 구현
   - Detailed Issue: User 테이블 설계
   - Detailed Issue: 비밀번호 해시 저장 구조 구현
   - Detailed Issue: 이메일 또는 아이디 중복 검증 구현

2. Medium Issue: 인증 플로우 구현
   - Detailed Issue: 회원가입 API 구현
   - Detailed Issue: 로그인 API 구현
   - Detailed Issue: 로그아웃 처리 구현
   - Detailed Issue: 인증 상태 유지 방식 구현

3. Medium Issue: 인증 UI 구현
   - Detailed Issue: 회원가입 화면 구현
   - Detailed Issue: 로그인 화면 구현
   - Detailed Issue: 인증 실패 메시지 처리

완료 기준:

- 사용자가 회원가입 후 로그인할 수 있다.
- 로그인하지 않은 사용자는 보호된 기능에 접근할 수 없다.
- 인증 실패와 입력 오류가 화면에 명확히 표시된다.

#### Main Issue: 게시글 관리

1. Medium Issue: 게시글 데이터 모델 구현
   - Detailed Issue: Post 테이블 설계
   - Detailed Issue: User와 Post 관계 설정
   - Detailed Issue: 제목, 본문, 공개 상태, 작성일, 수정일 필드 정의

2. Medium Issue: 게시글 CRUD API 구현
   - Detailed Issue: 게시글 생성 API 구현
   - Detailed Issue: 게시글 목록 조회 API 구현
   - Detailed Issue: 게시글 상세 조회 API 구현
   - Detailed Issue: 게시글 수정 API 구현
   - Detailed Issue: 게시글 삭제 API 구현

3. Medium Issue: 게시글 UI 구현
   - Detailed Issue: 게시글 목록 화면 구현
   - Detailed Issue: 게시글 상세 화면 구현
   - Detailed Issue: 게시글 작성 화면 구현
   - Detailed Issue: 게시글 수정 화면 구현

완료 기준:

- 로그인 사용자가 자신의 게시글을 작성, 조회, 수정, 삭제할 수 있다.
- 다른 사용자의 게시글을 임의로 수정하거나 삭제할 수 없다.

#### Main Issue: 댓글, 태그, 탐색 기능

1. Medium Issue: 댓글 기능 구현
   - Detailed Issue: Comment 테이블 설계
   - Detailed Issue: 댓글 작성 API 구현
   - Detailed Issue: 댓글 삭제 API 구현
   - Detailed Issue: 게시글 상세 화면에 댓글 목록 표시

2. Medium Issue: 태그 기능 구현
   - Detailed Issue: Tag 테이블 및 Post-Tag 관계 설계
   - Detailed Issue: 게시글 작성 시 태그 저장
   - Detailed Issue: 태그별 게시글 조회

3. Medium Issue: 목록 탐색 기능 구현
   - Detailed Issue: 게시글 페이징 구현
   - Detailed Issue: 제목 및 본문 키워드 검색 구현
   - Detailed Issue: 태그 필터와 키워드 검색 조합 처리

완료 기준:

- 게시글 목록에서 페이징, 검색, 태그 필터를 사용할 수 있다.
- 댓글은 작성자 또는 게시글 작성자 권한 기준으로 삭제할 수 있다.

### Phase 2. AI 데이터 파이프라인 구축

#### Main Issue: 게시글 지식 기반화

1. Medium Issue: 게시글 텍스트 전처리
   - Detailed Issue: 게시글 본문 정규화 규칙 작성
   - Detailed Issue: Markdown 또는 HTML 텍스트 추출 방식 구현
   - Detailed Issue: chunk 분할 기준 구현

2. Medium Issue: 임베딩 및 벡터 저장
   - Detailed Issue: OpenAI Embedding 호출 모듈 구현
   - Detailed Issue: ChromaDB 컬렉션 설계
   - Detailed Issue: 게시글 생성 시 벡터 저장
   - Detailed Issue: 게시글 수정 시 벡터 재생성
   - Detailed Issue: 게시글 삭제 시 벡터 삭제

3. Medium Issue: AI 작업 로그 및 비용 관리
   - Detailed Issue: AI 요청 로그 테이블 설계
   - Detailed Issue: 에러 및 재시도 정책 구현
   - Detailed Issue: 토큰 사용량 기록

완료 기준:

- 게시글 CRUD와 벡터 DB 상태가 일관되게 유지된다.
- 게시글을 수정하거나 삭제해도 오래된 벡터가 남지 않는다.
- AI 호출 실패 시 사용자가 이해할 수 있는 오류가 반환된다.

### Phase 3. Dropbox Markdown 지식 소스 확보

#### Main Issue: 외부 Markdown 문서 동기화

1. Medium Issue: Dropbox MCP read-only 연결
   - Detailed Issue: Dropbox MCP 인증 방식 정리
   - Detailed Issue: Dropbox 접근 토큰과 환경 변수 구성
   - Detailed Issue: Markdown 파일 목록 조회 기능 구현
   - Detailed Issue: 특정 Markdown 파일 내용 읽기 기능 구현

2. Medium Issue: Dropbox Markdown 문서 정규화
   - Detailed Issue: Dropbox 파일 경로, 파일명, 수정일, content hash 저장 구조 설계
   - Detailed Issue: Markdown 본문을 plain text로 전처리
   - Detailed Issue: 게시글 chunk와 같은 기준으로 Markdown chunk 분할
   - Detailed Issue: source type을 `POST`와 `DROPBOX_MD`로 구분

3. Medium Issue: Dropbox Markdown 벡터 색인
   - Detailed Issue: Markdown chunk embedding 생성
   - Detailed Issue: ChromaDB metadata에 source path와 source title 저장
   - Detailed Issue: 파일 변경 시 이전 vector 삭제 후 재색인
   - Detailed Issue: 삭제되거나 접근 불가능한 파일의 vector 정리

완료 기준:

- Dropbox MCP를 통해 Markdown 파일 목록과 본문을 읽을 수 있다.
- Dropbox Markdown 문서가 게시글과 같은 chunk 구조로 정규화된다.
- Dropbox Markdown chunk가 ChromaDB에 저장되고, 파일 변경 시 오래된 vector가 남지 않는다.

### Phase 4. RAG 기능 구현

#### Main Issue: 게시글과 Markdown 기반 검색 및 답변

1. Medium Issue: 통합 유사 문서 검색
   - Detailed Issue: 질문 또는 기준 텍스트 embedding 생성
   - Detailed Issue: 게시글 chunk와 Dropbox Markdown chunk를 함께 검색
   - Detailed Issue: 유사도 점수와 근거 source 반환
   - Detailed Issue: 게시글 링크와 Dropbox 문서 경로를 구분해 표시

2. Medium Issue: 내 기억 Q&A
   - Detailed Issue: 질문 임베딩 생성
   - Detailed Issue: 관련 chunk 검색
   - Detailed Issue: 검색 결과를 포함한 답변 생성
   - Detailed Issue: 답변에 참고 게시글 링크와 Dropbox 문서 경로 표시

3. Medium Issue: 중복 작성 방지 알림
   - Detailed Issue: 게시글 발행 직전 유사도 검사
   - Detailed Issue: 중복 가능성이 높은 게시글과 Markdown 문서 목록 표시
   - Detailed Issue: 사용자가 무시하고 발행할 수 있는 흐름 구현

완료 기준:

- 사용자가 자연어 질문으로 게시글과 Dropbox Markdown 기반 답변을 받을 수 있다.
- 답변에는 어떤 게시글 또는 Markdown 문서를 근거로 삼았는지 표시된다.
- 새 글 발행 전 유사한 게시글이나 Markdown 문서가 있으면 알림이 표시된다.

### Phase 5. MCP 연동

#### Main Issue: 자체 MCP 서버 제공

1. Medium Issue: 블로그 MCP 서버 기본 구조 구현
   - Detailed Issue: MCP 서버 실행 환경 구성
   - Detailed Issue: 게시글 목록 조회 tool 구현
   - Detailed Issue: 게시글 상세 조회 tool 구현
   - Detailed Issue: 게시글 생성, 수정, 삭제 tool 구현

2. Medium Issue: 링크 및 이미지 분석 저장
   - Detailed Issue: 외부 링크 입력 tool 구현
   - Detailed Issue: 링크 본문 추출 및 요약 구현
   - Detailed Issue: 이미지 입력 및 분석 흐름 구현
   - Detailed Issue: 분석 결과를 게시글 초안으로 저장

완료 기준:

- MCP client가 블로그 게시글 CRUD를 제어할 수 있다.
- 외부 링크나 이미지가 입력되면 AI가 내용을 정리하고 초안으로 저장할 수 있다.

### Phase 6. AI Agent 기능 구현

#### Main Issue: 글감 추천 및 인사이트

1. Medium Issue: 최근 작성 활동 분석
   - Detailed Issue: 최근 게시글 빈도 계산
   - Detailed Issue: 최근 게시글 주제 추출
   - Detailed Issue: 관심 주제 변화 요약

2. Medium Issue: 글감 추천 Agent 구현
   - Detailed Issue: 추천 후보 생성 프롬프트 작성
   - Detailed Issue: 과거 글과 중복되지 않는 추천 필터 구현
   - Detailed Issue: 추천 사유와 참고 게시글 표시

완료 기준:

- 사용자는 최근 글을 기반으로 한 글감 추천 목록을 볼 수 있다.
- 추천에는 이유와 관련 과거 글이 함께 표시된다.

#### Main Issue: 개인 문체 및 페르소나 변환

1. Medium Issue: 사용자 문체 프로파일 생성
   - Detailed Issue: 과거 게시글의 어조, 문장 길이, 자주 쓰는 표현 분석
   - Detailed Issue: 사용자 문체 프로파일 저장 구조 구현
   - Detailed Issue: 프로파일 갱신 조건 구현

2. Medium Issue: 문체 변환 기능 구현
   - Detailed Issue: 외부 텍스트 입력 UI 구현
   - Detailed Issue: 사용자 문체 기반 재작성 API 구현
   - Detailed Issue: 원문과 변환문 비교 UI 구현

완료 기준:

- 사용자는 새 글이나 외부 정보를 자신의 문체에 가깝게 재작성할 수 있다.
- 결과물은 원문과 함께 비교할 수 있다.

#### Main Issue: 출판 퀄리티 리팩토링

1. Medium Issue: 고품질 리팩토링 API 구현
   - Detailed Issue: 문장 개선 프롬프트 작성
   - Detailed Issue: 구조 개선, 문장 개선, 표현 개선 옵션 설계
   - Detailed Issue: 리팩토링 결과 저장 방식 구현

2. Medium Issue: Before/After 비교 화면 구현
   - Detailed Issue: 좌우 비교 UI 구현
   - Detailed Issue: 변경된 문장 강조 표시
   - Detailed Issue: 사용자가 결과를 게시글에 반영하는 기능 구현

완료 기준:

- 사용자는 기존 글을 출판 가능한 수준의 문장으로 리팩토링할 수 있다.
- 변경 전후 차이를 시각적으로 확인하고 선택적으로 반영할 수 있다.

### Phase 7. 품질 안정화 및 배포 준비

#### Main Issue: 테스트 및 안정화

1. Medium Issue: 핵심 기능 테스트
   - Detailed Issue: 인증 API 테스트
   - Detailed Issue: 게시글 CRUD 테스트
   - Detailed Issue: 댓글, 태그, 검색 테스트
   - Detailed Issue: RAG 검색 결과 테스트
   - Detailed Issue: MCP tool 동작 테스트

2. Medium Issue: 보안 및 권한 점검
   - Detailed Issue: 사용자별 데이터 접근 제한 검증
   - Detailed Issue: AI 기능에서 타 사용자 글이 섞이지 않는지 검증
   - Detailed Issue: 외부 링크 입력 보안 검토
   - Detailed Issue: 환경 변수 노출 여부 점검

3. Medium Issue: 성능 및 비용 점검
   - Detailed Issue: 게시글 목록 응답 시간 확인
   - Detailed Issue: 벡터 검색 응답 시간 확인
   - Detailed Issue: OpenAI API 호출 비용 추적
   - Detailed Issue: 캐싱 또는 rate limit 필요성 검토

완료 기준:

- 핵심 사용자 흐름이 테스트로 검증된다.
- 사용자 데이터 격리가 보장된다.
- AI 기능의 실패, 지연, 비용에 대한 대응 방식이 준비되어 있다.

#### Main Issue: 배포 준비

1. Medium Issue: 운영 환경 구성
   - Detailed Issue: 운영 DB 설정
   - Detailed Issue: 운영 ChromaDB 설정
   - Detailed Issue: OpenAI API key 관리 방식 정리
   - Detailed Issue: 로그와 모니터링 방식 정리

2. Medium Issue: 릴리즈 문서 작성
   - Detailed Issue: README 업데이트
   - Detailed Issue: 환경 변수 문서화
   - Detailed Issue: 초기 배포 절차 문서화
   - Detailed Issue: 알려진 제한 사항 정리

완료 기준:

- 새 개발자가 README를 보고 로컬 실행과 배포 흐름을 이해할 수 있다.
- 운영 환경에서 MVP 기능을 실행할 수 있다.

## 4. 권장 개발 순서 요약

1. 프로젝트 기준 정리
2. Next.js 프로젝트 및 로컬 인프라 구성
3. MySQL 데이터 모델 설계
4. 인증 구현
5. 게시글 CRUD 구현
6. 댓글, 태그, 검색, 페이징 구현
7. 게시글 전처리 및 ChromaDB 인덱싱 구현
8. Dropbox MCP read-only 연동
9. Dropbox Markdown 문서 정규화 및 저장 구조 구현
10. Dropbox Markdown chunk embedding 및 ChromaDB 색인 구현
11. 게시글과 Markdown 기반 통합 유사 검색 구현
12. 내 기억 Q&A 구현
13. 중복 작성 방지 알림 구현
14. 자체 MCP 서버와 게시글 CRUD tool 구현
15. 링크 및 이미지 분석 저장 구현
16. 글감 추천 Agent 구현
17. 개인 문체 변환 구현
18. 출판 퀄리티 리팩토링 및 Before/After 비교 구현
19. 테스트, 보안, 성능 점검
20. 배포 문서화 및 운영 환경 구성

## 5. Future Scope 진행 순서

MVP 안정화 후 다음 순서로 확장한다.

1. 게시판 히스토리 기반 트렌드 리포트
   - 기간별 게시글 일괄 분석
   - 주요 이슈와 여론 흐름 요약
   - 보고서 화면 또는 파일 출력

2. 자동 DB 정규화 및 태깅 고도화
   - 게시글 카테고리 자동 추천
   - 태그 자동 정리 및 병합
   - MCP를 통한 DB 정리 작업 자동화

## 6. 첫 번째로 생성할 GitHub Issues

초기에는 다음 Main Issue와 Medium Issue부터 생성한다.

1. Main Issue: 프로젝트 기반 구성
   - Medium Issue: MVP 요구사항 정리
   - Medium Issue: 기술 선택 확정
   - Medium Issue: 개발 환경 구성

2. Main Issue: 인증 및 사용자 관리
   - Medium Issue: 사용자 데이터 모델 구현
   - Medium Issue: 인증 플로우 구현
   - Medium Issue: 인증 UI 구현

3. Main Issue: 게시글 관리
   - Medium Issue: 게시글 데이터 모델 구현
   - Medium Issue: 게시글 CRUD API 구현
   - Medium Issue: 게시글 UI 구현

이 세 묶음이 완료되면 댓글, 태그, 검색을 붙이고, 그 다음 AI 데이터 파이프라인으로 넘어간다.
