# BX Hub — 브랜드 체험마케팅 프로젝트 협업도구

팝업스토어·샘플링·체험단·오프라인 행사 같은 **브랜드 체험마케팅 프로젝트**를 5명 내외의 팀이 함께 운영하기 위한 웹 협업도구입니다.
Vercel에 배포해 팀원 모두가 브라우저(PC·모바일)에서 사용할 수 있습니다.

| 기능 | 내용 |
| --- | --- |
| **프로젝트** | 캠페인별 브랜드·유형·운영 기간(D-day)·장소·담당 PM·목표를 관리하고, 문서·일정·회의록·활동을 한 화면에 모아 봅니다. |
| **문서 공유** | Word(.docx)·PDF·PPT·Excel·한글·이미지 업로드. **Word는 브라우저에서 바로 미리보기**, 수정본은 **새 버전으로 업로드**(이전 버전 보관), 문서별 의견(댓글). |
| **Figma 연동** | Figma 공유 링크를 등록하면 디자인·프로토타입·FigJam이 **문서 화면에 임베드**됩니다. |
| **일정 관리** | 월간 캘린더, 회의·마감·행사 운영·촬영·설치/철수·할 일 유형, 담당자 지정, 프로젝트/담당자 필터, 할 일 완료 체크, `.ics` 내보내기(구글·아웃룩 캘린더). |
| **AI 회의록** | 정리되지 않은 메모·메신저 대화·받아쓰기 텍스트를 붙여넣거나 **Word/텍스트 파일을 불러오면** Claude가 *요약 · 안건 · 논의 내용 · 결정 사항 · 액션 아이템(담당자/기한) · 미결 사항 · 다음 회의*로 정리합니다. 편집 가능, **Word(.docx) 다운로드/문서함 저장**, 액션 아이템을 **클릭 한 번으로 일정(할 일)에 등록**. |
| **팀** | 팀원 관리, 첫 로그인 시 팀 초대 코드로 개인 비밀번호 설정, 비밀번호 초기화, 서비스 연결 상태 확인, 대시보드 팀 활동 피드. |

## Figma · Word와 함께 쓰는 흐름

- **Word**: 문서는 Word에서 작성·수정하고 BX Hub에는 결과 파일을 올립니다. 수정할 때마다 「새 버전 업로드」를 쓰면 팀원이 항상 최신본을 보고, 이전 버전도 내려받을 수 있습니다. 회의록은 맑은 고딕 서식의 .docx로 내보내져 Word에서 바로 편집·보고할 수 있습니다.
- **Figma**: 디자인은 Figma에서 작업하고, 공유 링크(Share → Copy link)를 문서함에 등록합니다. 팀원은 BX Hub에서 바로 시안을 보고 의견을 남길 수 있습니다. 임베드를 보려면 각 팀원이 해당 Figma 파일 열람 권한을 가지고 있어야 합니다.
- Word·Figma 파일을 BX Hub 안에서 **실시간 공동 편집**하는 기능은 없습니다. (편집은 각 도구에서, 공유·검토·이력 관리는 BX Hub에서)

## 기술 스택

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Drizzle ORM + Postgres(Neon) · Vercel Blob · Anthropic Claude API(`claude-opus-5-5`) · mammoth(Word 미리보기/텍스트 추출) · docx(Word 생성)

---

## Vercel 배포 (약 10분)

> **요금 참고**: Vercel **Hobby(무료) 플랜은 개인·비상업용**입니다. 회사 업무용으로 쓰려면 **Pro 플랜**을 사용하세요.
> Neon(Postgres)과 Vercel Blob은 소규모 팀이면 무료 한도로 충분한 경우가 많습니다. Claude API 사용료는 회의록 1건당 보통 수백 원 이하입니다(원문 길이에 따라 다름).

1. **저장소 가져오기** — [vercel.com/new](https://vercel.com/new)에서 이 GitHub 저장소를 Import 합니다. (Framework: Next.js 자동 인식, 설정 변경 불필요)
2. **Postgres 연결** — 프로젝트의 **Storage** 탭 → **Create Database** → **Neon (Postgres)** 생성 후 이 프로젝트에 연결합니다. `DATABASE_URL`이 자동으로 추가됩니다.
3. **파일 저장소 연결** — **Storage** 탭 → **Blob** 스토어 생성(접근 방식 **Private** 권장) 후 연결합니다. `BLOB_READ_WRITE_TOKEN`이 자동으로 추가됩니다.
   *(Public 스토어로 만들었다면 환경변수 `BLOB_ACCESS=public`을 추가하세요.)*
4. **환경변수 추가** — **Settings → Environment Variables**

   | 이름 | 값 |
   | --- | --- |
   | `AUTH_SECRET` | 16자 이상 임의 문자열 (예: 터미널에서 `openssl rand -base64 32`) |
   | `TEAM_PASSWORD` | 팀 초대 코드 (팀원에게만 공유) |
   | `TEAM_MEMBERS` | 팀원 이름, 쉼표 구분 (예: `김민지,이준호,박서연,최유진,정다은`) |
   | `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com)에서 발급한 API 키 |

5. **재배포** — **Deployments** 탭에서 최신 배포의 **Redeploy**를 누릅니다. 빌드 중에 DB 테이블이 자동 생성(마이그레이션)됩니다.
6. **팀원 첫 로그인** — 배포 주소를 팀원에게 공유합니다. 각자 자기 이름을 선택 → 팀 초대 코드 입력 → 개인 비밀번호를 만들면 됩니다.

> 💡 응답 속도를 위해 Neon DB 리전과 Vercel **Settings → Functions → Region**을 같은 아시아 리전(예: 싱가포르)으로 맞추면 좋습니다.

## 로컬 실행

```bash
npm install
cp .env.example .env.local   # 필요한 값만 채우기 (비워 둬도 실행됨)
npm run dev                  # http://localhost:3000
```

- `DATABASE_URL`이 없으면 설치 없이 동작하는 내장 Postgres(PGlite, `.data/pglite`)를 사용합니다.
- `BLOB_READ_WRITE_TOKEN`이 없으면 업로드 파일을 `.data/uploads`에 저장합니다.
- 로컬에서 `TEAM_PASSWORD`를 비워 두면 초대 코드는 `team1234`입니다.
- `ANTHROPIC_API_KEY`가 없으면 회의 원문 저장과 직접 작성만 가능합니다.

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 마이그레이션 후 개발 서버 실행 |
| `npm run build` | 마이그레이션 후 프로덕션 빌드 (Vercel이 실행) |
| `npm run lint` / `npm run typecheck` | 코드 검사 |
| `npm run db:generate` | `src/db/schema.ts` 변경 후 마이그레이션 SQL 생성 |

## 보안

- 모든 페이지·API·서버 액션은 로그인한 팀원만 사용할 수 있습니다. 세션은 HMAC 서명 쿠키(HttpOnly), 비밀번호는 scrypt 해시로 저장합니다.
- 업로드 파일은 비공개 Blob에 저장되고, 로그인한 팀원만 서버를 거쳐 열람·다운로드할 수 있습니다.
- Word 미리보기는 스크립트가 실행되지 않는 sandbox iframe에서 표시합니다.
- 비밀번호 변경/초기화 시 기존 세션은 자동으로 만료됩니다.

## 폴더 구조

```
src/
  app/
    (app)/            로그인 후 화면: 대시보드, projects, documents, schedule, meetings, team
    api/              파일 다운로드, 업로드, 회의록 AI 정리·Word 내보내기, 텍스트 추출, .ics
    login/            로그인(첫 로그인 시 비밀번호 설정)
  components/         공통 UI·목록 컴포넌트
  db/                 Drizzle 스키마·DB 연결 (Postgres / PGlite)
  lib/                인증, 저장소, AI(Claude), Word 생성, 날짜(KST) 유틸
drizzle/              마이그레이션 SQL
scripts/migrate.mjs   빌드/개발 전 마이그레이션 실행
```
