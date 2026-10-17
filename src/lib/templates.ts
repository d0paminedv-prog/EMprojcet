// 실시간 문서 템플릿 (HTML → 편집기 첫 내용)
export type DocTemplate = { id: string; label: string; category: string; html: string };

const today = () =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date());

export function docTemplates(): DocTemplate[] {
  return [
    { id: "blank", label: "빈 문서", category: "etc", html: "<p></p>" },
    {
      id: "minutes",
      label: "회의록",
      category: "minutes",
      html: `<h1>회의록</h1>
<table><tbody>
<tr><th><p>일시</p></th><td><p>${today()}</p></td></tr>
<tr><th><p>장소</p></th><td><p></p></td></tr>
<tr><th><p>참석자</p></th><td><p></p></td></tr>
<tr><th><p>작성자</p></th><td><p></p></td></tr>
</tbody></table>
<h2>1. 안건</h2><ul><li><p></p></li></ul>
<h2>2. 논의 내용</h2><ul><li><p></p></li></ul>
<h2>3. 결정 사항</h2><ul><li><p></p></li></ul>
<h2>4. 할 일 (담당 / 기한)</h2>
<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul>
<h2>5. 다음 회의</h2><p></p>`,
    },
    {
      id: "proposal",
      label: "캠페인 기획서",
      category: "proposal",
      html: `<h1>[브랜드] 체험마케팅 캠페인 기획서</h1>
<h2>1. 캠페인 개요</h2>
<table><tbody>
<tr><th><p>브랜드 / 제품</p></th><td><p></p></td></tr>
<tr><th><p>유형</p></th><td><p>팝업스토어 / 샘플링 / 체험단 / 오프라인 행사</p></td></tr>
<tr><th><p>기간</p></th><td><p></p></td></tr>
<tr><th><p>장소</p></th><td><p></p></td></tr>
<tr><th><p>예산</p></th><td><p></p></td></tr>
</tbody></table>
<h2>2. 목표 및 KPI</h2><ul><li><p>방문객 수:</p></li><li><p>샘플 배포 수:</p></li><li><p>SNS 언급량 / UGC:</p></li></ul>
<h2>3. 타깃</h2><p></p>
<h2>4. 핵심 컨셉 · 메시지</h2><p></p>
<h2>5. 체험 프로그램 구성</h2><ul><li><p></p></li></ul>
<h2>6. 공간 · 디자인 (Figma 링크)</h2><p></p>
<h2>7. 운영 계획 (인력 · 동선 · 일정)</h2><p></p>
<h2>8. 홍보 · 인플루언서</h2><p></p>
<h2>9. 리스크 및 대응</h2><p></p>`,
    },
    {
      id: "report",
      label: "결과 보고서",
      category: "report",
      html: `<h1>[캠페인명] 결과 보고서</h1>
<h2>1. 개요</h2><p></p>
<h2>2. 주요 성과</h2>
<table><tbody>
<tr><th><p>지표</p></th><th><p>목표</p></th><th><p>실적</p></th><th><p>달성률</p></th></tr>
<tr><td><p>방문객 수</p></td><td><p></p></td><td><p></p></td><td><p></p></td></tr>
<tr><td><p>샘플 배포</p></td><td><p></p></td><td><p></p></td><td><p></p></td></tr>
<tr><td><p>SNS 언급</p></td><td><p></p></td><td><p></p></td><td><p></p></td></tr>
</tbody></table>
<h2>3. 현장 반응 · 인사이트</h2><ul><li><p></p></li></ul>
<h2>4. 개선점</h2><ul><li><p></p></li></ul>
<h2>5. 첨부 (사진 · 자료)</h2><p></p>`,
    },
  ];
}
