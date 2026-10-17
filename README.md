# BX Hub — 브랜드 체험마케팅 5인 팀 협업도구

팝업스토어·샘플링·체험단·오프라인 행사 같은 **브랜드 체험마케팅 프로젝트**를 5명 팀이 함께 운영하기 위한 웹 협업도구입니다.
링크와 입장 코드만 공유하면 팀원 모두가 브라우저(PC·모바일)에서 바로 사용할 수 있습니다.

## 핵심 기능

| # | 기능 | 내용 |
| --- | --- | --- |
| 1 | **링크 + 입장 코드** | 공유받은 링크로 접속 → 입장 코드 **「2심전심」** 입력 → 본인 이름 입력. 처음 입력한 이름은 팀원으로 등록되고 다음부터 같은 이름으로 들어옵니다(30일 유지). 코드를 5번 틀리면 10분간 막힙니다. |
| 2 | **실시간 문서 (Word 호환)** | 여러 명이 같은 문서를 **동시에 편집**합니다. 다른 팀원의 커서와 이름이 보이고, 입력은 즉시 모두에게 반영되며 자동 저장됩니다. 제목·굵게·밑줄·형광펜·목록·체크리스트·표·이미지·정렬 지원. **Word(.docx) 불러오기 → 실시간 문서**, **실시간 문서 → Word(.docx) 내보내기**. 버전 저장/복원(30분마다 자동 저장), 문서 의견. 템플릿: 회의록, 캠페인 기획서, 결과 보고서. |
| 3 | **Figma 연동** | Figma 공유 링크를 등록하면 문서 화면에 디자인·프로토타입·FigJam이 바로 보입니다. 프로젝트 화면에서 시안을 모아 보고, 태스크에도 Figma 링크를 붙일 수 있습니다. (선택) `FIGMA_TOKEN`을 넣으면 썸네일·최종 수정 시각도 표시합니다. |
| 4 | **AI 미사용** | Claude 등 외부 AI API를 쓰지 않습니다. |
| 5 | **프로젝트 관리** | 캠페인별 브랜드·유형·상태·운영 기간(D-day)·장소·PM, **태스크 완료율 진행률**, 프로젝트별 태스크·문서·일정·Figma·활동을 한 화면에. 월간 캘린더(회의·마감·행사·촬영·설치)와 `.ics` 내보내기. |
| 6 | **5인 태스크 한눈에** | **팀원별 보드**(5명 칸 + 미배정)와 **상태별 칸반**(할 일/진행 중/검토/완료), 목록 보기. 카드를 끌어 담당자·상태 변경, 마감 지남/오늘/이번 주 강조. 대시보드에 팀원별 할 일·진행·지연·주간 완료 요약과 지금 접속 중인 팀원 표시. 다른 팀원이 바꾼 내용은 **새로고침 없이** 반영됩니다. |

## 구성

- **Next.js 16** (App Router) · React 19 · TypeScript · Tailwind CSS 4
- **배포: Vercel Hobby(무료)** — 팀 내부 비상업 용도는 무료 플랜 약관에 맞습니다. Next.js를 가장 안정적으로 지원하고 Blob 저장소까지 한곳에서 관리할 수 있어 선택했습니다.
  (Render 무료는 15분 미사용 시 잠들어 첫 접속이 1분가량 느리고, Cloudflare는 별도 어댑터와 저장소 교체가 필요합니다.)
- **DB: Neon Postgres** (Vercel Storage에서 무료 연결) — 로컬은 설치 없는 내장 Postgres(PGlite)
- **실시간: Liveblocks 무료 플랜** — 월 500개 문서방, 방당 동시 10명 (5인 팀에 충분)
- **파일: Vercel Blob** (비공개)
- 편집기: Tiptap + Liveblocks Yjs · Word 변환: mammoth(불러오기) / docx(내보내기)

---

## Vercel 배포 (약 15분, 모두 무료 플랜)

1. **Liveblocks 가입** — [liveblocks.io](https://liveblocks.io)에서 무료 가입 → 프로젝트 생성 → **API keys**에서 `sk_`로 시작하는 **Secret key** 복사
2. **Vercel에 저장소 가져오기** — [vercel.com/new](https://vercel.com/new)에서 이 GitHub 저장소를 Import (설정 변경 없음)
3. **Postgres 연결** — Vercel 프로젝트 **Storage** 탭 → **Create Database** → **Neon** 생성 후 연결 (`DATABASE_URL` 자동 추가)
4. **파일 저장소 연결** — **Storage** 탭 → **Blob** 생성(접근 방식 **Private**) 후 연결 (`BLOB_READ_WRITE_TOKEN` 자동 추가)
5. **환경변수 추가** — **Settings → Environment Variables**

   | 이름 | 값 |
   | --- | --- |
   | `AUTH_SECRET` | 16자 이상 임의 문자열 (예: `openssl rand -base64 32` 결과) |
   | `LIVEBLOCKS_SECRET_KEY` | 1번에서 복사한 Secret key |
   | `ENTRY_CODE` | (선택) 입장 코드 — 넣지 않으면 `2심전심` |
   | `FIGMA_TOKEN` | (선택) Figma 개인 액세스 토큰 — 썸네일·수정 시각 표시용 |

6. **재배포** — **Deployments** 탭에서 **Redeploy** (빌드 중에 DB 테이블이 자동 생성됩니다)
7. **팀원 초대** — 앱의 **팀** 화면에서 「초대 문구 복사」를 눌러 링크와 입장 코드를 팀원에게 보냅니다.

> 입장 코드를 바꾸려면 `ENTRY_CODE`를 수정하고 재배포하세요. 모든 팀원이 새 코드로 다시 입장하게 됩니다.

> **빌드 오류 "No Output Directory named "public" found"** 가 나오면, Vercel 프로젝트를 빈 저장소로 먼저 만들어서 Framework Preset 이 "Other" 로 잡힌 경우입니다.
> 저장소의 `vercel.json` 이 Next.js 로 고정해 주며, 그래도 나오면 **Settings → Build and Deployment → Framework Preset** 을 **Next.js** 로 바꾸고 Output Directory 덮어쓰기(Override)를 끈 뒤 재배포하세요.

## 로컬 실행

```bash
npm install
cp .env.example .env.local
npm run dev          # http://localhost:3000 — 입장 코드 2심전심
```

실시간 기능까지 로컬에서 쓰려면 Liveblocks 개발 서버를 함께 띄웁니다(Bun 필요).

```bash
npx liveblocks dev   # http://localhost:1153
# .env.local 에 LIVEBLOCKS_SECRET_KEY=sk_localdev, LIVEBLOCKS_BASE_URL=http://localhost:1153
```

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 마이그레이션 후 개발 서버 |
| `npm run build` | 마이그레이션 후 프로덕션 빌드 (Vercel이 실행) |
| `npm run lint` / `npm run typecheck` | 코드 검사 |
| `npm run db:generate` | `src/db/schema.ts` 변경 후 마이그레이션 SQL 생성 |

## 알아 두기

- **입장 보안**: 링크와 입장 코드를 아는 사람은 누구나 들어올 수 있고, 이름 입력은 본인 확인이 아닙니다. 코드가 밖으로 새면 `ENTRY_CODE`를 바꾸세요. 팀원은 최대 10명까지 등록되며, 오타로 만든 이름은 **팀** 화면에서 삭제할 수 있습니다.
- **Word 호환 범위**: 제목, 문단, 굵게/기울임/밑줄/취소선/형광펜, 목록, 체크리스트, 표, 이미지, 링크, 정렬은 불러오기·내보내기 모두 유지됩니다. 머리글·바닥글, 각주, 다단, 변경 내용 추적 같은 복잡한 서식은 단순화됩니다. 원본 Word 파일 그대로 보관하려면 **파일 업로드**(버전 관리·미리보기 지원)를 쓰세요.
- **Liveblocks 무료 플랜**: 방(문서) 하나에 동시 접속 10개까지입니다. 5명이 한 문서를 여러 탭으로 열어도 대부분 충분합니다. 버전 기록은 앱 DB에 따로 저장하므로 무료 플랜의 기록 보관 기간과 관계없습니다.
- 모든 화면·API는 입장한 팀원만 이용할 수 있고, 업로드 파일은 비공개 저장소에서 서버를 거쳐 전달됩니다. Word 미리보기는 스크립트가 실행되지 않는 sandbox에서 표시됩니다.

## 폴더 구조

```
src/
  app/
    join/             입장 (코드 → 이름)
    (app)/            대시보드, tasks(팀 보드), projects, documents(실시간 문서·파일·Figma), schedule, team
    api/              Liveblocks 인증, 파일·첨부 전달, 업로드, Word 내보내기, .ics
  components/         공통 UI, 실시간(접속자·변경 알림), 목록, Figma 갤러리
  db/                 Drizzle 스키마·DB 연결 (Postgres / PGlite)
  lib/                입장 인증, 저장소, Liveblocks, Figma, Word 변환, 템플릿, 날짜(KST)
drizzle/              마이그레이션 SQL
scripts/migrate.mjs   빌드/개발 전 마이그레이션 실행
```
