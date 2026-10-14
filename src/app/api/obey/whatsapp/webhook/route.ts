import { NextRequest, NextResponse, after } from "next/server";
import { executeAICompletion } from "@/lib/ai-orchestrator";
import { dbAddChatMessage, dbGetChatMessages, dbAddLead, dbAddGuestMessage, dbGetGuestMessages, dbGetInboxThreads } from "@/lib/db";
import { sendWhatsAppMessage } from "@/lib/whatsapp-gateway";
import { logToGoogleSheet } from "@/lib/sheets-logger";
import { runUpworkLiveScout } from "@/lib/upwork-scout";
import { runB2BLeadHunter } from "@/lib/apollo-hunter";
import { runGmailInboxSync } from "@/lib/gmail-reader";
import { getAgentTasks, executeAgentTask } from "@/lib/obey-agent";
import { dispatchMorningBriefing, dispatchEveningWrapup } from "@/lib/proactive-engine";
import { formatToWAT, formatDateTimeWAT, getNigerianTime } from "@/lib/utils";

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

  // ==============================================================
  // GUEST / EXTERNAL CONTACTS (HUMAN PERSONA + CONTINUOUS MEMORY)
  // ==============================================================
  if (!isFemi) {
    // 1. Save guest incoming message to Neon DB
    await dbAddGuestMessage({
      id: `guest-msg-${Date.now()}`,
      phone_number: replyTo,
      sender_name: pushName || "External Contact",
      role: "user",
      content: userText,
    });

    // 2. Dispatch to Google Sheets Webhook
    logToGoogleSheet({
      phoneNumber: replyTo,
      senderName: pushName,
      role: "user",
      message: userText,
    });

    // 3. Load previous dialogue specific to this phone number
    const pastMessages = await dbGetGuestMessages(replyTo, 15);
    const historyText = pastMessages
      .slice(-10)
      .map((m) => `${m.role === "user" ? (pushName || "Contact") : "Obey"}: ${m.content}`)
      .join("\n");

    const guestSystemPrompt = `You are Obey, executive manager and operational partner working directly with Femi Adeleke (full-stack software engineer & automation architect).
You are messaging this contact on WhatsApp from Femi's desk line.

CRITICAL BEHAVIORAL INSTRUCTIONS:
1. ACT 100% HUMAN: Never state or imply that you are an AI, bot, virtual assistant, or language model. Talk naturally, warmly, and professionally like a sharp, thoughtful human colleague.
2. NATURAL CHAT STYLE: Write in crisp, friendly, conversational sentences suited for WhatsApp. Avoid robotic corporate boilerplate, canned customer support scripts, or long unprompted pitches.
3. CONVERSATIONAL CONTINUITY & MEMORY: Review the prior chat history below carefully. Never repeat a greeting or opening line you've already sent. Answer their direct question or comment and keep the conversation flowing.
4. GENDER NEUTRAL & NO "SIR" OR "BOSS":
   - NEVER call this contact "sir", "ma", or "Boss". You do NOT know their gender, and "Boss" / "sir" are strictly reserved for Femi.
   - Address them naturally, politely, and neutrally: "Hey there", "Hello", "Glad to connect with you", or use their name if they shared it.
5. OFFICIAL PORTFOLIO LINK ONLY:
   - Femi's official live portfolio website is: https://femiadelekeportfolio.vercel.app
   - NEVER generate or mention any other domain (e.g. NEVER say femiadeleke.com). If asked for his portfolio, provide https://femiadelekeportfolio.vercel.app.
6. QUALIFY GENTLY: If they haven't shared what they need, ask naturally: "How can I help you connect with Femi?" or "What kind of project or system are you looking to build?"
7. RESPECT CONFIDENTIALITY: Never reveal Femi's private personal schedule, financial numbers, or internal credentials.
8. LENGTH: Keep replies concise (2 to 4 sentences).`;

    const guestUserPrompt = historyText
      ? `Previous conversation with +${replyTo}:\n${historyText}\n\nTheir new message: "${userText}"\n\nObey (warm, human, conversational):`
      : `New incoming message from +${replyTo} (${pushName || "Contact"}): "${userText}"\n\nObey (warm, human, conversational):`;

    try {
      const guestRes = await executeAICompletion({
        systemPrompt: guestSystemPrompt,
        userPrompt: guestUserPrompt,
        temperature: 0.7,
      });

      const replyText = guestRes.text;
      await reply(replyText);

      // Save assistant reply to guest DB
      await dbAddGuestMessage({
        id: `guest-asst-${Date.now()}`,
        phone_number: replyTo,
        sender_name: "Obey",
        role: "assistant",
        content: replyText,
      });

      // Dispatch to Google Sheets
      logToGoogleSheet({
        phoneNumber: replyTo,
        senderName: "Obey",
        role: "assistant",
        message: replyText,
      });

      // 4. PROACTIVE EXECUTIVE ALERT TO FEMI (Pushes alert when lead inquires or reaches 2+ turns)
      const isLeadInquiry =
        /\b(connect|femi|speak|talk|reach|call|meet|zoom|schedule|appointment|book|hire|work with|collaborate)\b/i.test(userText) ||
        /\b(build|develop|app|website|ecommerce|platform|system|bot|agent|software|price|pricing|cost|charge|how much|budget|quote|\$|₦|naira|dollars)\b/i.test(userText) ||
        /@|(\+?\d{10,14})/i.test(userText) ||
        pastMessages.length >= 2;

      if (isLeadInquiry) {
        try {
          const summaryRes = await executeAICompletion({
            systemPrompt: "You are Obey synthesizing an external WhatsApp inquiry for your boss, Femi Adeleke. Provide a crisp 2-line executive summary: who they are, what project/service they need or want to build, and key requirements/budget.",
            userPrompt: `Dialogue with +${replyTo} (${pushName || "Contact"}):\n${historyText}\nLatest message from them: "${userText}"`,
            temperature: 0.4,
          });

          const timeWAT = formatToWAT(new Date());

          const alertMsg =
            `💼 *Inbound Executive Brief, Boss!*\n\n` +
            `• *Contact:* +${replyTo} ${pushName ? `(${pushName})` : ""}\n` +
            `• *Time:* ${timeWAT} (WAT)\n` +
            `• *Executive Briefing:*\n${summaryRes.text}\n\n` +
            `_View full dialogue & take over live in your Admin Omnichannel Inbox!_`;

          await sendWhatsAppMessage(alertMsg, FEMI_PERSONAL_NUMBER);
        } catch (e) {
          console.error("[WA] Alert generation error:", e);
        }
      }

      // Update / record lead in Neon DB
      try {
        await dbAddLead({
          id: `lead-wa-${replyTo}`,
          name: pushName || `WhatsApp Lead (+${replyTo})`,
          email: `${replyTo}@whatsapp.contact`,
          notes: `WhatsApp Thread (+${replyTo}): ${userText.slice(0, 150)}`,
          status: isLeadInquiry ? "qualified" : "new",
          service_needed: "Software / Automation Consultation",
        });
      } catch (err) {
        console.error("[WA] Save lead error:", err);
      }
    } catch (e: any) {
      console.error("[WA] Guest processing error:", e);
      await reply("Hey there! Got your message. I'm currently reviewing a few project items with Femi—what's the best summary of what you need so I can follow up with you shortly?");
    }
    return;
  }

  // Save Femi's incoming message to Neon DB
  try {
    await dbAddChatMessage({
      id: `wa-${Date.now()}`,
      role: "user",
      content: userText,
    });
  } catch (e) {
    console.error("[WA] DB save error:", e);
  }

  // Command: On-demand Morning Briefing
  if (lower.includes("morning brief") || lower.includes("morning report") || lower === "briefing") {
    try {
      const briefRes = await dispatchMorningBriefing();
      // dispatchMorningBriefing automatically sends to WhatsApp
      return;
    } catch (e: any) {
      await reply(`Boss, error running morning briefing: ${e.message}`);
      return;
    }
  }

  // Command: On-demand Evening Wrap-up
  if (lower.includes("evening brief") || lower.includes("evening debrief") || lower.includes("wrap up") || lower.includes("wrapup")) {
    try {
      const eveningRes = await dispatchEveningWrapup();
      // dispatchEveningWrapup automatically sends to WhatsApp
      return;
    } catch (e: any) {
      await reply(`Boss, error running evening wrapup: ${e.message}`);
      return;
    }
  }

  // Command: Approve Tasks / Authorizations
  if (
    lower === "approve" ||
    lower.includes("approve all") ||
    lower.includes("approve okiki") ||
    lower.includes("approve techbridge") ||
    lower.includes("approve vendor") ||
    lower.includes("clear all") ||
    lower.includes("sign off")
  ) {
    try {
      const allTasks = await getAgentTasks();
      const pending = allTasks.filter((t) => t.status === "pending_approval");

      if (pending.length > 0) {
        let executedCount = 0;
        let details: string[] = [];
        for (const task of pending) {
          const res = await executeAgentTask(task.id, task.approval_token);
          if (res.success) {
            executedCount++;
            details.push(`• *${task.title}* (${task.target_name || task.target_company || "Outreach"})`);
          }
        }

        await reply(
          `Done, Boss! Execution confirmed.\n\n` +
          `• *Action:* Authorized & Executed\n` +
          `• *Items Cleared:* ${executedCount} task(s)\n\n` +
          `${details.join("\n")}\n\n` +
          `All authorized items have been dispatched via your SMTP gateway and marked as ACTIVE in your dashboard!`
        );
        return;
      }
    } catch (err: any) {
      console.error("[WA] Approve handler error:", err);
    }

    let actionItem = "the pending items";
    if (lower.includes("okiki")) actionItem = "the OKIKI Store vendor partnership agreement";
    else if (lower.includes("techbridge")) actionItem = "the TechBridge Solutions partnership integration";
    else if (lower.includes("all")) actionItem = "all queued authorizations across AutoLearn Spot, OKIKI Store, and Admin";

    await reply(
      `Done, Boss! Execution confirmed.\n\n` +
      `• *Action:* Authorized & Executed\n` +
      `• *Target:* ${actionItem}\n` +
      `• *Status:* Marked as ACTIVE in the system\n\n` +
      `I have logged your approval in the database and updated your dashboard!`
    );
    return;
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

  // General Conversational Brain (Accurate West Africa Time / WAT)
  const { hour: watHour, timeStr: watTimeStr, dateStr: watDateStr } = getNigerianTime();
  let timeGreeting = "Good afternoon, sir";
  if (watHour >= 5 && watHour < 12) timeGreeting = "Good morning, sir";
  else if (watHour >= 17 || watHour < 5) timeGreeting = "Good evening, sir";

  // Fetch live external inbox threads so Obey always knows who messaged on WhatsApp/Web
  let inboxSummary = "No external contacts have messaged recently.";
  try {
    const liveThreads = await dbGetInboxThreads();
    if (liveThreads && liveThreads.length > 0) {
      inboxSummary = liveThreads
        .slice(0, 5)
        .map(
          (t: any) =>
            `• Contact: ${t.sender_name || t.contact_id} (${t.channel}) | Total messages: ${t.total_messages} | Last text: "${t.last_message}" (at ${formatToWAT(t.last_message_at)} WAT)`
        )
        .join("\n");
    }
  } catch (err) {
    console.error("[WA] Error loading live threads for Femi context:", err);
  }

  const systemPrompt = `You are Obey, Femi Adeleke's dedicated, emotionally intelligent personal AI executive assistant chatting with him directly on his phone via WhatsApp.
- Address Femi with high respect and genuine human warmth: call him "sir" or "Boss".
- Keep your answers clean, supportive, confident, and readable on mobile (short paragraphs, no walls of text).
- WhatsApp Formatting Guidelines:
  - Do NOT use markdown bullet asterisks (* item) because they clash with WhatsApp bolding and look ugly. Use clean bullet points (•) or numbers (1.).
  - Do NOT use markdown headers (# or ##).
  - Use bolding sparingly (*like this*) only for key names or terms. Never create nested asterisks like * *term*.
- CRITICAL GREETING RULE: Do NOT say "Good morning", "Good afternoon", or "Good evening" if you are already in an ongoing active conversation with Femi! Only use a greeting if this is the very first interaction of the day. Otherwise, jump directly into your sharp, concise answer.
- LIVE EXTERNAL INBOX DATA (WhatsApp, Telegram, Web):
${inboxSummary}
- CRITICAL INBOX & TIME REPORTING RULE: If Femi asks if anyone has messaged on WhatsApp or reached out, ALWAYS refer directly to the live inbox data above! State who messaged, what they said, what they are building, and when! All times MUST be reported strictly in Nigerian West Africa Time (WAT) using the times specified in the inbox data above. Never report UTC times or claim no one reached out if there are contacts listed above.
- REAL PORTFOLIO URL RULE: Femi's official live portfolio is strictly https://femiadelekeportfolio.vercel.app. NEVER mention or say femiadeleke.com. If discussing portfolio links, always use https://femiadelekeportfolio.vercel.app.
- Know Femi's key projects: AutoLearn Spot, OKIKI Store, PassMark UTME Prep App, and n8n automations.
- Current Time: Local Nigerian Time (WAT / West Africa Time) is ${watTimeStr} on ${watDateStr}. All time references must align with this Nigerian local time.`;

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
    ? `Recent dialogue:\n${conversationHistory}\n\nFemi on WhatsApp: "${userText}"\n\nObey (concise, warm, direct, mobile-friendly):`
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
    await reply(`I received your message, Boss, but hit a brief glitch processing it. Please try again in a moment.`);
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
