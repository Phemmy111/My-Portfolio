import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const publicKey =
      (await getSetting("VAPI_PUBLIC_KEY")) ||
      process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY ||
      "b01a3c29-4712-4edf-8ae6-33bbd1edf562";

    const assistantId =
      (await getSetting("VAPI_ASSISTANT_ID")) ||
      process.env.VAPI_ASSISTANT_ID ||
      "dc1277f3-270e-4774-8c81-6d7e407faf8d";

    return NextResponse.json({
      publicKey,
      assistantId,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load Vapi config" },
      { status: 500 }
    );
  }
}
