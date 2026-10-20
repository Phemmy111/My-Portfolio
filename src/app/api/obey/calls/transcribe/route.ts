import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/ai-orchestrator";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { audioBase64, mimeType } = body;

    if (!audioBase64) {
      return NextResponse.json({ success: false, error: "Audio payload required" }, { status: 400 });
    }

    const res = await transcribeAudio(audioBase64, mimeType || "audio/webm");
    return NextResponse.json(res);
  } catch (err: any) {
    console.error("[Calls Transcribe API Error]:", err);
    return NextResponse.json({ success: false, error: err?.message || "Transcription failed" }, { status: 500 });
  }
}
