import { NextRequest, NextResponse } from "next/server";
import { runWhatsAppSessionSentinel } from "@/lib/session-sentinel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const notify = searchParams.get("notify") === "true";

    const report = await runWhatsAppSessionSentinel({
      notifyOwners: notify,
      notifyAdmin: notify,
    });

    return NextResponse.json({
      status: "success",
      report,
    });
  } catch (err: any) {
    console.error("[Health-Check GET] Sentinel error:", err);
    return NextResponse.json(
      {
        status: "error",
        error: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const notifyOwners = Boolean(body.notifyOwners);
    const notifyAdmin = Boolean(body.notifyAdmin);

    const report = await runWhatsAppSessionSentinel({
      notifyOwners,
      notifyAdmin,
    });

    return NextResponse.json({
      status: "success",
      report,
    });
  } catch (err: any) {
    console.error("[Health-Check POST] Sentinel error:", err);
    return NextResponse.json(
      {
        status: "error",
        error: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
