import { NextRequest, NextResponse } from "next/server";
import { dbGetInboxThreads, dbGetGuestMessages, dbAddGuestMessage } from "@/lib/db";
import { sendWhatsAppMessage } from "@/lib/whatsapp-gateway";
import { sendTelegramMessage } from "@/lib/telegram-bot";
import { logToGoogleSheet } from "@/lib/sheets-logger";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get("contactId");

  try {
    if (contactId) {
      const messages = await dbGetGuestMessages(contactId, 100);
      return NextResponse.json({ ok: true, messages });
    }

    const threads = await dbGetInboxThreads();
    return NextResponse.json({ ok: true, threads });
  } catch (err: any) {
    console.error("[Admin Inbox API] Error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contactId, channel, message } = body;

    if (!contactId || !message) {
      return NextResponse.json({ ok: false, error: "Missing contactId or message" }, { status: 400 });
    }

    // 1. Dispatch through appropriate channel
    if (channel === "whatsapp") {
      await sendWhatsAppMessage(message, contactId);
    } else if (channel === "telegram") {
      await sendTelegramMessage(`Reply from Femi Adeleke:\n\n${message}`);
    }

    // 2. Persist to omnichannel database
    const saved = await dbAddGuestMessage({
      id: `manual-reply-${Date.now()}`,
      phone_number: contactId,
      sender_name: "Femi Adeleke (Direct)",
      channel: channel || "whatsapp",
      role: "assistant",
      content: message,
    });

    // 3. Sync to Google Sheets
    logToGoogleSheet({
      phoneNumber: contactId,
      senderName: "Femi Adeleke",
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
