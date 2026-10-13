import { NextRequest, NextResponse } from "next/server";
import { handleTelegramWebhook } from "@/lib/telegram-bot";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    await handleTelegramWebhook(body);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Telegram webhook error:", err);
    return NextResponse.json({ error: err.message }, { status: 200 }); // Telegram requires 200 to acknowledge
  }
}

export async function GET() {
  return NextResponse.json({
    status: "active",
    service: "Obey Telegram Webhook Gateway",
    endpoint: "/api/obey/telegram/webhook",
  });
}
