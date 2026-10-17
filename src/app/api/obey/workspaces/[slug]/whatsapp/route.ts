import { NextRequest, NextResponse } from "next/server";
import {
  sql,
  dbGetWorkspaceBySlug,
  dbUpdateWorkspaceWhatsAppStatus,
} from "@/lib/db";
import {
  createEvolutionInstance,
  getEvolutionInstanceQR,
  getEvolutionConnectionState,
  setEvolutionInstanceWebhook,
  getEvolutionPairingCode,
  logoutEvolutionInstance,
  setEvolutionInstanceSettings,
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

    let connectedNumber = "";
    let profileName = "";
    let profilePicUrl = "";

    if (sql) {
      try {
        const [instRow] = await sql`
          SELECT "ownerJid", "profileName", "profilePicUrl"
          FROM evolution."Instance"
          WHERE LOWER(name) = ${instanceName.toLowerCase()} OR id = ${instanceName}
          LIMIT 1
        `;
        if (instRow?.ownerJid) {
          connectedNumber = instRow.ownerJid.replace(/@s\.whatsapp\.net|@lid/g, "").replace(/\D/g, "");
          profileName = instRow.profileName || "";
          profilePicUrl = instRow.profilePicUrl || "";
        }
      } catch (err) {
        console.warn("Could not query evolution instance owner:", err);
      }
    }

    // 2. If connected, update DB, activate blue ticks & online presence, and return status
    if (currentState === "open") {
      await dbUpdateWorkspaceWhatsAppStatus(ws.id, instanceName, "connected");
      setEvolutionInstanceSettings(instanceName).catch(() => {});
      return NextResponse.json({
        status: "connected",
        instanceName,
        connectedNumber,
        profileName,
        profilePicUrl,
        state: currentState,
      });
    }

    // 3. If disconnected or connecting, fetch QR code
    const qrData = await getEvolutionInstanceQR(instanceName);

    return NextResponse.json({
      status: currentState === "open" ? "connected" : "disconnected",
      instanceName,
      connectedNumber,
      profileName,
      profilePicUrl,
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

    const body = await req.json().catch(() => ({}));
    const action = body.action || "qr";
    const instanceName = `obey-${ws.slug}`;
    const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "https://obeyai.vercel.app";
    const webhookUrl = `${origin}/api/obey/whatsapp/webhook/${instanceName}`;

    // DISCONNECT / UNLINK FLOW
    if (action === "disconnect") {
      await logoutEvolutionInstance(instanceName);
      await dbUpdateWorkspaceWhatsAppStatus(ws.id, instanceName, "disconnected");
      return NextResponse.json({
        success: true,
        status: "disconnected",
        instanceName,
      });
    }

    // PLAN B: Pairing Code flow (no QR code / single mobile phone)
    if (action === "pairing_code") {
      const phoneNumber = body.phoneNumber || ws.owner_phone || "";
      const cleaned = phoneNumber.replace(/\D/g, "");
      if (!cleaned || cleaned.length < 9) {
        return NextResponse.json(
          { error: "A valid phone number with country code is required for pairing code generation." },
          { status: 400 }
        );
      }

      // Configure webhook for this instance
      await setEvolutionInstanceWebhook(instanceName, webhookUrl);
      setEvolutionInstanceSettings(instanceName).catch(() => {});

      // Request 8-digit Baileys pairing code from Evolution API
      const pairRes = await getEvolutionPairingCode(instanceName, cleaned);
      if (!pairRes.success || !pairRes.pairingCode) {
        return NextResponse.json(
          { error: pairRes.error || "Failed to generate 8-digit pairing code" },
          { status: 500 }
        );
      }

      await dbUpdateWorkspaceWhatsAppStatus(ws.id, instanceName, "connecting");

      return NextResponse.json({
        success: true,
        instanceName,
        pairingCode: pairRes.pairingCode,
        state: "connecting",
      });
    }

    // PLAN A: QR Code flow
    // 1. Create or ensure instance exists
    await createEvolutionInstance(instanceName);

    // 2. Set webhook for this instance
    await setEvolutionInstanceWebhook(instanceName, webhookUrl);
    setEvolutionInstanceSettings(instanceName).catch(() => {});

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
