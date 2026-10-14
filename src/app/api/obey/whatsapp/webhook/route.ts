import { NextRequest, NextResponse, after } from "next/server";
import { executeAICompletion } from "@/lib/ai-orchestrator";
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
import { sendWhatsAppMessage } from "@/lib/whatsapp-gateway";
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

async function processMessage(senderNumber: string, userText: string, pushName?: string) {
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

  // Voice note acknowledgment
  if (userText === "[Voice Note Received]") {
    await reply(
      `🎙️ *Voice Note Received!*\n\n` +
      `I can hear you! I am analyzing and processing voice messages. To trigger instant actions right now, you can also send quick text commands like:\n` +
      `• *Send WhatsApp to [number] saying [message]*\n` +
      `• *Send email to [email] saying [message]*\n` +
      `• *Check my Gmail inbox*\n` +
      `• *Scout Upwork jobs*`
    );
    return;
  }

  // 1. Record incoming message in Neon DB
  try {
    await dbAddGuestMessage({
      id: `guest-msg-${Date.now()}`,
      phone_number: replyTo,
      sender_name: pushName || "User",
      role: "user",
      content: userText,
    });
  } catch (err) {
    console.warn("[WA] DB save error:", err);
  }

  // 2. Load conversation history
  const pastMessages = await dbGetGuestMessages(replyTo, 15);
  const historyText = pastMessages
    .slice(-10)
    .map((m) => `${m.role === "user" ? (pushName || "User") : "Obey"}: ${m.content}`)
    .join("\n");

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

    await reply(companionRes.reply);

    // Save assistant reply to guest DB
    await dbAddGuestMessage({
      id: `guest-asst-${Date.now()}`,
      phone_number: replyTo,
      sender_name: "Obey",
      role: "assistant",
      content: companionRes.reply,
    });

    // Also dispatch to Google Sheets
    logToGoogleSheet({
      phoneNumber: replyTo,
      senderName: pushName,
      role: "assistant",
      message: companionRes.reply,
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
    ""
  ).trim();

  const isAudio = Boolean(msgObj.message?.audioMessage);
  if (!userText && isAudio) {
    userText = "[Voice Note Received]";
  }

  if (!userText) {
    return NextResponse.json({ ok: true });
  }

  console.log(`[WA Webhook] Incoming from ${senderNumber}: "${userText}"`);

  after(async () => {
    try {
      await processMessage(senderNumber, userText, msgObj.pushName);
    } catch (err) {
      console.error("[WA] processMessage error:", err);
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
