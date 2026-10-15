import { NextRequest, NextResponse, after } from "next/server";
import { sendWhatsAppMessage, sendWhatsAppAudio } from "@/lib/whatsapp-gateway";
import { dbAddGuestMessage, dbAddChatMessage } from "@/lib/db";
import { getVapiProvidersPool } from "@/lib/settings";

export const maxDuration = 60;

const FEMI_PERSONAL_NUMBER = "2348120934828";

/**
 * Vapi.ai Webhook Endpoint for End-of-Call Reports
 * Automatically delivers the call recording (audio) and full transcript + summary to the user on WhatsApp.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const messageType = body?.message?.type || body?.type;

  // We are interested in the end-of-call-report
  if (messageType === "end-of-call-report" || body?.message?.recordingUrl || body?.recordingUrl) {
    const report = body.message || body;
    const recordingUrl = report.recordingUrl || body.call?.recordingUrl;
    const transcript = report.transcript || body.call?.transcript || "";
    const summary = report.summary || body.call?.summary || "";
    const isWebRTC = !report.customer?.number && !body.call?.customer?.number;
    const callerName = report.metadata?.userName || report.variableValues?.userName || "";
    const targetLabel = isWebRTC
      ? `WebRTC Voice Call${callerName ? ` with ${callerName}` : ""}`
      : report.customer?.number || body.call?.customer?.number || "Direct Phone";
    const durationSeconds = report.durationSeconds || body.call?.durationSeconds || 0;

    // Find who ordered this call (from metadata or assistantOverrides)
    let userPhone =
      report.assistantOverrides?.metadata?.userPhone ||
      report.metadata?.userPhone ||
      report.assistantOverrides?.variableValues?.userPhone ||
      report.variableValues?.userPhone ||
      body.call?.metadata?.userPhone ||
      FEMI_PERSONAL_NUMBER;

    userPhone = userPhone.replace(/\D/g, "");
    if (!userPhone || userPhone.length < 10) userPhone = FEMI_PERSONAL_NUMBER;

    const mins = Math.floor(durationSeconds / 60);
    const secs = Math.floor(durationSeconds % 60);

    const callReportText =
      `📞 *AI Voice Call Completed!*\n\n` +
      `• *Channel:* ${targetLabel}\n` +
      `• *Duration:* ${mins > 0 ? `${mins}m ` : ""}${secs}s\n\n` +
      (summary ? `📝 *Executive Summary:*\n${summary.trim()}\n\n` : "") +
      (transcript ? `📄 *Full Transcript:*\n${transcript.trim().slice(0, 1200)}\n\n` : "") +
      (recordingUrl ? `🎙️ *Recording:* Sent below as voice note...` : "");

    after(async () => {
      try {
        // 1. Send text summary & transcript
        await sendWhatsAppMessage(callReportText, userPhone);

        // 2. Send playable audio file / voice note
        if (recordingUrl) {
          let finalAudioPayload = recordingUrl;
          try {
            // Check if recordingUrl is access-controlled (returns 401/403 without auth)
            const checkRes = await fetch(recordingUrl, { method: "HEAD" });
            if (checkRes.status === 401 || checkRes.status === 403) {
              const vapiPool = await getVapiProvidersPool();
              const primaryKey = vapiPool[0]?.apiKey;
              if (primaryKey) {
                const authRes = await fetch(recordingUrl, {
                  headers: { Authorization: `Bearer ${primaryKey}` },
                });
                if (authRes.ok) {
                  const buffer = Buffer.from(await authRes.arrayBuffer());
                  finalAudioPayload = `data:audio/mp3;base64,${buffer.toString("base64")}`;
                }
              }
            }
          } catch (audioErr) {
            console.warn("[Vapi Webhook] Audio access-check error:", audioErr);
          }

          await sendWhatsAppAudio(finalAudioPayload, userPhone, `🎙️ Call Recording: ${targetLabel}`);
        }

        // 3. Save to database memory
        await dbAddGuestMessage({
          id: `call-report-${Date.now()}`,
          phone_number: userPhone,
          sender_name: "Obey",
          role: "assistant",
          content: callReportText,
        });

        if (userPhone === FEMI_PERSONAL_NUMBER) {
          await dbAddChatMessage({
            id: `call-report-${Date.now()}`,
            role: "assistant",
            content: callReportText,
          });
        }
      } catch (err) {
        console.error("[Vapi Webhook] Error dispatching call report:", err);
      }
    });

    return NextResponse.json({ ok: true, status: "report_processed" });
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({
    status: "active",
    service: "Obey Vapi Telephony Webhook",
    webhookUrl: "/api/obey/calls/webhook",
    description: "Receives end-of-call-report, audio recording URL, and full transcript from Vapi.ai",
  });
}
