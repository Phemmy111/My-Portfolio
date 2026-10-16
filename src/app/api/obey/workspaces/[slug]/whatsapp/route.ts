import { NextRequest, NextResponse } from "next/server";
import {
  dbGetWorkspaceBySlug,
  dbUpdateWorkspaceWhatsAppStatus,
} from "@/lib/db";
import {
  createEvolutionInstance,
  getEvolutionInstanceQR,
  getEvolutionConnectionState,
  setEvolutionInstanceWebhook,
} from "@/lib/whatsapp-gateway";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ws = await dbGetWorkspaceBySlug(slug);
    if (!ws) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const instanceName = ws.whatsapp_instance_name || `obey-${ws.slug}`;

    // 1. Check current connection state
    const stateData = await getEvolutionConnectionState(instanceName);
    const currentState = stateData?.instance?.state || "close";

    // 2. If connected, update DB and return status
    if (currentState === "open") {
      await dbUpdateWorkspaceWhatsAppStatus(ws.id, instanceName, "connected");
      return NextResponse.json({
        status: "connected",
        instanceName,
        state: currentState,
      });
    }

    // 3. If disconnected or connecting, fetch QR code
    const qrData = await getEvolutionInstanceQR(instanceName);

    return NextResponse.json({
      status: currentState === "open" ? "connected" : "disconnected",
      instanceName,
      state: currentState,
      qrcode: qrData?.base64 || qrData?.qrcode?.base64 || null,
      pairingCode: qrData?.pairingCode || null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch WhatsApp connection state" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ws = await dbGetWorkspaceBySlug(slug);
    if (!ws) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const instanceName = `obey-${ws.slug}`;
    const origin = req.headers.get("origin") || "https://femiadelekeportfolio.vercel.app";
    const webhookUrl = `${origin}/api/obey/whatsapp/webhook/${instanceName}`;

    // 1. Create or ensure instance exists
    await createEvolutionInstance(instanceName);

    // 2. Set webhook for this instance
    await setEvolutionInstanceWebhook(instanceName, webhookUrl);

    // 3. Fetch QR code
    const qrData = await getEvolutionInstanceQR(instanceName);

    await dbUpdateWorkspaceWhatsAppStatus(ws.id, instanceName, "connecting");

    return NextResponse.json({
      success: true,
      instanceName,
      qrcode: qrData?.base64 || qrData?.qrcode?.base64 || null,
      pairingCode: qrData?.pairingCode || null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to initialize WhatsApp instance" },
      { status: 500 }
    );
  }
}
