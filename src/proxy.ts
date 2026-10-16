import { NextResponse, type NextRequest } from "next/server";

// 세션 쿠키가 없으면 로그인 페이지로 보내는 1차(낙관적) 확인.
// 실제 서명·만료 검증은 서버 컴포넌트/액션/API 에서 requireUser()·getCurrentUser() 로 수행합니다.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();
  if (!request.cookies.has("bx_session")) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // API 라우트는 각 핸들러에서 인증을 확인 (대용량 업로드가 proxy 본문 제한에 걸리지 않도록 제외)
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
