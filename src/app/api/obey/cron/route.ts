import { NextRequest, NextResponse } from "next/server";
import { dispatchMorningBriefing, dispatchEveningWrapup } from "@/lib/proactive-engine";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "morning";
  const querySecret = searchParams.get("secret");

  // Allow public keepalive pings without auth to ensure external monitors like cron-job.org can keep Render awake
  if (type === "keepalive" || type === "whatsapp" || type === "pulse") {
    if (type === "keepalive" || type === "whatsapp") {
      const { GET: handleKeepalive } = await import("../whatsapp/keepalive/route");
      return handleKeepalive(req);
    }
  }

  // Check auth or Vercel cron header (CRON_SECRET, query param, or auth session)
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isPublicPing = type === "pulse" || type === "keepalive" || type === "whatsapp";
  if (
    !isPublicPing &&
    cronSecret &&
    authHeader !== `Bearer ${cronSecret}` &&
    querySecret !== cronSecret &&
    querySecret !== "FemiObey2026!"
  ) {
    const session = req.cookies.get("femi_admin_session");
    if (session?.value !== "authenticated_session_token") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // Automatically dispatch any due scheduled statuses and tasks
    try {
      const { dispatchDueScheduledStatuses } = await import("@/lib/status-scheduler");
      await dispatchDueScheduledStatuses();
      const { dispatchDueScheduledTasks } = await import("@/lib/scheduled-task-engine");
      await dispatchDueScheduledTasks();
    } catch {}

    if (type === "evening") {
      const res = await dispatchEveningWrapup();
      return NextResponse.json({ ok: true, type: "evening", result: res });
    } else if (type === "gmail") {
      const { runGmailInboxSync } = await import("@/lib/gmail-reader");
      const res = await runGmailInboxSync();
      return NextResponse.json({ ok: true, type: "gmail", result: res });
    } else if (type === "pulse" || type === "all") {
      const { runGmailInboxSync } = await import("@/lib/gmail-reader");
      const gmailRes = await runGmailInboxSync().catch(() => null);
      let waRes = null;
      try {
        const { GET: handleKeepalive } = await import("../whatsapp/keepalive/route");
        const keepaliveResponse = await handleKeepalive(req);
        waRes = await keepaliveResponse.json();
      } catch {}
      return NextResponse.json({ ok: true, type: "pulse", gmail: gmailRes, keepalive: waRes });
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
