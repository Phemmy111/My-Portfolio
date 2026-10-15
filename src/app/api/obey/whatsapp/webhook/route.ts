import { NextRequest, NextResponse, after } from "next/server";
import { executeAICompletion, transcribeAudio, executeAICompletionWithMedia } from "@/lib/ai-orchestrator";
import {
  dbAddChatMessage,
  dbGetChatMessages,
  dbAddLead,
  dbAddGuestMessage,
  dbGetGuestMessages,
  dbGetInboxThreads,
  dbGetOrCreatePersonalAgent,
  dbCreateUserPendingAction,
  dbGetPendingUserAction,
  dbUpdateUserActionStatus,
} from "@/lib/db";
import { sendWhatsAppMessage, fetchEvolutionMediaBase64 } from "@/lib/whatsapp-gateway";
import { logToGoogleSheet } from "@/lib/sheets-logger";
import { runUpworkLiveScout } from "@/lib/upwork-scout";
import { runB2BLeadHunter } from "@/lib/apollo-hunter";
import { runGmailInboxSync } from "@/lib/gmail-reader";
import { getAgentTasks, executeAgentTask } from "@/lib/obey-agent";
import { dispatchMorningBriefing, dispatchEveningWrapup } from "@/lib/proactive-engine";
import { formatToWAT, formatDateTimeWAT, getNigerianTime } from "@/lib/utils";
import { getObeyBrainContext, getSetting, setSetting } from "@/lib/settings";
import { executePendingUserAction } from "@/lib/agent-dispatcher";
import { processDynamicCompanionTurn } from "@/lib/dynamic-companion";

// Tell Next.js to use the Edge-compatible streaming runtime so we can
// respond instantly and keep processing in the background.
export const maxDuration = 60; // seconds — Vercel Hobby allows up to 60s on API routes

// Femi's personal WhatsApp number (the one he messages FROM)
const FEMI_PERSONAL_NUMBER = "2348120934828";

function cleanWhatsAppFormatting(text: string): string {
  return text
    // Replace markdown bullets like "* *item:*" with "• *item:*"
    .replace(/^(\s*)\*\s+\*([^*]+)\*:/gm, "$1• *$2:*")
    .replace(/^(\s*)\*\s+/gm, "$1• ")
    .replace(/^(\s*)-\s+/gm, "$1• ")
    // Remove markdown headers (# Title)
    .replace(/^#{1,6}\s+/gm, "")
    // Normalize markdown double bolding **text** to WhatsApp single bold *text*
    .replace(/\*\*([^*]+)\*\*/g, "*$1*")
    // Fix accidental double asterisk clutter
    .replace(/\*\s*\*/g, "*")
    .trim();
}

interface ProcessMessageParams {
  senderNumber: string;
  userText: string;
  pushName?: string;
  isVoiceNote?: boolean;
  visionMedia?: { base64: string; mimetype: string } | null;
  docMedia?: { base64: string; mimetype: string } | null;
  documentFileName?: string;
}

async function processMessage(params: ProcessMessageParams) {
  const {
    senderNumber,
    userText,
    pushName,
    isVoiceNote = false,
    visionMedia = null,
    docMedia = null,
    documentFileName,
  } = params;

  const lower = userText.toLowerCase();
  let replyTo = (senderNumber || FEMI_PERSONAL_NUMBER).replace(/@s\.whatsapp\.net|@lid|@g\.us/g, "").replace(/\D/g, "");
  if (!replyTo || replyTo.length > 13 || replyTo.length < 10) {
    replyTo = FEMI_PERSONAL_NUMBER;
  }

  const isFemi = replyTo === FEMI_PERSONAL_NUMBER;

  // Helper: send reply via WhatsApp + save to DB
  async function reply(text: string) {
    const formatted = cleanWhatsAppFormatting(text);
    await sendWhatsAppMessage(formatted, replyTo);
    if (isFemi) {
      try {
        await dbAddChatMessage({
          id: `wa-asst-${Date.now()}`,
          role: "assistant",
          content: formatted,
        });
      } catch {}
    }
  }

  // 1. Record incoming message in Neon DB
  const recordedUserText = userText && userText !== "[Image Received]" && userText !== "[Unclear Voice Note]"
    ? (visionMedia?.base64
        ? `[Attached Image] ${userText}`
        : docMedia?.base64
        ? `[Attached Document: ${documentFileName || "Document"}] ${userText}`
        : userText)
    : (visionMedia?.base64
        ? "[Attached Image]"
        : docMedia?.base64
        ? `[Attached Document: ${documentFileName || "Document"}]`
        : userText);

  try {
    await dbAddGuestMessage({
      id: `guest-msg-${Date.now()}`,
      phone_number: replyTo,
      sender_name: pushName || "User",
      role: "user",
      content: recordedUserText,
    });
    if (isFemi) {
      await dbAddChatMessage({
        id: `wa-user-${Date.now()}`,
        role: "user",
        content: recordedUserText,
      });
    }
  } catch (err) {
    console.warn("[WA] DB save error:", err);
  }

  // 2. Load conversation history
  const pastMessages = await dbGetGuestMessages(replyTo, 15);
  const historyText = pastMessages
    .slice(-10)
    .map((m) => `${m.role === "user" ? (pushName || "User") : "Obey"}: ${m.content}`)
    .join("\n");

  // Handle unclear voice notes
  if (userText === "[Unclear Voice Note]") {
    await reply(
      `🎙️ I received your voice note, but the audio was a bit faint or unclear. Could you please send it once more or type a quick summary?`
    );
    return;
  }

  // Handle Multimodal Vision (Photos, Screenshots, Invoices, Receipts)
  if (visionMedia?.base64) {
    try {
      const visionPrompt = `${historyText ? `PRIOR CONVERSATION CONTEXT:\n${historyText}\n\n` : ""}CURRENT ACTION: The user sent this image${userText && userText !== "[Image Received]" ? ` with note/question: "${userText}"` : ""}. Analyze this image thoroughly in relation to our ongoing conversation, extract any key details or text, and assist them directly with clarity and warmth.`;

      const aiRes = await executeAICompletionWithMedia({
        systemPrompt: "You are Obey, an autonomous AI executive companion equipped with computer vision. Analyze user screenshots, photos, documents, receipts, code, and diagrams with high precision, human warmth, and actionable clarity, connecting them directly with your ongoing conversation context.",
        userPrompt: visionPrompt,
        mediaBase64: visionMedia.base64,
        mimeType: visionMedia.mimetype || "image/jpeg",
        temperature: 0.4,
      });

      const visionReply = `👁️ *Image Analysis:*\n\n${aiRes.text}`;
      await reply(visionReply);

      try {
        await dbAddGuestMessage({
          id: `guest-img-${Date.now()}`,
          phone_number: replyTo,
          sender_name: "Obey",
          role: "assistant",
          content: visionReply,
        });
      } catch {}
      return;
    } catch (err: any) {
      console.error("[WA] Vision processing error:", err);
      await reply("I received your image, but had a momentary glitch analyzing the visual content. Could you send it once more?");
      return;
    }
  }

  // Handle Document Attachments (PDFs, CVs, Invoices, Contracts)
  if (docMedia?.base64) {
    try {
      const docPrompt = `${historyText ? `PRIOR CONVERSATION CONTEXT:\n${historyText}\n\n` : ""}CURRENT ACTION: The user sent this document (${documentFileName || "Attached Document"})${userText ? ` with note/question: "${userText}"` : ""}. Review its contents thoroughly in relation to our ongoing conversation, extract key details, or answer questions with executive clarity.`;

      const aiRes = await executeAICompletionWithMedia({
        systemPrompt: "You are Obey, an autonomous AI executive companion. Analyze attached documents, PDF contracts, resumes, and reports with sharp intelligence and structured clarity, connecting them directly with your ongoing conversation context.",
        userPrompt: docPrompt,
        mediaBase64: docMedia.base64,
        mimeType: docMedia.mimetype || "application/pdf",
        temperature: 0.3,
      });

      const docReply = `📄 *Document Review (${documentFileName || "Document"}):*\n\n${aiRes.text}`;
      await reply(docReply);

      try {
        await dbAddGuestMessage({
          id: `guest-doc-${Date.now()}`,
          phone_number: replyTo,
          sender_name: "Obey",
          role: "assistant",
          content: docReply,
        });
      } catch {}
      return;
    } catch (err: any) {
      console.error("[WA] Document processing error:", err);
      await reply("I received your document, but could not read the format. Please ensure it is a standard PDF or text document.");
      return;
    }
  }

  // 3. Proactive First-Contact Notification to Femi (in background)
  if (!isFemi && pastMessages.length <= 1) {
    try {
      const timeWAT = formatToWAT(new Date());
      const firstContactAlert =
        `👋 *New Contact Initiated Chat, Boss!*\n\n` +
        `• *Contact:* +${replyTo} ${pushName ? `(${pushName})` : ""}\n` +
        `• *Time:* ${timeWAT} (WAT)\n` +
        `• *First Message:* "${userText}"\n\n` +
        `_Obey is actively assisting them live as their personal agent companion._`;
      await sendWhatsAppMessage(firstContactAlert, FEMI_PERSONAL_NUMBER);
    } catch (e) {
      console.warn("[WA] First contact alert error:", e);
    }
  }

  // 4. Memory & Directives Listener (Taught in chat)
  const isReportingDirective =
    /\b(report|brief|alert|notification|notify)\b/i.test(lower) &&
    /\b(every|first time|meaningful|don't give me|dont give me|only send|stop sending|too many|conversat)\b/i.test(lower);

  const isExplicitMemoryDirective =
    /^(remember|never forget|note this|instruction|directive|from now on)\b/i.test(lower.trim());

  if (isReportingDirective || isExplicitMemoryDirective) {
    try {
      const currentInstructions = await getSetting("OBEY_CUSTOM_INSTRUCTIONS");
      let directiveToSave = "";

      if (isReportingDirective) {
        directiveToSave = "NOTIFICATION & REPORTING DIRECTIVE (Approved by Femi): Only alert Femi when a new contact messages for the first time, or when they reach a concrete milestone (e.g., share email/phone, request a call/meeting, or agree on project budget/scope). Never spam on intermediate conversational chatter.";
      } else {
        directiveToSave = userText.replace(/^(remember|never forget|note this|instruction|directive|from now on)[:\s]*/i, "").trim();
      }

      const updated = currentInstructions
        ? `${currentInstructions}\n• ${directiveToSave}`
        : `• ${directiveToSave}`;

      await setSetting("OBEY_CUSTOM_INSTRUCTIONS", updated);

      if (isReportingDirective) {
        await reply(
          `Understood and noted, Boss! 🎯\n\n` +
          `I have permanently committed this directive to my Neon DB memory:\n` +
          `• *Rule:* I will only alert you when a new person messages for the first time, or when they reach a concrete milestone (like sharing their contact details or requesting a call).\n` +
          `• *Status:* Active and saved in Obey Brain.\n\n` +
          `I will never spam you with intermediate conversational chatter, sir.`
        );
      } else {
        await reply(
          `Understood, Boss! 🧠 I have committed that to my permanent Neon DB memory:\n\n` +
          `"${directiveToSave}"\n\n` +
          `I will remember and apply this across all channels.`
        );
      }
      return;
    } catch (err: any) {
      console.error("[WA] Save directive error:", err);
    }
  }

  // 5. Special Femi Admin Commands
  if (isFemi) {
    if (lower.includes("morning brief") || lower.includes("morning report") || lower === "briefing") {
      try {
        await dispatchMorningBriefing();
        return;
      } catch (e: any) {
        await reply(`Boss, error running morning briefing: ${e.message}`);
        return;
      }
    }

    if (lower.includes("evening brief") || lower.includes("evening debrief") || lower.includes("wrap up") || lower.includes("wrapup")) {
      try {
        await dispatchEveningWrapup();
        return;
      } catch (e: any) {
        await reply(`Boss, error running evening wrapup: ${e.message}`);
        return;
      }
    }

    if (lower === "approve" || lower.includes("approve all") || lower.includes("clear all") || lower.includes("sign off")) {
      try {
        const allTasks = await getAgentTasks();
        const pending = allTasks.filter((t) => t.status === "pending_approval");
        if (pending.length > 0) {
          let executedCount = 0;
          for (const task of pending) {
            const res = await executeAgentTask(task.id, task.approval_token);
            if (res.success) executedCount++;
          }
          await reply(`Done, Boss! Execution confirmed.\n\n• *Items Cleared:* ${executedCount} task(s)\nAll authorized items have been dispatched!`);
          return;
        }
      } catch (e) {
        console.error("[WA] Approve error:", e);
      }
    }
  }

  // 6. DYNAMIC COMPANION ENGINE (Zero-Regex Universal Task & Companion Processing)
  try {
    const companionRes = await processDynamicCompanionTurn({
      userIdentifier: replyTo,
      userText,
      senderName: pushName,
      channel: "whatsapp",
      historyText,
    });

    const finalReply = companionRes.reply;

    if (finalReply && finalReply.trim()) {
      await reply(finalReply);
    }

    // Save assistant reply to guest DB
    await dbAddGuestMessage({
      id: `guest-asst-${Date.now()}`,
      phone_number: replyTo,
      sender_name: "Obey",
      role: "assistant",
      content: finalReply,
    });

    // Also dispatch to Google Sheets
    logToGoogleSheet({
      phoneNumber: replyTo,
      senderName: pushName,
      role: "assistant",
      message: finalReply,
    });
  } catch (err: any) {
    console.error("[WA] Dynamic companion error:", err);
    await reply("Please, I am busy right now. Check back with me in a moment. Thanks!");
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  console.log("[WA Webhook] Raw event:", JSON.stringify(body).slice(0, 300));

  const msgObj = Array.isArray(body?.data) ? body.data[0] : (body?.data || body);
  if (!msgObj || !msgObj.key) return NextResponse.json({ ok: true });

  // Ignore messages the bot itself sent (outgoing echo)
  if (msgObj.key?.fromMe) {
    return NextResponse.json({ ok: true });
  }

  // remoteJidAlt provides the actual phone JID (e.g. 2348120934828@s.whatsapp.net) when remoteJid is an LID
  const senderJid = msgObj.key?.remoteJidAlt || msgObj.key?.remoteJid || "";

  // Ignore broadcasts and groups
  if (senderJid.endsWith("@broadcast") || senderJid.endsWith("@g.us")) {
    return NextResponse.json({ ok: true });
  }

  let senderNumber = senderJid.replace(/@s\.whatsapp\.net|@g\.us|@lid/g, "").replace(/\D/g, "");

  // In WhatsApp multi-device, messages to linked accounts arrive with @lid (e.g. 164213964194040@lid).
  // If incoming JID is an internal WhatsApp LID, or not a valid E.164 phone length,
  // route directly to Femi's verified personal WhatsApp number (2348120934828):
  if (senderJid.endsWith("@lid") || !senderNumber || senderNumber.length > 13 || senderNumber.length < 10) {
    senderNumber = FEMI_PERSONAL_NUMBER;
  }

  let userText = (
    msgObj.message?.conversation ||
    msgObj.message?.extendedTextMessage?.text ||
    msgObj.message?.imageMessage?.caption ||
    msgObj.message?.documentMessage?.caption ||
    ""
  ).trim();

  const isAudio = Boolean(msgObj.message?.audioMessage);
  const isImage = Boolean(msgObj.message?.imageMessage);
  const isDoc = Boolean(msgObj.message?.documentMessage || msgObj.message?.documentWithCaptionMessage);

  if (!userText && !isAudio && !isImage && !isDoc) {
    return NextResponse.json({ ok: true });
  }

  console.log(`[WA Webhook] Incoming from ${senderNumber}: "${userText || (isAudio ? '[Audio]' : isImage ? '[Image]' : '[Doc]')}"`);

  after(async () => {
    try {
      let activeText = userText;
      let isVoiceNote = false;
      let visionMedia: { base64: string; mimetype: string } | null = null;
      let docMedia: { base64: string; mimetype: string } | null = null;

      // 1. Voice Note Transcription
      if (isAudio) {
        const media = await fetchEvolutionMediaBase64(msgObj);
        if (media?.base64) {
          const transRes = await transcribeAudio(media.base64, media.mimetype || "audio/ogg");
          if (transRes.success && transRes.text) {
            activeText = transRes.text;
            isVoiceNote = true;
          } else {
            activeText = "[Unclear Voice Note]";
          }
        } else {
          activeText = "[Unclear Voice Note]";
        }
      }

      // 2. Multimodal Vision (Photos, Screenshots)
      if (isImage) {
        visionMedia = await fetchEvolutionMediaBase64(msgObj);
        if (!activeText) activeText = "[Image Received]";
      }

      // 3. Documents (PDFs, CVs, Invoices)
      if (isDoc) {
        docMedia = await fetchEvolutionMediaBase64(msgObj);
        if (!activeText) activeText = "[Document Received]";
      }

      await processMessage({
        senderNumber,
        userText: activeText,
        pushName: msgObj.pushName,
        isVoiceNote,
        visionMedia,
        docMedia,
        documentFileName: msgObj.message?.documentMessage?.fileName,
      });
    } catch (err) {
      console.error("[WA] processMessage background task error:", err);
    }
  });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({
    status: "active",
    service: "Obey WhatsApp Webhook Gateway",
    endpoint: "/api/obey/whatsapp/webhook",
    linkedNumber: "2349161488564",
    femiPersonal: "2348120934828",
  });
}
