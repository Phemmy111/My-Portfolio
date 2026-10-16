import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Define protected routes
const isAdminRoute = createRouteMatcher(["/admin(.*)"]);
const isControlRoomRoute = createRouteMatcher(["/control-room(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  // Check if authenticated via direct Obey OTP session cookie
  const obeySession = req.cookies.get("obey_auth_session")?.value;
  if (obeySession) {
    return NextResponse.next();
  }

  // Fallback: Check if authenticated via Clerk
  if (isAdminRoute(req) || isControlRoomRoute(req)) {
    try {
      const { userId } = await auth();
      if (userId) {
        return NextResponse.next();
      }
    } catch {
      // Ignore Clerk auth errors in middleware
    }

    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", req.url);
    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
