import { NextRequest, NextResponse } from "next/server";
import { dispatchMorningBriefing, dispatchEveningWrapup } from "@/lib/proactive-engine";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "morning";

  // Check auth or Vercel cron header (CRON_SECRET or auth)
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Only verify if CRON_SECRET is explicitly set
    const session = req.cookies.get("femi_admin_session");
    if (session?.value !== "authenticated_session_token") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    if (type === "evening") {
      const res = await dispatchEveningWrapup();
      return NextResponse.json({ ok: true, type: "evening", result: res });
    } else if (type === "gmail") {
      const { runGmailInboxSync } = await import("@/lib/gmail-reader");
      const res = await runGmailInboxSync();
      return NextResponse.json({ ok: true, type: "gmail", result: res });
    } else {
      const res = await dispatchMorningBriefing();
      return NextResponse.json({ ok: true, type: "morning", result: res });
    }
  } catch (err: any) {
    console.error("Cron execution error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const type = body.type || "morning";

    if (type === "evening") {
      const res = await dispatchEveningWrapup();
      return NextResponse.json({ ok: true, type: "evening", result: res });
    } else {
      const res = await dispatchMorningBriefing();
      return NextResponse.json({ ok: true, type: "morning", result: res });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
