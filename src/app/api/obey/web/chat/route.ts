import { NextRequest, NextResponse } from "next/server";
import { executeAICompletion } from "@/lib/ai-orchestrator";
import { dbAddGuestMessage, dbGetGuestMessages, dbAddLead } from "@/lib/db";
import { sendWhatsAppMessage } from "@/lib/whatsapp-gateway";
import { logToGoogleSheet } from "@/lib/sheets-logger";
import { formatToWAT } from "@/lib/utils";
import { getObeyBrainContext } from "@/lib/settings";

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

    const mediaBase64 = body.mediaBase64;
    const mediaMimeType = body.mediaMimeType;
    const mediaFileName = body.mediaFileName || "attachment";

    const savedUserContent = mediaBase64
      ? `${userText ? `${userText}\n` : ""}[📎 Attached: ${mediaFileName}]`
      : userText;

    // 1. Save visitor message to Neon DB
    await dbAddGuestMessage({
      id: `web-msg-${Date.now()}`,
      phone_number: contactId,
      sender_name: displayName,
      channel: "web",
      role: "user",
      content: savedUserContent,
    });

    // 2. Dispatch to Google Sheets
    logToGoogleSheet({
      phoneNumber: contactId,
      senderName: displayName,
      role: "user",
      message: savedUserContent,
      intent: "Website Live Chat",
    });

    // 3. Load previous dialogue for this web session & Obey Brain
    const [pastMessages, brain] = await Promise.all([
      dbGetGuestMessages(contactId, 12),
      getObeyBrainContext(),
    ]);

    const historyText = pastMessages
      .slice(-8)
      .map((m) => `${m.role === "user" ? displayName : "Obey"}: ${m.content}`)
      .join("\n");

    const systemPrompt = `You are Obey, executive associate and operations lead working directly with Femi Adeleke (full-stack software engineer & automation architect).
You are chatting with a visitor in real-time on Femi's website.

CRITICAL BEHAVIOR RULES:
1. ACT 100% HUMAN: Do NOT state or imply that you are an AI, bot, virtual assistant, or language model. Speak warmly, naturally, and professionally like a sharp, thoughtful human colleague.
2. GENDER NEUTRAL: Do NOT call visitors "sir" or "ma". Use natural, polite, and neutral language: "Hello", "Hey there", "Glad to connect".
3. OFFICIAL PORTFOLIO LINK: Femi's official live portfolio website is: https://femiadelekeportfolio.vercel.app. Never invent any other URL.
4. REPRESENT FEMI EXPERTLY: Know Femi's key strengths: Full-Stack Web Apps (Next.js, React, Node.js, TypeScript), Custom AI Agents, Automated Workflows (n8n), Database Architecture (PostgreSQL/Neon), and scalable MVPs (AutoLearn Spot, OKIKI Store, PassMark).
5. CALLING OPTIONS: If they ask to speak or call Femi or Obey, provide Option 1: Direct Hotline +1 (302) 927 8209 (carrier rates apply) and Option 2: 100% Free Instant Voice Call via WebRTC at /call.
6. QUALIFY GENTLY: If they want to build something, ask about their target timeline or project requirements. Encourage them to leave their email or WhatsApp number so Femi and you can follow up with a proposal or schedule a brief discovery call.
7. NATURAL & CONCISE: Keep replies engaging, concise (2 to 4 sentences), and easy to read.${brain.formattedPrompt ? `\n\n${brain.formattedPrompt}` : ""}`;

    const userPrompt = historyText
      ? `Previous conversation on website with ${displayName}:\n${historyText}\n\nTheir new message: "${userText}"${mediaBase64 ? ` (User also attached file: ${mediaFileName})` : ""}\n\nObey (warm, human, helpful):`
      : `New website visitor (${displayName}): "${userText}"${mediaBase64 ? ` (User also attached file: ${mediaFileName})` : ""}\n\nObey (warm, human, helpful):`;

    const aiRes = await executeAICompletion({
      systemPrompt,
      userPrompt,
      temperature: 0.7,
      mediaBase64,
      mimeType: mediaMimeType,
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

    // 6. Proactive Executive Alert to Femi's WhatsApp (Triggers as soon as visitor engages or asks to connect)
    const isLeadInquiry =
      /\b(connect|femi|speak|talk|reach|call|meet|zoom|schedule|appointment|book|hire|work with|collaborate)\b/i.test(userText) ||
      /\b(build|develop|app|website|ecommerce|platform|system|bot|agent|software|price|pricing|cost|charge|how much|budget|quote|\$|₦|naira|dollars)\b/i.test(userText) ||
      /@|(\+?\d{10,14})/i.test(userText) ||
      pastMessages.length >= 2;

    if (isLeadInquiry) {
      try {
        const summaryRes = await executeAICompletion({
          systemPrompt: "You are Obey. Synthesize a 2-line executive briefing for Femi about this website visitor inquiry: what they want to build, their goal or question, and contact details if provided.",
          userPrompt: `Web Chat with ${displayName} (Email: ${visitorEmail || "Not provided yet"}):\n${historyText}\nLatest: "${userText}"`,
          temperature: 0.4,
        });

        const timeWAT = formatToWAT(new Date());

        const alertMsg =
          `🌐 *New Web Visitor Alert, Boss!*\n\n` +
          `• *Visitor:* ${displayName} ${visitorEmail ? `(${visitorEmail})` : ""}\n` +
          `• *Time:* ${timeWAT} (WAT)\n` +
          `• *Executive Briefing:*\n${summaryRes.text}\n\n` +
          `_View full live dialogue & reply in your Admin Omnichannel Inbox!_`;

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
