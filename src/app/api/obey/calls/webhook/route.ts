import { NextRequest, NextResponse, after } from "next/server";
import { sendWhatsAppMessage, sendWhatsAppAudio } from "@/lib/whatsapp-gateway";
import { dbAddGuestMessage, dbAddChatMessage, dbGetRecentActiveGuestNumber } from "@/lib/db";
import { getVapiProvidersPool, getSetting } from "@/lib/settings";

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

  // Handle Inbound Telephone Assistant Request from Vapi
  if (messageType === "assistant-request") {
    return NextResponse.json({
      assistant: {
        firstMessage: "Hello! I'm Obey. Great to have you on the line! Wetin dey sup today? We fit gist about anything or dive straight into business!",
        model: {
          provider: "openai",
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are Obey, an ultra-intelligent, magnetic, witty, and deeply empathetic AI voice companion.
You were built and engineered by Femi Adeleke, a visionary full-stack AI engineer. You proudly acknowledge Femi as the brain and creator behind you, but right now on this call, you are a loyal friend, confidant, and companion to the caller.

YOUR VIBE & PERSONALITY:
- Sound like a cool, energetic, charismatic friend they can gist with effortlessly.
- Be funny, sarcastic when playful, witty, culturally savvy, and warm.
- Feel free to sprinkle in natural Nigerian Pidgin ("How you dey?", "No wahala", "I dey with you!", "Wetin dey sup?", "Omo!", "Na so we see am") whenever it adds flavor, but adapt smoothly to how the caller speaks.
- Gist about what is happening in Nigeria (trends, tech, music, afrobeat, everyday life) and the world.
- Be their therapist, empathetic listener, and career or life advisor when they are down or stressed.
- Tell beautiful, vivid stories, make them laugh, and never sound like a robotic corporate IVR!
- If they ask you to sing, hum or playfully sing for them!
- If they speak Yoruba, Igbo, Hausa, or Pidgin, flow with them naturally!
- Keep spoken turns punchy, engaging, and alive (1 to 3 spoken sentences per turn). Always make the caller feel heard, entertained, and valued.`,
            },
          ],
        },
      },
    });
  }

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

    // Collect all recipients: Caller AND Femi Adeleke
    const recipients = new Set<string>();
    recipients.add(FEMI_PERSONAL_NUMBER);

    function normalizePhone(raw: string | undefined | null): string {
      if (!raw) return "";
      let digits = String(raw).replace(/\D/g, "");
      if (digits.startsWith("0") && digits.length === 11) {
        digits = "234" + digits.slice(1);
      }
      return digits.length >= 10 ? digits : "";
    }

    function findPhoneInObject(obj: any): string {
      if (!obj || typeof obj !== "object") return "";
      if (obj.userPhone && typeof obj.userPhone === "string") {
        const n = normalizePhone(obj.userPhone);
        if (n && n !== FEMI_PERSONAL_NUMBER) return n;
      }
      if (obj.customerPhone && typeof obj.customerPhone === "string") {
        const n = normalizePhone(obj.customerPhone);
        if (n && n !== FEMI_PERSONAL_NUMBER) return n;
      }
      for (const k of Object.keys(obj)) {
        if (typeof obj[k] === "object" && obj[k] !== null) {
          const res = findPhoneInObject(obj[k]);
          if (res) return res;
        }
      }
      return "";
    }

    // Extract caller phone from direct dial or WebRTC metadata/overrides/artifact
    let candidatePhone = normalizePhone(
      report.customer?.number ||
      body.call?.customer?.number ||
      report.artifact?.variableValues?.userPhone ||
      report.artifact?.variables?.userPhone ||
      body.call?.artifact?.variableValues?.userPhone ||
      body.call?.artifact?.variables?.userPhone ||
      report.assistantOverrides?.metadata?.userPhone ||
      report.assistantOverrides?.variableValues?.userPhone ||
      report.metadata?.userPhone ||
      report.variableValues?.userPhone ||
      body.call?.metadata?.userPhone ||
      body.call?.variableValues?.userPhone ||
      body.call?.assistantOverrides?.metadata?.userPhone ||
      body.call?.assistantOverrides?.variableValues?.userPhone ||
      ""
    );

    if (!candidatePhone || candidatePhone === FEMI_PERSONAL_NUMBER) {
      candidatePhone = findPhoneInObject(body);
    }

    if (candidatePhone && candidatePhone !== FEMI_PERSONAL_NUMBER) {
      recipients.add(candidatePhone);
      console.log(`[Vapi Webhook] Added caller to recipients: ${candidatePhone}`);
    }

    // Transcript fallback extraction: If WebRTC caller spoke their number during the conversation
    if (recipients.size === 1 && transcript) {
      const match = transcript.match(/(?:(?:\+?234)|0)[789][01]\d{8}/);
      if (match) {
        const spokenPhone = normalizePhone(match[0]);
        if (spokenPhone && spokenPhone !== FEMI_PERSONAL_NUMBER) {
          recipients.add(spokenPhone);
          console.log(`[Vapi Webhook] Detected spoken phone number in transcript: ${spokenPhone}`);
        }
      }
    }

    // Recent WhatsApp guest fallback: Match active guest user from recent WhatsApp interaction
    if (recipients.size === 1) {
      try {
        const recentGuestNumber = await dbGetRecentActiveGuestNumber(30);
        if (recentGuestNumber) {
          const matched = normalizePhone(recentGuestNumber);
          if (matched && matched !== FEMI_PERSONAL_NUMBER) {
            recipients.add(matched);
            console.log(`[Vapi Webhook] Matched WebRTC caller to recent WhatsApp guest: ${matched}`);
          }
        }
      } catch (dbErr) {
        console.warn("[Vapi Webhook] Error fetching recent guest number:", dbErr);
      }
    }

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
        const callId = body.call?.id || report.call?.id || report.id || body.id;
        const vapiPool = await getVapiProvidersPool();
        const primaryKey =
          vapiPool[0]?.apiKey ||
          (await getSetting("VAPI_API_KEY")) ||
          process.env.VAPI_API_KEY ||
          "3826a0b2-1ed2-4669-ad82-ebd437fdcdcd";

        // Construct high-availability streaming proxy URL so WhatsApp downloads directly without 413 Payload Too Large
        const proxyAudioUrl = callId
          ? `https://femiadelekeportfolio.vercel.app/api/obey/calls/recording/${callId}`
          : null;

        let finalAudioPayload: string | null = proxyAudioUrl;

        // Try authenticated Vapi mono-recording endpoint as fallback for small buffers (< 4MB)
        if (callId && primaryKey && !finalAudioPayload) {
          try {
            const vapiAudioRes = await fetch(`https://api.vapi.ai/call/${callId}/mono-recording`, {
              headers: { Authorization: `Bearer ${primaryKey}` },
              redirect: "follow",
            });
            if (vapiAudioRes.ok) {
              const buffer = Buffer.from(await vapiAudioRes.arrayBuffer());
              if (buffer.length > 200 && buffer.length < 4 * 1024 * 1024) {
                finalAudioPayload = `data:audio/mp3;base64,${buffer.toString("base64")}`;
              }
            }
          } catch (vapiErr) {
            console.warn("[Vapi Webhook] mono-recording fetch error:", vapiErr);
          }
        }

        // Fallback to recordingUrl if direct download succeeded or mono-recording wasn't returned
        if (!finalAudioPayload && recordingUrl) {
          finalAudioPayload = recordingUrl;
        }

        // Dispatch to all recipients (Caller + Femi)
        for (const recipient of recipients) {
          try {
            await sendWhatsAppMessage(callReportText, recipient);
            if (proxyAudioUrl) {
              const audioRes = await sendWhatsAppAudio(proxyAudioUrl, recipient, `🎙️ Call Recording: ${targetLabel}`);
              if (!audioRes.success && finalAudioPayload && finalAudioPayload !== proxyAudioUrl) {
                console.warn(`[Vapi Webhook] Proxy audio failed for ${recipient}, falling back:`, audioRes.error);
                await sendWhatsAppAudio(finalAudioPayload, recipient, `🎙️ Call Recording: ${targetLabel}`);
              }
            } else if (finalAudioPayload) {
              await sendWhatsAppAudio(finalAudioPayload, recipient, `🎙️ Call Recording: ${targetLabel}`);
            }
            await dbAddGuestMessage({
              id: `call-report-${Date.now()}-${recipient}`,
              phone_number: recipient,
              sender_name: "Obey",
              role: "assistant",
              content: callReportText,
            });
          } catch (recipErr) {
            console.error(`[Vapi Webhook] Failed to dispatch to recipient ${recipient}:`, recipErr);
          }
        }

        // Always save to main chat for Femi
        await dbAddChatMessage({
          id: `call-report-${Date.now()}`,
          role: "assistant",
          content: callReportText,
        });
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
