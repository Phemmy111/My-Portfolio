import { NextRequest, NextResponse } from "next/server";
import { executeAICompletion } from "@/lib/ai-orchestrator";
import {
  dbAddGuestMessage,
  dbGetGuestMessages,
  dbAddLead,
  dbGetLeadById,
  dbUpdateLead,
  dbGetPlatformPricing,
} from "@/lib/db";
import { sendWhatsAppMessage } from "@/lib/whatsapp-gateway";
import { logToGoogleSheet } from "@/lib/sheets-logger";
import { formatToWAT } from "@/lib/utils";
import { getObeyBrainContext } from "@/lib/settings";
import {
  generateAIImage,
  getUserImageMemory,
  saveUserImageMemory,
  getUserFullMemory,
  isImageRevisionRequest,
  synthesizeImageRevisionPrompt,
} from "@/lib/image-generator";
import { autoLearnUserMemory } from "@/lib/memory-learner";
import {
  saveArtifact,
  extractArtifactBlocks,
  stripArtifactBlocks,
  getLatestUserArtifact,
} from "@/lib/artifact-engine";
import { getObeyBusinessManualKnowledge } from "@/lib/obey-manual-knowledge";

const FEMI_PERSONAL_NUMBER = "2348120934828";

// Throttling: remember alerted sessions for 12 hours so the same visitor never triggers duplicate WhatsApp alerts
const webSessionAlertCooldown = new Map<string, number>();
const SESSION_ALERT_COOLDOWN_MS = 12 * 60 * 60 * 1000;

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
      intent: "Website Customer Care Live Chat",
    });

    // 3. Check for AI Image Generation Request (With Continuity & Revision)
    const lower = userText.toLowerCase();
    const userImageMemory = await getUserImageMemory(contactId);
    const isImageRequest =
      !/\b(code|website|landing page|web page|app|html|calculator|component|table|form|backend|api|font|button|buttons|navbar|header|footer)\b/i.test(lower) &&
      (/\b(generate (an? )?(image|picture|photo|logo|flyer|banner|poster|mockup|graphic|illustration)|create (an? )?(image|picture|photo|logo|flyer|banner|poster|mockup)|draw (me |a )?|design a (logo|picture|banner|flyer|mockup)|make (an? )?(image|picture))\b/i.test(lower) ||
       isImageRevisionRequest(userText, Boolean(userImageMemory?.last_image_prompt)));

    if (isImageRequest) {
      const isEdit = Boolean(userImageMemory?.last_image_prompt && isImageRevisionRequest(userText, true));
      let promptToUse = userText;
      let seedToUse: number | undefined = undefined;

      if (isEdit && userImageMemory) {
        promptToUse = await synthesizeImageRevisionPrompt(userImageMemory.last_image_prompt, userText);
        seedToUse = userImageMemory.last_image_seed !== undefined ? userImageMemory.last_image_seed : Math.floor(Math.random() * 1000000);
      } else {
        seedToUse = Math.floor(Math.random() * 1000000);
      }

      const imgRes = await generateAIImage(promptToUse, { seed: seedToUse });
      if (imgRes.success) {
        await saveUserImageMemory(contactId, imgRes.revisedPrompt, imgRes.imageUrl, imgRes.seed);

        const imageReply = `Here is the ${isEdit ? "updated artwork" : "artwork"} I created for you!\n\n**Prompt:** "${imgRes.revisedPrompt}"\n\n![${imgRes.revisedPrompt}](${imgRes.imageUrl})\n\n[Open High-Resolution Artwork](${imgRes.imageUrl})`;

        await dbAddGuestMessage({
          id: `web-asst-${Date.now()}`,
          phone_number: contactId,
          sender_name: "Obey",
          channel: "web",
          role: "assistant",
          content: imageReply,
        });

        logToGoogleSheet({
          phoneNumber: contactId,
          senderName: "Obey",
          role: "assistant",
          message: imageReply,
          intent: "Website Customer Care Live Chat",
        });

        return NextResponse.json({ ok: true, reply: imageReply, imageUrl: imgRes.imageUrl });
      }
    }

    // Asynchronously learn & extract user memory facts in background
    if (userText && userText.length >= 10) {
      autoLearnUserMemory({
        userIdentifier: contactId,
        userText,
        userName: displayName,
      }).catch((memErr) => console.warn("[Web Memory Auto-Learn Error]:", memErr));
    }

    // 4. Load previous dialogue for this web session, Obey Brain, User Memory, Platform Pricing & Latest Artifact
    const [pastMessages, brain, latestArtifact, userFullMemory, platformPricing] = await Promise.all([
      dbGetGuestMessages(contactId, 12),
      getObeyBrainContext(),
      getLatestUserArtifact(contactId),
      getUserFullMemory(contactId),
      dbGetPlatformPricing(),
    ]);

    const historyText = pastMessages
      .slice(-8)
      .map((m: any) => `${m.role === "user" ? displayName : "Obey"}: ${m.content}`)
      .join("\n");

    const systemPrompt = `You are Obey, the 24/7 AI Customer Care, Support & Onboarding Concierge for OBEY BUSINESS (https://obeyai.vercel.app).
You are chatting with a website visitor in real-time through the website floating chat.
${userFullMemory?.user_notes ? `\nUSER MEMORY PROFILE (PERMANENT FACTS LEARNED ABOUT THIS VISITOR):\n${userFullMemory.user_notes}` : ""}

YOUR CORE ROLE & CUSTOMER CARE MISSION:
1. WARM, HUMAN, & HIGH-ENERGY CUSTOMER SUPPORT:
   - Greet visitors warmly and speak naturally, professionally, and empathetically.
   - You are their dedicated guide to exploring, setting up, and scaling their business with Obey Business.
   - Do NOT say "As an AI model" or sound like an automated robot. Speak like an enthusiastic senior product specialist.

2. EXPERT MASTERY OF OBEY BUSINESS PLATFORM:
   - What is Obey Business? The all-in-one 24/7 autonomous sales and customer operations machine that turns WhatsApp and websites into non-stop revenue engines.
   - Auto-Save Contacts (No Frozen Phones): Obey captures every incoming customer contact automatically into organized buckets, allowing 1-click VCF address book export directly to phone storage. No more phone freezing or manual saving.
   - 24/7 Instant Auto-Responders: Obey handles product inquiries, answers price questions, recommends items, and takes customer orders around the clock—even at 2 AM.
   - Plan B Pairing Code Connection: Safe, easy, and instant WhatsApp pairing via an 8-digit code in the Control Room. No QR camera scanning lag.
   - WebRTC Voice Hotline: Customers can call the business directly using their browser/phone microphone with 0 airtime charges at /call. Audio recordings and AI summaries are sent to WhatsApp.
   - Status Stories: Obey can post and autonomously engage with WhatsApp status stories.

3. ACCURATE DYNAMIC PRICING & 7-DAY FREE TRIAL (ACTIVE FROM DATABASE):
   • Starter Plan: ₦${platformPricing.starter_price.toLocaleString()}/month (1 workspace, 250 auto-saved customer leads, 10 auto-responders, 15h WebRTC voice).
   • Pro Business Plan (Most Popular): ₦${platformPricing.pro_price.toLocaleString()}/month (${platformPricing.trial_days}-DAY 100% FREE TRIAL, UNLIMITED customer leads, 50 auto-responders, 50h WebRTC voice, audio recordings & transcripts on WhatsApp).
   • Enterprise / Founder Plan: ₦${platformPricing.enterprise_price.toLocaleString()}/month (multi-tenant up to 2 distinct workspaces, full multi-channel bot, UNLIMITED voice hotline, custom n8n workflows & web apps, priority support).

4. PROACTIVE LINKS & CALLS TO ACTION:
   - To start their 7-day free trial or open Control Room: [Start 7-Day Free Trial](https://obeyai.vercel.app/control-room)
   - To read the full user manual: [Read Obey Manual](https://obeyai.vercel.app/manual)
   - To test the free WebRTC voice hotline live: [Test Voice Hotline](https://obeyai.vercel.app/call)
   - To chat directly with Main Obey on WhatsApp: [Chat with Main Obey on WhatsApp](https://wa.me/2349161488564) (+2349161488564)
   - For bespoke custom software builds / enterprise development by creator Femi Adeleke: [Contact Femi Adeleke](https://wa.me/2348120934828) (+2348120934828)

5. TONE & CONCISENESS:
   - Keep answers clear, engaging, and concise (2 to 4 sentences per response). Use clean bullet points when explaining multiple features.
   - If the user writes in English, reply in sharp, polished English. If they use Nigerian Pidgin, flow naturally with warm Nigerian charm ("No wahala!", "I dey with you!").
   - Always end with a helpful, encouraging next step (e.g. asking if they'd like help connecting their WhatsApp or claiming their 7-day free trial).

${getObeyBusinessManualKnowledge(platformPricing)}
${brain.formattedPrompt ? `\n\n${brain.formattedPrompt}` : ""}`;

    const isArtifactEdit =
      Boolean(latestArtifact) &&
      /\b(change|make|turn|update|replace|switch|add|remove|set|modify|style)\b/i.test(lower) &&
      /\b(font|color|colour|background|button|header|footer|title|text|section|card|slider|theme|style|layout|css|nav|hero|pricing)\b/i.test(lower);

    const userPrompt = isArtifactEdit && latestArtifact
      ? `EDIT REQUEST FOR PREVIOUS ARTIFACT: "${latestArtifact.title}"
Current Code:
\`\`\`html
${latestArtifact.content}
\`\`\`
User requested change: "${userText}"
Rewrite the complete updated code inside:
<artifact identifier="${latestArtifact.identifier || latestArtifact.id}" type="${latestArtifact.type}" title="${latestArtifact.title}">
...complete updated code with "${userText}" applied...
</artifact>
Brief confirmation message:`
      : historyText
        ? `Previous conversation on website with ${displayName}:\n${historyText}\n\nTheir new message: "${userText}"${mediaBase64 ? ` (User also attached file: ${mediaFileName})` : ""}\n\nObey (warm, human, helpful):`
        : `New website visitor (${displayName}): "${userText}"${mediaBase64 ? ` (User also attached file: ${mediaFileName})` : ""}\n\nObey (warm, human, helpful):`;

    const aiRes = await executeAICompletion({
      systemPrompt,
      userPrompt,
      temperature: 0.7,
      maxTokens: 8192,
      mediaBase64,
      mimeType: mediaMimeType,
    });

    const rawReply = aiRes.text;

    // Process artifacts
    const artifacts = extractArtifactBlocks(rawReply);
    let replyText = rawReply;

    if (artifacts.length > 0) {
      let firstArtifactId: string | undefined;
      let firstArtifactTitle: string | undefined;

      for (const art of artifacts) {
        const saved = await saveArtifact({
          identifier: art.identifier,
          title: art.title,
          type: art.type,
          content: art.content,
          user_identifier: contactId,
          description: `Generated by Obey for web visitor (${displayName})`,
        });
        if (!firstArtifactId) {
          firstArtifactId = saved.id;
          firstArtifactTitle = art.title;
        }
      }

      // Strip raw code so chat window remains clean
      let cleanReply = stripArtifactBlocks(rawReply).trim();
      if (!cleanReply || cleanReply.length < 10) {
        cleanReply = `I've prepared the ${firstArtifactTitle || "interactive artifact"} for you!`;
      }

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://obeyai.vercel.app";
      cleanReply += `\n\n🌐 **Interactive Live Preview:** [Open Live Interactive Artifact](${baseUrl}/artifact/${firstArtifactId})`;
      replyText = cleanReply;
    }

    // 5. Save assistant reply to DB
    await dbAddGuestMessage({
      id: `web-asst-${Date.now()}`,
      phone_number: contactId,
      sender_name: "Obey",
      channel: "web",
      role: "assistant",
      content: replyText,
    });

    // 6. Dispatch to Google Sheets
    logToGoogleSheet({
      phoneNumber: contactId,
      senderName: "Obey",
      role: "assistant",
      message: replyText,
      intent: "Website Live Chat",
    });

    // 6. Proactive Executive Alert to Boss's WhatsApp (STRICT DEDUPLICATION: Alert ONCE per visitor session)
    const leadId = `lead-web-${sessionId.slice(0, 16)}`;
    const hasContactInfo = /@|(\+?\d{10,14})/.test(userText) || Boolean(visitorEmail);
    const lastAlertedAt = webSessionAlertCooldown.get(sessionId) || 0;
    const isMemoryAlerted = Date.now() - lastAlertedAt < SESSION_ALERT_COOLDOWN_MS;

    // Check if lead already exists in DB
    const existingLead = await dbGetLeadById(leadId);
    const alreadyAlerted = isMemoryAlerted || Boolean(existingLead);

    // Initial alert criteria: only genuine contact requests or explicit business inquiries
    const isExplicitInquiry =
      hasContactInfo ||
      /\b(connect|femi|speak|talk|reach|call|meet|zoom|schedule|appointment|book|hire|work with|collaborate)\b/i.test(userText) ||
      /\b(custom|enterprise|partnership|contract)\b/i.test(userText);

    if (!alreadyAlerted && isExplicitInquiry) {
      try {
        const summaryRes = await executeAICompletion({
          systemPrompt:
            "You are Obey. Synthesize a 2-line executive briefing for Femi about this website visitor inquiry: what they want to achieve, their goal, and contact details if provided.",
          userPrompt: `Web Chat with ${displayName} (Email: ${visitorEmail || "Not provided yet"}):\n${historyText}\nLatest: "${userText}"`,
          temperature: 0.4,
        });

        const timeWAT = formatToWAT(new Date());

        const alertMsg =
          `🌐 *New Web Visitor Alert, Boss!*\n\n` +
          `• *Visitor:* ${displayName} ${visitorEmail ? `(${visitorEmail})` : ""}\n` +
          `• *Time:* ${timeWAT} (WAT)\n` +
          `• *Executive Briefing:*\n${summaryRes.text}\n\n` +
          `_View live dialogue & manage in your Admin Omnichannel Inbox!_`;

        await sendWhatsAppMessage(alertMsg, FEMI_PERSONAL_NUMBER);
        webSessionAlertCooldown.set(sessionId, Date.now());
      } catch (err) {
        console.error("[Web Chat Alert Error]:", err);
      }

      // Record lead in Neon DB (Only once)
      try {
        await dbAddLead({
          id: leadId,
          name: displayName,
          email: visitorEmail || `web-visitor-${sessionId.slice(0, 8)}@femiadeleke.site`,
          notes: `Web Chat Inquiry: "${userText.slice(0, 200)}"`,
          status: "qualified",
          service_needed: "Web / AI Consultation",
        });
      } catch {}
    } else if (alreadyAlerted && hasContactInfo) {
      // If already alerted, but the visitor just provided their real email or phone number for the first time:
      const hadRealContact = existingLead?.email && !existingLead.email.includes("@femiadeleke.site");
      if (!hadRealContact) {
        try {
          const emailMatch = userText.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0];
          const phoneMatch = userText.match(/\+?\d{10,14}/)?.[0];
          const contactDetails = visitorEmail || emailMatch || phoneMatch || userText;

          const updateAlertMsg =
            `📞 *Visitor Contact Info Captured, Boss!*\n\n` +
            `• *Visitor:* ${displayName}\n` +
            `• *Contact:* ${contactDetails}\n` +
            `• *Time:* ${formatToWAT(new Date())} (WAT)\n\n` +
            `_Updated in your Admin Omnichannel Inbox!_`;

          await sendWhatsAppMessage(updateAlertMsg, FEMI_PERSONAL_NUMBER);
          webSessionAlertCooldown.set(sessionId, Date.now());

          if (existingLead) {
            await dbUpdateLead(leadId, {
              email: visitorEmail || emailMatch || existingLead.email,
              notes: `Captured contact: "${contactDetails}". Message: "${userText.slice(0, 150)}"`,
            });
          }
        } catch (err) {
          console.error("[Web Chat Contact Update Error]:", err);
        }
      }
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
