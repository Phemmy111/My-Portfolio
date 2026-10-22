import { NextRequest, NextResponse } from "next/server";
import { dbGetInboxThreads, dbGetGuestMessages, dbAddGuestMessage } from "@/lib/db";
import { sendWhatsAppMessage } from "@/lib/whatsapp-gateway";
import { sendTelegramMessage } from "@/lib/telegram-bot";
import { logToGoogleSheet } from "@/lib/sheets-logger";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get("contactId");
  const workspaceId = searchParams.get("workspaceId");

  try {
    if (contactId) {
      const messages = await dbGetGuestMessages(contactId, 100, workspaceId || undefined);
      return NextResponse.json({ ok: true, messages });
    }

    const threads = await dbGetInboxThreads(workspaceId || undefined);
    return NextResponse.json({ ok: true, threads });
  } catch (err: any) {
    console.error("[Admin Inbox API] Error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contactId, channel, message, workspaceId } = body;

    if (!contactId || !message) {
      return NextResponse.json({ ok: false, error: "Missing contactId or message" }, { status: 400 });
    }

    const targetWsId = workspaceId || "ws_femi_default";
    let instanceName = "obey";
    let senderTitle = "Femi Adeleke (Direct)";

    if (targetWsId && targetWsId !== "ws_femi_default") {
      const { dbGetWorkspaceById } = await import("@/lib/db");
      const ws = await dbGetWorkspaceById(targetWsId);
      if (ws) {
        instanceName = ws.whatsapp_instance_name || "obey";
        senderTitle = `${ws.name} (Direct)`;
      }
    }

    // 1. Dispatch through appropriate channel & instance
    if (channel === "whatsapp") {
      await sendWhatsAppMessage(message, contactId, instanceName);
    } else if (channel === "telegram") {
      await sendTelegramMessage(`Reply from ${senderTitle}:\n\n${message}`);
    }

    // 2. Persist to omnichannel database under the isolated workspace
    const saved = await dbAddGuestMessage({
      id: `manual-reply-${Date.now()}`,
      phone_number: contactId,
      sender_name: senderTitle,
      channel: channel || "whatsapp",
      role: "assistant",
      content: message,
      workspace_id: targetWsId,
    });

    // 3. Sync to Google Sheets
    logToGoogleSheet({
      phoneNumber: contactId,
      senderName: senderTitle,
      role: "assistant",
      message,
      intent: "Manual Direct Reply",
    });

    return NextResponse.json({ ok: true, message: saved });
  } catch (err: any) {
    console.error("[Admin Inbox Reply Error]:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
