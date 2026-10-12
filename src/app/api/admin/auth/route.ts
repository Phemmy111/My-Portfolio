import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PASSCODE } from "@/lib/admin-store";

export async function POST(req: NextRequest) {
  try {
    const { passcode } = await req.json();

    if (!passcode || passcode !== ADMIN_PASSCODE) {
      return NextResponse.json({ error: "Invalid admin passcode" }, { status: 401 });
    }

    const res = NextResponse.json({ success: true, message: "Authenticated successfully" });
    // Set admin cookie for 7 days
    res.cookies.set("femi_admin_session", "authenticated_session_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return res;
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = req.cookies.get("femi_admin_session");
  const isAuthenticated = session?.value === "authenticated_session_token";
  return NextResponse.json({ authenticated: isAuthenticated });
}

export async function DELETE() {
  const res = NextResponse.json({ success: true, message: "Logged out" });
  res.cookies.delete("femi_admin_session");
  return res;
}
