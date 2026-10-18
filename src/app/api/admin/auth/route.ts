import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PASSCODE } from "@/lib/admin-store";
import { getSetting, setSetting } from "@/lib/settings";

export async function POST(req: NextRequest) {
  try {
    const { passcode } = await req.json();

    const configuredPasscode =
      (await getSetting("ADMIN_PASSCODE")) || process.env.ADMIN_PASSCODE || ADMIN_PASSCODE;

    if (!passcode || passcode.trim() !== configuredPasscode.trim()) {
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

export async function PATCH(req: NextRequest) {
  const session = req.cookies.get("femi_admin_session");
  if (session?.value !== "authenticated_session_token") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { newPasscode } = await req.json();
    if (!newPasscode || typeof newPasscode !== "string" || newPasscode.trim().length < 6) {
      return NextResponse.json(
        { error: "New passcode must be at least 6 characters long." },
        { status: 400 }
      );
    }

    await setSetting("ADMIN_PASSCODE", newPasscode.trim());

    return NextResponse.json({
      success: true,
      message: "Admin passcode successfully updated! Use your new passcode for future logins.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to update admin passcode" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const res = NextResponse.json({ success: true, message: "Logged out" });
  res.cookies.delete("femi_admin_session");
  return res;
}
