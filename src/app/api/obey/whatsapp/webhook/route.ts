import { NextRequest, NextResponse } from "next/server";
import { executeAICompletion } from "@/lib/ai-orchestrator";
import { dbAddChatMessage, dbGetChatMessages } from "@/lib/db";
import { sendWhatsAppMessage } from "@/lib/whatsapp-gateway";
import { runUpworkLiveScout } from "@/lib/upwork-scout";
import { runB2BLeadHunter } from "@/lib/apollo-hunter";
import { runGmailInboxSync } from "@/lib/gmail-reader";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Evolution API messages upsert structure
    const data = body?.data;
    if (!data) return NextResponse.json({ ok: true });

    // Ignore messages sent by the bot itself (key.fromMe = true)
    if (data.key?.fromMe) {
      return NextResponse.json({ ok: true });
    }

    const senderJid = data.key?.remoteJid || "";
    const senderNumber = senderJid.replace(/@s\.whatsapp\.net|@g\.us/g, "");

    // Extract text content from WhatsApp message
    const userText = (
      data.message?.conversation ||
      data.message?.extendedTextMessage?.text ||
      ""
    ).trim();

    if (!userText) {
      return NextResponse.json({ ok: true });
    }

    const lower = userText.toLowerCase();

    // 1. Save Femi's WhatsApp message to Neon DB Cloud Memory
    await dbAddChatMessage({
      id: `wa-${Date.now()}`,
      role: "user",
      content: userText,
    });

    // 2. Command: Scout Upwork
    if (lower.includes("scout upwork") || lower.includes("find job")) {
      const scoutRes = await runUpworkLiveScout();
      const tasks = scoutRes.tasks || [];

      if (tasks.length === 0) {
        await sendWhatsAppMessage("I scanned the Upwork feeds, sir, but couldn't find fresh listings in this run. I'll notify you as soon as new gigs drop!");
        return NextResponse.json({ ok: true });
      }

      const firstTask = tasks[0];
      const reply = `Right away, sir! I captured *${tasks.length} high-value Upwork contracts* matching your stack!\n\n` +
        `*Top Match:* ${firstTask.title}\n` +
        `*Company:* ${firstTask.target_company || "Upwork Client"}\n\n` +
        `*Proposal Draft:*\n${firstTask.payload?.slice(0, 350)}...\n\n` +
        `_Reply with 'approve' on Telegram or open your Command Center to send._`;

      await sendWhatsAppMessage(reply);
      return NextResponse.json({ ok: true });
    }

    // 3. Command: Check Gmail Inbox
    if (lower.includes("check email") || lower.includes("check gmail") || lower.includes("read mail") || lower.includes("inbox")) {
      const syncRes = await runGmailInboxSync();
      const emails = syncRes.emails || [];

      if (emails.length === 0) {
        await sendWhatsAppMessage("I reviewed your inbox, sir! No pending unread client emails at the moment. All clear!");
        return NextResponse.json({ ok: true });
      }

      const target = emails[0];
      const reply = `Here is the latest message from your inbox, sir:\n\n` +
        `*From:* ${target.sender} (${target.senderEmail})\n` +
        `*Subject:* ${target.subject}\n` +
        `*Summary:* ${target.summary}\n\n` +
        `*Drafted Reply:*\n"${target.draftReply.slice(0, 300)}..."`;

      await sendWhatsAppMessage(reply);
      return NextResponse.json({ ok: true });
    }

    // 4. Command: Hunt B2B Leads
    if (lower.includes("hunt lead") || lower.includes("hunt b2b") || lower.includes("cold email")) {
      const huntRes = await runB2BLeadHunter({ industry: "E-Commerce & Digital Logistics" });
      const tasks = huntRes.tasks || [];

      if (tasks.length === 0) {
        await sendWhatsAppMessage("No fresh B2B leads captured in this run, sir. Let me know if you want me to search another niche.");
        return NextResponse.json({ ok: true });
      }

      const firstTask = tasks[0];
      const reply = `Done, sir! I scouted decision-makers and drafted cold outreach pitches.\n\n` +
        `*Target:* ${firstTask.target_name} (${firstTask.target_email})\n` +
        `*Company:* ${firstTask.target_company}\n` +
        `*Subject:* ${firstTask.subject}\n\n` +
        `*Pitch:*\n${firstTask.payload?.slice(0, 300)}...`;

      await sendWhatsAppMessage(reply);
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
- Keep your answers clean, supportive, confident, and readable on mobile.
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

    const replyText = aiRes.text;

    // Save Obey's reply in Neon DB
    await dbAddChatMessage({
      id: `wa-asst-${Date.now()}`,
      role: "assistant",
      content: replyText,
    });

    // Send reply back to Femi on WhatsApp
    await sendWhatsAppMessage(replyText);

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
  });
}
