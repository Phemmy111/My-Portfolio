import { NextRequest, NextResponse } from "next/server";
import { getSetting, getVapiProvidersPool } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Public Streaming Proxy for Vapi Call Recordings.
 * Allows Evolution API & WhatsApp to stream high-definition call audio directly
 * without hitting base64 payload limits (413 Payload Too Large) or Cloudflare R2 bucket 403s.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: callId } = await params;
  if (!callId) {
    return new NextResponse("Missing call ID", { status: 400 });
  }

  try {
    const vapiPool = await getVapiProvidersPool();
    const apiKey =
      vapiPool[0]?.apiKey ||
      (await getSetting("VAPI_API_KEY")) ||
      process.env.VAPI_API_KEY ||
      "3826a0b2-1ed2-4669-ad82-ebd437fdcdcd";

    const vapiRes = await fetch(`https://api.vapi.ai/call/${callId}/mono-recording`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      redirect: "follow",
    });

    if (!vapiRes.ok || !vapiRes.body) {
      return new NextResponse("Recording not found or still processing", {
        status: vapiRes.status,
      });
    }

    const contentType = vapiRes.headers.get("content-type") || "audio/wav";
    const contentLength = vapiRes.headers.get("content-length");

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", contentType);
    if (contentLength) responseHeaders.set("Content-Length", contentLength);
    responseHeaders.set("Cache-Control", "public, max-age=86400, s-maxage=86400");
    responseHeaders.set("Accept-Ranges", "bytes");

    return new NextResponse(vapiRes.body as any, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.error("[Call Audio Proxy] Error streaming recording:", err);
    return new NextResponse(err.message || "Failed to stream recording", { status: 500 });
  }
}
