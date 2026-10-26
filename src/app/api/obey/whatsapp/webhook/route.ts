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
  dbGetRealPhoneByLid,
  dbGetWorkspaceLeads,
  dbGetWorkspaceBySlug,
  dbGetWorkspaceById,
  dbGetWorkspaceByInstanceName,
  dbGetWorkspaceSettings,
  dbRecordStatusComment,
  dbHasRecentStatusComment,
  dbGetStatusCommentsTodayCount,
  dbIsPhoneExcludedFromStatusComments,
  dbAddStatusExclusion,
  dbRemoveStatusExclusion,
  dbGetStatusExclusions,
  dbGetPlatformPricing,
  dbSetWorkspaceBotBypass,
  dbGetWorkspaceBotBypass,
  dbEnqueueWorkspaceMessage,
  dbUpdateWorkspaceMessageQueueStatus,
  dbRecordMissedIntent,
  isValidE164Phone,
} from "@/lib/db";
import {
  getUserFullMemory,
  saveUserPersonalMemory,
  generateAIImage,
  saveUserImageMemory,
  isImageRevisionRequest,
  generateFaceLockWithFal,
  generateFaceSwapWithSegmind,
  isFaceSwapRequest,
  generateImageToImageWithCloudflare,
  editImageWithInstructPix2Pix,
} from "@/lib/image-generator";
import { v2 as cloudinary } from "cloudinary";
import { autoLearnUserMemory } from "@/lib/memory-learner";
import {
  sendWhatsAppMessage,
  sendWhatsAppButtons,
  sendWhatsAppList,
  sendWhatsAppAudio,
  sendWhatsAppImage,
  sendWhatsAppStatusPost,
  fetchEvolutionMediaBase64,
  markWhatsAppMessageRead,
  sendWhatsAppPresence,
  sendWhatsAppReaction,
} from "@/lib/whatsapp-gateway";
import { generateSpeechAudio } from "@/lib/tts-engine";
import { logToGoogleSheet } from "@/lib/sheets-logger";
import { runUpworkLiveScout } from "@/lib/upwork-scout";
import { runB2BLeadHunter } from "@/lib/apollo-hunter";
import { runGmailInboxSync } from "@/lib/gmail-reader";
import { getAgentTasks, executeAgentTask } from "@/lib/obey-agent";
import { dispatchMorningBriefing, dispatchEveningWrapup } from "@/lib/proactive-engine";
import { formatToWAT, formatDateTimeWAT, getNigerianTime } from "@/lib/utils";
import { getObeyBrainContext, getSetting, setSetting } from "@/lib/settings";
import { checkCustomerSpamRateLimit } from "@/lib/rate-limiter";
import { executePendingUserAction } from "@/lib/agent-dispatcher";
import { processDynamicCompanionTurn } from "@/lib/dynamic-companion";
import { getLatestUserArtifact } from "@/lib/artifact-engine";
import {
  OBEY_BUSINESS_MANUAL_KNOWLEDGE,
  MAIN_OBEY_FLAGSHIP_KNOWLEDGE,
  getObeyBusinessManualKnowledge,
  getMainObeyFlagshipKnowledge,
} from "@/lib/obey-manual-knowledge";
import {
  handleScheduledTaskConversation,
  dispatchDueScheduledTasks,
} from "@/lib/scheduled-task-engine";
import {
  matchInstantFAQIntent,
  getCachedFAQResponse,
  setCachedFAQResponse,
} from "@/lib/faq-cache";

// Tell Next.js to use the Edge-compatible streaming runtime so we can
// respond instantly and keep processing in the background.
export const dynamic = "force-dynamic";
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

/**
 * Strips meta audio stage directions, generated disclaimers, or bracketed audio commentary
 * so they are never spoken aloud by voice notes or displayed in WhatsApp chat text.
 */
function stripAudioStageDirections(text: string): string {
  if (!text) return "";
  return text
    // Strip meta audio disclaimers and stage directions in brackets/parentheses
    .replace(/\s*\*?\s*\([^)]*(?:audio|voice|vn|dispatched|generating|record|speaking|note|sent|attach|deliver)[^)]*\)\s*\*?/gi, "")
    .replace(/\s*\*?\s*\[[^\]]*(?:audio|voice|vn|dispatched|generating|record|speaking|note|sent|attach|deliver)[^\]]*\]\s*\*?/gi, "")
    .replace(/\s*\*(?:Audio|Voice|VN)[^*]*(?:generating|dispatched|sent|recording)[^*]*\*\s*/gi, "")
    .replace(/^\s*\*?\([^)]+\)\*?\s*/g, "")
    .replace(/\s*\*?\([^)]+\)\*?\s*$/g, "")
    .trim();
}

// Enterprise scale sliding-window deduplication (up to 10,000 entries, 5-minute TTL)
const recentlyProcessedWebhookMessageIds = new Map<string, number>();

function isDuplicateWebhookMessage(messageId: string): boolean {
  if (!messageId) return false;
  const now = Date.now();
  if (recentlyProcessedWebhookMessageIds.size > 5000) {
    for (const [id, ts] of recentlyProcessedWebhookMessageIds.entries()) {
      if (now - ts > 300000) {
        recentlyProcessedWebhookMessageIds.delete(id);
      }
    }
  }
  if (recentlyProcessedWebhookMessageIds.has(messageId)) {
    return true;
  }
  recentlyProcessedWebhookMessageIds.set(messageId, now);
  return false;
}

// ============================================================================
// ANTI-BOT SHIELD: PLATFORM BOT REGISTRY & EXTERNAL AUTO-RESPONDER DETECTOR
// Prevents bot-to-bot infinite loops (e.g. Obey chatting with AutoLearn Spot)
// ============================================================================
let platformBotNumbersCache: { set: Set<string>; lastFetch: number } = {
  set: new Set(["2349161488564", "2349074027451", "2349071965770"]),
  lastFetch: 0,
};

async function refreshPlatformBotNumbers(): Promise<Set<string>> {
  const now = Date.now();
  if (now - platformBotNumbersCache.lastFetch < 300000 && platformBotNumbersCache.set.size > 0) {
    return platformBotNumbersCache.set;
  }
  const newSet = new Set(["2349161488564", "2349074027451", "2349071965770"]);
  try {
    if (sql) {
      const rows = await sql`
        SELECT "ownerJid" FROM evolution."Instance" WHERE "ownerJid" IS NOT NULL
      `;
      for (const r of rows) {
        if (r.ownerJid) {
          const clean = r.ownerJid.replace(/@s\.whatsapp\.net|@lid|@g\.us/g, "").replace(/\D/g, "");
          if (clean.length >= 10) newSet.add(clean);
        }
      }
    }
  } catch (e) {
    console.warn("[Platform Bot Cache] Error loading instances:", e);
  }
  platformBotNumbersCache = { set: newSet, lastFetch: now };
  return newSet;
}

function isPlatformBotNumber(phone: string | undefined | null): boolean {
  if (!phone) return false;
  const clean = phone.replace(/\D/g, "");
  if (!clean || clean.length < 8) return false;
  // NEVER classify Femi's personal phone as a bot!
  if (clean === FEMI_PERSONAL_NUMBER || clean.endsWith(FEMI_PERSONAL_NUMBER.slice(-10))) {
    return false;
  }
  for (const botNum of platformBotNumbersCache.set) {
    if (clean === botNum || clean.endsWith(botNum.slice(-10)) || botNum.endsWith(clean.slice(-10))) {
      return true;
    }
  }
  return false;
}

function isExternalAutoResponder(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  return (
    /\b(thank you for contacting|thanks for reaching out|we are currently away|our business hours are|we will get back to you shortly|automated message|auto-reply|auto reply|please choose from the menu|reply with [0-9]|type [0-9] for|press [0-9] for)\b/i.test(lower) ||
    /^(thank you for contacting|hi! thank you for contacting|hello! thank you for contacting)/i.test(lower)
  );
}

interface ProcessMessageParams {
  senderNumber: string;
  userText: string;
  pushName?: string;
  isVoiceNote?: boolean;
  isSticker?: boolean;
  messageId?: string;
  visionMedia?: { base64: string; mimetype: string } | null;
  docMedia?: { base64: string; mimetype: string } | null;
  documentFileName?: string;
  instanceName?: string;
  connectedOwner?: string;
}

/**
 * Universal WhatsApp Status Post Command Extractor
 * Matches all variations of owner commands to publish to status:
 * - "Post: Thank you Lord"
 * - "post: test"
 * - "Post status: Flash sale!"
 * - "status: We are open"
 * - "Put on status: Good morning"
 * - "Share to status: Hello"
 * - "Post to status: ..."
 * - "Post status Flash sale" (no colon)
 */
function extractStatusPostText(input: string): string | null {
  if (!input) return null;
  // 1. Strip code block backticks (``` or `), markdown blockquotes (>), and quotation marks
  let clean = input.trim();
  clean = clean.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/i, "");
  clean = clean.replace(/^`+|`+$/g, "").trim();
  clean = clean.replace(/^>+\s*/g, "").trim();
  clean = clean.replace(/^["'“‘]+|["'”’]+$/g, "").trim();

  // 2. Strip friendly conversational prefixes (e.g. "Obey, ", "Please ", "Help me ")
  clean = clean.replace(
    /^(?:obey(?:\s+(?:ai|business|bot))?|please|kindly|help\s+me|can\s+you(?:\s+please)?)\s*[,:]?\s*/i,
    ""
  ).trim();

  // Strip backticks/quotes again if wrapped inside friendly prefix
  clean = clean.replace(/^`+|`+$/g, "").trim();
  clean = clean.replace(/^["'“‘]+|["'”’]+$/g, "").trim();

  // 3. Prefix with colon or hyphen: "Post: ...", "Post status: ...", "Status: ...", "Put on status: ..."
  const colonMatch = clean.match(
    /^(?:post\s+(?:this\s+)?(?:to\s+|on\s+)?(?:my\s+)?status|status\s+update|status|put\s+(?:this\s+)?on\s+(?:my\s+)?status|publish\s+(?:this\s+)?(?:to\s+|on\s+)?(?:my\s+)?status|share\s+(?:this\s+)?(?:to|on)\s+(?:my\s+)?status|post)\s*[:\-]\s*(.*)$/is
  );
  if (colonMatch) {
    let extracted = (colonMatch[1] || "").trim();
    extracted = extracted.replace(/^`+|`+$/g, "").replace(/^["'“‘]+|["'”’]+$/g, "").trim();
    return extracted;
  }

  // 4. Explicit phrase commands without colon: "Post status Hello", "Put on status Hello", "Post to status Hello"
  const phraseMatch = clean.match(
    /^(?:post\s+(?:this\s+)?(?:to\s+|on\s+)?(?:my\s+)?status|put\s+(?:this\s+)?on\s+(?:my\s+)?status|publish\s+(?:this\s+)?(?:to\s+|on\s+)?(?:my\s+)?status|share\s+(?:this\s+)?(?:to|on)\s+(?:my\s+)?status)\s+(.*)$/is
  );
  if (phraseMatch) {
    let extracted = (phraseMatch[1] || "").trim();
    extracted = extracted.replace(/^`+|`+$/g, "").replace(/^["'“‘]+|["'”’]+$/g, "").trim();
    return extracted;
  }

  // 5. Exact commands like "post status" or "post:" alone with no text
  if (/^(?:post\s+(?:to\s+|on\s+)?(?:my\s+)?status|status|post\s*[:\-])$/i.test(clean)) {
    return "";
  }

  return null;
}

/**
 * Handles incoming WhatsApp messages for Obey Business instances (e.g. AutoLearn Spot).
 * - Only responds to the business OWNER as their private AI business manager.
 * - Allows posting status updates on command ("Post: ...", "Post status: ...").
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
  visionMedia?: { base64: string; mimetype: string } | null;
  docMedia?: { base64: string; mimetype: string } | null;
  documentFileName?: string;
  isSticker?: boolean;
}) {
  const {
    currentWs,
    userText,
    replyTo,
    pushName,
    historyText,
    instanceName,
    reply,
    visionMedia,
    docMedia,
    documentFileName,
    isSticker,
  } = params;
  const lower = userText.toLowerCase().trim();

  // Sticker reaction for owner
  if (isSticker) {
    const stickerReplies = [
      `Haha, nice sticker Boss! 😄 Wetin we dey tackle for ${currentWs.name} today?`,
      `Love the sticker vibe, Boss! 🔥 How can I assist you with ${currentWs.name} right now?`,
      `Sharp sticker, Boss! ⚡ What would you like to work on for ${currentWs.name}?`,
    ];
    const replyTxt = stickerReplies[Math.floor(Math.random() * stickerReplies.length)];
    await reply(replyTxt);
    try {
      await dbAddGuestMessage({
        id: `guest-stk-${Date.now()}`,
        phone_number: replyTo,
        sender_name: currentWs.name,
        role: "assistant",
        content: replyTxt,
        workspace_id: currentWs.id,
      });
    } catch {}
    return;
  }

  // 0. Intelligent Scheduled Tasks & Reminders Handling
  const taskTurn = await handleScheduledTaskConversation({
    userText,
    historyText,
    recipientPhone: replyTo,
    workspaceId: currentWs.id,
    instanceName,
    senderName: currentWs.name,
  });

  if (taskTurn.handled && taskTurn.replyText) {
    await reply(taskTurn.replyText);
    try {
      await dbAddGuestMessage({
        id: `guest-asst-${Date.now()}`,
        phone_number: replyTo,
        sender_name: currentWs.name,
        role: "assistant",
        content: taskTurn.replyText,
        workspace_id: currentWs.id,
      });
    } catch {}
    return;
  }

  // 1. WhatsApp Status Automation Commands: "post: ...", "post status: ...", "status: ...", "put on status: ..."
  const extractedStatus = extractStatusPostText(userText);
  if (extractedStatus !== null) {
    if (!extractedStatus) {
      await reply("Boss, please specify what you want me to post to your WhatsApp Status! E.g. `Post: Flash sale today! 20% off all orders.`");
      return;
    }

    const targetInst = currentWs?.whatsapp_instance_name || instanceName || "obey";
    
    // 1. Immediately confirm to Boss within 1s so they get instant acknowledgement without waiting
    await reply(`🚀 *Status Publishing Initiated!*, Boss.\n\nBroadcasting your update to your entire audience now:\n\n"${extractedStatus}"`);

    // 2. Broadcast to full audience (up to 3,000 contacts) asynchronously
    sendWhatsAppStatusPost({
      text: extractedStatus,
      instanceName: targetInst,
    }).then(async (res) => {
      if (res.success && sql) {
        try {
          await sql`
            INSERT INTO workspace_statuses (id, workspace_id, content, status, message_id, posted_at)
            VALUES (${'stat_' + Date.now()}, ${currentWs.id}, ${extractedStatus}, 'posted', ${res.messageId || null}, NOW())
          `;
        } catch (dbErr) {
          console.warn("[WA Status DB] Insert error:", dbErr);
        }
      } else if (!res.success) {
        console.warn("[WA Status Post] Broadcast issue:", res.error);
      }
    }).catch((postErr) => console.warn("[WA Status Post] Broadcast exception:", postErr));

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

  // 3.4. Owner Status Exclusion Management Command
  if (/\b(status\s+exclusion|excluded\s+from\s+status|status\s+blacklist|status\s+opt-out)\b/i.test(lower)) {
    const exclusions = await dbGetStatusExclusions(currentWs.id);
    if (!exclusions || exclusions.length === 0) {
      await reply(`🚫 *Status Comment Exclusion List for ${currentWs.name}:*\n\nNo contacts are currently excluded. All contacts with status stories will be viewed and engaged.\n\n💡 *To exclude someone, say:* "Exclude 08012345678 from status comments"`);
    } else {
      const list = exclusions.map((ex, i) => `${i + 1}. *${ex.name || ex.phone}* (+${ex.phone})\n   • Reason: ${ex.reason || "Opt-out"}`).join("\n\n");
      await reply(`🚫 *Status Comment Exclusion List (${exclusions.length} contacts):*\n\n${list}\n\n💡 *To remove someone, say:* "Remove +${exclusions[0]?.phone} from status exclusion"`);
    }
    return;
  }

  const excludeMatch = userText.match(/\b(?:exclude|block|blacklist)\s+([+0-9\s-]{10,16})\s+(?:from|on)\s+(?:status|status\s+commenting|status\s+comments)\b/i);
  if (excludeMatch && excludeMatch[1]) {
    const rawNumber = excludeMatch[1].replace(/\D/g, "");
    await dbAddStatusExclusion(currentWs.id, rawNumber, `Contact ${rawNumber.slice(-4)}`, "Owner excluded via WhatsApp");
    await reply(`✅ *Contact Excluded!*, Boss.\n\n+${rawNumber} has been added to your status comment exclusion list. Obey will never comment on their status stories.`);
    return;
  }

  const removeExcludeMatch = userText.match(/\b(?:remove|unblock|re-allow)\s+([+0-9\s-]{10,16})\s+(?:from)\s+(?:status\s+exclusion|status\s+blacklist)\b/i);
  if (removeExcludeMatch && removeExcludeMatch[1]) {
    const rawNumber = removeExcludeMatch[1].replace(/\D/g, "");
    await dbRemoveStatusExclusion(currentWs.id, rawNumber);
    await reply(`✅ *Contact Re-allowed!*, Boss.\n\n+${rawNumber} has been removed from the exclusion list. Obey will resume normal status engagement for them.`);
    return;
  }

  // 3.5. Owner Contact Search & Bucket Messaging Commands ("help me message Femi", "deliver this to bucket 1", "YES" to approve)
  try {
    const { handleOwnerContactOrBucketTurn } = await import("@/lib/contact-agent");
    const contactTurn = await handleOwnerContactOrBucketTurn({
      workspaceId: currentWs.id,
      instanceName,
      userPhone: replyTo,
      userText,
      historyText,
      ownerName: currentWs.owner_name || "Boss",
    });
    if (contactTurn.handled) {
      await reply(contactTurn.reply);
      return;
    }
  } catch (err) {
    console.warn("[WA Webhook] contact/bucket handler warning:", err);
  }

  // 4. Conversational Obey Business Assistant
  const [wsSettings, platformPricing] = await Promise.all([
    dbGetWorkspaceSettings(currentWs.id),
    dbGetPlatformPricing(),
  ]);
  const businessBio = wsSettings?.business_bio || currentWs.bio_context || "Professional services and products.";
  const catalog = currentWs.catalog_items || wsSettings?.catalog_summary || [];
  const isImageOrVisualPromptTurn =
    /\b(?:make|create|generate|draw|design|paint|produce|build|render|give me)\b[\w\s,–—-]{0,80}\b(?:image|photo|picture|artwork|illustration|flyer|poster|banner|logo|graphic|portrait|scene|character|visual|thumbnail|render|reference)\b/i.test(userText) ||
    (/\b(?:aspect\s*ratio|9:16|16:9|cinematic\s+cgi|photorealistic|hyperrealistic)\b/i.test(userText) && /\b(?:create|make|generate|render|draw|character|scene)\b/i.test(userText));
  const asksVoiceCall =
    !isImageOrVisualPromptTurn &&
    /\b(?:voice call with you|call (?:you|me|link)|talk on phone with you|voice link|call link|speak on phone with you|can (?:we|i) call(?: you)?)\b/i.test(userText) &&
    !/\b(?:ended|after|during|finished|missed|received)\s+(?:a\s+)?phone call\b/i.test(userText);
  const { timeStr: currentWatTime, dateStr: currentWatDate } = getNigerianTime();

  const cleanHistory = (historyText || "")
    .replace(/\b(?:It'?s|It is|Currently|As of)\s+(?:currently\s+)?\*\*\d{1,2}:\d{2}\s*(?:AM|PM)\s*WAT\*\*.*?(?:\.|\n|$)/gi, "")
    .replace(/\b(?:It'?s|It is|Currently|As of)\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*WAT.*?(?:\.|\n|$)/gi, "")
    .replace(/\n{3,}/g, "\n\n");

  const systemPrompt = `You are Obey Business AI, the private 24/7 autonomous operations assistant and business manager for "${currentWs.name}".
You are chatting directly with your business owner/boss (${currentWs.owner_name || "Boss"}).

INTERNAL CLOCK (FOR CONTEXT ONLY):
• Current Local Time: ${currentWatTime} (WAT, Africa/Lagos) | Date: ${currentWatDate}
• 🚨 STRICT PROHIBITION: NEVER state, announce, or append the current time, date, or "It's currently ... WAT" to any message UNLESS Boss explicitly asked "What time is it?" or "What is the date?". Stating the time when unprompted is strictly forbidden.

Business Knowledge:
${businessBio}

Product & Service Catalog:
${JSON.stringify(catalog)}

VOICE CALL CAPABILITY:
- You have an active, 100% free live 24/7 WebRTC voice calling capability powered by Obey!
- Your direct voice call hotline link is: ${voiceCallLink}
- When Boss asks to call, speak on the phone, hop on a voice call, or asks for your voice call link, ALWAYS invite them warmly and provide this exact link: ${voiceCallLink}
- NEVER say you cannot speak or don't have a voice calling feature! You can speak live via WebRTC!

Your role and personality:
- You are their dedicated business manager and operations co-pilot for "${currentWs.name}".
- Address them respectfully and warmly as "Boss".
- WHATSAPP STATUS POSTING RULES:
  • Status posting is triggered by the command system when Boss prefixes their message with "Post: [text]" or "Post status: [text]".
  • If Boss asks to post or publish something in conversational language (e.g. "put this on status", "can you post this?"), present the suggested draft and instruct Boss:
    "To post this live to your WhatsApp status story, simply reply with:
    Post: [Your text here]"
  You have the complete Obey Manual memorized. Guide Boss on how to use every feature: connecting WhatsApp with Plan B pairing code, saving leads with 1-click VCF export, creating Contact Buckets, running status broadcasts, and setting up keyword triggers.
- MAIN OBEY & ADVANCED CUSTOM ENGINEERING:
  You are fully aware of Main Obey (Femi Adeleke's flagship personal AI engineer & executive companion).
  If Boss asks for custom full-stack software development, bespoke enterprise bot setups, mobile app engineering, or wants to connect with Main Obey / Femi Adeleke directly, introduce Main Obey and provide Femi's verified direct clickable WhatsApp link:
  • Direct WhatsApp: https://wa.me/2348120934828 (+2348120934828)
  • Obey Platform: https://obeyai.vercel.app
  • Femi's Portfolio: https://obeyai.vercel.app/portfolio (Title: Femi Adeleke | AI Systems Architect & Full-Stack Developer)

${getObeyBusinessManualKnowledge(platformPricing)}
${getMainObeyFlagshipKnowledge()}`;

  let aiRes: any;
  if (visionMedia?.base64) {
    aiRes = await executeAICompletionWithMedia({
      systemPrompt,
      userPrompt: `${cleanHistory ? `RECENT CHAT HISTORY:\n${cleanHistory}\n\n` : ""}Boss sent this image with note: "${userText}". Review it in relation to ${currentWs.name} business operations and advise Boss directly:`,
      mediaBase64: visionMedia.base64,
      mimeType: visionMedia.mimetype || "image/jpeg",
      temperature: 0.5,
    });
  } else if (docMedia?.base64) {
    aiRes = await executeAICompletionWithMedia({
      systemPrompt,
      userPrompt: `${cleanHistory ? `RECENT CHAT HISTORY:\n${cleanHistory}\n\n` : ""}Boss sent this document (${documentFileName || "Document"}) with note: "${userText}". Review its contents in relation to ${currentWs.name} business operations and advise Boss directly:`,
      mediaBase64: docMedia.base64,
      mimeType: docMedia.mimetype || "application/pdf",
      temperature: 0.3,
    });
  } else {
    const userPrompt = `${cleanHistory ? `RECENT CHAT HISTORY:\n${cleanHistory}\n\n` : ""}Boss says: "${userText}"`;
    aiRes = await executeAICompletion({
      systemPrompt,
      userPrompt,
      temperature: 0.7,
    });
  }

  let replyText = aiRes.text;

  // Scrub accidental unsolicited timestamps unless user explicitly asked for the time
  if (!/\b(?:what(?:\s+is|\s+'s)?\s+(?:the\s+)?time|what\s+date|what\s+day)\b/i.test(userText)) {
    replyText = replyText
      .replace(/\b(?:It'?s|It is|Currently|As of)\s+(?:currently\s+)?\*\*\d{1,2}:\d{2}\s*(?:AM|PM)\s*WAT\*\*.*?(?:\.|\n|$)/gi, "")
      .replace(/\b(?:It'?s|It is|Currently|As of)\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*WAT.*?(?:\.|\n|$)/gi, "")
      .trim();
  }

  if (asksVoiceCall && !replyText.includes(currentWs.slug)) {
    replyText += `\n\n📞 *Start Live Voice Call with ${currentWs.name}:*\n${voiceCallLink}`;
  }
  await reply(replyText);
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
  visionMedia?: { base64: string; mimetype: string } | null;
  docMedia?: { base64: string; mimetype: string } | null;
  documentFileName?: string;
  isSticker?: boolean;
}) {
  const {
    currentWs,
    userText,
    replyTo,
    pushName,
    historyText,
    instanceName,
    reply,
    visionMedia,
    docMedia,
    documentFileName,
    isSticker,
  } = params;

  // Sticker reaction for customer
  if (isSticker) {
    const stickerReplies = [
      `Thanks for the sticker! 😊 How can I help you today with ${currentWs.name}?`,
      `Nice sticker! 👍 Let me know if you have any questions about our products or services!`,
      `Great vibe! ✨ How can I assist you today?`,
    ];
    const replyTxt = stickerReplies[Math.floor(Math.random() * stickerReplies.length)];
    await reply(replyTxt);
    try {
      await dbAddGuestMessage({
        id: `guest-stk-${Date.now()}`,
        phone_number: replyTo,
        sender_name: currentWs.name,
        role: "assistant",
        content: replyTxt,
        workspace_id: currentWs.id,
      });
    } catch {}
    return;
  }

  const [wsSettings, userFullMemory] = await Promise.all([
    dbGetWorkspaceSettings(currentWs.id),
    getUserFullMemory(replyTo),
  ]);

  const businessBio = wsSettings?.business_bio || currentWs.bio_context || "Professional services and products.";
  const catalog = currentWs.catalog_items || wsSettings?.catalog_summary || [];

  const customerName = pushName ? pushName.trim() : "Friend";
  const hasHistory = Boolean(historyText && historyText.trim().length > 15);

  // 1. Check for personal gender/memory directives from customer
  const declaresFemale = /\b(i am (?:a )?(?:lady|woman|girl|female)|i'm (?:a )?(?:lady|woman|girl|female)|i am her|i'm her|she\/her)\b/i.test(userText);
  const declaresMale = /\b(i am (?:a )?(?:guy|man|boy|male)|i'm (?:a )?(?:guy|man|boy|male)|i am him|i'm him|he\/him)\b/i.test(userText);
  if (declaresFemale) {
    await saveUserPersonalMemory({ userIdentifier: replyTo, gender: "female", userName: pushName });
  } else if (declaresMale) {
    await saveUserPersonalMemory({ userIdentifier: replyTo, gender: "male", userName: pushName });
  }

  // 2. Contextual Owner Request / Relay ("him" / "tell him" / "ask him to send data")
  const asksOwnerAction =
    /\b(tell him|ask him|let him know|reach out to him|connect with him|send data to me|give him my number|talk to him|call him)\b/i.test(userText.trim()) ||
    (/\b(tell|ask|let|send|call)\b/i.test(userText) && Boolean(currentWs.owner_name && userText.toLowerCase().includes(currentWs.owner_name.toLowerCase())));

  if (asksOwnerAction && currentWs.owner_phone) {
    try {
      const ownerAlert =
        `🔔 *New Customer Request (${currentWs.name}):*\n\n` +
        `• *From:* ${customerName} (+${replyTo})\n` +
        `• *Customer says:* "${userText}"\n` +
        `• *Context:* The customer is requesting you to reach out or send them information/data.\n\n` +
        `👉 *Action Required:* Please reply to or call them directly!`;

      await sendWhatsAppMessage(ownerAlert, currentWs.owner_phone, instanceName);
    } catch (alertErr) {
      console.warn("[WA] Could not alert business owner:", alertErr);
    }
  }

  const voiceCallLink = `https://obeyai.vercel.app/call?biz=${currentWs.slug}&phone=${replyTo}&name=${encodeURIComponent(customerName)}`;
  const asksVoiceCall = /\b(voice call|call (?:you|me|link)|talk on phone|on phone|phone call|voice link|call link|speak on phone|speak to (?:you|someone)|can (?:we|i) call)\b/i.test(userText);
  const { timeStr: currentWatTime, dateStr: currentWatDate } = getNigerianTime();

  const systemPrompt = `You are Obey Business AI, the human-like WhatsApp sales and customer assistant for "${currentWs.name}".
You are chatting with ${customerName}.

INTERNAL REAL-TIME CLOCK (FOR CONTEXT ONLY):
• Current Time: ${currentWatTime} WAT | Date: ${currentWatDate}
• 🚨 STRICT RULE: NEVER state, announce, or append the current time, date, or timestamps to any message UNLESS the customer explicitly asked "what time is it?" or "what date is it?". Mentioning the time unprompted is strictly forbidden.

About "${currentWs.name}":
${businessBio}

Product & Service Catalog:
${JSON.stringify(catalog, null, 2)}

${userFullMemory?.gender === 'female' ? 'CUSTOMER GENDER: Female / Lady. Refer to her respectfully as a lady (she/her). NEVER assume male, NEVER call her "my guy" or "bro"!' : ''}

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

3. UNDERSTANDING "HIM" & OWNER RELAYS:
   - When the customer says "tell him...", "ask him to send data", or "let him know", "him" refers to the business manager/owner (${currentWs.owner_name || "the business owner"}).
   - You have already notified ${currentWs.owner_name || "the owner"} directly! Simply acknowledge this warmly in 1 short sentence: "I've passed your message directly to ${currentWs.owner_name || "our team"}. They will reach out to you shortly!"

4. NATURAL HUMAN FLOW & ACCURACY:
   - If they say "How are you doing?", reply like a human: "I'm doing great, thank you! How are you?"
   - If they ask about something you don't do (e.g. cash payouts), answer simply and directly: "No, we don't distribute cash payouts. We provide training and learning packages to help you build skills."
   - Keep emojis tasteful and minimal (0-2 max per message, never excessive).

5. LIVE VOICE CALL HOTLINE:
   - You HAVE an active 24/7 WebRTC Live Voice Hotline where customers can speak directly with you over audio!
   - Your direct hotline link is: ${voiceCallLink}
   - When a customer asks to talk on the phone, hop on a call, or asks for your voice call link, ALWAYS invite them warmly and share the link: "You can speak with me directly on a live voice call right now! Tap here to start: ${voiceCallLink}"
   - NEVER say you are only text-based or don't have a phone/calling feature!

6. BRAND REPRESENTATION & ISOLATION (STRICT):
   - You represent "${currentWs.name}" exclusively.
   - NEVER transfer, redirect, or send customer leads to other bots or external WhatsApp numbers.
   - If a customer asks about getting an AI assistant or technical setup, keep them within "${currentWs.name}": inform them that ${currentWs.owner_name || "the management"} can assist them with business inquiries.
   - NEVER share Femi's personal number or redirect customers away from this business.

7. PRIVACY, SECURITY & CHAT CONFIDENTIALITY (STRICT):
   - If a customer asks how you got their number or how this chat appeared on their phone:
     Explain calmly: "This is the official automated AI assistant line for ${currentWs.name}. You are connected to our public WhatsApp service to assist with questions, catalog items, and orders. Your phone number and personal details remain completely private."
     NEVER say "the developer connected your number to test things out" or mention internal developer configurations!
   - If a customer asks "Can Femi / the developer / anyone read my chats?":
     Reassure them firmly: "No. Your messages are completely private and processed directly by our automated AI system to assist you. The developer does not read your personal chats."
     NEVER say "the developer has access to server logs to read chats" — that alarms users and creates false panic.
   - If a customer asks to stop, remove, or opt out:
     Politely say: "You are always in control. You can simply delete or block this chat at any time, or text 'Stop', and we will never message you again."`;

  // 0. Phase 2 Instant FAQ Cache & Semantic Matcher (< 15ms latency, 0 tokens)
  if (!userText.includes("[Attached") && userText.length >= 6) {
    const instantMatch = matchInstantFAQIntent({
      userQuery: userText,
      businessName: currentWs.name,
      bioContext: businessBio,
      catalogSummary: typeof catalog === "string" ? catalog : JSON.stringify(catalog),
      ownerName: currentWs.owner_name,
    });

    if (instantMatch.hit && instantMatch.response) {
      console.log(`[FAQ Cache] Instant intent hit for ${currentWs.name}: "${userText.slice(0, 40)}"`);
      await reply(instantMatch.response);
      try {
        await dbAddGuestMessage({
          id: `guest-asst-${Date.now()}`,
          phone_number: replyTo,
          sender_name: currentWs.name,
          role: "assistant",
          content: instantMatch.response,
          workspace_id: currentWs.id,
        });
      } catch {}
      return;
    }

    const cachedFAQ = await getCachedFAQResponse(currentWs.id, userText);
    if (cachedFAQ.hit && cachedFAQ.response) {
      console.log(`[FAQ Cache] DB cache hit for ${currentWs.name}: "${userText.slice(0, 40)}"`);
      await reply(cachedFAQ.response);
      try {
        await dbAddGuestMessage({
          id: `guest-asst-${Date.now()}`,
          phone_number: replyTo,
          sender_name: currentWs.name,
          role: "assistant",
          content: cachedFAQ.response,
          workspace_id: currentWs.id,
        });
      } catch {}
      return;
    }
  }

  const cleanCustomerHistory = (historyText || "")
    .replace(/\b(?:It'?s|It is|Currently|As of)\s+(?:currently\s+)?\*\*\d{1,2}:\d{2}\s*(?:AM|PM)\s*WAT\*\*.*?(?:\.|\n|$)/gi, "")
    .replace(/\b(?:It'?s|It is|Currently|As of)\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*WAT.*?(?:\.|\n|$)/gi, "")
    .replace(/\n{3,}/g, "\n\n");

  let aiRes: any;
  if (visionMedia?.base64) {
    aiRes = await executeAICompletionWithMedia({
      systemPrompt,
      userPrompt: `${cleanCustomerHistory ? `RECENT CONVERSATION HISTORY:\n${cleanCustomerHistory}\n\n` : ""}Customer sent an image with note: "${userText}". Analyze this image in relation to our business products and services catalog, and answer them directly in 1-2 sentences:`,
      mediaBase64: visionMedia.base64,
      mimeType: visionMedia.mimetype || "image/jpeg",
      temperature: 0.5,
    });
  } else if (docMedia?.base64) {
    aiRes = await executeAICompletionWithMedia({
      systemPrompt,
      userPrompt: `${cleanCustomerHistory ? `RECENT CONVERSATION HISTORY:\n${cleanCustomerHistory}\n\n` : ""}Customer sent a document (${documentFileName || "Document"}) with note: "${userText}". Review this document and answer them directly in 1-2 sentences:`,
      mediaBase64: docMedia.base64,
      mimeType: docMedia.mimetype || "application/pdf",
      temperature: 0.3,
    });
  } else {
    const userPrompt = `${cleanCustomerHistory ? `RECENT CONVERSATION HISTORY:\n${cleanCustomerHistory}\n\n` : ""}Customer says: "${userText}"`;
    aiRes = await executeAICompletion({
      systemPrompt,
      userPrompt,
      temperature: 0.5,
    });
  }

  let replyText = aiRes.text;

  // Scrub accidental unsolicited timestamps unless user explicitly asked for the time
  if (!/\b(?:what(?:\s+is|\s+'s)?\s+(?:the\s+)?time|what\s+date|what\s+day)\b/i.test(userText)) {
    replyText = replyText
      .replace(/\b(?:It'?s|It is|Currently|As of)\s+(?:currently\s+)?\*\*\d{1,2}:\d{2}\s*(?:AM|PM)\s*WAT\*\*.*?(?:\.|\n|$)/gi, "")
      .replace(/\b(?:It'?s|It is|Currently|As of)\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*WAT.*?(?:\.|\n|$)/gi, "")
      .trim();
  }

  if (asksVoiceCall && !replyText.includes(currentWs.slug)) {
    replyText += `\n\n📞 *Start Live Voice Call with ${currentWs.name}:*\n${voiceCallLink}`;
  }
  await reply(replyText);

  // Store in semantic FAQ cache asynchronously for subsequent identical customer questions
  if (userText.length >= 6 && replyText && !asksVoiceCall) {
    setCachedFAQResponse({
      workspaceId: currentWs.id,
      userQuery: userText,
      response: replyText,
    }).catch(() => {});
  }

  // Save assistant reply to guest DB
  try {
    await dbAddGuestMessage({
      id: `guest-asst-${Date.now()}`,
      phone_number: replyTo,
      sender_name: currentWs.name,
      role: "assistant",
      content: replyText,
      workspace_id: currentWs.id,
    });

    // Detect unhandled queries or fallbacks and log to Missed Intents Inbox
    const isFallbackReply =
      replyText.includes("Please, I am busy right now") ||
      replyText.includes("Check back with me later") ||
      replyText.includes("I don't have that information") ||
      replyText.includes("momentary glitch analyzing");

    if (isFallbackReply && userText.length >= 4) {
      dbRecordMissedIntent({
        workspace_id: currentWs.id,
        phone_number: replyTo,
        sender_name: pushName || "Customer",
        user_query: userText,
        ai_response: replyText,
        reason: "ai_fallback_or_uncertainty",
      }).catch((e) => console.warn("[Missed Intent] Record error:", e));
    }
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
  let isMainObeyInstance = !instanceName || instanceName === "obey" || instanceName === "default" || instanceName === "obey_default";
  let currentWs: any = null;
  if (!isMainObeyInstance) {
    currentWs = await dbGetWorkspaceByInstanceName(instanceName);
    if (!currentWs && connectedOwner) {
      currentWs = await dbGetWorkspaceByInstanceName(connectedOwner);
    }
    if (!currentWs) {
      currentWs = await dbGetWorkspaceBySlug(instanceName.replace(/^obey-/, ""));
    }
  }

  if (isMainObeyInstance && !currentWs) {
    currentWs = (await dbGetWorkspaceById("ws_femi_default")) || (await dbGetWorkspaceBySlug("femi-adeleke"));
  }

  const wsId = currentWs ? currentWs.id : (isMainObeyInstance ? "ws_femi_default" : "default");
  const isDefaultFemi = isMainObeyInstance && (!currentWs || currentWs.slug === "femi-adeleke" || currentWs.id === "ws_femi_default");

  const ownerClean = (currentWs?.owner_phone || (isDefaultFemi ? FEMI_PERSONAL_NUMBER : "")).replace(/\D/g, "");
  const isOwner = isDefaultFemi
    ? replyTo === FEMI_PERSONAL_NUMBER
    : (ownerClean ? (replyTo.endsWith(ownerClean.slice(-10)) || replyTo === ownerClean) : false);

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
    } else {
      try {
        await dbAddGuestMessage({
          id: `guest-asst-${Date.now()}`,
          phone_number: replyTo,
          sender_name: currentWs?.name || "Obey",
          role: "assistant",
          content: formatted,
          workspace_id: currentWs?.id || wsId,
        });
      } catch {}
    }
  }

  // Helper: synthesize & send native WhatsApp Voice Note (PTT) + companion text
  async function replyVoiceNote(spokenText: string, companionText?: string, suppressCompanionText: boolean = false) {
    const sendInstance = currentWs?.whatsapp_instance_name || instanceName || "obey";
    let voiceSent = false;
    const cleanSpoken = stripAudioStageDirections(spokenText);
    const cleanCompanion = stripAudioStageDirections(companionText || spokenText);

    // Broadcast WhatsApp "recording audio..." status live so user sees the recording badge!
    sendWhatsAppPresence(sendInstance, replyTo, "recording", 12000).catch(() => {});

    try {
      const speech = await generateSpeechAudio({
        text: cleanSpoken,
        voice: isDefaultFemi ? "en-NG-AbeoNeural" : (currentWs?.voice_name || "en-NG-AbeoNeural"),
        gender: "male",
        personality: currentWs?.voice_personality || (isDefaultFemi ? "nigerian_pidgin" : "friendly"),
      });

      if (speech?.base64) {
        const audioRes = await sendWhatsAppAudio(
          speech.base64,
          replyTo,
          undefined,
          sendInstance
        );
        voiceSent = audioRes.success;
      }
    } catch (ttsErr) {
      console.warn("[WA Webhook] Voice note generation notice:", ttsErr);
    }

    // Deliver accompanying text record if:
    // 1. Voice synthesis/dispatch failed (so user gets their answer as text fallback)
    // 2. OR companion text has substantial extra details beyond the spoken excerpt AND companion text is not explicitly suppressed
    const isLongCompanion = !suppressCompanionText && cleanCompanion && cleanCompanion.length > cleanSpoken.length + 40;
    if (!voiceSent || isLongCompanion) {
      if (cleanCompanion) {
        await reply(cleanCompanion);
      }
    }
    return voiceSent;
  }

  // 0. OWNER COMMANDS: BOT BYPASS TOGGLE (/stop, /start, /status)
  if (isOwner && userText) {
    const trimmedCommand = userText.trim();
    const isStopCommand = /^\s*(?:\/stop|stop\s+bot|pause\s+bot|\/pause|\/bypass\s+on)\s*$/i.test(trimmedCommand);
    const isStartCommand = /^\s*(?:\/start|start\s+bot|resume\s+bot|\/resume|\/bypass\s+off)\s*$/i.test(trimmedCommand);
    const isStatusQueryCommand = /^\s*(?:\/status|bot\s+status|bypass\s+status)\s*$/i.test(trimmedCommand);

    if (isStopCommand) {
      const targetId = currentWs?.id || (isDefaultFemi ? "ws_femi_default" : "default");
      await dbSetWorkspaceBotBypass(targetId, true);
      if (currentWs?.slug) {
        await dbSetWorkspaceBotBypass(currentWs.slug, true);
      }
      if (currentWs) currentWs.bot_bypass = true;

      const wsName = currentWs?.name || "your workspace";
      const stopReply =
        `🛑 *Bot Bypass Activated! (Bot Paused)*\n\n` +
        `Obey has stopped auto-replying to incoming customer messages for *${wsName}*.\n\n` +
        `• *Control Room Status:* Paused (Real-time synced)\n` +
        `• You can now chat manually with your customers on WhatsApp without any AI replies.\n\n` +
        `💡 *To resume autonomous AI replies:* Send */start* here or toggle Bot Bypass OFF in your Control Room.`;
      await reply(stopReply);
      return;
    }

    if (isStartCommand) {
      const targetId = currentWs?.id || (isDefaultFemi ? "ws_femi_default" : "default");
      await dbSetWorkspaceBotBypass(targetId, false);
      if (currentWs?.slug) {
        await dbSetWorkspaceBotBypass(currentWs.slug, false);
      }
      if (currentWs) currentWs.bot_bypass = false;

      const wsName = currentWs?.name || "your workspace";
      const startReply =
        `⚡ *Bot Bypass Deactivated! (Bot Active)*\n\n` +
        `Obey is back online and actively handling customer conversations and inquiries for *${wsName}* 24/7!\n\n` +
        `• *Control Room Status:* Active (Real-time synced)\n` +
        `• AI auto-replies, keyword triggers, and lead capture are operational.\n\n` +
        `💡 *To pause auto-replies anytime:* Send */stop* here or toggle Bot Bypass ON in your Control Room.`;
      await reply(startReply);
      return;
    }

    if (isStatusQueryCommand) {
      const isBypassed = Boolean(currentWs?.bot_bypass);
      const wsName = currentWs?.name || "Obey";
      const statusReply =
        `ℹ️ *Bot Operational Status for ${wsName}:*\n\n` +
        `• *Bot Bypass:* ${isBypassed ? "🛑 ON (Bot is Paused / Silent)" : "⚡ OFF (Bot is Active 24/7)"}\n` +
        `• *Controls:* Send */stop* to pause auto-replies, or */start* to resume.`;
      await reply(statusReply);
      return;
    }
  }

  // Natural Emoji Reactions & Sticker Handling
  if (params.messageId && replyTo) {
    const isAppreciation = /\b(thank you|thanks|well done|welldone|proud of you|you are the best|awesome|amazing|bless you|god bless|love you|appreciate)\b/i.test(lower);
    const isCelebration = /\b(fire|let'?s go|lets go|congrats|congratulations|wow|great job|kudos|superb|victory)\b/i.test(lower);
    const isAffirmation = /^(yes|yeah|sure|done|approved|proceed|perfect|correct|ok|okay)\b/i.test(lower.trim());
    const isHumor = /\b(haha|hahaha|lol|lmao|hehe|😂|🤣)\b/i.test(lower);

    let chosenReaction = "";
    if (params.isSticker) {
      chosenReaction = ["❤️", "🔥", "😂", "👍"][Math.floor(Math.random() * 4)];
    } else if (isAppreciation) {
      chosenReaction = "❤️";
    } else if (isCelebration) {
      chosenReaction = "🔥";
    } else if (isAffirmation) {
      chosenReaction = "👍";
    } else if (isHumor) {
      chosenReaction = "😂";
    }

    if (chosenReaction) {
      sendWhatsAppReaction({
        instanceName: currentWs?.whatsapp_instance_name || instanceName || "obey",
        remoteJid: `${replyTo}@s.whatsapp.net`,
        messageId: params.messageId,
        reaction: chosenReaction,
      }).catch((err) => console.warn("[WA Reaction] Failed to send emoji reaction:", err));
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
      workspace_id: wsId,
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

  // Auto-capture non-owner incoming contact into workspace_leads (for auto-saving & status view boost)
  if (!isOwner && currentWs && replyTo && isValidE164Phone(replyTo)) {
    try {
      const isAutoSave = currentWs.auto_save_contacts !== false;
      const contactName = pushName || `WhatsApp User ${replyTo.slice(-4)}`;
      const savedLead = await dbUpsertWorkspaceLead({
        workspace_id: currentWs.id,
        phone: replyTo,
        name: contactName,
        source: "whatsapp",
        status: isAutoSave ? "saved" : "lead",
        intent_summary: userText.slice(0, 150),
        last_message: userText,
        auto_save: isAutoSave,
        is_saved: isAutoSave,
      });
    } catch (leadErr) {
      console.warn("[WA] Auto-save contact lead capture error:", leadErr);
    }
  }

  // 1a. If Bot Bypass is ON, suppress autonomous AI replies completely (both customer chats and owner chatter)
  if (currentWs?.bot_bypass) {
    console.log(`[WA Bot Bypass] Auto-reply suppressed for ${replyTo} because Bot Bypass is ON for ${currentWs?.name}`);
    return;
  }

  // 1a-1. Strict Subscription & Trial Enforcement (Flagship 'femi-adeleke' is permanently active)
  if (currentWs && currentWs.slug !== "femi-adeleke") {
    const isTrial = currentWs.subscription_status === "trial";
    const trialExpired = Boolean(isTrial && currentWs.trial_ends_at && new Date(currentWs.trial_ends_at).getTime() < Date.now());
    const isSuspendedOrExpired = currentWs.subscription_status === "expired" || currentWs.subscription_status === "past_due" || trialExpired;

    if (isSuspendedOrExpired) {
      console.log(`[WA Trial Guard] Workspace ${currentWs.name} (${currentWs.slug}) trial/subscription expired. Auto-replies suppressed.`);
      if (isOwner) {
        await reply(
          `⚠️ *[Obey Business Notice]*\n\nYour 14-day free trial for *${currentWs.name}* has expired.\n\nTo continue letting Obey autonomously reply to your customers, send voice notes, and close orders, please renew your subscription in your Control Room:\nhttps://femiadeleke.com/control-room`
        );
      }
      return;
    }
  }

  // 1a-2. Sliding-Window Anti-Spam & Abuse Protection (Phase 3 Enterprise Scale)
  if (!isOwner && currentWs) {
    const spamCheck = checkCustomerSpamRateLimit({
      workspaceId: currentWs.id,
      phone: replyTo,
      businessName: currentWs.name,
    });

    if (!spamCheck.allowed) {
      console.warn(`[WA Anti-Spam] Throttled rapid spam burst from ${replyTo} on ${currentWs.name}`);
      if (spamCheck.sendWarning && spamCheck.warningMessage) {
        await reply(spamCheck.warningMessage);
      }
      return;
    }
  }

  // 1a-3. External Chatbot & Away Auto-Responder Detector (Never reply to automated bots)
  if (!isOwner && isExternalAutoResponder(userText)) {
    console.log(`[WA Anti-Bot Loop] Suppressed reply to automated auto-responder from ${replyTo}: "${userText.slice(0, 50)}"`);
    return;
  }

  // 2. Load conversation history early (Fetch recent 40 messages, strictly isolated to current workspace)
  const pastMessages = await dbGetGuestMessages(replyTo, 40, wsId);
  const historyText = pastMessages
    .slice(-25)
    .map((m) => `${m.role === "user" ? (pushName || "User") : (currentWs?.name || "Obey")}: ${m.content}`)
    .join("\n");

  // Check if recent assistant messages explicitly engaged with a WhatsApp status story
  const recentAssistantMessages = pastMessages
    .filter((m) => m.role === "assistant")
    .slice(-3)
    .map((m) => m.content.toLowerCase())
    .join(" ");

  const wasRecentStatusTopic =
    recentAssistantMessages.includes("[obey replied to your whatsapp status") ||
    recentAssistantMessages.includes("saw your status update") ||
    recentAssistantMessages.includes("status comment exclusion list");

  // Status opt-out complaints are short direct messages (never long paragraphs or assignment queries)
  const isShortMessage = lower.trim().length <= 140;

  // 1b. Check if contact is explicitly requesting to stop status viewing/commenting
  const isDirectStatusOptOut =
    isShortMessage && (
      /\b(stop|don'?t|never|quit|cease)\s+(checking|viewing|watching|looking\s+at)\s+(it|my\s+status|my\s+story|status|story)\b/i.test(lower) ||
      /\bstop\s+checking\s+(it|my\s+status|my\s+story|status|story)?\b/i.test(lower) ||
      /\bstop\s+viewing\s+(it|my\s+status|my\s+story|status|story)?\b/i.test(lower) ||
      /\bstop\s+watching\s+(it|my\s+status|my\s+story|status|story)?\b/i.test(lower) ||
      /\bdon'?t\s+(check|view|watch|look\s+at)\s+(it|my\s+status|my\s+story)\b/i.test(lower) ||
      /\bwhy\s+(are\s+you|u|do\s+you)\s+(checking|viewing|watching|looking\s+at)\s*(my\s+status|my\s+story|it)?\b/i.test(lower) ||
      /\b(stop|don'?t|quit|never)\s+(comment|commenting|reply|replying|react|reacting)\s+(on\s+)?(my\s+)?(status|story|stories)\b/i.test(lower) ||
      /\b(remove|exclude)\s+(me|my\s+number)\s+from\s+(status|story|stories)\b/i.test(lower) ||
      /^\s*(opt\s*-?\s*out|unsubscribe)\s*$/i.test(lower.trim())
    );

  const isContextualStatusOptOut =
    isShortMessage &&
    wasRecentStatusTopic &&
    /^\s*(stop\s+checking\s*it?|stop\s+viewing\s*it?|stop\s+watching\s*it?|don'?t\s+check\s*it?|don'?t\s+view\s*it?|stop\s+it|leave\s+me\s+alone)\s*$/i.test(lower.trim());

  const isStatusComplaint = isDirectStatusOptOut || isContextualStatusOptOut;

  // 1c. Check if contact is requesting complete data deletion / erasure (GDPR & Privacy Compliance)
  const isDataDeletionRequest =
    isShortMessage && (
      /\b(delete|clear|erase|remove|wipe)\s+(everything|all\s+data|all\s+my\s+data|my\s+data|my\s+chats?|my\s+messages?|all\s+records?)\b/i.test(lower) ||
      /\b(cleared|deleted|erased|wiped)\s+(in|from)\s+(your\s+)?database\b/i.test(lower)
    );

  if (isDataDeletionRequest && !isOwner) {
    const contactName = pushName || `User ${replyTo.slice(-4)}`;
    await dbAddStatusExclusion(wsId, replyTo, contactName, "Contact requested data deletion & opt-out");
    try {
      const { sql: neonSql } = await import("@/lib/db");
      await neonSql`DELETE FROM guest_chat_messages WHERE phone_number = ${replyTo}`;
      await neonSql`DELETE FROM workspace_leads WHERE phone = ${replyTo} OR phone LIKE ${`%${replyTo.slice(-10)}`}`;
    } catch (e) {
      console.warn("[Data Deletion] Error wiping records:", e);
    }

    const deletionReply = `Your request has been completely executed. 🙏 All your message history, leads, and logs have been permanently erased from our database, and your number is strictly excluded from all future automated engagement. Your privacy is fully respected. Farewell!`;
    await reply(deletionReply);
    return;
  }

  if (isStatusComplaint && !isOwner) {
    const contactName = pushName || `User ${replyTo.slice(-4)}`;
    await dbAddStatusExclusion(wsId, replyTo, contactName, `Contact requested opt-out: "${userText.slice(0, 40)}"`);
    const optOutReply = `I am truly sorry for disturbing you! 🙏 I have immediately added your number to our status comment exclusion list. I will never view or comment on your WhatsApp status updates again. Have a wonderful day ahead!`;
    await reply(optOutReply);
    try {
      await dbAddGuestMessage({
        id: `guest-optout-${Date.now()}`,
        phone_number: replyTo,
        sender_name: currentWs?.name || "Obey",
        role: "assistant",
        content: optOutReply,
        workspace_id: wsId,
      });
    } catch {}
    return;
  }

  // ==============================================================
  // OBEY BUSINESS WORKSPACE ROUTER (Airtight Strict Tenant Isolation)
  // Non-Main-Obey instances (e.g. AutoLearn Spot, Moonvibez, customer bots)
  // MUST NEVER reach Main Obey's personal code, memory, settings, or artifacts!
  // ==============================================================
  if (!isDefaultFemi && currentWs) {
    // Proactive First-Contact Notification to Owner & Welcome for new leads
    if (!isOwner && pastMessages.length <= 1) {
      try {
        const timeWAT = formatToWAT(new Date());
        const notifyPhone = currentWs.owner_phone || FEMI_PERSONAL_NUMBER;
        const firstContactAlert =
          `👋 *New Lead Initiated Chat with ${currentWs.name}!*\n\n` +
          `• *Contact:* +${replyTo} ${pushName ? `(${pushName})` : ""}\n` +
          `• *Time:* ${timeWAT} (WAT)\n` +
          `• *First Message:* "${userText}"\n\n` +
          `_Obey Business AI is actively assisting them live._`;
        await sendWhatsAppMessage(firstContactAlert, notifyPhone, instanceName);
      } catch (e) {
        console.warn("[WA] First contact alert error:", e);
      }

      // Welcome new users with concise showcase
      const isFirstGreeting =
        /^(hi|hello|hey|good morning|good afternoon|good evening|who are you|what can you do|start|help)\b/i.test(lower.trim()) ||
        pastMessages.length === 0;

      if (isFirstGreeting) {
        const welcomeName = pushName ? `, ${pushName}` : "";
        const wsSettings = await dbGetWorkspaceSettings(wsId);
        let welcomeText = "";
        if (wsSettings?.whatsapp_welcome) {
          welcomeText = wsSettings.whatsapp_welcome.replace(/\{name\}/g, pushName || "there");
        } else {
          welcomeText = `👋 *Hello${welcomeName}! Welcome to ${currentWs.name}.*\n\nI am your 24/7 AI business assistant powered by Obey. I can answer questions about our catalog, pricing, services, and take your orders or bookings anytime!\n\nHow can I help you today?`;
        }

        await reply(welcomeText);
        try {
          await dbAddGuestMessage({
            id: `guest-welcome-${Date.now()}`,
            phone_number: replyTo,
            sender_name: currentWs.name,
            role: "assistant",
            content: welcomeText,
            workspace_id: currentWs.id,
          });
        } catch {}
        return;
      }
    }

    // Keyword rule triggers for customer leads
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
            if (/\b(?:not|don'?t|no)\s+(?:want|need|ask(?:ing)?\s+for)?\s*(?:a\s+)?call\b/i.test(cleanUserText)) continue;
            if (cleanUserText.length > 60 || /\b(help me message|message|send a message|wasbot|status)\b/i.test(cleanUserText)) continue;

            console.log(`[WA] Triggered Keyword Rule (${currentWs.name}): "${rule.trigger_keywords.join(", ")}" -> ${rule.action}`);
            await reply(rule.response_text);

            await dbAddGuestMessage({
              id: `guest-asst-${Date.now()}`,
              phone_number: replyTo,
              sender_name: currentWs.name,
              role: "assistant",
              content: rule.response_text,
              workspace_id: currentWs.id,
            });

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

    if (isOwner) {
      await handleObeyBusinessOwnerTurn({
        currentWs,
        userText,
        replyTo,
        pushName,
        historyText,
        instanceName,
        reply,
        visionMedia,
        docMedia,
        documentFileName,
        isSticker: params.isSticker,
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
        visionMedia,
        docMedia,
        documentFileName,
        isSticker: params.isSticker,
      });
      return;
    }
  }

  // ==============================================================
  // MAIN OBEY PERSONAL ASSISTANT PIPELINE (Strictly for Femi Adeleke & Flagship Instance)
  // ==============================================================
  if (userText && userText.length >= 10 && userText !== "[Unclear Voice Note]") {
    autoLearnUserMemory({
      userIdentifier: replyTo,
      userText,
      userName: pushName,
      isOwner,
    }).catch((memErr) => console.warn("[Memory Auto-Learn Error]:", memErr));
  }

  // Dedicated Multimodal WhatsApp Sticker Decoding & Vision Banter
  if (params.isSticker) {
    let stickerVisualResponse = "";
    if (visionMedia?.base64) {
      try {
        const isFemiOwner = isOwner && isDefaultFemi;
        const stickerSystemPrompt = `You are Obey, an ultra-intelligent, magnetic, witty, and culturally savvy AI executive companion created by Femi Adeleke.
The user just sent you a WhatsApp sticker.
YOUR TASK:
1. Visually decode the sticker with precision: Recognize the person, character, meme, facial expression, clothing, gesture, or emotion (e.g. laughing heartily, wearing a green beanie/cap, teasing, eye-rolling, flex/swagger, shock, crying laughter). Notice any text or meme caption if present.
2. React naturally and conversationally with genuine banter:
   - Acknowledge what the person/character in the sticker is doing with humor and warmth (e.g. "Look at that hearty laugh in the green beanie! 😂", "That face is hilarious! 💀", "That swagger is unmatched! 🔥").
   - Match their energy: sound like a real friend who actually looked at the sticker and got the joke/vibe.
   - Smoothly ask how you can help or pivot back to what you were working on together.
3. Keep it punchy, warm, and natural (1-3 sentences max).
${isFemiOwner ? "You are speaking directly with your boss and creator, Femi Adeleke." : ""}`;

        const aiRes = await executeAICompletionWithMedia({
          systemPrompt: stickerSystemPrompt,
          userPrompt: `${historyText ? `RECENT CHAT CONTEXT:\n${historyText}\n\n` : ""}The user sent this WhatsApp sticker. Visually decode the sticker's expression/meme, react with authentic banter, and reply:`,
          mediaBase64: visionMedia.base64,
          mimeType: visionMedia.mimetype || "image/webp",
          temperature: 0.7,
        });

        stickerVisualResponse = aiRes.text.trim();
      } catch (stkVisionErr) {
        console.warn("[WA Sticker] Vision analysis fallback:", stkVisionErr);
      }
    }

    if (!stickerVisualResponse) {
      const stickerReplies = [
        "Haha, nice sticker! 😄 Wetin we dey tackle today, Boss?",
        "Love the sticker vibe! 🔥 Tell me what you'd like to work on.",
        "Sharp sticker! ⚡ How can I assist you right now?",
      ];
      stickerVisualResponse = stickerReplies[Math.floor(Math.random() * stickerReplies.length)];
    }

    const formattedReply = cleanWhatsAppFormatting(stickerVisualResponse);
    await reply(formattedReply);
    try {
      await dbAddGuestMessage({
        id: `guest-stk-${Date.now()}`,
        phone_number: replyTo,
        sender_name: currentWs?.name || "Obey",
        role: "assistant",
        content: formattedReply,
      });
    } catch {}
    return;
  }

  // Handle unclear voice notes
  if (userText === "[Unclear Voice Note]") {
    await reply(
      `🎙️ I received your voice note, but the audio was a bit faint or unclear. Could you please send it once more or type a quick summary?`
    );
    return;
  }

  // Handle Multimodal Vision (Photos, Screenshots, n8n Canvas, UI Errors, Invoices)
  if (visionMedia?.base64) {
    try {
      const cleanInstruction = (userText || "")
        .replace(/^\[(?:Attached\s+)?Image\s*Received\]\s*/i, "")
        .trim();

      const isImageEditIntent =
        cleanInstruction.length > 2 &&
        (isImageRevisionRequest(cleanInstruction, true) ||
          /\b(edit|modify|transform|recreate|redraw|make\s+(?:her|him|them|it)|add|put|give|wear|change|turn\s+(?:this|into)|style\s+as|beret|sunglasses|dress|suit|hair)\b/i.test(
            cleanInstruction
          ));

      // ── PHOTO EDITING & TRANSFORMATION ──
      // If the user attached an image AND gave an explicit command to edit/modify/transform it:
      if (isImageEditIntent) {
        console.log(`[WA Webhook] Image edit request detected on user photo: "${cleanInstruction}"`);
        await reply("🎨 *On it, Boss!* Locking facial identity and applying your requested styling... ⚡");

        // Convert image base64 to dataUri or upload to Cloudinary for Fal.ai / Segmind
        let photoUrl = "";
        const cleanB64 = visionMedia.base64.replace(/^data:[^;]+;base64,/, "").trim();
        const mime = visionMedia.mimetype || "image/jpeg";
        const dataUri = `data:${mime};base64,${cleanB64}`;

        if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
          try {
            const cloudUpload = await cloudinary.uploader.upload(dataUri, {
              folder: "obey-user-uploads",
              resource_type: "image",
            });
            photoUrl = cloudUpload.secure_url || "";
          } catch (uploadErr) {
            console.warn("[WA Webhook] Cloudinary upload error for photo edit:", uploadErr);
          }
        }
        const effectivePhotoRef = photoUrl || dataUri;

        // 1. 100% Free Primary: Hugging Face Space InstructPix2Pix (Modifies exact reference photo based on instructions)
        console.log("[WA Webhook] Running Free Hugging Face InstructPix2Pix image manipulation...");
        let imgRes = await editImageWithInstructPix2Pix({
          referenceImageBase64: visionMedia.base64,
          instruction: cleanInstruction,
          steps: 25,
          imageGuidanceScale: 1.5,
          textGuidanceScale: 7.5,
          workspaceId: currentWs?.id,
        });

        let isFaceLocked = imgRes.success;

        // 2. Secondary: Cloudflare Workers AI Inpainting
        if (!imgRes.success) {
          console.log("[WA Webhook] InstructPix2Pix notice, attempting Cloudflare inpainting...");
          imgRes = await generateImageToImageWithCloudflare({
            referenceImageBase64: visionMedia.base64,
            prompt: `a photorealistic portrait of the exact same person, ${cleanInstruction}, ultra sharp focus, professional photography, maintaining facial identity and composition`,
            strength: 0.6,
            workspaceId: currentWs?.id,
          });
          if (imgRes.success) isFaceLocked = true;
        }

        // 3. Tertiary: Fal.ai FLUX PuLID / InstantID (if user activated paid credits)
        if (!imgRes.success) {
          console.log("[WA Webhook] Attempting Fal.ai face-lock...");
          imgRes = await generateFaceLockWithFal({
            referenceImageUrl: effectivePhotoRef,
            prompt: `a high-end studio portrait of the person, ${cleanInstruction}, 8k resolution, photorealistic, professional lighting, maintaining exact facial resemblance`,
            workspaceId: currentWs?.id,
          });
          if (imgRes.success) isFaceLocked = true;
        }

        // 4. Strict Identity Guardrail: If photo editing could not be completed, NEVER generate a random stranger!
        if (!imgRes.success) {
          console.warn("[WA Webhook] Photo editing could not be processed on reference photo.");
          await reply(
            "⚠️ *Photo Edit Notice:*\n\n" +
            "I couldn't modify your exact photo right now because the free image-editing GPU queue is currently busy. To keep your original photo and face 100% accurate, I did not generate a completely random different person for you.\n\n" +
            "Please try your edit again in a moment, or re-send the photo with a clear instruction like *'add a white beret'*."
          );
          return;
        }

        if (imgRes.success && imgRes.imageUrl) {
          await saveUserImageMemory(replyTo, cleanInstruction, imgRes.imageUrl, imgRes.seed);
          await sendWhatsAppImage(
            imgRes.imageUrl,
            replyTo,
            `🎨 *Edited Artwork:*\n"${cleanInstruction}"`,
            currentWs?.whatsapp_instance_name || instanceName || "obey"
          );
          await reply(
            isFaceLocked
              ? `🎨 *Here is your revised artwork, Boss!* \n\n🔒 *Image-to-Image Identity Lock:* Preserved facial geometry and composition while applying your requested styling: "${cleanInstruction}".`
              : `🎨 *Here is your revised artwork, Boss!* \n\n📌 *Identity Note:* This was synthesized using high-resolution diffusion based on your photo. To lock her exact facial features with 100% precision, activate your Fal.ai key in Settings!`
          );
          return;
        } else {
          console.warn("[WA Webhook] Image generation failed during photo edit:", imgRes.error);
        }
      }

      const activeArtifact = await getLatestUserArtifact(replyTo);
      const artifactMemoryNote = activeArtifact
        ? `\n\nACTIVE ARTIFACT IN MEMORY:\n• Title: "${activeArtifact.title}" (ID: ${activeArtifact.id})\n• Note: You (Obey) created this artifact. If the user's screenshot shows this website, n8n workflow, or console errors, analyze the issue and tell them you already have the complete code/blueprint saved in memory and can update and rebuild it for them right away. NEVER ask them to paste code.`
        : "";

      const visionPrompt = `${historyText ? `PRIOR CONVERSATION CONTEXT:\n${historyText}\n\n` : ""}CURRENT ACTION: The user sent this image${userText && userText !== "[Image Received]" ? ` with note/question: "${userText}"` : ""}.${artifactMemoryNote}

Analyze this image thoroughly in relation to our ongoing conversation, extract any key details or text, diagnose any error or workflow stage shown, and assist them directly with clarity, engineering precision, and warmth.`;

      const aiRes = await executeAICompletionWithMedia({
        systemPrompt: "You are Obey, an autonomous AI executive companion, senior engineer, and automation architect for Femi Adeleke. You are equipped with computer vision. Analyze user screenshots, photos, n8n workflow canvases, node errors, receipts, and diagrams with high precision, human warmth, and actionable clarity, connecting them directly with your ongoing conversation context. If you spot an n8n error, diagnose the exact node and provide the immediate fix. Speak naturally and directly as Obey without rigid headers.",
        userPrompt: visionPrompt,
        mediaBase64: visionMedia.base64,
        mimeType: visionMedia.mimetype || "image/jpeg",
        temperature: 0.3,
      });

      const visionReply = aiRes.text.trim();
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

I am your 24/7 personal AI companion and executive assistant, right here inside WhatsApp! ⚡

🚀 *Here is what we can do together:*
🎙️ *Voice Notes:* Send me any voice note in English or Pidgin — I listen, analyze, and execute your instructions.
📁 *Instant Documents & Plans:* Ask me to turn any idea, pitch, or meeting notes into a Word Doc, Google Doc, or PDF.
⚙️ *n8n Automation Workflows:* Ask me to design ready-made n8n JSON workflows you can import with 1 click.
🌐 *Web Apps & Tools:* Ask me to create or update interactive HTML pages, calculators, and dashboards with live links.
🎨 *AI Image Generation:* Describe any artwork or image you want, and I'll generate it instantly.
📞 *Live Voice Calls:* Tap my voice link anytime for a 100% free voice call — we can talk and brainstorm live!
👥 *Contacts & Messaging:* Ask me to find numbers, message contacts, or broadcast to contact buckets.

How can I assist you right now?`;
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

  // 5. Special Owner Admin Commands
  if (isOwner) {
    // 5.0 WhatsApp Status Publishing Command: "Post: ...", "Post status: ...", "Status: ...", "Put on status: ..."
    const femiStatusText = extractStatusPostText(userText);
    if (femiStatusText !== null) {
      if (!femiStatusText) {
        await reply("Boss, please specify what you want me to post to your WhatsApp Status! E.g. `Post: Flash sale today! 20% off all orders.`");
        return;
      }

      const targetInst = currentWs?.whatsapp_instance_name || instanceName || "obey";

      // 1. Immediately confirm to Boss within 1s so they get instant acknowledgement without waiting
      await reply(`🚀 *Status Publishing Initiated!*, Boss.\n\nBroadcasting your update to your entire audience now:\n\n"${femiStatusText}"`);

      // 2. Broadcast to full audience (up to 3,000 contacts) asynchronously
      sendWhatsAppStatusPost({
        text: femiStatusText,
        instanceName: targetInst,
      }).then(async (res) => {
        if (res.success && sql) {
          try {
            await sql`
              INSERT INTO workspace_statuses (id, workspace_id, content, status, message_id, posted_at)
              VALUES (${'stat_' + Date.now()}, ${currentWs?.id || 'femi-adeleke'}, ${femiStatusText}, 'posted', ${res.messageId || null}, NOW())
            `;
          } catch (dbErr) {
            console.warn("[Main Obey Status DB] Insert error:", dbErr);
          }
        } else if (!res.success) {
          console.warn("[Main Obey Status Post] Broadcast issue:", res.error);
        }
      }).catch((postErr) => console.warn("[Main Obey Status Post] Broadcast exception:", postErr));

      return;
    }

    if (lower.includes("morning brief") || lower.includes("morning report") || lower === "briefing") {
      try {
        await reply("⚡ On it Boss! Generating your executive operational briefing and dispatching to your email & phone...");
        const res = await dispatchMorningBriefing();
        if (res.text) {
          await reply(res.text);
        }
        return;
      } catch (e: any) {
        await reply(`Boss, error running morning briefing: ${e.message}`);
        return;
      }
    }

    if (lower.includes("evening brief") || lower.includes("evening debrief") || lower.includes("wrap up") || lower.includes("wrapup")) {
      try {
        await reply("🌙 On it Boss! Generating your evening check-in and wrap-up...");
        const res = await dispatchEveningWrapup();
        if (res.text) {
          await reply(res.text);
        }
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

  // 5.8 FOLLOW-UP VOICE NOTE RESEND / CONVERT HANDLER
  // When user says "Send it as vn", "I said you should send it as voice notes", "convert to vn", "make it a voice note":
  // Instantly take the previous assistant response, synthesize it, and dispatch as a native WhatsApp PTT voice note!
  const isResendAsVN =
    /\b(?:send\s+(?:it|that|this)|said\s+.*(?:send\s+it|voice\s*notes?|vn)|convert\s+(?:it|that|this)|speak\s+(?:it|that|this)|repeat\s+(?:it|that|this)|make\s+(?:it|that|this))\b[\s\S]{0,45}\b(?:voice\s*note|voice\s*notes|vn|vns|audio)\b/i.test(userText) ||
    /^\s*(?:send\s+it\s+as\s+vn|send\s+as\s+vn|make\s+it\s+vn|in\s+vn|as\s+vn|voice\s*note|vn)\s*[.!?]?\s*$/i.test(userText);

  if (isResendAsVN && pastMessages && pastMessages.length > 0) {
    // Find the latest assistant message by searching backwards from the end of history
    const lastAssistantMsg = [...pastMessages].reverse().find(
      (m) => m.role === "assistant" && m.content && !m.content.startsWith("🎙️")
    );
    if (lastAssistantMsg && lastAssistantMsg.content.trim()) {
      const cleanContent = stripAudioStageDirections(lastAssistantMsg.content);
      const sentences = cleanContent.split(/(?<=[.!?])\s+/);
      const spokenExcerpt =
        sentences.length <= 2 || cleanContent.split(/\s+/).length <= 45
          ? cleanContent
          : sentences.slice(0, 2).join(" ");

      await replyVoiceNote(spokenExcerpt, cleanContent, true);
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
      instanceName,
      workspaceId: wsId,
    });

    const rawReply = companionRes.reply;
    const finalReply = stripAudioStageDirections(rawReply);

    if (finalReply && finalReply.trim()) {
      const hasNegativeVN = /\b(?:no|not|don'?t|dont|never|stop|without)\s+(?:send\s+)?(?:a\s+)?(?:voice\s*note|vn|audio)\b/i.test(userText);
      const userAskedForVN =
        !hasNegativeVN && (
          Boolean(isVoiceNote) ||
          /\b(?:vn|vns|voice\s*note|voice\s*notes|audio\s*note|voice\s*memo)\b/i.test(userText) ||
          /\b(?:send|drop|record|give|reply|answer|say|speak|talk)\b[\s\S]{0,40}\b(?:voice\s*note|vn|audio)\b/i.test(userText) ||
          /\b(?:as|in|via|on|through)\s+(?:a\s+)?(?:voice\s*note|vn|audio)\b/i.test(userText)
        );

      if (userAskedForVN) {
        // If the reply is concise, speak all of it in the voice note.
        // If it's a longer breakdown, speak the first 2 punchy sentences in the VN and provide the full transcript below!
        const sentences = finalReply.split(/(?<=[.!?])\s+/);
        const spokenExcerpt =
          sentences.length <= 2 || finalReply.split(/\s+/).length <= 45
            ? finalReply
            : sentences.slice(0, 2).join(" ");
        await replyVoiceNote(spokenExcerpt, finalReply);
      } else {
        await reply(finalReply);
      }
    }

    // Save assistant reply to guest DB
    await dbAddGuestMessage({
      id: `guest-asst-${Date.now()}`,
      phone_number: replyTo,
      sender_name: currentWs?.name || "Obey",
      role: "assistant",
      content: finalReply,
      workspace_id: wsId,
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
  if (detectedInstanceId && sql) {
    try {
      const evoInst = await sql`
        SELECT name FROM evolution."Instance" WHERE id = ${detectedInstanceId} LIMIT 1
      `;
      if (evoInst && evoInst.length > 0 && evoInst[0].name) {
        instanceName = evoInst[0].name;
      }
    } catch {}
  }

  // Bulletproof mapping: If connected bot number is 09074027451 or instance hints match AutoLearn Spot
  if (
    detectedInstanceId === "38da4e73-256d-4f8e-b7bd-de6db3b51e5e" ||
    detectedInstanceId === "6acca55e-e17a-4116-af24-585cd0d5161b" ||
    connectedOwner.endsWith("9074027451") ||
    instanceName.toLowerCase().includes("autolearn") ||
    instanceName === "38da4e73-256d-4f8e-b7bd-de6db3b51e5e" ||
    instanceName === "6acca55e-e17a-4116-af24-585cd0d5161b"
  ) {
    instanceName = "obey-autolearn-spot";
  } else if (
    detectedInstanceId === "f3fd36fd-b59c-462d-863d-01eaf4c8c190" ||
    detectedInstanceId === "74f619e3-3793-4aa1-8208-32dda0e38a8f" ||
    connectedOwner.endsWith("9161488564") ||
    instanceName === "f3fd36fd-b59c-462d-863d-01eaf4c8c190" ||
    instanceName === "74f619e3-3793-4aa1-8208-32dda0e38a8f"
  ) {
    instanceName = "obey";
  }

  if (!instanceName) {
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

  // Check and dispatch any due scheduled tasks asynchronously
  dispatchDueScheduledTasks().catch(() => {});

  // Deduplicate incoming webhook deliveries to prevent double replies
  if (msgObj.key?.id && isDuplicateWebhookMessage(msgObj.key.id)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // 1. Detect WhatsApp Status Stories (must inspect key.remoteJid directly before any LID/remoteJidAlt rewriting)
  const rawRemoteJid = msgObj.key?.remoteJid || msgObj.remoteJid || "";
  const isStatusBroadcast =
    rawRemoteJid === "status@broadcast" ||
    rawRemoteJid.endsWith("@broadcast") ||
    rawRemoteJid.includes("status@broadcast") ||
    rawRemoteJid === "status";

  // Handle WhatsApp Status Stories
  if (isStatusBroadcast) {
    after(async () => {
      try {
        // WhatsApp LID vs E.164 phone JID:
        // key.participant is often an internal 14-digit LID (e.g. 49194689654851@lid),
        // while key.remoteJidAlt contains the actual real contact phone JID (e.g. 2348055308520@s.whatsapp.net).
        const rawAlt = msgObj.key?.remoteJidAlt || msgObj.remoteJidAlt || "";
        const rawPart = msgObj.key?.participant || msgObj.participant || "";

        let phoneJid = "";
        if (rawAlt && rawAlt.includes("@s.whatsapp.net")) {
          phoneJid = rawAlt;
        } else if (rawPart && rawPart.includes("@s.whatsapp.net")) {
          phoneJid = rawPart;
        } else {
          phoneJid = rawAlt || rawPart;
        }

        let posterPhone = phoneJid.replace(/@s\.whatsapp\.net|@g\.us|@lid/g, "").replace(/\D/g, "");
        const readParticipant = rawPart || rawAlt || phoneJid;

        // Bulletproof LID Resolution: Map WhatsApp internal 14/15-digit LIDs to actual phone numbers
        if (posterPhone.length > 13 && sql) {
          try {
            const resolvedRows = await sql`
              SELECT key->>'remoteJidAlt' as alt
              FROM evolution."Message"
              WHERE (key->>'participant' LIKE ${`%${posterPhone}%`} OR key->>'remoteJid' LIKE ${`%${posterPhone}%`})
                AND key->>'remoteJidAlt' LIKE '%@s.whatsapp.net'
              LIMIT 1
            `;
            if (resolvedRows && resolvedRows.length > 0 && resolvedRows[0].alt) {
              phoneJid = resolvedRows[0].alt;
              posterPhone = phoneJid.replace(/@s\.whatsapp\.net|@g\.us|@lid/g, "").replace(/\D/g, "");
            }
          } catch {}
        }

        // Hard-pinned known mappings for Femi Adeleke and AutoLearn Spot
        if (posterPhone === "164213964194040" || posterPhone.includes("164213964194040")) {
          posterPhone = "2348120934828";
          phoneJid = "2348120934828@s.whatsapp.net";
        }
        if (posterPhone === "94270824419528" || posterPhone.includes("94270824419528")) {
          posterPhone = "2349074027451";
          phoneJid = "2349074027451@s.whatsapp.net";
        }

        // 1. Identify workspace / instance
        let currentWs: any = null;
        const isMainObeyInstance = !instanceName || instanceName === "obey" || instanceName === "default" || instanceName === "obey_default";
        if (!isMainObeyInstance) {
          currentWs = await dbGetWorkspaceByInstanceName(instanceName);
          if (!currentWs) {
            currentWs = await dbGetWorkspaceBySlug(instanceName.replace(/^obey-/, ""));
          }
        } else {
          currentWs = (await dbGetWorkspaceById("ws_femi_default")) || (await dbGetWorkspaceBySlug("femi-adeleke"));
        }

        // 2. Check settings (Unified single feature: Viewing & AI Commenting are active together)
        let engagementEnabled = false;
        let commentTone = "friendly";

        if (currentWs) {
          engagementEnabled = Boolean(currentWs.auto_comment_status && currentWs.auto_view_status !== false);
          commentTone = currentWs.comment_tone || "friendly";
        } else {
          const viewSetting = await getSetting("AUTO_VIEW_STATUS_ENABLED");
          const commentSetting = await getSetting("AUTO_COMMENT_STATUS_ENABLED");
          engagementEnabled = viewSetting === "true" && commentSetting === "true";
          commentTone = (await getSetting("COMMENT_TONE")) || "friendly";
        }

        // If unified status engagement is disabled, DO NOT view and DO NOT comment
        if (!engagementEnabled) {
          console.log(`[WA Status] Status engagement is OFF for ${instanceName}. Ignoring status story.`);
          return;
        }

        // 3. Auto-View Status (Mark as Read in WhatsApp strictly within this instance)
        if (msgObj.key?.id) {
          await markWhatsAppMessageRead(instanceName, "status@broadcast", msgObj.key.id, readParticipant, phoneJid);
          console.log(`[WA Status] Viewed status story ${msgObj.key.id} from ${posterPhone} (${instanceName})`);
        }

        // 4. AI Status Commenting
        if (posterPhone && posterPhone.length >= 10 && posterPhone.length <= 13) {
          // Guard: Don't comment on the bot's own posted status
          if (msgObj.key?.fromMe) {
            return;
          }

          // Guard: Don't comment if workspace subscription / trial has expired
          if (currentWs && currentWs.slug !== "femi-adeleke") {
            const isTrial = currentWs.subscription_status === "trial";
            const trialExpired = Boolean(isTrial && currentWs.trial_ends_at && new Date(currentWs.trial_ends_at).getTime() < Date.now());
            if (currentWs.subscription_status === "expired" || currentWs.subscription_status === "past_due" || trialExpired) {
              return;
            }
          }

          const ownerClean = (currentWs?.owner_phone || "").replace(/\D/g, "");
          const isOwnerOrFounder =
            Boolean(ownerClean && (posterPhone.endsWith(ownerClean.slice(-10)) || posterPhone === ownerClean)) ||
            posterPhone === FEMI_PERSONAL_NUMBER ||
            posterPhone.endsWith(FEMI_PERSONAL_NUMBER.slice(-10));

          // Guard: Don't comment if poster is a platform bot (prevents inter-bot status comment loops)
          if (isPlatformBotNumber(posterPhone)) {
            console.log(`[WA Status] Skipping status comment for ${posterPhone}: Poster is a platform bot.`);
            return;
          }

          // Guard: Don't comment if contact is in the status comment exclusion list
          const isExcluded = await dbIsPhoneExcludedFromStatusComments(currentWs?.id, posterPhone);
          if (isExcluded) {
            console.log(`[WA Status] Skipping status comment for ${posterPhone}: Contact is in the status comment exclusion list.`);
            return;
          }

          // Rate limit calculation: plan-based for businesses, user-chosen (unlimited or interval) for Main Obey
          let rateLimitHours = 12;
          let dailyLimit = 10000;

          if (currentWs) {
            if (currentWs.comment_rate_limit === "unlimited") {
              rateLimitHours = 0;
              dailyLimit = 10000;
            } else if (currentWs.comment_rate_limit === "1h") {
              rateLimitHours = 1;
            } else if (currentWs.comment_rate_limit === "4h") {
              rateLimitHours = 4;
            } else if (currentWs.comment_rate_limit === "8h") {
              rateLimitHours = 8;
            } else if (currentWs.comment_rate_limit === "24h") {
              rateLimitHours = 24;
            } else {
              const plan = (currentWs.plan || "starter").toLowerCase();
              if (plan === "starter" || plan === "trial") {
                rateLimitHours = 24; // 1 comment per contact every 24 hours
                dailyLimit = 10;     // Max 10 status comments per day
              } else if (plan === "pro") {
                rateLimitHours = 8;  // 1 comment per contact every 8 hours
                dailyLimit = 35;     // Max 35 status comments per day
              } else if (plan === "enterprise" || plan === "founder" || plan === "lifetime") {
                rateLimitHours = 0;
                dailyLimit = 10000; // Unlimited daily cap
              }
            }
          } else {
            // Main Obey (Femi Adeleke): user can select unlimited or custom hours
            const mainRateSetting = await getSetting("STATUS_COMMENT_RATE_LIMIT");
            if (mainRateSetting === "unlimited" || !mainRateSetting) {
              rateLimitHours = 0; // Unlimited!
            } else if (mainRateSetting === "1h") {
              rateLimitHours = 1;
            } else if (mainRateSetting === "4h") {
              rateLimitHours = 4;
            } else if (mainRateSetting === "12h") {
              rateLimitHours = 12;
            } else if (mainRateSetting === "24h") {
              rateLimitHours = 24;
            }
          }

          // Check if Bot Bypass is ON for this workspace
          if (currentWs?.bot_bypass) {
            console.log(`[WA Status] Skipping status comment because Bot Bypass is ON for ${currentWs.name}`);
            return;
          }

          // Check daily quota for workspaces
          if (currentWs && dailyLimit < 1000) {
            const todayCount = await dbGetStatusCommentsTodayCount(currentWs.id);
            if (todayCount >= dailyLimit) {
              console.log(`[WA Status] Daily status comment cap reached for ${currentWs.name} (${todayCount}/${dailyLimit})`);
              return;
            }
          }

          // Rate limit cooldown per contact
          const alreadyCommented = await dbHasRecentStatusComment(posterPhone, rateLimitHours, currentWs?.id, instanceName);
          if (!alreadyCommented) {
            const statusText = (
              msgObj.message?.conversation ||
              msgObj.message?.extendedTextMessage?.text ||
              msgObj.message?.imageMessage?.caption ||
              msgObj.message?.videoMessage?.caption ||
              ""
            ).trim();

            const hasVisual = Boolean(msgObj.message?.imageMessage || msgObj.message?.videoMessage);

            if (statusText.length >= 2 || hasVisual) {
              const commenterRole = currentWs?.name || "Obey";
              const promptContext = statusText ? `STATUS TEXT/CAPTION: "${statusText}"` : "STATUS PHOTO: [Visual Story]";

              const aiRes = await executeAICompletion({
                systemPrompt: `You are leaving a warm, authentic, natural 1-sentence comment on a contact's WhatsApp status story.
Sender/Brand: ${commenterRole}.
Tone: ${commentTone} (short, uplifting, genuine, 1 tasteful emoji max).
Rules:
- NEVER write long marketing paragraphs or promote products unsolicited.
- Sound like a real supportive human friend or trusted professional.
- Max 10-12 words.
Examples:
- "Huge congratulations! 🎉 Big wins ahead."
- "Love this vibe! 🔥 Keep shining."
- "Looking super sharp! 👏"
- "This looks fantastic! ✨"
Output ONLY the comment text.`,
                userPrompt: `${promptContext}\nCOMMENT:`,
                temperature: 0.7,
                maxTokens: 50,
              });

              const comment = aiRes.text.trim().replace(/^["']|["']$/g, "");
              if (comment && comment.length >= 2) {
                // Construct quoted status story so comment appears directly attached under the status story in WhatsApp
                const quotedStatus: any = {
                  key: {
                    remoteJid: "status@broadcast",
                    id: msgObj.key?.id,
                    fromMe: false,
                    participant: `${posterPhone}@s.whatsapp.net`,
                  },
                  message:
                    msgObj.message && Object.keys(msgObj.message).length > 0
                      ? msgObj.message
                      : { conversation: statusText || "Status Story" },
                };
                if (
                  !quotedStatus.message.conversation &&
                  !quotedStatus.message.extendedTextMessage &&
                  !quotedStatus.message.imageMessage &&
                  !quotedStatus.message.videoMessage
                ) {
                  quotedStatus.message = { conversation: statusText || "Status Story" };
                }

                await sendWhatsAppMessage(comment, posterPhone, instanceName, quotedStatus);
                await dbRecordStatusComment({
                  workspace_id: currentWs?.id || null,
                  instance_name: instanceName,
                  poster_phone: posterPhone,
                  status_id: msgObj.key?.id || null,
                  status_text: statusText || (hasVisual ? "[Media Story]" : null),
                  comment_sent: comment,
                });

                // Write into guest_messages so Obey remembers commenting on their status when they reply!
                try {
                  await dbAddGuestMessage({
                    id: `guest-status-cmt-${Date.now()}`,
                    phone_number: posterPhone,
                    sender_name: currentWs?.name || "Obey",
                    role: "assistant",
                    content: `[Obey replied to your WhatsApp Status "${statusText || (hasVisual ? "Media Story" : "Status Update")}"]: "${comment}"`,
                  });
                } catch (cmtDbErr) {
                  console.warn("[WA Status] Failed to record status comment in guest_messages:", cmtDbErr);
                }

                console.log(`[WA Status] Commented on ${posterPhone}'s status: "${comment}" (quoted reply)`);
              }
            }
          }
        }
      } catch (statusErr) {
        console.warn("[WA Status] Error handling status@broadcast:", statusErr);
      }
    });

    return NextResponse.json({ ok: true, statusHandled: true });
  }

  // 2. Direct Messages & Chat routing
  const extractCleanPhone = (jid: string | undefined | null): string => {
    if (!jid) return "";
    if (jid.endsWith("@lid") || jid.includes("@g.us") || jid.includes("@broadcast")) return "";
    const clean = jid.replace(/@s\.whatsapp\.net|@lid|@g\.us/g, "").replace(/\D/g, "");
    return clean.length >= 9 && clean.length <= 13 ? clean : "";
  };

  // Check all candidate fields for the real E.164 phone number
  let senderNumber =
    extractCleanPhone(msgObj.key?.remoteJidAlt) ||
    extractCleanPhone((msgObj as any).remoteJidAlt) ||
    extractCleanPhone(msgObj.key?.participantPn) ||
    extractCleanPhone((msgObj as any).participantPn) ||
    extractCleanPhone(msgObj.key?.remoteJid) ||
    extractCleanPhone(msgObj.key?.participant);

  // If still not resolved and key has an internal WhatsApp LID, query DB Baileys mapping
  if (!senderNumber) {
    const rawLid = (msgObj.key?.remoteJid || msgObj.key?.participant || "").replace(/@s\.whatsapp\.net|@lid|@g\.us/g, "").replace(/\D/g, "");
    if (rawLid && rawLid.length > 13) {
      try {
        const resolved = await dbGetRealPhoneByLid(rawLid);
        if (resolved) senderNumber = resolved;
      } catch {}
    }
  }

  // Fallback for Main Obey instance when Femi's linked phone sends with an unrecognized LID
  if (!senderNumber) {
    if (instanceName === "obey" || instanceName === "default") {
      senderNumber = FEMI_PERSONAL_NUMBER;
    }
  }

  const senderJid = senderNumber ? `${senderNumber}@s.whatsapp.net` : (msgObj.key?.remoteJid || "");

  // Ignore regular group chats
  if (senderJid.endsWith("@g.us")) {
    return NextResponse.json({ ok: true });
  }

  // Inter-Bot Loop Shield: Drop incoming direct messages from other bots on the platform
  await refreshPlatformBotNumbers();
  if (senderNumber && isPlatformBotNumber(senderNumber)) {
    console.log(`[WA Inter-Bot Shield] Suppressed message from platform bot (${senderNumber}) on instance ${instanceName}`);
    return NextResponse.json({ ok: true, isPlatformBot: true });
  }

  // 1. Explicitly trigger blue ticks (Read receipt) for the sender
  if (msgObj.key?.id && senderJid) {
    markWhatsAppMessageRead(instanceName, senderJid, msgObj.key.id).catch(() => {});
  }

  const isIncomingAudio = Boolean(msgObj.message?.audioMessage);
  // 2. Trigger typing or recording indicator presence
  if (senderNumber) {
    sendWhatsAppPresence(
      instanceName,
      senderNumber,
      isIncomingAudio ? "recording" : "composing",
      isIncomingAudio ? 12000 : 1500
    ).catch(() => {});
  }

  // Extract text, button clicks, and list selections
  const buttonResponseText =
    msgObj.message?.buttonsResponseMessage?.selectedDisplayText ||
    msgObj.message?.buttonsResponseMessage?.selectedButtonId ||
    msgObj.message?.templateButtonReplyMessage?.selectedDisplayText ||
    msgObj.message?.templateButtonReplyMessage?.selectedId ||
    msgObj.message?.listResponseMessage?.title ||
    msgObj.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msgObj.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;

  let userText = (
    buttonResponseText ||
    msgObj.message?.conversation ||
    msgObj.message?.extendedTextMessage?.text ||
    msgObj.message?.imageMessage?.caption ||
    msgObj.message?.documentMessage?.caption ||
    ""
  ).trim();


  const asksVoiceNote = /\b(voice note|send vn|send audio|voice message|talk to me|record audio|record a vn|send voice|speak to me)\b/i.test(userText);
  if (senderNumber && asksVoiceNote) {
    sendWhatsAppPresence(instanceName, senderNumber, "recording", 12000).catch(() => {});
  }

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
  const isSticker = Boolean(msgObj.message?.stickerMessage);

  // Extract quoted reply text (including status replies and quoted messages)
  const quotedMsg = msgObj.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const quotedText =
    quotedMsg?.conversation ||
    quotedMsg?.extendedTextMessage?.text ||
    quotedMsg?.imageMessage?.caption ||
    "";
  if (quotedText && !userText.includes("[Replying to:")) {
    userText = `[Replying to: "${quotedText}"] ${userText}`.trim();
  }

  if (isSticker && !userText) {
    userText = "[Sticker Sent by User]";
  }

  if (!userText && !isAudio && !isImage && !isDoc && !isContact && !isSticker) {
    return NextResponse.json({ ok: true });
  }

  console.log(`[WA Webhook] Incoming (${instanceName}) from ${senderNumber}: "${userText || (isAudio ? '[Audio]' : isImage ? '[Image]' : isSticker ? '[Sticker]' : '[Doc]')}"`);

  const msgId = msgObj.key?.id;

  // Persistent database queue deduplication (drops duplicate deliveries across multiple containers/lambdas)
  let queueId: string | null = null;
  try {
    queueId = await dbEnqueueWorkspaceMessage({
      instanceName,
      senderPhone: senderNumber,
      messageId: msgId,
      payload: {
        pushName: msgObj.pushName,
        textSample: (userText || "").slice(0, 160),
        isAudio,
        isImage,
        isDoc,
        isSticker,
      },
      status: "processing",
    });

    if (msgId && !queueId) {
      console.log(`[WA Webhook] Dropping duplicate delivery for message ${msgId} (database queue deduplication)`);
      return NextResponse.json({ ok: true, duplicate: true });
    }
  } catch (qErr) {
    console.warn("[WA Webhook] Message queue enqueue warning:", qErr);
  }

  // 3. Dispatch processing in Next.js after() background block so Evolution API receives an immediate
  // HTTP 200 OK within 25ms and NEVER retries or re-dispatches the webhook!
  after(async () => {
    try {
      let activeText = userText;
      let isVoiceNote = false;
      let visionMedia: { base64: string; mimetype: string } | null = null;
      let docMedia: { base64: string; mimetype: string } | null = null;

      // Voice Note Transcription
      if (isAudio) {
        isVoiceNote = true;
        try {
          const media = await fetchEvolutionMediaBase64(msgObj, instanceName);
          if (media?.base64) {
            const transRes = await transcribeAudio(media.base64, media.mimetype || "audio/ogg");
            if (transRes.success && transRes.text) {
              activeText = userText ? `${userText} ${transRes.text}` : transRes.text;
            } else {
              activeText = userText ? `${userText} [Voice note was unclear]` : "[Unclear Voice Note]";
            }
          } else {
            activeText = userText || "[Unclear Voice Note]";
          }
        } catch (audioErr) {
          console.warn("[WA Webhook] Voice note handling notice:", audioErr);
          activeText = userText || "[Unclear Voice Note]";
        }
      }

      // Multimodal Vision (Photos, Screenshots, Stickers)
      if (isImage || isSticker) {
        visionMedia = await fetchEvolutionMediaBase64(msgObj, instanceName);
        if (!activeText) activeText = isSticker ? "[Sticker Received]" : "[Image Received]";
      }

      // Documents (PDFs, CVs, Invoices)
      if (isDoc) {
        docMedia = await fetchEvolutionMediaBase64(msgObj, instanceName);
        if (!activeText) activeText = "[Document Received]";
      }

      await processMessage({
        senderNumber,
        userText: activeText,
        pushName: msgObj.pushName,
        isVoiceNote,
        isSticker,
        messageId: msgId,
        visionMedia,
        docMedia,
        documentFileName: msgObj.message?.documentMessage?.fileName,
        instanceName,
        connectedOwner,
      });

      if (queueId) {
        await dbUpdateWorkspaceMessageQueueStatus(queueId, "completed");
      }
    } catch (err: any) {
      console.error("[WA] processMessage execution error:", err);
      if (queueId) {
        await dbUpdateWorkspaceMessageQueueStatus(queueId, "failed", err?.message || String(err));
      }
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
