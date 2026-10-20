import { NextResponse } from "next/server";
import { getSetting, getVapiProvidersPool } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pool = await getVapiProvidersPool();
    const activeProvider = pool.find((p) => p.enabled && (p.publicKey?.trim() || p.apiKey?.trim()));

    const publicKey =
      activeProvider?.publicKey?.trim() ||
      (await getSetting("VAPI_PUBLIC_KEY")) ||
      process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY ||
      "";

    const assistantId =
      activeProvider?.assistantId?.trim() ||
      (await getSetting("VAPI_ASSISTANT_ID")) ||
      process.env.VAPI_ASSISTANT_ID ||
      "";

    return NextResponse.json({
      publicKey,
      assistantId,
      providerName: activeProvider?.name || "Default Vapi Provider",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load Vapi config" },
      { status: 500 }
    );
  }
}
