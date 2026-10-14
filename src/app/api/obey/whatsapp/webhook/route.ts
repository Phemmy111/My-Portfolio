import { NextRequest, NextResponse, after } from "next/server";
import { executeAICompletion } from "@/lib/ai-orchestrator";
import { dbAddChatMessage, dbGetChatMessages } from "@/lib/db";
import { sendWhatsAppMessage } from "@/lib/whatsapp-gateway";
import { runUpworkLiveScout } from "@/lib/upwork-scout";
import { runB2BLeadHunter } from "@/lib/apollo-hunter";
import { runGmailInboxSync } from "@/lib/gmail-reader";

// Tell Next.js to use the Edge-compatible streaming runtime so we can
// respond instantly and keep processing in the background.
export const maxDuration = 60; // seconds — Vercel Hobby allows up to 60s on API routes

// Femi's personal WhatsApp number (the one he messages FROM)
const FEMI_PERSONAL_NUMBER = "2348120934828";

async function processMessage(senderNumber: string, userText: string) {
  const lower = userText.toLowerCase();
  let replyTo = (senderNumber || FEMI_PERSONAL_NUMBER).replace(/@s\.whatsapp\.net|@lid|@g\.us/g, "").replace(/\D/g, "");
  if (!replyTo || replyTo.length > 13 || replyTo.length < 10) {
    replyTo = FEMI_PERSONAL_NUMBER;
  }

  // Save incoming message to Neon DB
  try {
    await dbAddChatMessage({
      id: `wa-${Date.now()}`,
      role: "user",
      content: `[WhatsApp from ${replyTo}] ${userText}`,
    });
  } catch (e) {
    console.error("[WA] DB save error:", e);
  }

  // Helper: send reply via WhatsApp + save to DB
  async function reply(text: string) {
    await sendWhatsAppMessage(text, replyTo);
    try {
      await dbAddChatMessage({
        id: `wa-asst-${Date.now()}`,
        role: "assistant",
        content: text,
      });
    } catch {}
  }

  // Command: Scout Upwork
  if (lower.includes("scout upwork") || lower.includes("find job")) {
    try {
      const scoutRes = await runUpworkLiveScout();
      const tasks = scoutRes.tasks || [];
      if (tasks.length === 0) {
        await reply("I scanned the Upwork feeds, sir, but couldn't find fresh listings in this run. I'll notify you as soon as new gigs drop!");
      } else {
        const firstTask = tasks[0];
        await reply(
          `Right away, sir! I captured *${tasks.length} high-value Upwork contracts* matching your stack!\n\n` +
          `*Top Match:* ${firstTask.title}\n` +
          `*Company:* ${firstTask.target_company || "Upwork Client"}\n\n` +
          `*Proposal Draft:*\n${firstTask.payload?.slice(0, 350)}...\n\n` +
          `_Reply with 'approve' on Telegram or open your Command Center to send._`
        );
      }
    } catch (e: any) {
      await reply(`Sorry sir, I ran into an issue scanning Upwork: ${e.message}`);
    }
    return;
  }

  // Command: Check Gmail Inbox
  if (
    lower.includes("check email") ||
    lower.includes("check gmail") ||
    lower.includes("read mail") ||
    lower.includes("inbox")
  ) {
    try {
      const syncRes = await runGmailInboxSync();
      const emails = syncRes.emails || [];
      if (emails.length === 0) {
        await reply("I reviewed your inbox, sir! No pending unread client emails at the moment. All clear!");
      } else {
        const target = emails[0];
        await reply(
          `Here is the latest message from your inbox, sir:\n\n` +
          `*From:* ${target.sender} (${target.senderEmail})\n` +
          `*Subject:* ${target.subject}\n` +
          `*Summary:* ${target.summary}\n\n` +
          `*Drafted Reply:*\n"${target.draftReply.slice(0, 300)}..."`
        );
      }
    } catch (e: any) {
      await reply(`Sorry sir, I couldn't read your inbox right now: ${e.message}`);
    }
    return;
  }

  // Command: Hunt B2B Leads
  if (
    lower.includes("hunt lead") ||
    lower.includes("hunt b2b") ||
    lower.includes("cold email")
  ) {
    try {
      const huntRes = await runB2BLeadHunter({ industry: "E-Commerce & Digital Logistics" });
      const tasks = huntRes.tasks || [];
      if (tasks.length === 0) {
        await reply("No fresh B2B leads captured in this run, sir. Let me know if you want me to search another niche.");
      } else {
        const firstTask = tasks[0];
        await reply(
          `Done, sir! I scouted decision-makers and drafted cold outreach pitches.\n\n` +
          `*Target:* ${firstTask.target_name} (${firstTask.target_email})\n` +
          `*Company:* ${firstTask.target_company}\n` +
          `*Subject:* ${firstTask.subject}\n\n` +
          `*Pitch:*\n${firstTask.payload?.slice(0, 300)}...`
        );
      }
    } catch (e: any) {
      await reply(`Sorry sir, lead hunting hit a snag: ${e.message}`);
    }
    return;
  }

  // General Conversational Brain
  const now = new Date();
  const watHour = (now.getUTCHours() + 1) % 24;
  let timeGreeting = "Good afternoon, sir";
  if (watHour >= 5 && watHour < 12) timeGreeting = "Good morning, sir";
  else if (watHour >= 17 || watHour < 5) timeGreeting = "Good evening, sir";

  const systemPrompt = `You are Obey, Femi Adeleke's dedicated, emotionally intelligent personal AI executive assistant chatting with him directly on his phone via WhatsApp.
- Address Femi with high respect and genuine human warmth: call him "sir" or "Boss".
- Keep your answers clean, supportive, confident, and readable on mobile (short paragraphs, no walls of text).
- Provide strategic advice, authentic encouragement, and emotional support.
- Know Femi's key projects: AutoLearn Spot, OKIKI Store, PassMark UTME Prep App, and n8n automations.
- Current Time: Local West Africa Time ~${watHour}:00. Greeting: "${timeGreeting}".`;

  let conversationHistory = "";
  try {
    const rows = await dbGetChatMessages(8);
    if (rows && rows.length > 0) {
      conversationHistory = rows
        .slice(-5)
        .map((r: any) => `${r.role === "user" ? "Femi" : "Obey"}: ${r.content}`)
        .join("\n\n");
    }
  } catch {}

  const promptWithContext = conversationHistory
    ? `Recent dialogue:\n${conversationHistory}\n\nFemi on WhatsApp: "${userText}"\n\nObey (concise, warm, mobile-friendly):`
    : userText;

  try {
    const aiRes = await executeAICompletion({
      systemPrompt,
      userPrompt: promptWithContext,
      temperature: 0.7,
    });
    await reply(aiRes.text);
  } catch (e: any) {
    console.error("[WA] AI error:", e);
    await reply(`${timeGreeting}! I received your message, sir, but hit a brief glitch processing it. Please try again in a moment.`);
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

  const userText = (
    msgObj.message?.conversation ||
    msgObj.message?.extendedTextMessage?.text ||
    msgObj.message?.imageMessage?.caption ||
    ""
  ).trim();

  if (!userText) {
    return NextResponse.json({ ok: true });
  }

  console.log(`[WA Webhook] Incoming from ${senderNumber}: "${userText}"`);

  after(async () => {
    try {
      await processMessage(senderNumber, userText);
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
