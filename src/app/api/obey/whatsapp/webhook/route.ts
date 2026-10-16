import { NextRequest, NextResponse, after } from "next/server";
import { executeAICompletion, transcribeAudio, executeAICompletionWithMedia } from "@/lib/ai-orchestrator";
import {
  sql,
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
  dbGetWorkspaceRules,
  dbUpsertWorkspaceLead,
  dbGetWorkspaceLeads,
  dbGetWorkspaceBySlug,
  dbGetWorkspaceByInstanceName,
  dbGetWorkspaceSettings,
import {
  sendWhatsAppMessage,
  sendWhatsAppStatusPost,
  fetchEvolutionMediaBase64,
  markWhatsAppMessageRead,
  sendWhatsAppPresence,
} from "@/lib/whatsapp-gateway";
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
import { getLatestUserArtifact } from "@/lib/artifact-engine";

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
  instanceName?: string;
  connectedOwner?: string;
}

/**
 * Handles incoming WhatsApp messages for Obey Business instances (e.g. AutoLearn Spot).
 * - Only responds to the business OWNER as their private AI business manager.
 * - Allows posting status updates on command ("Post status: ...").
 * - Does NOT auto-reply to others, keeping the number 100% normal for regular chat.
 */
async function handleObeyBusinessOwnerTurn(params: {
  currentWs: any;
  userText: string;
  replyTo: string;
  pushName?: string;
  historyText: string;
  instanceName: string;
  reply: (text: string) => Promise<void>;
}) {
  const { currentWs, userText, replyTo, pushName, historyText, instanceName, reply } = params;
  const lower = userText.toLowerCase().trim();

  // 1. WhatsApp Status Automation Commands: "post status: ...", "status: ...", "put on status: ..."
  if (lower.startsWith("post status:") || lower.startsWith("status:") || lower.startsWith("put on status:")) {
    const statusText = userText.replace(/^(post status:|status:|put on status:)/i, "").trim();
    if (!statusText) {
      await reply("Boss, please specify what you want me to post to your WhatsApp Status! E.g. `Post status: Flash sale today! 20% off all orders.`");
      return;
    }

    const res = await sendWhatsAppStatusPost({
      text: statusText,
      instanceName,
    });

    if (res.success) {
      await reply(`🚀 *Status Published!*, Boss.\n\nYour post is now live on your WhatsApp Status Stories:\n\n"${statusText}"`);
      try {
        if (sql) {
          await sql`
            INSERT INTO workspace_statuses (id, workspace_id, content, status, posted_at)
            VALUES (${'stat_' + Date.now()}, ${currentWs.id}, ${statusText}, 'posted', NOW())
          `;
        }
      } catch {}
    } else {
      await reply(`⚠️ Could not post status: ${res.error || "Evolution broadcast error"}. Please make sure your WhatsApp session is connected in your Control Room.`);
    }
    return;
  }

  // 2. Draft / Generate Status Command
  if (lower.includes("draft status") || lower.includes("generate status") || lower.includes("suggest status")) {
    const aiDraft = await executeAICompletion({
      systemPrompt: `You are Obey Business AI for "${currentWs.name}". Draft a punchy, high-converting WhatsApp status post with emojis to promote their products/services. Output only the suggested status text.`,
      userPrompt: `Business context: ${currentWs.bio_context || ""}. Catalog: ${JSON.stringify(currentWs.catalog_items || [])}. Write a status update ready to publish.`,
    });

    await reply(`✨ *Suggested WhatsApp Status for ${currentWs.name}:*\n\n${aiDraft.text}\n\n👉 *To post this now*, simply reply:\n\`Post status: ${aiDraft.text.slice(0, 80)}...\``);
    return;
  }

  // 3. Leads Query Command
  if (lower === "leads" || lower.includes("show leads") || lower.includes("recent leads") || lower.includes("who messaged")) {
    const wsLeads = await dbGetWorkspaceLeads(currentWs.id);
    if (!wsLeads || wsLeads.length === 0) {
      await reply(`📊 *Leads Update for ${currentWs.name}:*\n\nNo customer leads logged yet. When clients ask about products or pricing, I will automatically record them here for you!`);
    } else {
      const leadList = wsLeads.slice(0, 5).map((l, i) => `${i + 1}. *${l.name || "Customer"}* (+${l.phone})\n   • Note: ${l.intent_summary || l.last_message || "Inquiry"}`).join("\n\n");
      await reply(`📊 *Latest ${Math.min(5, wsLeads.length)} Leads for ${currentWs.name}:*\n\n${leadList}\n\n💡 You can also manage all leads in your Control Room.`);
    }
    return;
  }

  // 4. Conversational Obey Business Assistant
  const wsSettings = await dbGetWorkspaceSettings(currentWs.id);
  const businessBio = wsSettings?.business_bio || currentWs.bio_context || "Professional services and products.";
  const catalog = currentWs.catalog_items || wsSettings?.catalog_summary || [];

  const systemPrompt = `You are Obey Business AI, the private 24/7 autonomous operations assistant and business manager for "${currentWs.name}".
You are chatting directly with your business owner/boss (${currentWs.owner_name || "Boss"}).

Business Knowledge:
${businessBio}

Product & Service Catalog:
${JSON.stringify(catalog)}

Your role and personality:
- You are their dedicated business manager for "${currentWs.name}".
- Address them respectfully and warmly as "Boss".
- Help them run and grow "${currentWs.name}" — draft WhatsApp status posts, brainstorm promos, check leads, answer catalog questions.
- If they want to post a status, tell them they can simply type: "Post status: [their text]" and you will publish it immediately to their WhatsApp status stories.
- CRITICAL: You represent ONLY "${currentWs.name}". NEVER mention Femi Adeleke, software engineering portfolios, or Upwork proposals.`;

  const userPrompt = `${historyText ? `RECENT CHAT HISTORY:\n${historyText}\n\n` : ""}Boss says: "${userText}"`;

  const aiRes = await executeAICompletion({
    systemPrompt,
    userPrompt,
    temperature: 0.7,
  });

  const replyText = aiRes.text;
  await reply(replyText);

  try {
    await dbAddGuestMessage({
      id: `guest-asst-${Date.now()}`,
      phone_number: replyTo,
      sender_name: currentWs.name,
      role: "assistant",
      content: replyText,
    });
  } catch {}
}

/**
 * Handles incoming customer/lead messages for an Obey Business instance (e.g. AutoLearn Spot).
 * - Acts as the dedicated 24/7 AI Sales & Customer Support Assistant for the business.
 * - Knowledgeable about the business bio, catalog, pricing, and services.
 * - Captures customer inquiries automatically in workspace_leads.
 * - NEVER mentions Femi Adeleke, software developer portfolios, or Upwork.
 */
async function handleObeyBusinessCustomerTurn(params: {
  currentWs: any;
  userText: string;
  replyTo: string;
  pushName?: string;
  historyText: string;
  instanceName: string;
  reply: (text: string) => Promise<void>;
}) {
  const { currentWs, userText, replyTo, pushName, historyText, reply } = params;

  const wsSettings = await dbGetWorkspaceSettings(currentWs.id);
  const businessBio = wsSettings?.business_bio || currentWs.bio_context || "Professional services and products.";
  const catalog = currentWs.catalog_items || wsSettings?.catalog_summary || [];

  const customerName = pushName ? pushName.trim() : "Friend";
  const hasHistory = Boolean(historyText && historyText.trim().length > 15);

  const systemPrompt = `You are Obey Business AI, the human-like WhatsApp sales and customer assistant for "${currentWs.name}".
You are chatting with ${customerName}.

About "${currentWs.name}":
${businessBio}

Product & Service Catalog:
${JSON.stringify(catalog, null, 2)}

🚨 CRITICAL HUMAN CONVERSATIONAL RULES (MUST FOLLOW STRICTLY):
1. NEVER REPEAT GREETINGS OR NAMES AT EVERY MESSAGE:
   - ${hasHistory 
      ? `This conversation is ALREADY IN PROGRESS. NEVER say "Hello ${customerName}!", "Hi ${customerName}!", "Hello!", or greeting formulas at the beginning of your message. NEVER repeat the customer's name at every reply. Jump straight into answering their question naturally like a real human texting back on WhatsApp.` 
      : `If this is the first turn and the customer opened with a greeting, give a single brief warm greeting. Otherwise, answer directly. Do NOT repeat their name incessantly.`}

2. ALWAYS SHORT, CONCISE, AND NATURAL (1 TO 2 SENTENCES DEFAULT):
   - Real people chatting on WhatsApp do NOT write long marketing essays or unsolicited multi-paragraph sales pitches.
   - Keep your replies short, natural, warm, and conversational (1 to 2 sentences max).
   - Answer directly what the customer asked. Do NOT dump marketing fluff, lengthy bulleted lists, or unsolicited promotional intros ("Welcome to AutoLearn Spot! We are your go-to destination...").
   - ONLY provide longer details, full bullet points, or catalog breakdowns IF the customer specifically asks for them (e.g. "Send me the full price list", "Can you explain in detail?", "What packages do you offer?").

3. NATURAL HUMAN FLOW & ACCURACY:
   - If they say "How are you doing?", reply like a human: "I'm doing great, thank you! How are you?"
   - If they ask to speak with someone (e.g. Mr. Adeleke), acknowledge simply: "Sure! Let me notify Mr. Adeleke for you right away. What would you like him to assist you with?"
   - If they ask about something you don't do (e.g. cash payouts), answer simply and directly: "No, we don't distribute cash payouts. We provide training and learning packages to help you build skills."
   - Keep emojis tasteful and minimal (0-2 max per message, never excessive).

4. STRICT BRAND ISOLATION:
   - You represent "${currentWs.name}" ONLY. NEVER mention Femi Adeleke, software engineering portfolios, Upwork proposals, or tech resumes unless the business itself is Femi's portfolio.`;

  const userPrompt = `${historyText ? `RECENT CONVERSATION HISTORY:\n${historyText}\n\n` : ""}Customer says: "${userText}"`;

  const aiRes = await executeAICompletion({
    systemPrompt,
    userPrompt,
    temperature: 0.5,
  });

  const replyText = aiRes.text;
  await reply(replyText);

  // Save assistant reply to guest DB
  try {
    await dbAddGuestMessage({
      id: `guest-asst-${Date.now()}`,
      phone_number: replyTo,
      sender_name: currentWs.name,
      role: "assistant",
      content: replyText,
    });
  } catch {}

  // Auto-capture or update customer lead in workspace_leads
  try {
    await dbUpsertWorkspaceLead({
      workspace_id: currentWs.id,
      phone: replyTo,
      name: pushName || "WhatsApp Customer",
      source: "whatsapp",
      status: "lead",
      intent_summary: userText.slice(0, 150),
      last_message: userText,
    });
  } catch (leadErr) {
    console.warn("[WA] Customer lead capture error:", leadErr);
  }
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
    instanceName = "obey",
    connectedOwner = "",
  } = params;

  const lower = userText.toLowerCase();
  let replyTo = (senderNumber || FEMI_PERSONAL_NUMBER).replace(/@s\.whatsapp\.net|@lid|@g\.us/g, "").replace(/\D/g, "");
  if (!replyTo || replyTo.length > 13 || replyTo.length < 10) {
    replyTo = FEMI_PERSONAL_NUMBER;
  }

  // Resolve Workspace by Evolution instance name or connected bot phone
  let currentWs: any = null;
  if (instanceName && instanceName !== "obey" && instanceName !== "default") {
    currentWs = await dbGetWorkspaceByInstanceName(instanceName);
  }
  if (!currentWs && connectedOwner) {
    currentWs = await dbGetWorkspaceByInstanceName(connectedOwner);
  }
  if (!currentWs) {
    currentWs = await dbGetWorkspaceBySlug("femi-adeleke");
  }
  const wsId = currentWs ? currentWs.id : "ws_femi_default";
  const isDefaultFemi = !currentWs || currentWs.slug === "femi-adeleke";

  const ownerClean = (currentWs?.owner_phone || FEMI_PERSONAL_NUMBER).replace(/\D/g, "");
  const isOwner = isDefaultFemi
    ? replyTo === FEMI_PERSONAL_NUMBER
    : replyTo.endsWith(ownerClean.slice(-10));

  const isFemi = isDefaultFemi && (replyTo === FEMI_PERSONAL_NUMBER);

  // Helper: send reply via WhatsApp + save to DB
  async function reply(text: string) {
    const formatted = cleanWhatsAppFormatting(text);
    const sendInstance = currentWs?.whatsapp_instance_name || instanceName || "obey";
    await sendWhatsAppMessage(formatted, replyTo, sendInstance);
    if (isOwner && isDefaultFemi) {
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

  // 2. Load conversation history (Fetch recent 40 messages, keep last 25 turns)
  const pastMessages = await dbGetGuestMessages(replyTo, 40);
  const historyText = pastMessages
    .slice(-25)
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
      const activeArtifact = await getLatestUserArtifact(replyTo);
      const artifactMemoryNote = activeArtifact
        ? `\n\nACTIVE ARTIFACT IN MEMORY:\n• Title: "${activeArtifact.title}" (ID: ${activeArtifact.id})\n• Note: You (Obey) created this website artifact. If the user's screenshot shows this website, a modal, or browser console errors (such as localStorage, form submission, or sandbox issues), analyze the bug and explicitly tell the user that you already have the complete code saved in memory and can update and rebuild it for them right away. NEVER ask the user to paste or provide code snippets since you already have their artifact stored.`
        : "";

      const visionPrompt = `${historyText ? `PRIOR CONVERSATION CONTEXT:\n${historyText}\n\n` : ""}CURRENT ACTION: The user sent this image${userText && userText !== "[Image Received]" ? ` with note/question: "${userText}"` : ""}.${artifactMemoryNote}

Analyze this image thoroughly in relation to our ongoing conversation, extract any key details or text, and assist them directly with clarity and warmth.`;

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

  // 3. Proactive First-Contact Notification to Owner & Welcome to New User
  if (!isOwner && pastMessages.length <= 1) {
    try {
      const timeWAT = formatToWAT(new Date());
      const notifyPhone = isDefaultFemi ? FEMI_PERSONAL_NUMBER : (currentWs?.owner_phone || FEMI_PERSONAL_NUMBER);
      const firstContactAlert =
        `👋 *New Lead Initiated Chat with ${currentWs?.name || "Obey"}!*\n\n` +
        `• *Contact:* +${replyTo} ${pushName ? `(${pushName})` : ""}\n` +
        `• *Time:* ${timeWAT} (WAT)\n` +
        `• *First Message:* "${userText}"\n\n` +
        `_Obey Business AI is actively assisting them live._`;
      await sendWhatsAppMessage(firstContactAlert, notifyPhone, instanceName);
    } catch (e) {
      console.warn("[WA] First contact alert error:", e);
    }

    // Welcome new users with concise showcase
    const isFirstGreeting = /^(hi|hello|hey|good morning|good afternoon|good evening|who are you|what can you do|start|help)\b/i.test(lower.trim()) || pastMessages.length === 0;
    if (isFirstGreeting) {
      const welcomeName = pushName ? `, ${pushName}` : "";
      let welcomeText = "";

      if (isDefaultFemi) {
        welcomeText =
          `👋 *Hello${welcomeName}! I am Obey.*

I am an autonomous AI executive companion built by *Femi Adeleke*. I am here to assist, entertain, and make life easier for you across WhatsApp, Web, and Voice!

🚀 *Here are my superpowers:*
🎙️ *Voice Notes:* Send me any voice note in English or Pidgin — I listen, analyze, and execute your instructions.
📞 *Live Voice Calls:* Tap my call link anytime for a 100% free WebRTC voice chat — we fit gist about anything!
🌐 *Instant Websites & Tools:* Ask me to build a website, landing page, or dashboard, and I'll send you the live preview link and code.
🎨 *AI Image Generation:* Describe any artwork or photo, and I'll generate it instantly.
📄 *Documents & Vision:* Send screenshots, PDFs, invoices, or contracts — I read and extract key insights.
🔎 *Live Web Search:* Ask me for real-time news, facts, and trends across Nigeria and the world.
📲 *Smart Delegation:* Ask me to message someone, and I'll format and dispatch it for you.

How can I assist you today?`;
      } else {
        const wsSettings = await dbGetWorkspaceSettings(wsId);
        if (wsSettings?.whatsapp_welcome) {
          welcomeText = wsSettings.whatsapp_welcome.replace(/\{name\}/g, pushName || "there");
        } else {
          welcomeText = `👋 *Hello${welcomeName}! Welcome to ${currentWs?.name || "our business"}.*

I am your 24/7 AI business assistant powered by Obey. I can answer questions about our catalog, pricing, services, and take your orders or bookings anytime!

How can I help you today?`;
        }
      }

      await reply(welcomeText);
      try {
        await dbAddGuestMessage({
          id: `guest-welcome-${Date.now()}`,
          phone_number: replyTo,
          sender_name: currentWs?.name || "Obey",
          role: "assistant",
          content: welcomeText,
        });
      } catch {}
      return;
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
  if (isOwner && isDefaultFemi) {
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

  // 5.5 MULTI-TENANT KEYWORD TRIGGER & LEAD CAPTURE (Wasbot AI Supercharged)
  if (!isOwner && userText && !visionMedia?.base64 && !docMedia?.base64) {
    try {
      const rules = await dbGetWorkspaceRules(wsId);
      const cleanUserText = userText.toLowerCase();

      for (const rule of rules) {
        if (!rule.is_active) continue;
        const matched = rule.trigger_keywords.some((kw) => {
          const cleanKw = kw.toLowerCase().trim();
          if (!cleanKw) return false;
          const escaped = cleanKw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return new RegExp(`(^|\\W)${escaped}($|\\W)`, "i").test(cleanUserText);
        });

        if (matched) {
          // Guard against negations ("not asking for call", "don't call", etc.)
          if (/\b(?:not|don'?t|no)\s+(?:want|need|ask(?:ing)?\s+for)?\s*(?:a\s+)?call\b/i.test(cleanUserText)) {
            continue;
          }

          // Guard against complex questions, status queries, or delegation commands
          if (cleanUserText.length > 60 || /\b(help me message|message|send a message|wasbot|status)\b/i.test(cleanUserText)) {
            continue;
          }

          console.log(`[WA] Triggered Keyword Rule (${currentWs?.name}): "${rule.trigger_keywords.join(", ")}" -> ${rule.action}`);
          await reply(rule.response_text);

          // Save assistant reply to guest DB
          await dbAddGuestMessage({
            id: `guest-asst-${Date.now()}`,
            phone_number: replyTo,
            sender_name: currentWs?.name || "Obey",
            role: "assistant",
            content: rule.response_text,
          });

          // Auto-capture lead in Workspace CRM
          await dbUpsertWorkspaceLead({
            workspace_id: wsId,
            phone: replyTo,
            name: pushName || "WhatsApp User",
            source: "whatsapp",
            status: rule.action === "collect_order" ? "interested" : "lead",
            intent_summary: `Triggered rule [${rule.trigger_keywords.slice(0, 3).join(", ")}] with: "${userText.slice(0, 80)}"`,
            last_message: userText,
          });

          return;
        }
      }
    } catch (ruleErr) {
      console.warn("[WA] Workspace rule evaluation error:", ruleErr);
    }
  }

  // 5.8 OBEY BUSINESS WORKSPACE ROUTER (Strict Tenant Isolation)
  if (!isDefaultFemi && currentWs) {
    if (isOwner) {
      await handleObeyBusinessOwnerTurn({
        currentWs,
        userText,
        replyTo,
        pushName,
        historyText,
        instanceName,
        reply,
      });
      return;
    } else {
      await handleObeyBusinessCustomerTurn({
        currentWs,
        userText,
        replyTo,
        pushName,
        historyText,
        instanceName,
        reply,
      });
      return;
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
      isVoiceNote,
    });

    const finalReply = companionRes.reply;

    if (finalReply && finalReply.trim()) {
      await reply(finalReply);
    }

    // Save assistant reply to guest DB
    await dbAddGuestMessage({
      id: `guest-asst-${Date.now()}`,
      phone_number: replyTo,
      sender_name: currentWs?.name || "Obey",
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

    // Auto-save lead in Workspace CRM
    if (!isOwner) {
      try {
        await dbUpsertWorkspaceLead({
          workspace_id: wsId,
          phone: replyTo,
          name: pushName || "WhatsApp Contact",
          source: "whatsapp",
          status: "lead",
          intent_summary: userText.slice(0, 120),
          last_message: userText,
        });
      } catch (crmErr) {
        console.warn("[WA] Auto-save lead CRM warning:", crmErr);
      }
    }
  } catch (err: any) {
    console.error("[WA] Dynamic companion error:", err);
    await reply("Please, I am busy right now. Check back with me in a moment. Thanks!");
  }
}

/**
 * Extracts contact details from shared WhatsApp contact cards (vCards)
 */
function extractContactCardInfo(msg: any): { name: string; phone: string } | null {
  if (!msg) return null;
  const quoted =
    msg.extendedTextMessage?.contextInfo?.quotedMessage ||
    msg.audioMessage?.contextInfo?.quotedMessage ||
    msg.imageMessage?.contextInfo?.quotedMessage ||
    msg.documentMessage?.contextInfo?.quotedMessage ||
    msg.contextInfo?.quotedMessage;

  const contact =
    msg.contactMessage ||
    (msg.contactsArrayMessage?.contacts && msg.contactsArrayMessage.contacts[0]) ||
    quoted?.contactMessage ||
    (quoted?.contactsArrayMessage?.contacts && quoted.contactsArrayMessage.contacts[0]);

  if (!contact) return null;
  const name = contact.displayName || "Contact";
  const vcard = contact.vcard || "";

  let phone = "";
  const waidMatch = vcard.match(/waid=(\d+)/i);
  if (waidMatch) {
    phone = waidMatch[1];
  } else {
    const telMatch = vcard.match(/TEL[^:]*:([^\r\n]+)/i);
    if (telMatch) {
      phone = telMatch[1].replace(/\D/g, "");
    }
  }

  if (phone) {
    if (phone.startsWith("0") && phone.length === 11) phone = "234" + phone.slice(1);
    return { name, phone };
  }
  return null;
}

export async function handleWhatsAppWebhook(req: NextRequest, forcedInstance?: string) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const msgObj = Array.isArray(body?.data) ? body.data[0] : (body?.data || body);
  if (!msgObj || !msgObj.key) return NextResponse.json({ ok: true });

  // 1. URL search params or forced instance
  let queryInstance = forcedInstance || req.nextUrl?.searchParams?.get("instance") || "";
  if (!queryInstance) {
    try {
      const parsedUrl = new URL(req.url);
      queryInstance = parsedUrl.searchParams.get("instance") || "";
    } catch {}
  }

  // 2. Webhook destination URL sent in body (Evolution API sends destination = registered webhook URL)
  let destInstance = "";
  if (body?.destination && typeof body.destination === "string") {
    try {
      const destUrl = new URL(body.destination);
      destInstance = destUrl.searchParams.get("instance") || "";
    } catch {}
    if (!destInstance && body.destination.includes("obey-autolearn-spot")) {
      destInstance = "obey-autolearn-spot";
    }
  }

  // 3. Direct instance identifier from Evolution payload or msgObj
  const bodyInstance =
    (typeof body?.instance === "string" ? body.instance : body?.instance?.name) ||
    (typeof body?.instanceId === "string" ? body.instanceId : "") ||
    (typeof body?.data?.instance === "string" ? body.data.instance : body?.data?.instance?.name) ||
    (typeof body?.data?.instanceId === "string" ? body.data.instanceId : "") ||
    (typeof msgObj?.instanceId === "string" ? msgObj.instanceId : "") ||
    (Array.isArray(body?.data) && (body.data[0]?.instance || body.data[0]?.instanceId)) ||
    "";

  // 4. Connected bot owner phone (the bot account receiving the message)
  const connectedOwner = (
    body?.sender ||
    body?.owner ||
    body?.data?.owner ||
    msgObj?.owner ||
    (Array.isArray(body?.data) && body.data[0]?.owner) ||
    ""
  ).replace(/@s\.whatsapp\.net|@lid|@g\.us/g, "").replace(/\D/g, "");

  // 5. Path-based instance check
  const pathInstance = req.nextUrl.pathname.includes("/obey-autolearn-spot")
    ? "obey-autolearn-spot"
    : "";

  let instanceName = forcedInstance || pathInstance || queryInstance || destInstance || bodyInstance || "";

  // 6. Direct Database lookup by Evolution UUID
  const detectedInstanceId = body?.instanceId || body?.data?.instanceId || msgObj?.instanceId || "";
  if (!instanceName || instanceName === "obey" || instanceName === "default") {
    if (detectedInstanceId === "6acca55e-e17a-4116-af24-585cd0d5161b" || connectedOwner.endsWith("9074027451")) {
      instanceName = "obey-autolearn-spot";
    } else if (detectedInstanceId && sql) {
      try {
        const evoInst = await sql`
          SELECT name FROM evolution."Instance" WHERE id = ${detectedInstanceId} LIMIT 1
        `;
        if (evoInst && evoInst.length > 0 && evoInst[0].name) {
          instanceName = evoInst[0].name;
        }
      } catch {}
    }
  }

  if (!instanceName) {
    instanceName = "obey";
  }

  // Bulletproof mapping: If connected bot number is 09074027451 or instance hints match AutoLearn Spot
  if (
    detectedInstanceId === "6acca55e-e17a-4116-af24-585cd0d5161b" ||
    connectedOwner.endsWith("9074027451") ||
    instanceName.toLowerCase().includes("autolearn") ||
    instanceName === "6acca55e-e17a-4116-af24-585cd0d5161b"
  ) {
    instanceName = "obey-autolearn-spot";
  } else if (
    detectedInstanceId === "f3fd36fd-b59c-462d-863d-01eaf4c8c190" ||
    connectedOwner.endsWith("9161488564") ||
    instanceName === "f3fd36fd-b59c-462d-863d-01eaf4c8c190"
  ) {
    instanceName = "obey";
  }

  // Log raw incoming request for telemetry
  try {
    if (sql) {
      await sql`
        INSERT INTO webhook_raw_logs (id, url, instance_detected, body)
        VALUES (${'raw_' + Date.now()}, ${req.url}, ${instanceName}, ${JSON.stringify(body)})
      `;
    }
  } catch {}

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

  // 1. Explicitly trigger blue ticks (Read receipt) for the sender
  if (msgObj.key?.id && senderJid) {
    markWhatsAppMessageRead(instanceName, senderJid, msgObj.key.id).catch(() => {});
  }

  let senderNumber = senderJid.replace(/@s\.whatsapp\.net|@g\.us|@lid/g, "").replace(/\D/g, "");

  // 2. Trigger typing indicator presence
  if (senderNumber) {
    sendWhatsAppPresence(instanceName, senderNumber, "composing", 1500).catch(() => {});
  }

  // In WhatsApp multi-device, messages to linked accounts can arrive with @lid.
  // For Main Obey (instance 'obey'), route unrecognized LIDs to Femi's verified number.
  if (instanceName === "obey" || instanceName === "default") {
    if (senderJid.endsWith("@lid") || !senderNumber || senderNumber.length > 13 || senderNumber.length < 10) {
      senderNumber = FEMI_PERSONAL_NUMBER;
    }
  } else {
    // For business workspaces, check alternate participant fields first
    const alt = msgObj.key?.remoteJidAlt || msgObj.key?.participantPn || msgObj.key?.participant || "";
    const cleanAlt = alt.replace(/@s\.whatsapp\.net|@g\.us|@lid/g, "").replace(/\D/g, "");
    if (cleanAlt && cleanAlt.length >= 10 && cleanAlt.length <= 13) {
      senderNumber = cleanAlt;
    }
  }

  let userText = (
    msgObj.message?.conversation ||
    msgObj.message?.extendedTextMessage?.text ||
    msgObj.message?.imageMessage?.caption ||
    msgObj.message?.documentMessage?.caption ||
    ""
  ).trim();

  // Extract shared WhatsApp contact cards (e.g. vCard attachments)
  const contactCard = extractContactCardInfo(msgObj.message);
  if (contactCard) {
    const contactTag = `[Shared Contact Card: ${contactCard.name} (Phone: +${contactCard.phone})]`;
    userText = userText ? `${contactTag} ${userText}` : contactTag;
  }

  const isAudio = Boolean(msgObj.message?.audioMessage);
  const isImage = Boolean(msgObj.message?.imageMessage);
  const isDoc = Boolean(msgObj.message?.documentMessage || msgObj.message?.documentWithCaptionMessage);
  const isContact = Boolean(contactCard);

  if (!userText && !isAudio && !isImage && !isDoc && !isContact) {
    return NextResponse.json({ ok: true });
  }

  console.log(`[WA Webhook] Incoming (${instanceName}) from ${senderNumber}: "${userText || (isAudio ? '[Audio]' : isImage ? '[Image]' : '[Doc]')}"`);

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
            activeText = userText ? `${userText} ${transRes.text}` : transRes.text;
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
        instanceName,
        connectedOwner,
      });
    } catch (err) {
      console.error("[WA] processMessage background task error:", err);
    }
  });

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  return handleWhatsAppWebhook(req);
}

export async function GET() {
  return NextResponse.json({
    status: "active",
    version: "v5-instanceid-routing",
    service: "Obey WhatsApp Webhook Gateway",
    endpoint: "/api/obey/whatsapp/webhook",
    linkedNumber: "2349161488564",
    femiPersonal: "2348120934828",
  });
}
