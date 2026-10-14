import { NextRequest, NextResponse } from "next/server";
import { dispatchMorningBriefing, dispatchEveningWrapup } from "@/lib/proactive-engine";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "morning";
  const querySecret = searchParams.get("secret");

  // Allow public keepalive pings without auth to ensure external monitors like cron-job.org can keep Render awake
  if (type === "keepalive" || type === "whatsapp") {
    try {
      const evoUrl = process.env.EVOLUTION_API_URL || "https://evolution-api-latest-cx3y.onrender.com";
      const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
      const instanceName = process.env.EVOLUTION_INSTANCE_NAME || "obey";

      const instRes = await fetch(`${evoUrl}/instance/fetchInstances`, {
        headers: { apikey: evoKey },
        cache: "no-store",
      });
      const instances = await instRes.json();
      const inst = Array.isArray(instances) ? instances.find((i: any) => i.name === instanceName) : null;
      const isConnected = Boolean(inst && inst.connectionStatus === "open" && !inst.disconnectionReasonCode);

      if (!isConnected) {
        await fetch(`${evoUrl}/instance/connect/${instanceName}`, { headers: { apikey: evoKey } });
      }
      return NextResponse.json({
        ok: true,
        type: "keepalive",
        connected: isConnected,
        status: inst?.connectionStatus || "connecting",
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
  }

  // Check auth or Vercel cron header (CRON_SECRET, query param, or auth session)
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (
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
