import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Public routes that don't require authentication
  const publicRoutes = ["/auth/signin", "/auth/error", "/auth/verify-request"];
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

  // Allow public routes and NextAuth API routes
  if (isPublicRoute || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Check for bearer token in Authorization header (for API routes)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    // Let the API route handle token validation
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionToken = request.cookies.get("authjs.session-token")?.value;
  
  // Redirect to signin if no session cookie
  if (!sessionToken) {
    const signInUrl = new URL("/auth/signin", request.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Allow authenticated users to access protected routes
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
