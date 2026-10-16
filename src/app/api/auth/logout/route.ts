import { NextResponse } from "next/server";
import { clearAuthSession } from "@/lib/auth-session";

export async function POST() {
  try {
    await clearAuthSession();
    return NextResponse.json({ success: true, message: "Logged out successfully" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to log out" }, { status: 500 });
  }
}
