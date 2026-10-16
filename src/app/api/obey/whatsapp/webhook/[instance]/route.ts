import { NextRequest, NextResponse } from "next/server";
import { handleWhatsAppWebhook } from "../route";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ instance: string }> }
) {
  const { instance } = await context.params;
  return handleWhatsAppWebhook(req, instance);
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ instance: string }> }
) {
  const { instance } = await context.params;
  return NextResponse.json({
    status: "active",
    version: "v5-instanceid-routing",
    instance,
    service: "Obey WhatsApp Webhook Gateway (Instance-Specific Route)",
  });
}
