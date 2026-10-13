import { NextRequest, NextResponse } from "next/server";
import { executeAICompletion } from "@/lib/ai-orchestrator";
import { dbAddChatMessage, dbGetChatMessages } from "@/lib/db";
import { sendWhatsAppMessage } from "@/lib/whatsapp-gateway";
import { runUpworkLiveScout } from "@/lib/upwork-scout";
import { runB2BLeadHunter } from "@/lib/apollo-hunter";
import { runGmailInboxSync } from "@/lib/gmail-reader";

// Femi's personal WhatsApp number (the one he messages FROM)
const FEMI_PERSONAL_NUMBER = "2348120934828";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    console.log("[WA Webhook] Received payload:", JSON.stringify(body).slice(0, 500));

    // Evolution API MESSAGES_UPSERT structure: body.data holds the message
    const data = body?.data;
    if (!data) return NextResponse.json({ ok: true });

    // The JID (phone@s.whatsapp.net) of who sent the message
    const senderJid = data.key?.remoteJid || "";
    // Strip WhatsApp domain suffix to get a clean E.164 number
    const senderNumber = senderJid.replace(/@s\.whatsapp\.net|@g\.us/g, "");

    // Ignore status broadcasts and groups for now
    if (senderJid.endsWith("@broadcast") || senderJid.endsWith("@g.us")) {
      return NextResponse.json({ ok: true });
    }

    // Ignore echo messages the bot sent itself — UNLESS it's from Femi's
    // personal number messaging the linked bot number (fromMe = true in that
    // context), which shouldn't happen but guard anyway.
    if (data.key?.fromMe && senderNumber !== FEMI_PERSONAL_NUMBER) {
      return NextResponse.json({ ok: true });
    }

    // Extract text content (plain conversation or extended text)
    const userText = (
      data.message?.conversation ||
      data.message?.extendedTextMessage?.text ||
      ""
    ).trim();

    if (!userText) {
      return NextResponse.json({ ok: true });
    }

    console.log(`[WA Webhook] Message from ${senderNumber}: "${userText}"`);

    const lower = userText.toLowerCase();

    // Determine who to reply to — always reply to the sender
    const replyTo = senderNumber || FEMI_PERSONAL_NUMBER;

    // 1. Save incoming message to Neon DB Cloud Memory
    await dbAddChatMessage({
      id: `wa-${Date.now()}`,
      role: "user",
      content: `[WhatsApp from ${replyTo}] ${userText}`,
    });

    // Helper: send and save reply
    async function reply(text: string) {
      await sendWhatsAppMessage(text, replyTo);
      await dbAddChatMessage({
        id: `wa-asst-${Date.now()}`,
        role: "assistant",
        content: text,
      });
    }

    // 2. Command: Scout Upwork
    if (lower.includes("scout upwork") || lower.includes("find job")) {
      const scoutRes = await runUpworkLiveScout();
      const tasks = scoutRes.tasks || [];

      if (tasks.length === 0) {
        await reply("I scanned the Upwork feeds, sir, but couldn't find fresh listings in this run. I'll notify you as soon as new gigs drop!");
        return NextResponse.json({ ok: true });
      }

      const firstTask = tasks[0];
      const msg =
        `Right away, sir! I captured *${tasks.length} high-value Upwork contracts* matching your stack!\n\n` +
        `*Top Match:* ${firstTask.title}\n` +
        `*Company:* ${firstTask.target_company || "Upwork Client"}\n\n` +
        `*Proposal Draft:*\n${firstTask.payload?.slice(0, 350)}...\n\n` +
        `_Reply with 'approve' on Telegram or open your Command Center to send._`;
      await reply(msg);
      return NextResponse.json({ ok: true });
    }

    // 3. Command: Check Gmail Inbox
    if (
      lower.includes("check email") ||
      lower.includes("check gmail") ||
      lower.includes("read mail") ||
      lower.includes("inbox")
    ) {
      const syncRes = await runGmailInboxSync();
      const emails = syncRes.emails || [];

      if (emails.length === 0) {
        await reply("I reviewed your inbox, sir! No pending unread client emails at the moment. All clear!");
        return NextResponse.json({ ok: true });
      }

      const target = emails[0];
      const msg =
        `Here is the latest message from your inbox, sir:\n\n` +
        `*From:* ${target.sender} (${target.senderEmail})\n` +
        `*Subject:* ${target.subject}\n` +
        `*Summary:* ${target.summary}\n\n` +
        `*Drafted Reply:*\n"${target.draftReply.slice(0, 300)}..."`;
      await reply(msg);
      return NextResponse.json({ ok: true });
    }

    // 4. Command: Hunt B2B Leads
    if (
      lower.includes("hunt lead") ||
      lower.includes("hunt b2b") ||
      lower.includes("cold email")
    ) {
      const huntRes = await runB2BLeadHunter({ industry: "E-Commerce & Digital Logistics" });
      const tasks = huntRes.tasks || [];

      if (tasks.length === 0) {
        await reply("No fresh B2B leads captured in this run, sir. Let me know if you want me to search another niche.");
        return NextResponse.json({ ok: true });
      }

      const firstTask = tasks[0];
      const msg =
        `Done, sir! I scouted decision-makers and drafted cold outreach pitches.\n\n` +
        `*Target:* ${firstTask.target_name} (${firstTask.target_email})\n` +
        `*Company:* ${firstTask.target_company}\n` +
        `*Subject:* ${firstTask.subject}\n\n` +
        `*Pitch:*\n${firstTask.payload?.slice(0, 300)}...`;
      await reply(msg);
      return NextResponse.json({ ok: true });
    }

    // 5. General Conversational Brain (Obey AI)
    const now = new Date();
    const watHour = (now.getUTCHours() + 1) % 24;
    let timeGreeting = "Good afternoon, sir";
    if (watHour >= 5 && watHour < 12) timeGreeting = "Good morning, sir";
    else if (watHour >= 12 && watHour < 17) timeGreeting = "Good afternoon, sir";
    else timeGreeting = "Good evening, sir";

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
      ? `Recent dialogue context:\n${conversationHistory}\n\nFemi texts on WhatsApp: "${userText}"\n\nObey (respond warmly and concisely for mobile):`
      : userText;

    const aiRes = await executeAICompletion({
      systemPrompt,
      userPrompt: promptWithContext,
      temperature: 0.7,
    });

    await reply(aiRes.text);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("WhatsApp webhook error:", err);
    return NextResponse.json({ error: err.message }, { status: 200 });
  }
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
