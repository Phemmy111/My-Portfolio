import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * 24/7 Keep-Alive & Auto-Reconnect Daemon for Evolution API (Render Free Web Service)
 * Prevents Render from sleeping after 15 minutes of inactivity and auto-heals Baileys socket disconnections.
 */
export async function GET(req: NextRequest) {
  const evoUrl = process.env.EVOLUTION_API_URL || "https://evolution-api-latest-cx3y.onrender.com";
  const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
  const instanceName = process.env.EVOLUTION_INSTANCE_NAME || "obey";

  try {
    // 1. Fetch live instance state directly from Evolution API
    const instRes = await fetch(`${evoUrl}/instance/fetchInstances`, {
      headers: { apikey: evoKey },
      cache: "no-store",
    });

    if (!instRes.ok) {
      // If Render was asleep or cold starting, ping connect endpoint directly
      try {
        await fetch(`${evoUrl}/instance/connect/${instanceName}`, {
          headers: { apikey: evoKey },
        });
      } catch {}
      return NextResponse.json({
        success: false,
        connected: false,
        error: `Evolution API returned HTTP ${instRes.status}. Triggered wake-up request.`,
      });
    }

    const instances = await instRes.json();
    const inst = Array.isArray(instances) ? instances.find((i: any) => i.name === instanceName) : null;

    const isConnected = Boolean(
      inst &&
      inst.connectionStatus === "open" &&
      !inst.disconnectionReasonCode
    );

    // 2. If disconnected or socket closed, auto-trigger connect immediately
    let autoReconnected = false;
    if (!isConnected) {
      console.log(`[WA Keepalive] WhatsApp instance '${instanceName}' is disconnected (status: ${inst?.connectionStatus || 'offline'}). Auto-reconnecting...`);
      try {
        const connectRes = await fetch(`${evoUrl}/instance/connect/${instanceName}`, {
          headers: { apikey: evoKey },
        });
        autoReconnected = connectRes.ok;
      } catch (connErr) {
        console.warn("[WA Keepalive] Auto-connect fetch error:", connErr);
      }
    }

    return NextResponse.json({
      success: true,
      connected: isConnected,
      status: inst?.connectionStatus || "disconnected",
      ownerJid: inst?.ownerJid || null,
      autoReconnected,
      keepAliveTimestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[WA Keepalive] Error pinging Evolution API:", err);
    return NextResponse.json({
      success: false,
      connected: false,
      error: err.message,
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
