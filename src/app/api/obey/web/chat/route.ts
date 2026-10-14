import { NextRequest, NextResponse } from "next/server";
import { executeAICompletion } from "@/lib/ai-orchestrator";
import { dbAddGuestMessage, dbGetGuestMessages, dbAddLead } from "@/lib/db";
import { sendWhatsAppMessage } from "@/lib/whatsapp-gateway";
import { logToGoogleSheet } from "@/lib/sheets-logger";

const FEMI_PERSONAL_NUMBER = "2348120934828";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, visitorName, visitorEmail, message } = body;

    const userText = (message || "").trim();
    if (!sessionId || !userText) {
      return NextResponse.json({ ok: false, error: "Missing sessionId or message" }, { status: 400 });
    }

    const contactId = `web-${sessionId}`;
    const displayName = visitorName || "Web Visitor";

    // 1. Save visitor message to Neon DB
    await dbAddGuestMessage({
      id: `web-msg-${Date.now()}`,
      phone_number: contactId,
      sender_name: displayName,
      channel: "web",
      role: "user",
      content: userText,
    });

    // 2. Dispatch to Google Sheets
    logToGoogleSheet({
      phoneNumber: contactId,
      senderName: displayName,
      role: "user",
      message: userText,
      intent: "Website Live Chat",
    });

    // 3. Load previous dialogue for this web session
    const pastMessages = await dbGetGuestMessages(contactId, 12);
    const historyText = pastMessages
      .slice(-8)
      .map((m) => `${m.role === "user" ? displayName : "Obey"}: ${m.content}`)
      .join("\n");

    const systemPrompt = `You are Obey, executive associate and operations lead working directly with Femi Adeleke (full-stack software engineer & automation architect).
You are chatting with a visitor in real-time on Femi's website.

CRITICAL BEHAVIOR RULES:
1. ACT 100% HUMAN: Do NOT state or imply that you are an AI, bot, virtual assistant, or language model. Speak warmly, naturally, and professionally like a sharp, thoughtful human colleague.
2. REPRESENT FEMI EXPERTLY: Know Femi's key strengths: Full-Stack Web Apps (Next.js, React, Node.js, TypeScript), Custom AI Agents, Automated Workflows (n8n), Database Architecture (PostgreSQL/Neon), and scalable MVPs (AutoLearn Spot, OKIKI Store, PassMark).
3. QUALIFY GENTLY: If they want to build something, ask about their target timeline or project requirements. Encourage them to leave their email so Femi and you can follow up with a proposal or schedule a brief discovery call.
4. NATURAL & CONCISE: Keep replies engaging, concise (2 to 4 sentences), and easy to read.`;

    const userPrompt = historyText
      ? `Previous conversation on website with ${displayName}:\n${historyText}\n\nTheir new message: "${userText}"\n\nObey (warm, human, helpful):`
      : `New website visitor (${displayName}): "${userText}"\n\nObey (warm, human, helpful):`;

    const aiRes = await executeAICompletion({
      systemPrompt,
      userPrompt,
      temperature: 0.7,
    });

    const replyText = aiRes.text;

    // 4. Save assistant reply to DB
    await dbAddGuestMessage({
      id: `web-asst-${Date.now()}`,
      phone_number: contactId,
      sender_name: "Obey",
      channel: "web",
      role: "assistant",
      content: replyText,
    });

    // 5. Dispatch to Google Sheets
    logToGoogleSheet({
      phoneNumber: contactId,
      senderName: "Obey",
      role: "assistant",
      message: replyText,
      intent: "Website Live Chat",
    });

    // 6. Check High-Intent Triggers for Instant WhatsApp Executive Alert to Femi
    const isHighIntent =
      /\b(\$|₦|budget|quote|cost|pricing|dollars|naira|hire|contract|urgent|proposal|scope|timeline)\b/i.test(userText) ||
      /\b(call|meet|zoom|google meet|schedule|appointment)\b/i.test(userText) ||
      /@|(\+?\d{10,13})/i.test(userText);

    if (isHighIntent) {
      try {
        const summaryRes = await executeAICompletion({
          systemPrompt: "You are Obey. Synthesize a 2-line executive briefing for Femi about this website visitor inquiry, including their goal, budget/timeline, and contact details if shared.",
          userPrompt: `Web Chat with ${displayName} (Email: ${visitorEmail || "Not provided yet"}):\n${historyText}\nLatest: "${userText}"`,
          temperature: 0.4,
        });

        const alertMsg =
          `🌐 *New Web Visitor Alert, Boss!*\n\n` +
          `• *Visitor:* ${displayName} ${visitorEmail ? `(${visitorEmail})` : ""}\n` +
          `• *Executive Summary:*\n${summaryRes.text}\n\n` +
          `_View full dialogue and reply live in your Admin Omnichannel Inbox!_`;

        await sendWhatsAppMessage(alertMsg, FEMI_PERSONAL_NUMBER);
      } catch (err) {
        console.error("[Web Chat Alert Error]:", err);
      }

      // Log/Update Lead in Neon DB
      try {
        await dbAddLead({
          id: `lead-web-${sessionId.slice(0, 12)}`,
          name: displayName,
          email: visitorEmail || `web-visitor-${sessionId.slice(0, 8)}@femiadeleke.site`,
          notes: `Web Chat Inquiry: "${userText.slice(0, 200)}"`,
          status: "qualified",
          service_needed: "Web / AI Consultation",
        });
      } catch {}
    }

    return NextResponse.json({ ok: true, reply: replyText });
  } catch (err: any) {
    console.error("[Web Chat API Error]:", err);
    return NextResponse.json(
      { ok: false, reply: "Hey there! Thanks for reaching out. Femi and I are currently reviewing client deliverables—please leave your email or inquiry here and we'll get right back to you!" },
      { status: 500 }
    );
  }
}
