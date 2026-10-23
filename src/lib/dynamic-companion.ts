import { randomUUID } from "crypto";
import { executeAICompletion } from "./ai-orchestrator";
import { searchTavily } from "./tavily-search";
import { runUpworkLiveScout } from "./upwork-scout";
import {
  dbGetPendingUserAction,
  dbCreateUserPendingAction,
  dbUpdateUserActionStatus,
  dbGetLatestExecutedUserAction,
  dbGetWorkspaceSettings,
  dbGetWorkspaceBySlug,
  dbGetWorkspaceById,
  dbGetWorkspaceByInstanceName,
  dbGetPlatformPricing,
  dbListWorkspaces,
} from "./db";
import { executePendingUserAction } from "./agent-dispatcher";
import { getNigerianTime, formatToWAT } from "./utils";
import {
  generateAIImage,
  getUserImageMemory,
  saveUserImageMemory,
  getUserFullMemory,
  saveUserPersonalMemory,
  isImageRevisionRequest,
  synthesizeImageRevisionPrompt,
} from "./image-generator";
import {
  saveArtifact,
  extractArtifactBlocks,
  stripArtifactBlocks,
  getLatestUserArtifact,
  getUserArtifacts,
  findUserArtifact,
} from "./artifact-engine";
import { sendWhatsAppMessage, sendWhatsAppImage, sendWhatsAppDocument } from "./whatsapp-gateway";
import { getObeyBusinessManualKnowledge, getMainObeyFlagshipKnowledge } from "./obey-manual-knowledge";

export interface CompanionResponse {
  reply: string;
  actionStaged?: boolean;
  actionExecuted?: boolean;
  imageUrl?: string;
  artifactId?: string;
  artifactTitle?: string;
  artifactContent?: string;
}

/**
 * Strips formatting for clean WhatsApp output
 */
function cleanWhatsApp(text: string): string {
  if (!text) return "";
  return text
    .replace(/^\s*\*\s+\*([^*]+)\*:/gm, "• *$1:*")
    .replace(/^\s*\*\s+\*([^*]+)\*/gm, "• *$1*")
    .replace(/\*\s+\*([^*]+)\*:/g, "• *$1:*")
    .replace(/\*\s+\*([^*]+)\*/g, "• *$1*")
    .replace(/\*\*([^*]+)\*\*/g, "*$1*")
    .replace(/^#{1,4}\s+(.+)$/gm, "*$1*")
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/\*\s*\*/g, "*")
    .trim();
}

/**
 * Formats an outbound delegated message to a contact in polite reported speech,
 * including dynamic WAT greeting, Femi's name, and Obey's ecosystem links.
 */
export async function formatOutboundDelegatedWhatsAppMessage(params: {
  rawContent: string;
  userInstruction: string;
  senderName?: string;
  isFemi: boolean;
  senderGender?: string;
}): Promise<string> {
  const { rawContent, userInstruction, senderName, isFemi, senderGender } = params;

  // Calculate Nigeria WAT greeting
  const { timeStr } = getNigerianTime();
  const hourMatch = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  let greeting = "Hello";
  if (hourMatch) {
    let hour = parseInt(hourMatch[1], 10);
    const ampm = hourMatch[3].toUpperCase();
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    if (hour < 12) greeting = "Good morning";
    else if (hour < 17) greeting = "Good afternoon";
    else greeting = "Good evening";
  }

  const senderLabel = isFemi ? "Femi" : (senderName ? senderName.trim() : "Femi");
  const pronounRule = senderGender === "female"
    ? `CRITICAL GENDER RULE: ${senderLabel} is a female/lady. Use "she" or "her" when referring to ${senderLabel}. NEVER use "he" or "his" on her behalf.`
    : senderGender === "male"
    ? `CRITICAL GENDER RULE: ${senderLabel} is a male. Use "he" or "his".`
    : `CRITICAL GENDER RULE: ${senderLabel}'s gender is unspecified. Use "${senderLabel}" or gender-neutral "they/them". NEVER assume male or use "he/his".`;

  // Transform message into clear, polite reported speech on sender's behalf
  let reportedSpeech = `${senderLabel} asked me to relay this to you: "${rawContent}"`;
  try {
    const res = await executeAICompletion({
      systemPrompt: `You are Obey, the professional AI executive assistant to ${senderLabel}.
Convert the user's instructions into polite, natural, crisp reported speech addressed to the recipient.
Always explicitly mention that ${senderLabel} asked you to deliver this message.
${pronounRule}
Examples:
- "tell him I am busy right now" -> "${senderLabel} asked me to let you know that ${senderGender === 'female' ? 'she is' : senderGender === 'male' ? 'he is' : senderLabel + ' is'} currently busy right now."
- "tell her to send the project files" -> "${senderLabel} asked me to request the project files from you."
Return ONLY the single transformed reported speech sentence without quotes or intro text.`,
      userPrompt: `USER COMMAND: "${userInstruction}"\nMESSAGE ESSENCE: "${rawContent}"\nREPORTED SPEECH:`,
      temperature: 0.2,
      maxTokens: 120,
    });
    const candidate = res.text.trim().replace(/^["']|["']$/g, "");
    if (candidate.length > 5 && !candidate.toLowerCase().includes("user command")) {
      reportedSpeech = candidate;
    }
  } catch (e) {
    reportedSpeech = `${senderLabel} asked me to let you know: ${rawContent}`;
  }

  return `${greeting}!

${reportedSpeech}

—
*I am Obey, ${senderLabel}'s personal AI executive companion.* If you don't have me yet or would like my assistance, you can access me directly:
• *WhatsApp:* https://wa.me/2349161488564
• *Telegram:* https://t.me/ObeyAssistantBot
• *Website:* https://obeyai.vercel.app

Looking forward to assisting you too!`;
}

/**
 * Universal Dynamic Intent & Action Engine
 * Dynamically resolves tasks, research, actions, and companion responses without rigid regex templates.
 */
export async function processDynamicCompanionTurn(params: {
  userIdentifier: string;
  userText: string;
  senderName?: string;
  channel?: "whatsapp" | "telegram" | "web";
  historyText?: string;
  mediaBase64?: string;
  mediaMimeType?: string;
  isVoiceNote?: boolean;
  instanceName?: string;
  workspaceId?: string;
}): Promise<CompanionResponse> {
  const { userIdentifier, userText, senderName, channel = "whatsapp", historyText = "", mediaBase64, mediaMimeType, isVoiceNote = false, instanceName, workspaceId } = params;
  const lower = userText.toLowerCase().trim();
  const isFemi = userIdentifier === "2348120934828";
  const { timeStr: watTime, dateStr: watDate } = getNigerianTime();

  // 1. FETCH MULTI-TURN MEMORY CONTEXT IN PARALLEL
  const [
    rawPendingAction,
    latestExecutedAction,
    userImageMemory,
    userFullMemory,
    recentArtifacts,
    platformPricing,
  ] = await Promise.all([
    dbGetPendingUserAction(userIdentifier),
    dbGetLatestExecutedUserAction(userIdentifier),
    getUserImageMemory(userIdentifier),
    getUserFullMemory(userIdentifier),
    getUserArtifacts(userIdentifier, 6),
    dbGetPlatformPricing(),
  ]);

  const latestArtifact = recentArtifacts.length > 0 ? recentArtifacts[0] : null;

  // Extract last Obey line in conversation history to verify confirmation context
  const historyLines = (historyText || "").split("\n");
  let lastObeyLine = "";
  for (let i = historyLines.length - 1; i >= 0; i--) {
    if (historyLines[i].startsWith("Obey:")) {
      lastObeyLine = historyLines[i].replace(/^Obey:\s*/, "").trim();
      break;
    }
  }

  // 1.2 STALE PENDING ACTION EXPIRATION & DISCARD SAFEGUARDS
  let pendingAction = rawPendingAction;
  if (pendingAction) {
    const actionAgeMs = Date.now() - new Date(pendingAction.created_at).getTime();
    // Auto-expire pending actions older than 5 minutes to prevent stale triggers
    if (actionAgeMs > 5 * 60 * 1000) {
      await dbUpdateUserActionStatus(pendingAction.id, "expired");
      pendingAction = null;
    }
  }

  // Discard pending action if user changes topic or commands a new post/status/broadcast
  if (pendingAction && (/^(?:post|broadcast|status)[:\s]/i.test(userText.trim()))) {
    await dbUpdateUserActionStatus(pendingAction.id, "cancelled");
    pendingAction = null;
  }

  // Verify Obey actually prompted for action confirmation in the immediate last turn
  if (pendingAction) {
    const obeyAskedToConfirm = /\b(reply yes|type yes|should i send|confirm|want me to message|dispatch this|send this to|ready to send|approve)\b/i.test(lastObeyLine);
    if (!obeyAskedToConfirm) {
      // Obey was asking an unrelated question (e.g. broadcast vs status); do NOT hijack conversation!
      pendingAction = null;
    }
  }

  // 1.5 USER PERSONAL MEMORY & DIRECTIVE LISTENER
  const declaresFemale = /\b(i am (?:a )?(?:lady|woman|girl|female)|i'm (?:a )?(?:lady|woman|girl|female)|i am her|i'm her|she\/her|call me (?:a )?lady)\b/i.test(userText);
  const declaresMale = /\b(i am (?:a )?(?:guy|man|boy|male)|i'm (?:a )?(?:guy|man|boy|male)|i am him|i'm him|he\/him)\b/i.test(userText);
  const declaresRemember = /^(?:remember|never forget|note this|save this|keep in mind|from now on)\b/i.test(userText.trim()) ||
    /\b(?:my name is|i am called|my business is|my company is)\b/i.test(userText);

  // Check if user is asking to do a task (flyer, image, design, write, calculate, etc.) along with introducing themselves
  const hasActionableIntent = /\b(flyer|design|poster|banner|image|logo|graphic|photo|art|drawing|write|create|make|help me|can you|draft|build|code|calculate|generate|summary|price|pricing)\b/i.test(userText);

  if (declaresFemale) {
    await saveUserPersonalMemory({
      userIdentifier,
      gender: "female",
      userName: senderName,
    });
    return {
      reply: cleanWhatsApp(`Locked into memory! 👑 I apologize for any previous mix-up. I've permanently saved that you are a lady (*she/her*). No more mistakes! How can I assist you right now?`),
    };
  } else if (declaresMale) {
    await saveUserPersonalMemory({
      userIdentifier,
      gender: "male",
      userName: senderName,
    });
    return {
      reply: cleanWhatsApp(`Got it! I've noted that in my memory (*he/him*). How can I assist you today?`),
    };
  } else if (declaresRemember) {
    const nameMatch = userText.match(/\b(?:my name is|i am called)\s+([a-zA-Z0-9_\s]{2,30})/i);
    const bizMatch = userText.match(/\b(?:my business is|my company is|my brand is)\s+([a-zA-Z0-9_\s]{2,40})/i);
    const extractedName = nameMatch ? nameMatch[1].trim() : senderName;
    const extractedBiz = bizMatch ? bizMatch[1].trim() : undefined;

    if (hasActionableIntent) {
      // Quietly save the user's name/business to memory, but DO NOT block the request from executing!
      await saveUserPersonalMemory({
        userIdentifier,
        userName: extractedName,
        userNotes: extractedBiz ? `Business: ${extractedBiz}` : undefined,
      });
      // Fall through to execute the flyer / task!
    } else {
      const noteToSave = userText.replace(/^(?:remember|never forget|note this|save this|keep in mind|from now on)[:\s]*/i, "").trim();
      await saveUserPersonalMemory({
        userIdentifier,
        userNotes: noteToSave,
        userName: extractedName || senderName,
      });
      return {
        reply: cleanWhatsApp(`Understood and noted! 🧠 I have committed this permanently to memory for your chat:\n\n• "${noteToSave}"\n\nI will remember and apply this in all our conversations.`),
      };
    }
  }

  // 2. CHECK FOR PENDING HUMAN-IN-THE-LOOP APPROVAL (STRICTLY VALIDATED)
  if (pendingAction) {
    const isAffirmative = /^(yes|send|approve|confirm|proceed|ok|1|do it|go ahead|dispatch|sure)\b/i.test(lower);
    const isNegative = /^(no|cancel|reject|stop|2|don't|dont|discard)\b/i.test(lower);

    if (isAffirmative) {
      const execRes = await executePendingUserAction(pendingAction as any);
      return {
        reply: cleanWhatsApp(execRes.message),
        actionExecuted: true,
      };
    } else if (isNegative) {
      await dbUpdateUserActionStatus(pendingAction.id, "rejected");
      return {
        reply: "❌ *Action Cancelled.* I've safely discarded the drafted operation.",
      };
    }
  }

  // 2.5 CONTACT SEARCH & BUCKET MESSAGING FOR OBEY
  try {
    const { handleOwnerContactOrBucketTurn } = await import("@/lib/contact-agent");
    let targetWs: any = null;
    if (workspaceId) {
      targetWs = await dbGetWorkspaceById(workspaceId);
    }
    if (!targetWs && instanceName && instanceName !== "obey" && instanceName !== "default") {
      targetWs = await dbGetWorkspaceByInstanceName(instanceName);
    }
    if (!targetWs) {
      targetWs = (await dbGetWorkspaceById("ws_femi_default")) || (await dbGetWorkspaceBySlug("femi-adeleke"));
    }
    const resolvedInstance = instanceName || targetWs?.whatsapp_instance_name || "obey";
    const resolvedWorkspaceId = targetWs?.id || "ws_femi_default";

    if (targetWs) {
      const contactTurn = await handleOwnerContactOrBucketTurn({
        workspaceId: resolvedWorkspaceId,
        instanceName: resolvedInstance,
        userPhone: userIdentifier,
        userText,
        historyText,
        ownerName: senderName || "Boss",
      });
      if (contactTurn.handled) {
        return {
          reply: cleanWhatsApp(contactTurn.reply),
        };
      }
    }
  } catch (err) {
    console.warn("[Dynamic Companion] contact/bucket turn fallback:", err);
  }

  // 2.5 MULTITASK VOICE-TO-ACTION PIPELINE (Compound tasks: Expenses + Reminders)
  try {
    const { processMultiTaskVoiceOrText } = await import("@/lib/multitask-pipeline");
    const multiTaskRes = await processMultiTaskVoiceOrText({
      userText,
      recipientPhone: userIdentifier || "2348120934828",
      workspaceId: workspaceId || "ws_femi_default",
      instanceName: instanceName || "obey",
      isVoiceNote,
    });
    if (multiTaskRes.handled && multiTaskRes.replyText) {
      return {
        reply: cleanWhatsApp(multiTaskRes.replyText),
      };
    }
  } catch (err) {
    console.warn("[Dynamic Companion] multitask turn fallback:", err);
  }

  // 2.6 SCHEDULED TASKS & REMINDERS FOR MAIN OBEY
  try {
    const { handleScheduledTaskConversation } = await import("@/lib/scheduled-task-engine");
    const taskTurn = await handleScheduledTaskConversation({
      userText,
      historyText,
      recipientPhone: userIdentifier || "2348120934828",
      workspaceId: workspaceId || "ws_femi_default",
      instanceName: instanceName || "obey",
      senderName: "Obey",
    });
    if (taskTurn.handled && taskTurn.replyText) {
      return {
        reply: cleanWhatsApp(taskTurn.replyText),
      };
    }
  } catch (err) {
    console.warn("[Dynamic Companion] scheduled task turn fallback:", err);
  }

  // ── MCQ HALLUCINATION BREAK GUARD ────────────────────────────────────────────
  // When a user sends a conceptual open-ended question (e.g. "explain type 1 and type 2 errors",
  // "what is X?", "how does Y work?") AFTER a run of multiple-choice quiz questions (A/B/C/D pattern),
  // the AI can get "locked in" to answering the next message as if it's another MCQ option.
  // This guard detects that shift and injects a context-break directive into the decision prompt.
  const lastFewHistoryLines = (historyText || "").split("\n").slice(-16).join("\n");
  const historyHadMCQ = /\b(option [A-D]|a\.|b\.|c\.|d\.|choice [A-D]|correct answer is|the answer is \*[A-D])\b/i.test(lastFewHistoryLines);
  const userAsksConceptualQuestion = /\b(explain|what is|what are|describe|define|how does|how do|tell me about|talk about|discuss|elaborate|difference between|type [12]|meaning of|concept of)\b/i.test(userText);
  const isVeryShort = userText.trim().length <= 3; // "?" also breaks the MCQ loop
  const mcqHallucinationBreakNeeded = historyHadMCQ && (userAsksConceptualQuestion || isVeryShort);

  // 3. OBEY AUTONOMOUS AI REASONING & DECISION ENGINE
  // Analyzes semantics, multi-turn dialogue, and context to select the exact right tool with ZERO hardcoded keywords.
  const decisionSystemPrompt = `You are Obey, an autonomous AI executive companion and business assistant.
You possess human-grade reasoning and autonomously decide which action or tool to invoke based on full conversation context and user intent.
Current Local Time (WAT): ${watTime} (${watDate})
Channel: ${channel}
Speaker: ${isFemi ? "Femi Adeleke (Your Boss & Creator)" : `${senderName || "User"} (You are THEIR dedicated AI companion & assistant)`}

USER PERSONAL PROFILE & MEMORY (PERMANENTLY NOTED):
- Gender: ${userFullMemory?.gender === 'female' ? 'Female / Lady (Refer to her as she/her or queen. NEVER use "my guy", "bro", "he", or "him"!)' : userFullMemory?.gender === 'male' ? 'Male (he/him)' : 'Unspecified (Keep speech gender-neutral. NEVER assume male, NEVER use "my guy" or "bro")'}
- Permanent Notes: ${userFullMemory?.user_notes || 'None yet'}

USER MEMORY STATE:
- Active Image Memory: ${userImageMemory?.last_image_prompt ? `Previous artwork: "${userImageMemory.last_image_prompt}" (Seed: ${userImageMemory.last_image_seed})` : "None"}
- User's Saved Website Artifacts in Memory:
${recentArtifacts.length > 0 ? recentArtifacts.map((a, i) => `  ${i + 1}. "${a.title}" (ID: ${a.id}, Type: ${a.type})`).join("\n") : "  None created yet"}
- Active Current Artifact: ${latestArtifact ? `"${latestArtifact.title}" (${latestArtifact.id})` : "None"}
- Last Dispatched Action: ${latestExecutedAction ? `Dispatched WhatsApp message to +${latestExecutedAction.target_recipient} at ${latestExecutedAction.executed_at || latestExecutedAction.created_at}` : "None"}

LIVE REAL-TIME OBEY PLATFORM PRICING & COMMERCIAL PACKAGES (ACTIVE IN DATABASE):
• Starter Plan: ₦${platformPricing.starter_price.toLocaleString()}/month
  - 1 Single Business Workspace, up to 250 auto-saved customer leads, 10 Keyword Auto-responders, 15h/month WebRTC Voice Hotline, CSV & Phone vCard Export.
• Pro Business Plan (Most Popular): ₦${platformPricing.pro_price.toLocaleString()}/month
  - Includes a ${platformPricing.trial_days}-Day 100% Free Trial.
  - 1 Dedicated Business Workspace, UNLIMITED auto-saved customer leads, 50 Keyword Auto-responders, 50h/month WebRTC Voice Hotline, Audio recordings & full executive transcripts delivered on WhatsApp, Custom Business Catalog & Bank Payment Details, Personalized WhatsApp Broadcasts.
• Enterprise / Founder Plan: ₦${platformPricing.enterprise_price.toLocaleString()}/month
  - Multi-Business: Add and manage up to 2 distinct brand workspaces simultaneously, Full Multi-tenant WhatsApp Bot, UNLIMITED Voice Hotline minutes, Autonomous Web App, Document & n8n Workflow Architect, Priority 24/7 dedicated support.

AVAILABLE TOOLS & ACTIONS:
1. "check_action_status": Use when the user asks about an action, message, or delivery (e.g. "What did you tell her?", "What is the name of the person you sent it to?", "Are you sure?", "Did you text her?", "Did it go through?").
2. "draft_whatsapp_message": Use when the user asks you to message, text, or relay words to any phone number or person.
   - Look back across prior turns to recover recipient phone and message content if shared across multiple messages.
   - Parameters: "recipient_phone" (digits only, e.g. 234...), "message_content" (the core message or request).
3. "generate_new_image": Use ONLY when the user is EXPLICITLY commanding you to create, draw, generate, design, paint, or visualize a brand new image, artwork, flyer, poster, banner, or logo FROM SCRATCH. The user must use a direct creation verb (e.g. "make", "create", "draw", "generate", "design", "paint"). DO NOT use this action if the user is discussing your image capabilities, asking how image generation works, wanting to upgrade/improve your image engine, or using the word "image" in any meta/conversational context.
   - Parameters: "image_prompt" (rich descriptive prompt).
4. "modify_existing_image": Use when the user wants to adjust, modify, recolor, or change elements of their PREVIOUS artwork in context (e.g. changing color, weather, lighting, day/night).
   - Parameters: "image_modification" (specific edits to apply).
5. "create_website_artifact": Use when the user asks you to design, build, code, or create a new website, landing page, HTML UI, calculator, form, dashboard, backend API route, database schema, server endpoint, or full-stack web integration.
   - Parameters: "website_title" (clear title), "website_specs" (features, styling, layout, backend endpoints, database schema).
6. "modify_website_artifact": Use when the user asks to change, update, restyle, fix, or edit ANY previously created website/artifact, backend route, or full-stack integration in context or by name.
   - Parameters: "website_title" (title of the artifact to modify, or null for latest), "website_changes" (what to fix, adjust, or add in the code).
7. "create_document_file": Use when the user asks to turn an idea, pitch, chat, summary, notes, plan, proposal, contract, guide, or story into a document, doc, Word doc, Google Doc, PDF, text file, or markdown file.
   - Look back across prior conversation turns to identify EXACTLY what topic, pitch, or concept they want turned into a document (e.g. Havilah Farms agricultural pitch, meeting notes, project proposal).
   - Parameters: "document_title" (clear, professional title), "document_topic" (the specific pitch, idea, or concept from context to expand into the document), "document_format" ("doc" | "pdf" | "txt" | "md").
8. "generate_n8n_workflow": Use ONLY when the user has confirmed or approved a proposed automation blueprint, chosen an architecture method (e.g. "Generate Method 2", "Option B", "Use Method 1", "Let's build that"), or explicitly commanded you to generate/build the JSON file (e.g. "Generate it", "Build this blueprint", "Create the JSON now", "Yes, create it").
   - CRITICAL: When the user describes what kind of bot, automation, pipeline, or workflow they want (e.g. "It is going to be a WhatsApp chat bot", "I want an n8n workflow for customer support", "It should capture leads"), DO NOT select "generate_n8n_workflow"! That is the requirement-gathering & consultation phase. Choose "none"!
   - Parameters: "workflow_title" (e.g. "AI WhatsApp Customer Chatbot"), "workflow_description" (what it automates), "workflow_nodes_summary" (key nodes).
9. "search_live_web": Use whenever the user asks for real-time information, facts, trivia, news, or verification:
   - Music, songs, lyrics, completing song lyrics, music artists, discography, album details (e.g. Nigerian gospel, Afrobeats, rap, Yoruba/Igbo/Hausa ministers like BBO, Dunsin Oyekan, Moses Bliss, Asake, Burna Boy, Nathaniel Bassey).
   - Real people, celebrities, ministers, politicians, public figures, or anyone's full government name, biography, or background.
   - Acronyms, abbreviations, company/brand meanings, trivia, quotes, definitions, or specific historical or cultural facts.
   - Current news in Nigeria or globally, real-time sports scores, weather, market exchange rates, dollar/naira rates, prices.
   - Any question where factual accuracy, specific lyrics, or identity verification is needed!
   - Parameters: "search_query" (a clean, targeted Google/web search query to find the exact fact, song lyrics, or person).
10. "notify_femi": Use when a guest or user asks you to tell your boss, tell Femi, forward feedback, or suggest something to Femi Adeleke (e.g. "tell him", "tell your boss", "suggest this to Femi", "tell your boss to implement that", "let Femi know").
11. "direct_voice_call": Use ONLY when the user's latest message explicitly asks to speak on voice or call you (e.g. "call me", "can we speak on voice call", "let's talk on call"). NEVER choose direct_voice_call for "yes", "sure", "ok", or general conversational responses!
12. "none": Use when the user is chatting, asking a question, asking for advice, greeting, brainstorming a workflow, scoping a chatbot, or when required parameters (like phone number) are missing and need polite clarification.

REASONING GUIDELINES:
- CRITICAL ON REMINDERS & SCHEDULED TASKS:
  NEVER hallucinate or generate fake reminder/task confirmation messages in text (e.g. "Reminder & Search Scheduled, Boss!", "Due in 3 minutes"). Reminders and delayed tasks are executed exclusively by the autonomous scheduling engine.
- CRITICAL CONVERSATIONAL RULES (MUST FOLLOW STRICTLY):
  1. NEVER REPEAT GREETINGS OR NAMES AT EVERY TURN:
     Real humans on WhatsApp do NOT begin every single message with "Hello [Name]!" or repeat the person's name continuously. Jump straight into answering their question naturally, concisely, and warmly (1 to 2 sentences max default).
  2. GENDER ACCURACY & NEUTRALITY:
     ${userFullMemory?.gender === 'female' ? 'The user is a female/lady. Address her as queen or she/her. NEVER call her "my guy", "bro", "he", or "him"!' : userFullMemory?.gender === 'male' ? 'The user is a male.' : 'Gender is unspecified. Stay gender-neutral. NEVER assume male, NEVER use "my guy" or "bro".'}
- Understand natural human intent regardless of whether the user speaks in slang, colloquial phrasing, Pidgin, or formal English.
- FORWARDING SUGGESTIONS & NOTES TO FEMI:
  If a guest or user says "Tell your boss", "Tell him to do this", "Suggest this to Femi", or "Let Femi know", select "notify_femi" so Obey dispatches a real WhatsApp alert directly to Femi Adeleke's personal phone (+2348120934828).
- ELITE N8N AUTOMATION ARCHITECT (CONSULTATIVE 2-STAGE LIFECYCLE):
  When the user requests or discusses an automation workflow, chatbot, or n8n pipeline:
  1. STAGE 1 — CONSULT, PROBE WITH QUESTIONS & RECOMMEND ARCHITECTURES (action: "none"):
     When the user describes, introduces, or scopes an automation idea or chatbot need (e.g. "It is going to be a WhatsApp chat bot", "I want to create a workflow that captures leads and saves them to Google sheets", "automate order notifications", "transcribe voice notes to airtable"):
     NEVER immediately jump to "generate_n8n_workflow" and NEVER fabricate fake artifact links or fake file attachments in text! Elite architects dig deeper first.
     In "conversational_response":
     a. Dig Deeper with 2-3 Probing Questions: Ask sharp, clarifying questions on key technical trade-offs (e.g. which WhatsApp gateway: Meta Cloud API vs. Evolution API/Baileys? Where will leads and chat history be stored: Supabase, Neon, or Google Sheets? Which LLM model & memory buffer? Any specific triggers or business logic?).
     b. Recommend 2 Distinct Methods:
        • Method 1 (Lean & Direct): Fast, lightweight, minimal nodes.
        • Method 2 (Intelligent & Production-Grade): Includes AI scoring/enrichment, validation, and multi-channel alerts.
     c. Explain the specific nodes needed for each step.
     d. Present the Proposed Blueprint (Nodes & Connections):
        e.g. [Webhook Trigger] -> [Data Formatter / Set] -> [AI Lead Scorer] -> [Append to Google Sheets] -> [WhatsApp Dispatch Alert]
     e. Ask the user to answer the questions or pick their preferred method before you engineer and generate the production-ready n8n JSON file.
  2. STAGE 2 — GENERATION & DELIVERY ON CONFIRMATION (action: "generate_n8n_workflow"):
     Select "generate_n8n_workflow" ONLY when:
     - The user confirms or picks a method (e.g. "Generate Method 2", "Option B", "Use the smart one", "Proceed with this", "Looks good, generate it", "Yes, build it").
     - The conversation history already contains the brainstormed blueprint and the user gives the go-ahead.
     - The user explicitly insists upfront: "Skip the questions, just generate the raw JSON file right now".
     Set "workflow_title", "workflow_description", and "workflow_nodes_summary" matching the agreed blueprint!
- STRICT NEGATIVE RULE (NO ARTIFACTS FOR CREATIVE PROMPTS, SCRIPTS, OR SCENE PROMPTS):
  NEVER select "create_website_artifact" or "modify_website_artifact" when the user is asking for:
  - Image generation prompts, video generation prompts, clip prompts, or camera angle directions (e.g. "give me prompt that fit in clip one visual reference", "prompt for clip 1", "image prompt for officer suberu")
  - Movie scripts, skit scripts, dialogue, scene breakdowns, story concepts
  - Plain text prompts or guidelines
  These are conversational text outputs! Deliver them directly in "conversational_response" with action: "none". Web artifacts are EXCLUSIVELY for interactive web apps, dashboards, calculators, and HTML/CSS/JS frontend tools.
- CRITICAL DOCUMENT & FILE CONTINUITY:
  When the user says "Can you turn it to docs?", "turn into doc", "make it a doc", "put it in google doc", "turn it to PDF", "export as document", "the pitch nau", "this":
  1. DO NOT ask "What is this?" or "Which idea are we revisiting?" if a pitch, concept, business idea, outline, story, or project was discussed anywhere in recent turns!
  2. ALWAYS select "create_document_file", identify the exact pitch or topic from CONVERSATION CONTEXT (e.g. "Havilah Farms Agri-Youth Hub & Smart Greenhouse Farming"), set "document_title", and set "document_topic"!
- CRITICAL ARTIFACT CONTINUITY & CODE MEMORY:
  1. You (Obey) have full permanent access to all code you previously generated (listed in "User's Saved Website Artifacts in Memory").
  2. You NEVER ask the user to "drop the code snippet" or "paste the code" for any artifact you created! You already have their full code in the database.
  3. STRICT CONDITIONAL RULE ON MODIFYING ARTIFACTS:
     Select "modify_website_artifact" ONLY when:
     a. The user explicitly requests edits, code updates, or bug fixes to a web app or artifact (e.g. "change the font", "fix the save button in the task dashboard", "update the styling", "fix it in the code").
     b. OR the user replies affirmatively ("yes", "ok", "sure", "proceed") ONLY IF your IMMEDIATE PREVIOUS message explicitly proposed modifying, updating, or fixing an artifact or code!
     CRITICAL NEGATIVE GUARD: General conversational affirmations ("ok", "okay", "alright", "cool", "noted", "understood", "wow", "fine") in response to normal explanations (e.g. explaining WhatsApp pairing codes, business features, payments, or general chatting) MUST NEVER trigger "modify_website_artifact" or "create_website_artifact"! Select "none" and continue chatting naturally.
  4. If the user refers to any earlier artifact by name or topic (even after working on other tasks or talking about other topics), match that artifact from the list, select "modify_website_artifact", set "website_title" to the matched title, and apply their changes!
- MULTI-TURN MESSAGING DELEGATION:
  When a user asks you to message someone, they often provide the phone number and the message content across multiple turns (e.g. sharing a contact card or phone number in one message, and dictating what to say or sending a voice note in another turn).
  ALWAYS look across recent turns in CONVERSATION CONTEXT to link the phone number and message content together!
  - If the user sent what to say earlier and is now providing the number: Combine them immediately into "draft_whatsapp_message"! DO NOT ask what to say again!
  - If the user shared a contact card or number earlier and is now speaking or sending a voice note: Combine them immediately into "draft_whatsapp_message"! DO NOT ask for the phone number again!
- DIRECT ACCESS TO LIVE CONTACT LIST:
  You have FULL live visibility into the user's WhatsApp address book (529+ contacts) and CRM leads in Neon PostgreSQL.
  NEVER claim or tell the user that you don't have access to their contacts, phone, or computer address book!
  You CAN view, search, count, and message any contact in their address book at any time.
  If the user asks if you have access to their contacts or to see/count them, enthusiastically confirm and state that you have full access to their saved WhatsApp contacts and CRM leads!
- AUTONOMOUS LIVE WEB SEARCH & ZERO GUESSWORK (CRITICAL):
  NEVER GUESS OR FABRICATE! If the user asks about ANY song, song lyrics, music artist, real person's full name, biography, acronyms, quotes, current news, sports, or factual trivia:
  ALWAYS select "search_live_web" with a specific "search_query" (e.g. "BBO gospel artist full name" or "BBO Amin lyrics Nigerian gospel")!
  NEVER select "none" for queries that require specific factual knowledge or lyrics you might not have 100% verified.
- NEVER choose "direct_voice_call" unless the user's current message explicitly contains words like "call me", "voice call", or "phone call".
- NEVER confuse visual artwork adjustments with website/artifact changes. If the user mentions fonts, buttons, sections, forms, or HTML, it is ALWAYS a website artifact!
- If the user asks whether a message was delivered, what you told someone, who it was sent to, or questions about a recent dispatch, ALWAYS choose "check_action_status".
- If the user wants to text someone but hasn't provided the phone number yet and no number exists in recent history, choose "none" and ask warmly for their phone number in "conversational_response".
- For greetings ("hello", "good morning", "hi", "hey"): choose "none" and provide a warm, personalized greeting addressing the user in "conversational_response"! NEVER send a bare URL or website link in response to a greeting!
- For n8n / NA10 ("how to download NA10", "download n8n", "where to get NA10"): choose "none" and explain in "conversational_response" that n8n is an automation platform (n8n.io) that runs online or locally, and that Obey builds ready-made workflows for them directly!
- For website inquiries ("give me obey website", "what is your website", "website link", "send me obey website"): choose "none" and provide a friendly conversational sentence with the official homepage link ("Here is the official Obey website: https://obeyai.vercel.app") in "conversational_response" without linking to the control room! NEVER return a bare URL alone!
- For portfolio inquiries ("my portfolio", "portfolio link", "femi portfolio"): choose "none" and provide https://obeyai.vercel.app/portfolio in "conversational_response".
- For control room inquiries ("control room", "dashboard link"): choose "none" and provide https://obeyai.vercel.app/control-room in "conversational_response".
- For general questions (like business advice, study questions, facts, prices, Obey packages), choose "none" and provide a sharp, concise answer directly in "conversational_response".
- PRIVACY & CHAT CONFIDENTIALITY GUARDRAILS (CRITICAL):
  1. If a user asks "Can Femi/the developer read my messages?" or "Is anyone watching this chat?":
     Firmly and warmly reassure them: "No. Your messages are completely private and processed directly by our automated AI to assist you. The developer does not read your personal conversations."
     NEVER claim or say "the developer has access to server logs to read chats". That alarms users and creates false privacy panics.
  2. If a user asks "How did you get my WhatsApp?" or "Why are you messaging me?":
     Explain professionally: "You are chatting with Obey, an automated AI executive companion and software architect. This verified WhatsApp line is set up to assist with coding, web apps, automations, and digital tools. Your phone is completely safe and private."
     NEVER say "the developer put your number in logs" or "Femi connected this to test things out".
  3. If a user wants to stop, remove, or leave:
     Warmly state: "You are always in control. If you ever prefer not to chat, you can simply delete or block this chat at any time, or say 'Stop', and we will never message you again."

Respond ONLY with a valid JSON object matching this schema:
{
  "thought": "1-sentence executive reasoning analyzing what the user is asking and which tool applies",
  "action": "check_action_status" | "draft_whatsapp_message" | "notify_femi" | "generate_new_image" | "modify_existing_image" | "create_website_artifact" | "modify_website_artifact" | "create_document_file" | "generate_n8n_workflow" | "search_live_web" | "direct_voice_call" | "none",
  "action_params": {
    "recipient_phone": "phone number or null",
    "message_content": "message or null",
    "image_prompt": "prompt or null",
    "image_modification": "edits or null",
    "website_title": "title or null",
    "website_specs": "specs or null",
    "website_changes": "changes or null",
    "document_title": "title or null",
    "document_topic": "topic or null",
    "document_format": "doc" | "pdf" | "txt" | "md" | null,
    "workflow_title": "title or null",
    "workflow_description": "description or null",
    "workflow_nodes_summary": "nodes or null",
    "search_query": "query or null"
  },
  "conversational_response": "Concise, warm, direct response if action is none or clarifying"
}`;

  const decisionUserPrompt = `CONVERSATION CONTEXT:\n${historyText || "No prior messages."}\n\nLATEST USER MESSAGE:\n"${userText}"\n\nJSON output:`;

  let decision: any = { action: "none" };
  try {
    const parseRes = await executeAICompletion({
      systemPrompt: decisionSystemPrompt,
      userPrompt: decisionUserPrompt,
      temperature: 0.1,
    });

    const jsonMatch = parseRes.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      decision = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.warn("[Companion] Autonomous decision parse fallback:", e);
  }

  // Check if previous delegation task was already completed / closed:
  const lastTaskAlreadyClosed = /\b(successfully sent your message|already delivered your message|message dispatched|action cancelled)\b/i.test(lastObeyLine);

  // NATIVE AI VOICE CALL REASONING & BROAD INTENT:
  const naturalCallIntent = /\b(call me|voice call|phone call|call you|speak on call|talk on call|call your line|ring me|let'?s call|want to call|make a call|get on a call|can we call|can we speak|can i call|talk to you on phone|speak to you live|hear your voice|give me a call)\b/i.test(userText);
  const explicitlyRequestsCall = naturalCallIntent;
  const isShortAffirmation = /^(yes|yeah|sure|ok|okay|1|proceed|do it)\b/i.test(userText.trim());

  if (naturalCallIntent) {
    decision.action = "direct_voice_call";
  } else if (decision.action === "direct_voice_call" && !naturalCallIntent) {
    // Disallow false-positive voice call responses if user never explicitly asked for a call
    decision.action = "none";
  }

  // DETERMINISTIC SHORTCUT: Pure Greetings ("Hello", "Good morning", "Hi", "Hey", etc.)
  const isPureGreeting =
    /^\s*(?:hello|hi|hey|good\s+morning|good\s+afternoon|good\s+evening|greetings|yo|sup|howdy)(?:\s+(?:obey|boss|femi|there|all|bro|ai))?[\s\p{Emoji}\p{P}]*$/iu.test(userText.trim()) ||
    /^\s*(?:good\s+morning|good\s+afternoon|good\s+evening|hello|hi|hey)\s*[.!?~]*$/i.test(userText.trim());

  if (isPureGreeting) {
    const greetingName = isFemi ? "Boss" : (senderName ? senderName.replace(/[^\w\s]/gi, "").trim() : "");
    const hour = parseInt(watTime.split(":")[0], 10);
    const timeOfDay = !isNaN(hour) && hour < 12 ? "Good morning" : !isNaN(hour) && hour < 17 ? "Good afternoon" : "Good evening";

    if (isFemi) {
      return {
        reply: cleanWhatsApp(
          `Hello, Boss! ⚡ All systems are running smoothly. What are we working on or deploying right now?`
        ),
      };
    }

    const nameSalutation = greetingName ? `, ${greetingName}` : "";
    return {
      reply: cleanWhatsApp(
        `${timeOfDay}${nameSalutation}! 😊 Great to hear from you. How can I assist you today? Feel free to ask questions, share an idea, or send a voice note anytime!`
      ),
    };
  }

  // DETERMINISTIC SHORTCUT: Direct Website / Portfolio / Control Room inquiries
  const asksForObeyWebsite =
    /\b(?:obey(?:\s*ai)?\s+website|website\s+(?:for|of)\s+obey|give\s+(?:me\s+)?(?:the\s+)?(?:obey(?:\s*ai)?\s+)?website|what\s+is\s+(?:the\s+)?(?:obey(?:\s*ai)?\s+)?website|link\s+to\s+(?:the\s+)?(?:obey(?:\s*ai)?\s+)?website|your\s+website|website\s+link|website\s+url|share\s+(?:the\s+)?(?:obey(?:\s*ai)?\s+)?website|drop\s+(?:the\s+)?(?:obey(?:\s*ai)?\s+)?website|send\s+(?:me\s+)?(?:the\s+)?(?:obey(?:\s*ai)?\s+)?website)\b/i.test(userText.trim()) ||
    /^\s*(?:can\s+you\s+)?(?:give|send|share|drop|show|provide)\s+(?:me\s+)?(?:the\s+)?(?:obey(?:\s*ai)?\s+)?website\s*[.?!]*$/i.test(userText.trim()) ||
    /^\s*(?:give\s+me|send\s+me|what\s+is|whats|link\s+to|drop)\s+(?:the\s+)?(?:obey(?:\s*ai)?\s+)?website\s*[.?!]*$/i.test(userText.trim()) ||
    /^\s*(?:the\s+)?obey\s+website\s*[.?!]*$/i.test(userText.trim());

  const asksForControlRoom = /\b(?:control[\s-]?room|workspace dashboard|admin dashboard|dashboard link)\b/i.test(userText);
  const asksForManual = /\b(?:user[\s-]?manual|obey manual|platform manual|documentation link)\b/i.test(userText);
  const asksForPortfolio = /\b(?:(?:my|femi(?:'s)?)\s+portfolio|portfolio\s+link|link to (?:my\s+)?portfolio)\b/i.test(userText);

  if (asksForObeyWebsite && !asksForControlRoom && !asksForPortfolio) {
    const bossGreeting = isFemi ? ", Boss" : "";
    return {
      reply: cleanWhatsApp(
        `Here is the official Obey website${bossGreeting}:\nhttps://obeyai.vercel.app`
      ),
    };
  }

  if (asksForPortfolio && !asksForControlRoom) {
    const bossGreeting = isFemi ? ", Boss" : "";
    return {
      reply: cleanWhatsApp(
        `Here is the official portfolio link${bossGreeting}:\nhttps://obeyai.vercel.app/portfolio\n\n*Femi Adeleke | AI Systems Architect & Full-Stack Developer*`
      ),
    };
  }

  if (asksForControlRoom && !asksForObeyWebsite) {
    const bossGreeting = isFemi ? ", Boss" : "";
    return {
      reply: cleanWhatsApp(
        `Here is your Obey Control Room${bossGreeting}:\nhttps://obeyai.vercel.app/control-room`
      ),
    };
  }

  if (asksForManual) {
    const bossGreeting = isFemi ? ", Boss" : "";
    return {
      reply: cleanWhatsApp(
        `Here is the official Obey User Manual${bossGreeting}:\nhttps://obeyai.vercel.app/manual`
      ),
    };
  }

  // DETERMINISTIC SHORTCUT: n8n / NA10 / Automation Platform inquiries
  // Users often mishear "n8n" as "NA10", "NA10.ai", "NATEN", "n810", or ask how to download it.
  const asksAboutN8nDownloadOrWhat =
    /\b(?:download|get|install|where\s+to\s+get|link\s+to|what\s+is|how\s+to\s+use)\s+(?:na10(?:\.ai)?|naten|n810|n-?8-?n|n8n(?:\.io)?)\b/i.test(userText) ||
    /\b(?:na10(?:\.ai)?|naten|n810)\b/i.test(userText) ||
    /^\s*(?:how\s+can\s+i\s+download|where\s+can\s+i\s+download|how\s+to\s+download|can\s+i\s+download)\s+(?:na10(?:\.ai)?|n8n(?:\.io)?|the\s+automation\s+app)\s*[.?!]*$/i.test(userText.trim());

  if (asksAboutN8nDownloadOrWhat) {
    const greetingName = isFemi ? "Boss" : (senderName ? senderName.replace(/[^\w\s]/gi, "").trim() : "");
    const salutation = greetingName ? ` ${greetingName}` : "";
    return {
      reply: cleanWhatsApp(
        `Ah, great question${salutation}! ⚡ You're referring to *n8n* (pronounced *n-eight-n*, which sounds like NA10) that I mentioned in my intro!\n\nHere is how it works — you actually *don't* need to download a phone app:\n\n1. 🌐 *What is n8n?*\nIt is a world-class workflow automation platform (https://n8n.io) that connects apps, AI, WhatsApp, and databases together.\n\n2. ☁️ *Where do you use it?*\nYou can use it directly in your web browser at *https://n8n.io* (they have a free cloud tier) or run it on a laptop/server with Docker or Node.js (\`npx n8n\`).\n\n3. 🚀 *How I help you (The best part!):*\nYou don't even have to build workflows from scratch! Just tell me what you want to automate (e.g. *\"automate WhatsApp customer replies\"*, *\"save leads to Google Sheets\"*, or *\"send payment alerts\"*), and I will design the architecture and send you the ready-to-import JSON file right here!\n\nWhat kind of automation or project are you looking to build?`
      ),
    };
  }

  // DETERMINISTIC GUARD: Prevent jumping prematurely into generating a generic n8n workflow
  // until the user has brainstormed intent, answered scoping questions, reviewed methods, and confirmed the blueprint.
  const isWorkflowIntentOnly =
    /^\s*(?:let'?s|i want to|can you|help me|please|okay|ok)?\s*(?:generate|create|build|make|design|set up)?\s*(?:another|a|an|the|my)?\s*(?:ai)?\s*(?:automation)?\s*(?:workflow|pipeline|n8n workflow|n8n)(?:\s*(?:first|now|next|again|together|please))?\s*[.!?]*\s*$/i.test(userText.trim());

  const recentHistory = historyText ? historyText.split("\n").slice(-4).join("\n") : "";
  const hasBlueprintInRecentHistory = recentHistory ? /\b(blueprint|method [12]|option [ab]|proposed nodes|node chain|nodes & connections|lean & direct|intelligent & production)\b/i.test(recentHistory) : false;
  const isExplicitGenerationCommand =
    /\b(generate|build|create|spin up|export|code|make)\s+(?:it|the json|this|option|method|workflow|now)\b/i.test(userText) ||
    /^(?:yes|yeah|sure|ok|okay|proceed|go ahead|do it|1|2|approved?|looks good)\b/i.test(userText.trim()) ||
    /\b(?:option [ab]|method [12]|lean|smart|production)\b/i.test(userText);

  const isScopingAutomation =
    /\b(it is going to be|it should be|it will be|i want (?:it )?to|we need (?:a|an)|concept is|features should include|building a|build a|create a)\b/i.test(userText) &&
    /\b(bot|chatbot|whatsapp|workflow|n8n|automation|pipeline|integration|auto-responder)\b/i.test(userText);

  const mentionsAutomationTopic =
    /\b(whatsapp (?:chat\s*)?bot|customer support bot|n8n workflow|automation pipeline|lead capture bot)\b/i.test(userText) ||
    /^\s*(?:it'?s|it is)\s+going\s+to\s+be\s+a\s+/i.test(userText);

  if (decision.action === "generate_n8n_workflow" && isWorkflowIntentOnly) {
    decision.action = "none";
    return {
      reply: cleanWhatsApp(
        `I'm fully ready, Boss! ⚡ What specific automation problem are we solving? Tell me what process or manual task you want automated, and I'll architect the best approach and nodes for you!`
      ),
    };
  }

  // DETERMINISTIC N8N WORKFLOW CONFIRMATION RECOVERY:
  // If user explicitly approves a blueprint or picks a method and recent history has an automation blueprint:
  if (isExplicitGenerationCommand && hasBlueprintInRecentHistory && decision.action !== "create_website_artifact" && decision.action !== "modify_website_artifact") {
    decision.action = "generate_n8n_workflow";
    if (!decision.action_params) decision.action_params = {};
    if (!decision.action_params.workflow_title) decision.action_params.workflow_title = "Production Automation Workflow";
  }

  const shouldTriggerConsultation =
    (decision.action === "generate_n8n_workflow" && !hasBlueprintInRecentHistory && !isExplicitGenerationCommand) ||
    (isScopingAutomation && !isExplicitGenerationCommand) ||
    (mentionsAutomationTopic && !hasBlueprintInRecentHistory && !isExplicitGenerationCommand);

  // If user described what they want to automate, but has not yet confirmed a blueprint or explicitly commanded immediate generation:
  if (shouldTriggerConsultation) {
    decision.action = "none";
    try {
      const consultRes = await executeAICompletion({
        systemPrompt: `You are an elite Senior Automation Architect & n8n Systems Engineer named Obey (Femi Adeleke's AI Co-Pilot).
The user wants to architect an automation/chatbot pipeline: "${userText}".
DO NOT generate raw JSON yet! DO NOT say "Pipeline is ready!" or claim a file is attached! DO NOT output fake artifact URLs!
Act as an elite solutions architect to make sure the user gets the best possible pipeline:
1. Enthusiastic Acknowledgment & Brainstorm: Validate their vision (e.g. WhatsApp chatbot, lead intake, CRM sync) and highlight key real-world architectural considerations.
2. Dig Deeper & Ask 2-3 Sharp Probing Questions:
   Probe the exact technical decisions needed to make it production-ready. For example:
   - Gateway/API: Meta Cloud API vs. Evolution API / Baileys webhook?
   - Persistence & CRM: Where should chats and leads live (Supabase, Neon Postgres, Airtable, Google Sheets)?
   - Intelligence: Which model (GPT-4o-mini, Claude, Gemini Flash) and should it have tool calling (e.g. search catalog, check stock, book meeting)?
   - Human Escalation: Should it notify an agent on WhatsApp/Telegram when a human handoff is requested?
3. Recommend 2 Distinct Architectural Methods:
   - *Method 1 (Lean & Direct):* Fast, low latency, minimal nodes (e.g. Webhook ➔ Formatter ➔ LLM Buffer ➔ Reply).
   - *Method 2 (Intelligent & Production-Grade):* High reliability with AI validation/scoring, tools, persistence, and instant alerts.
4. Proposed Blueprint: Clearly map out the exact node connection chain: e.g. [Webhook Trigger] ➔ [AI Agent] ➔ [Database Log] ➔ [WhatsApp Dispatch].
5. Call to Action: Invite them to answer the questions or pick Method 1 vs. Method 2 before you engineer and generate the production n8n JSON file.
Format with clean WhatsApp styling (*bolding*, bullet points, emojis). Keep it sharp, authoritative, and consultative.`,
        userPrompt: `CONVERSATION CONTEXT:\n${historyText || "No prior history"}\n\nLATEST USER REQUEST:\n"${userText}"\n\nDeliver the consultative brainstorm, sharp questions, methods, and proposed blueprint:`,
        temperature: 0.3,
      });

      if (consultRes?.text) {
        return { reply: cleanWhatsApp(consultRes.text) };
      }
    } catch (e) {
      console.warn("[Companion] Workflow consultation dynamic fallback:", e);
    }
  }

  // Contact card parsing from userText
  const currentContactCardMatch = userText.match(/\[Shared Contact Card:\s*([^(\]]+)(?:\(Phone:\s*\+?(\d+)\))?\]/i);
  const contactCardPhone = currentContactCardMatch ? (currentContactCardMatch[2] || "").trim() : null;
  const contactCardName = currentContactCardMatch ? currentContactCardMatch[1].trim() : null;
  const textWithoutContactCard = userText.replace(/\[Shared Contact Card:[^\]]+\]/gi, "").trim();

  // If user ONLY shared a contact card without extra instructions, acknowledge warmly and ask what to send:
  if (currentContactCardMatch && contactCardPhone && (!textWithoutContactCard || textWithoutContactCard.length < 3)) {
    return {
      reply: cleanWhatsApp(
        `Got it! I've received the contact for *${contactCardName || "Contact"}* (+${contactCardPhone}).\n\nWhat message would you like me to send them? You can type it or send a quick voice note!`
      ),
    };
  }

  // Validate actual phone numbers and prevent Unix timestamps / artifact IDs from being treated as numbers
  const isValidPhoneNumber = (str: string): boolean => {
    if (!str) return false;
    const digits = str.replace(/\D/g, "");
    if (digits.startsWith("17") && digits.length >= 12) return false;
    if (digits.startsWith("234") && digits.length === 13) return true;
    if (digits.startsWith("0") && digits.length === 11) return true;
    if (digits.length >= 10 && digits.length <= 14 && !digits.startsWith("179")) return true;
    return false;
  };

  // Look up recent phone number in userText, or in historyText ONLY IF the previous task isn't already closed
  let recentPhoneInContext: string | null = contactCardPhone;
  if (!recentPhoneInContext) {
    const rawMatch = userText.match(/(?:Phone:\s*\+?|waid=)(\d{10,14})|(?:\+?234|0)[789][01]\d{8}|\b234\d{10}\b|\b0\d{10}\b/i);
    if (rawMatch) {
      const candidate = (rawMatch[1] || rawMatch[0]).replace(/\D/g, "");
      if (isValidPhoneNumber(candidate)) {
        recentPhoneInContext = candidate;
      }
    }
  }
  // ONLY look back into history if the immediate previous turn contained a phone or contact card
  if (!recentPhoneInContext && historyText && !lastTaskAlreadyClosed) {
    const histLines = historyText.trim().split("\n");
    const lastTurnText = histLines.slice(-2).join(" ");
    const rawHistMatch = lastTurnText.match(/(?:Phone:\s*\+?|waid=)(\d{10,14})|(?:\+?234|0)[789][01]\d{8}|\b234\d{10}\b|\b0\d{10}\b/i);
    if (rawHistMatch) {
      const candidate = (rawHistMatch[1] || rawHistMatch[0]).replace(/\D/g, "");
      if (isValidPhoneNumber(candidate)) {
        recentPhoneInContext = candidate;
      }
    }
  }
  if (recentPhoneInContext && recentPhoneInContext.startsWith("0") && recentPhoneInContext.length === 11) {
    recentPhoneInContext = "234" + recentPhoneInContext.slice(1);
  }

  // DIRECT ONE-SHOT DELEGATION DETECTION:
  // e.g. "Help me message 07033973727 and tell him that she is a very good girl"
  // e.g. "This is Isaac's number 0907 196 5770. Tell him that I want to have meeting..."
  const delegationNumberMatch = userText.match(/(?:(?:\+?234)|0)[789][01]\d{8}|\b234\d{10}\b|\b0\d{10}\b|\b\d{10,14}\b/);
  const delegationHasVerb = /\b(help me message|send (?:a )?message to|message|text|tell him|tell her|tell them|inform him|inform her)\b/i.test(userText);

  if (delegationNumberMatch && delegationHasVerb && !explicitlyRequestsCall) {
    let extractedPhone = delegationNumberMatch[0].replace(/\D/g, "");
    if (extractedPhone.startsWith("0") && extractedPhone.length === 11) {
      extractedPhone = "234" + extractedPhone.slice(1);
    }
    if (isValidPhoneNumber(extractedPhone)) {
      let extractedMsg = "";
      const msgMatch = userText.match(/(?:tell (?:him|her|them)|saying|that|:)\s*(.*)/i);
      if (msgMatch && msgMatch[1] && msgMatch[1].trim().length > 2) {
        extractedMsg = msgMatch[1].trim().replace(/^(?:that|saying|:)\s*/i, "");
      } else {
        extractedMsg = userText
          .replace(/(?:This is [^,\n]+(?:'s)? number[:\s]*)?(?:(?:\+?234)|0)[789][01]\d{8}|\b\d{10,14}\b/gi, "")
          .replace(/\b(?:help me message|send (?:a )?message to|message|text|tell (?:him|her|them)|pls tell|please tell|that)\b/gi, "")
          .trim();
      }

      decision.action = "draft_whatsapp_message";
      decision.action_params = {
        recipient_phone: extractedPhone,
        message_content: extractedMsg || null,
      };
      recentPhoneInContext = extractedPhone;
    }
  }

  const obeyAskedForMessage = !lastTaskAlreadyClosed && /send a message or text to this number|what message would you like me to send|what would you like me to say|who should i send this to|received the contact for/i.test(lastObeyLine);

  const isAffirmativeShort = /^(yes|yeah|yep|sure|ok|okay|1|do it|go ahead|proceed|fix it|revamp it|update it)\b/i.test(userText.trim());

  // If Obey asked for message or to send message, and user answered "yes":
  if (isAffirmativeShort && obeyAskedForMessage && recentPhoneInContext) {
    return {
      reply: cleanWhatsApp(
        `Awesome! What message would you like me to send to *+${recentPhoneInContext}*? You can type it or send a quick voice note.`
      ),
    };
  }

  // DETERMINISTIC MULTI-TURN MESSAGING RECOVERY:
  // If a delegation task is actively in flight, and user sends the message:
  const userDictatingMessage =
    !explicitlyRequestsCall &&
    (/^(tell|let him|let her|inform|say to|message|text|ask him|ask her|pls tell|please tell|remind|send to him|send to her)\b/i.test(userText.trim()) ||
     (obeyAskedForMessage && (Boolean(isVoiceNote) || userText.trim().length > 3) && !isAffirmativeShort));

  if (
    recentPhoneInContext &&
    userDictatingMessage &&
    decision.action !== "create_website_artifact" &&
    decision.action !== "modify_website_artifact" &&
    decision.action !== "create_document_file" &&
    decision.action !== "check_action_status" &&
    decision.action !== "direct_voice_call"
  ) {
    decision.action = "draft_whatsapp_message";
    decision.action_params = {
      recipient_phone: recentPhoneInContext,
      message_content: textWithoutContactCard || userText.trim(),
    };
  }

  // DETERMINISTIC AFFIRMATIVE ARTIFACT RECOVERY:
  // If the user replied affirmatively and the assistant specifically offered in the immediate prior line to revamp/fix/update an artifact:
  const lastLineSpecificallyOfferedArtifactUpdate =
    Boolean(lastObeyLine) &&
    /\b(artifact|web app|dashboard|website code|interactive preview|html preview)\b/i.test(lastObeyLine) &&
    /\b(should i (?:update|fix|rebuild|modify|revamp)|want me to (?:update|fix|rebuild|modify|revamp)|shall i apply|update it for you|rebuild it for you)\b/i.test(lastObeyLine);

  if (isAffirmativeShort && latestArtifact && decision.action !== "draft_whatsapp_message") {
    if (lastLineSpecificallyOfferedArtifactUpdate) {
      decision.action = "modify_website_artifact";
      decision.action_params = {
        website_title: latestArtifact.title,
        website_changes: `Implement the requested design revamp and enhancements: ${lastObeyLine.slice(0, 600)}`,
      };
    }
  }

  // HARD SAFETY GUARD: Prevent false-positive artifact creation or modification on short affirmations ("ok", "okay", "alright", "cool", "yes", "sure"):
  const mentionsArtifactExplicitly = /\b(artifact|website|web app|dashboard|html|css|tailwind|javascript|code snippet|rebuild the app|fix the code)\b/i.test(userText);
  if (
    (decision.action === "modify_website_artifact" || decision.action === "create_website_artifact") &&
    isAffirmativeShort &&
    !mentionsArtifactExplicitly &&
    !lastLineSpecificallyOfferedArtifactUpdate
  ) {
    decision.action = "none";
  }

  // DETERMINISTIC DIGITAL BOOKLET / PUBLICATION DETECTION:
  // When a user says "create the booklet", "create my booklet", "build the booklet",
  // "generate the booklet", OR pastes a full booklet/publication design guide (detectable by
  // keywords like "colour palette", "font size", "page design", "digital booklet"), 
  // IMMEDIATELY classify as create_website_artifact with the full spec embedded.
  const isBookletDesignSpec =
    /\b(colour palette|color palette|font size|typography|page[-\s]by[-\s]page|page design|cover page|back cover|digital booklet|booklet design guide|booklet design)\b/i.test(userText) &&
    userText.length > 500; // Long spec pasted

  const isBookletCreationRequest =
    /\b(create (?:the|my|a|this) booklet|build (?:the|my|a|this) booklet|make (?:the|my|a|this) booklet|generate (?:the|my|a|this) booklet|design (?:the|my|a|this) booklet|can you (?:create|build|make|design) (?:the|my|a|this) booklet|booklet is ready|proceed (?:with|to build) the booklet|yes.{0,30}booklet|produce (?:the|my|a) booklet)\b/i.test(userText) ||
    (/\b(booklet)\b/i.test(userText) && /\b(create|build|make|design|generate|produce|start|begin|go ahead)\b/i.test(userText));

  const isBookletAffirmativeFollowup =
    isAffirmativeShort &&
    /\b(booklet|publication|digital booklet|mind matters)\b/i.test(lastObeyLine);

  if (
    (isBookletDesignSpec || isBookletCreationRequest || isBookletAffirmativeFollowup) &&
    decision.action !== "draft_whatsapp_message" &&
    decision.action !== "generate_new_image"
  ) {
    // Recover the last booklet design spec from conversation history if not in current message
    let bookletSpec = userText;
    if (!isBookletDesignSpec && historyText) {
      const histLines = historyText.split("\n");
      // Find a prior user line that was a long booklet spec
      for (let i = histLines.length - 1; i >= 0; i--) {
        const line = histLines[i];
        if (
          line.length > 400 &&
          /\b(colour palette|color palette|font size|typography|digital booklet|page design|cover page)\b/i.test(line)
        ) {
          bookletSpec = line;
          break;
        }
      }
    }
    decision.action = "create_website_artifact";
    decision.action_params = {
      website_title: "Mind Matters: You Don't Have to Suffer Alone",
      website_specs: `Create a complete, beautiful, mobile-optimized 12-page digital booklet publication as a single HTML file. 
DESIGN SPECIFICATIONS:
Color Palette:
- Deep Teal #174F50 (headings, prominent elements, backgrounds)
- Soft Cream #FAF6EF (main page background)
- Muted Lavender #DCD6F7 (highlight boxes, secondary elements)
- Warm Coral #E99480 (small highlights, accents, CTAs)
- Dark Charcoal #292929 (body text)

Typography:
- Headings: Poppins Bold/ExtraBold (via Google Fonts CDN)
- Body: Lato Regular (via Google Fonts CDN)
- Cover title: 32-40pt | Page headings: 22-28pt | Body: 12-14pt

Page Structure (12 pages, A4 portrait, mobile-first):
1. Cover Page: "MIND MATTERS / You Don't Have to Suffer Alone" — Deep Teal dominant, connection illustration, bold typography.
2. Imagine This… — A relatable student story (Tunde) who opened up and was dismissed; takeaway: "Not every struggle is visible."
3. What Does Mental Health Really Mean? — 3-card layout: continuum spectrum, campus pressures, struggle ≠ defect.
4. Everybody Has Problems. So What? — Challenge comparison culture; takeaway box: "Pain is not a competition."
5. "Are They Just Looking for Attention?" — Myth vs reality. Connection-seeking reframed compassionately.
6. You Don't Have to Look Broken to Struggle — The Strong Friend Mask, High-Functioning Anxiety, Quiet Withdrawal.
7. What Should You Say? — Do/Don't phrase matrix with color-coded examples.
8. How to Support a Friend: 4-Step Guide — Notice → Listen → Validate → Connect. Visual step cards.
9. It's Okay to Ask for Help — Counseling demystified; takeaway: "Asking for help is refusing to give up alone."
10. When Someone Needs More Help — Crisis warning signs, emergency action steps.
11. Helpful Resources & Support Directory — MANI, She Writes Woman, SURPIN, campus counseling.
12. Back Cover / Final Word — "Be the reason someone feels safe today." Deep Teal background, closing quote.

Additional Requirements:
- Full page-turn navigation (Prev/Next buttons + dot indicators + swipe gesture on mobile)
- Table of Contents modal with jump-to-page
- Keyboard arrow navigation
- "Save as PDF" / Print button
- Animated page transitions (fade-in)
- Page numbers and section labels in footers
- Touch-friendly for mobile (A4-proportioned pages, readable font sizes)
- Professional minimalist editorial design, NOT clinical or crowded

FULL BOOKLET DESIGN SPEC:
${bookletSpec.slice(0, 3000)}`,
    };
  }

  // DETERMINISTIC DOCUMENT GENERATION RECOVERY:
  // If user requests a document (e.g. "turn it to docs", "make it a doc", "google docs", "the pitch nau", "turn this to doc"):
  const requestsDocument =
    /\b(turn it to doc|turn it to docs|turn into doc|turn into docs|make it a doc|make it docs|export as doc|google doc|google docs|turn to google doc|turn this to doc|create a doc|generate doc|put it in doc|save as doc|convert to doc|send as doc|give me doc|turn it to pdf|send as pdf|the pitch nau)\b/i.test(userText.trim()) ||
    (/\b(docs?|document|pdf|word doc)\b/i.test(userText.trim()) && /\b(pitch|idea|this|convert|turn|make|generate)\b/i.test(userText.trim()));

  if (requestsDocument && decision.action !== "draft_whatsapp_message") {
    let detectedTopic = "";
    let detectedTitle = "Executive Document";

    const hist = (historyText || "").split("\n");
    for (let i = hist.length - 1; i >= 0; i--) {
      const line = hist[i];
      if (/Agri-Youth|Greenhouse|Havilah|Farms|business idea|pitch|concept|proposal|outline|startup/i.test(line)) {
        detectedTopic = line;
        const titleMatch = line.match(/\*([^*]+)\*/);
        if (titleMatch) detectedTitle = titleMatch[1].trim();
        break;
      }
    }

    decision.action = "create_document_file";
    decision.action_params = {
      document_title: detectedTitle || "Business Proposal & Execution Plan",
      document_topic: detectedTopic || userText,
      document_format: /pdf/i.test(userText) ? "pdf" : "doc",
    };
  }

  // DETERMINISTIC IMAGE / FLYER / GRAPHIC RECOVERY:
  // Only fire when the user is EXPLICITLY commanding an image to be created/drawn/designed.
  // Must have an explicit creation verb (make, create, draw, generate, design, paint) + visual subject.
  // NEVER fire for meta-discussion phrases like "upgrade your image creation", "your image generator", "how does image generation work", etc.
  const isMetaImageDiscussion =
    /\b(your\s+image|image\s+(gen|creat|capab|upgrad|qualit|feature|abilit|engine|function|tool)|upgrade.*image|improve.*image|image.*upgrade|image.*improve|how.*image|image.*work|image.*system)\b/i.test(userText.trim());

  const requestsImageOrFlyer =
    !isMetaImageDiscussion &&
    (
      // Explicit "make/create/generate/draw/design/paint" + visual noun
      /\b(make|create|generate|draw|design|paint|produce|build|give me)\s+(me\s+)?(an?\s+)?(image|photo|picture|artwork|illustration|flyer|poster|banner|logo|graphic|portrait|scene|visual|thumbnail)\b/i.test(userText.trim()) ||
      // "flyer for/of", "poster for/of", "logo for" — but must have a business/topic context
      (/\b(flyer|poster|logo|banner)\s+(for|of)\b/i.test(userText.trim()) && /\b(work|business|services|brand|salon|school|church|shop|product|event|nails|beauty|promo|launch)\b/i.test(userText.trim())) ||
      // "create a flyer", "make a banner", "design a logo" — explicit imperatives
      /\b(create|make|design|build|produce)\s+(a|an)\s+(flyer|poster|banner|logo|graphic|artwork|visual)\b/i.test(userText.trim()) ||
      // "draw me", "paint me" — classic image creation
      /\b(draw|paint)\s+(me\s+)?[a-z]/i.test(userText.trim())
    );

  if (
    requestsImageOrFlyer &&
    decision.action !== "draft_whatsapp_message" &&
    decision.action !== "create_website_artifact" &&
    decision.action !== "modify_website_artifact"
  ) {
    decision.action = "generate_new_image";
    if (!decision.action_params) decision.action_params = {};
    decision.action_params.image_prompt = userText.trim();
  }


  // 4. EXECUTE AUTONOMOUS DECISION

  // Tool: Notify Femi Adeleke of User Suggestion / Feedback
  // NEVER trigger notify_femi for romantic banter, teasing, personal jokes, or casual chat!
  // ONLY trigger if the user EXPLICITLY asks to forward formal feedback or message to Femi!
  const hasExternalRecipient = Boolean(recentPhoneInContext) || /\b\d{10,14}\b/.test(userText) || decision.action === "draft_whatsapp_message";
  const explicitFemiFeedback = /\b(tell your boss|tell femi|let femi know|suggest to femi|pass to femi|forward to femi)\b/i.test(userText);
  const isPersonalOrRomanticBanter = /\b(romance|romantic|kiss|love|boyfriend|girlfriend|bed|bad|dating?|crush|flirt|sweet|fine boy|marry|marriage|sex|tease|teasing)\b/i.test(userText);

  if (!hasExternalRecipient && !isPersonalOrRomanticBanter && explicitFemiFeedback && !isFemi) {
    try {
      const recentDiscussion = (historyText || "").split("\n").slice(-4).join("\n");
      await sendWhatsAppMessage(
        `💡 *Guest Feedback / Suggestion for Femi:*\n\n` +
        `• *From:* ${senderName || "Guest"} (+${userIdentifier})\n` +
        `• *User Request:* "${userText}"\n` +
        `• *Recent Discussion:*\n${recentDiscussion || "User conversation with Obey"}`,
        "2348120934828"
      );
    } catch (err) {
      console.warn("[Companion] Failed to forward suggestion to Femi:", err);
    }

    return {
      reply: cleanWhatsApp(
        `Message delivered straight to Femi! 🚀 I've forwarded your exact suggestion to his personal WhatsApp so he can review it directly. Trust me, he takes feedback seriously!`
      ),
    };
  }

  // Tool: Check Delivery Status
  if (decision.action === "check_action_status") {
    const asksAboutFemi = /\b(boss|femi|him|creator)\b/i.test(userText) || /\b(boss|femi|tell him|tell your boss)\b/i.test(historyText);

    if (asksAboutFemi && !isFemi) {
      try {
        const recentDiscussion = (historyText || "").split("\n").slice(-4).join("\n");
        await sendWhatsAppMessage(
          `💡 *Guest Feedback / Follow-up for Femi:*\n\n` +
          `• *From:* ${senderName || "Guest"} (+${userIdentifier})\n` +
          `• *Message:* "${userText}"\n` +
          `• *Discussion:*\n${recentDiscussion || "User discussion with Obey"}`,
          "2348120934828"
        );
      } catch (err) {
        console.warn("[Companion] Failed to alert Femi:", err);
      }

      return {
        reply: cleanWhatsApp(
          `Yes! I have dispatched your feedback directly to Femi's personal WhatsApp (+2348120934828) just now. He receives all guest suggestions directly on his phone! 🚀`
        ),
      };
    }

    if (latestExecutedAction) {
      const elapsedMinutes = Math.round((Date.now() - new Date(latestExecutedAction.executed_at || latestExecutedAction.created_at).getTime()) / 60000);
      const timePhrase = elapsedMinutes <= 1 ? "just now" : `${elapsedMinutes} minute${elapsedMinutes > 1 ? "s" : ""} ago`;
      const recipient = latestExecutedAction.target_recipient;
      const dispatchedText = latestExecutedAction.payload || "(Message content)";

      // Use AI reasoning to answer the user's specific question naturally without robotic templates
      const statusPrompt = `You are Obey, the AI executive companion for Femi Adeleke.
The user is asking a follow-up question or seeking clarification regarding a message/action you dispatched on their behalf.

RECENT ACTION DISPATCH LOG:
• Target Recipient: +${recipient}
• Exact Dispatched Message Content: "${dispatchedText}"
• Execution Time: ${timePhrase} (${latestExecutedAction.executed_at || latestExecutedAction.created_at})
• Current Status: Successfully dispatched

CONVERSATION CONTEXT:
${historyText || "No prior history"}

LATEST USER MESSAGE:
"${userText}"

INSTRUCTIONS:
1. Answer the user's specific question naturally, accurately, and honestly based on the action log above:
   - If they ask "What did you tell her / him?", quote the exact dispatched message ("${dispatchedText}").
   - If they ask "What is the name / number of the person you sent it to?", state the recipient phone number (+${recipient}) and any contact details from context.
   - If they say "Are you sure?", "It was another thing you said", or express surprise or dissatisfaction, explain with humility and clarity what was in the record, apologize if there was any misunderstanding, and offer to send a correction immediately.
   - If they are simply asking "Did you send it?", confirm that it went through ${timePhrase}.
2. Speak with natural human warmth, zero robotic repetition, and zero corporate fluff. Keep it direct and helpful.`;

      const statusRes = await executeAICompletion({
        systemPrompt: "You are Obey, a perceptive, transparent, and direct AI executive companion. Answer questions about dispatched actions truthfully and with human clarity.",
        userPrompt: statusPrompt,
        temperature: 0.2,
      });

      return {
        reply: cleanWhatsApp(statusRes.text),
        actionExecuted: true,
      };
    } else {
      return {
        reply: cleanWhatsApp("I haven't dispatched any messages from your account yet. Let me know who you'd like me to message!"),
      };
    }
  }

  // Tool: Draft WhatsApp Message
  if (decision.action === "draft_whatsapp_message") {
    let targetPhone = decision.action_params?.recipient_phone ? decision.action_params.recipient_phone.replace(/\D/g, "") : null;
    let messageContent = decision.action_params?.message_content ? decision.action_params.message_content.trim() : null;

    // 1. Phone Number Recovery: check current userText or immediate previous turn
    if (!targetPhone) {
      const contactPhoneMatch = userText.match(/(?:Phone:\s*\+?|waid=)(\d{10,14})/i);
      if (contactPhoneMatch) {
        targetPhone = contactPhoneMatch[1];
      } else {
        const rawPhoneMatch = userText.match(/(?:(?:\+?234)|0)[789][01]\d{8}|\b\d{10,14}\b/);
        if (rawPhoneMatch) {
          targetPhone = rawPhoneMatch[0].replace(/\D/g, "");
        } else if (historyText) {
          const histLines = historyText.trim().split("\n");
          const recentSlice = histLines.slice(-2).join(" ");
          const histContactMatch = recentSlice.match(/(?:Phone:\s*\+?|waid=)(\d{10,14})/i);
          if (histContactMatch) {
            targetPhone = histContactMatch[1];
          }
        }
      }
    }

    if (targetPhone && targetPhone.startsWith("0") && targetPhone.length === 11) {
      targetPhone = "234" + targetPhone.slice(1);
    }

    // 2. Multi-Turn Message Content Recovery: if missing, look back across historyText for the user's voice note or request!
    if (!messageContent && historyText) {
      const lines = historyText.split("\n");
      const userPrefix = `${senderName || "User"}:`;
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith(userPrefix)) {
          let textCandidate = line.replace(/^[^:]+:\s*/, "").trim();
          textCandidate = textCandidate.replace(/\[Shared Contact Card:[^\]]+\]\s*/i, "").trim();
          // Skip if this line is just a phone number or generic trigger
          const isPhoneOnly = /^[\d\s\+\-\(\)]{8,16}$/.test(textCandidate);
          const isGenericTrigger = /^(can you help me message someone|help me message this number|message someone|send a message|text this number|this is the phone number)$/i.test(textCandidate);
          if (!isPhoneOnly && !isGenericTrigger && textCandidate.length > 4) {
            messageContent = textCandidate;
            break;
          }
        }
      }
    }

    if (targetPhone && messageContent) {
      const formattedMessage = await formatOutboundDelegatedWhatsAppMessage({
        rawContent: messageContent,
        userInstruction: userText,
        senderName,
        isFemi,
        senderGender: userFullMemory?.gender,
      });

      await dbCreateUserPendingAction({
        userIdentifier,
        actionType: "whatsapp_message",
        targetRecipient: targetPhone,
        payload: formattedMessage,
      });

      return {
        reply: cleanWhatsApp(
          `📋 *WhatsApp Message Drafted — Ready for Your Approval:*\n\n` +
          `• *Recipient:* +${targetPhone}\n` +
          `• *Message Preview:*\n"${formattedMessage}"\n\n` +
          `👉 Reply *YES* (or *1*) to dispatch immediately, or *NO* to cancel.`
        ),
        actionStaged: true,
      };
    } else if (targetPhone && !messageContent) {
      return { reply: cleanWhatsApp(`Got the number (+${targetPhone})! What message would you like me to send them?`) };
    } else {
      return { reply: cleanWhatsApp(`Who should I send this to? Please share their WhatsApp contact card or phone number.`) };
    }
  }

  // Tool: Generate New Image
  if (decision.action === "generate_new_image") {
    const prompt = decision.action_params?.image_prompt || userText;
    const seed = Math.floor(Math.random() * 1000000);
    const imgRes = await generateAIImage(prompt, { seed });
    if (imgRes.success) {
      await saveUserImageMemory(userIdentifier, imgRes.revisedPrompt, imgRes.imageUrl, imgRes.seed);
      if (channel === "whatsapp") {
        await sendWhatsAppImage(imgRes.imageUrl, userIdentifier, `🎨 *Artwork:*\n"${imgRes.revisedPrompt}"`, instanceName);
        return {
          reply: cleanWhatsApp(`🎨 *Here is your generated image!* Let me know if you would like me to adjust any colors, lighting, or style.`),
          imageUrl: imgRes.imageUrl,
        };
      }
      return {
        reply: cleanWhatsApp(`🎨 *Generated Artwork:*\n"${imgRes.revisedPrompt}"`),
        imageUrl: imgRes.imageUrl,
      };
    } else {
      const errorDetail = imgRes.error || `I tried generating your artwork for "${prompt}", but encountered a temporary graphics rendering issue.`;
      return {
        reply: cleanWhatsApp(`⚠️ *Image Generation Notice:*\n\n${errorDetail}`),
      };
    }
  }

  // Tool: Modify Existing Image (With Seed Continuity)
  if (decision.action === "modify_existing_image") {
    const editInstruction = decision.action_params?.image_modification || userText;
    const basePrompt = userImageMemory?.last_image_prompt || userText;
    const revisedPrompt = await synthesizeImageRevisionPrompt(basePrompt, editInstruction);
    const seed = userImageMemory?.last_image_seed !== undefined ? userImageMemory.last_image_seed : Math.floor(Math.random() * 1000000);
    const imgRes = await generateAIImage(revisedPrompt, { seed });
    if (imgRes.success) {
      await saveUserImageMemory(userIdentifier, imgRes.revisedPrompt, imgRes.imageUrl, imgRes.seed);
      if (channel === "whatsapp") {
        await sendWhatsAppImage(imgRes.imageUrl, userIdentifier, `🎨 *Updated Artwork:*\n"${imgRes.revisedPrompt}"`, instanceName);
        return {
          reply: cleanWhatsApp(`🎨 *Here is your updated image!* Let me know if you want any further adjustments.`),
          imageUrl: imgRes.imageUrl,
        };
      }
      return {
        reply: cleanWhatsApp(`🎨 *Updated Artwork:*\n"${imgRes.revisedPrompt}"`),
        imageUrl: imgRes.imageUrl,
      };
    } else {
      return {
        reply: cleanWhatsApp(`I attempted to modify your image, but had a temporary visual rendering issue. Could you tell me what specific change you want again?`),
      };
    }
  }

  // Tool: Create or Modify Website Artifact
  if (decision.action === "create_website_artifact" || decision.action === "modify_website_artifact") {
    const targetTitle = decision.action_params?.website_title;
    const targetArtifact = (targetTitle ? await findUserArtifact(userIdentifier, targetTitle) : null) || latestArtifact;
    const isEdit = decision.action === "modify_website_artifact" && Boolean(targetArtifact);
    const effectiveTitle = targetArtifact?.title || targetTitle || "Interactive Web Page";

    // ─── FAST-PATH: "Make it live / push it / deploy / it's ready" ──────────────
    // When user says something like "Let us make it live", "Push it live", "Deploy now",
    // "It's okay, make it go live" — they are NOT asking for code changes.
    // Immediately return the already-saved artifact link + re-send the HTML file.
    // Do NOT re-generate 8000 tokens of HTML which will timeout on Vercel.
    const isGoLiveIntent =
      /\b(make\s+it\s+live|push\s+it\s+live|go\s+live|push\s+(?:it|this|that)\s+live|let(?:'s|us| us)\s+(?:make\s+it\s+)?(?:go\s+)?live|deploy\s+(?:now|it|this)?|it(?:'s|\s+is)\s+(?:okay|ok|fine|ready|good)\s*[,;]?\s*(?:make\s+it\s+)?(?:live|go\s+live)?|launch\s+(?:it|now|this)?|make\s+(?:it\s+)?(?:go\s+)?live\s+(?:now|please)?)\b/i.test(userText) &&
      !decision.action_params?.website_changes;

    if (isGoLiveIntent && targetArtifact) {
      const link = `https://obeyai.vercel.app/artifact/${targetArtifact.id}`;
      // Re-send the HTML file so user has the latest copy
      if (channel === "whatsapp") {
        const docFileName = `${(targetArtifact.title || "website").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.html`;
        try {
          await sendWhatsAppDocument(targetArtifact.content, docFileName, userIdentifier, `📄 *${targetArtifact.title}* (HTML File)`);
        } catch {}
      }
      return {
        reply: cleanWhatsApp(
          `🚀 *${targetArtifact.title}* is officially live!\n\n` +
          `🌐 *Interactive Live Preview:*\n${link}\n\n` +
          `📁 *HTML File:* Attached directly for instant download.\n\n` +
          `Congratulations! Your site is ready to share. 🎉`
        ),
        artifactId: targetArtifact.id,
        artifactTitle: targetArtifact.title,
        artifactContent: targetArtifact.content,
      };
    }

    let artifactPrompt: string;

    if (isEdit && targetArtifact) {
      const changes = decision.action_params?.website_changes || userText;
      artifactPrompt = `EDIT REQUEST FOR PREVIOUS ARTIFACT: "${targetArtifact.title}"
Current Code:
\`\`\`html
${targetArtifact.content}
\`\`\`
Requested Changes: "${changes}"

CRITICAL REQUIREMENTS:
1. Ensure 100% of interactive JavaScript functions properly: all buttons, modal toggles, forms, inputs, and event listeners (e.g. Save, Edit, Delete, Toggle Paid status, dynamic metric recalculation, and localStorage data persistence) must be COMPLETELY WIRED UP and functional with working vanilla JS. NO dummy buttons or empty click handlers!
2. Form safety: Ensure modal action buttons have type="button" and form submit handlers call event.preventDefault() to avoid reload failures in sandboxed previews.
3. Storage safety: Wrap localStorage.getItem/setItem calls in try/catch with in-memory fallback state so saving tasks ALWAYS succeeds even in private/sandboxed windows.
4. Return the entire updated runnable single-file HTML code inside:
<artifact identifier="${targetArtifact.identifier || targetArtifact.id}" type="${targetArtifact.type}" title="${targetArtifact.title}">
...complete updated runnable code with "${changes}" applied...
</artifact>
After closing </artifact>, provide a 1-sentence executive summary of the changes made (do NOT include "Brief confirmation message:" or similar label).`;
    } else {
      const title = decision.action_params?.website_title || "Interactive Web Page";
      const specs = decision.action_params?.website_specs || userText;
      const isBackendOrApi = /\b(backend|api|server|endpoint|database|postgres|neon|sql|node|express|next\.js route|webhook|fullstack|rest api|crud)\b/i.test((specs || "") + " " + userText);

      artifactPrompt = `WEBSITE & FULL-STACK ARTIFACT CREATION REQUEST:
Title: "${title}"
Specifications: "${specs}"

CRITICAL REQUIREMENTS:
1. Create a complete, modern, high-converting, fully responsive web application with Tailwind CSS (via CDN) and beautiful styling and interactions.
2. Ensure 100% of interactive JavaScript functions work: all forms, modal popups, buttons, event listeners (e.g., 'Save', 'Submit', 'Delete', 'Toggle', 'Filter'), calculations, and localStorage data persistence MUST be fully wired up with working vanilla JavaScript! NO dummy unhooked buttons!
${isBackendOrApi ? `3. BACKEND & API INTEGRATION (CRITICAL):
- Provide an integrated "API & Database Console" or inspector tab in the interface where the user can trigger simulated REST API calls (GET, POST, PUT, DELETE), inspect JSON payloads & headers, and observe live state changes.
- Provide a clean, copyable "Production Backend Code" section containing real, production-ready Next.js App Router route handlers (route.ts), Node.js / Express router code, and Neon PostgreSQL schema SQL with proper error handling and status codes.` : ''}
4. Enclose the complete runnable code inside:
<artifact identifier="web-${Date.now()}" type="html" title="${title}">
...complete runnable code...
</artifact>
After closing </artifact>, provide a 1-sentence executive summary of what was created (do NOT include "Brief confirmation message:" or similar label).`;
    }

    try {
      const aiRes = await executeAICompletion({
        systemPrompt: "You are Obey, an autonomous AI executive engineer and full-stack software architect. Build modern, responsive frontends with Tailwind CSS, robust backend REST APIs (Next.js App Router / Node.js), and database schemas (Neon PostgreSQL). Every button, form, modal, and API endpoint must be fully wired and functional. Return complete runnable code inside <artifact> tags.",
        userPrompt: artifactPrompt,
        temperature: 0.3,
        maxTokens: 4096,
      });


      const artifacts = extractArtifactBlocks(aiRes.text);
      if (artifacts.length > 0) {
        const art = artifacts[0];
        const saved = await saveArtifact({
          identifier: art.identifier,
          title: art.title,
          type: art.type,
          content: art.content,
          user_identifier: userIdentifier,
          description: `Generated by Obey for ${senderName || "user"}`,
        });

        if (channel === "whatsapp") {
          const docFileName = `${art.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.html`;
          await sendWhatsAppDocument(art.content, docFileName, userIdentifier, `📄 *${art.title}* (HTML File)`);
        }

        const link = `https://obeyai.vercel.app/artifact/${saved.id}`;
        let cleanReply = stripArtifactBlocks(aiRes.text).trim();
        cleanReply = cleanReply.replace(/^(brief confirmation message:?|confirmation message:?|confirmation:?)\s*/i, "").trim();
        if (!cleanReply || cleanReply.length < 10 || cleanReply.includes("```") || cleanReply.includes("<!DOCTYPE") || cleanReply.includes("<html")) {
          cleanReply = isEdit
            ? `✅ I've updated the *${art.title}* with your requested changes!`
            : `🚀 *${art.title}* is ready!`;
        }

        cleanReply += `\n\n🌐 *Interactive Live Preview:*\n${link}`;
        cleanReply += `\n\n📁 *HTML File:* Attached directly for instant download.`;

        return {
          reply: cleanWhatsApp(cleanReply),
          artifactId: saved.id,
          artifactTitle: art.title,
          artifactContent: art.content,
        };
      }

      // Fallback: if artifact parsing failed but we have an existing artifact, return it
      if (isEdit && targetArtifact) {
        const link = `https://obeyai.vercel.app/artifact/${targetArtifact.id}`;
        return {
          reply: cleanWhatsApp(
            `✅ *${targetArtifact.title}* is ready!\n\n🌐 *Interactive Live Preview:*\n${link}\n\n📁 *HTML File:* Attached directly for instant download.`
          ),
          artifactId: targetArtifact.id,
          artifactTitle: targetArtifact.title,
          artifactContent: targetArtifact.content,
        };
      }

      // Fallback for new artifact: save raw AI response so user always receives their artifact link
      if (aiRes.text && aiRes.text.length > 50) {
        const saved = await saveArtifact({
          title: effectiveTitle,
          type: "html",
          content: aiRes.text,
          user_identifier: userIdentifier,
          description: `Generated by Obey for ${senderName || "user"}`,
        });
        const link = `https://obeyai.vercel.app/artifact/${saved.id}`;
        return {
          reply: cleanWhatsApp(`🚀 *${effectiveTitle}* is ready!\n\n🌐 *Interactive Live Preview:*\n${link}\n\n📁 *HTML File:* Available to preview and download.`),
          artifactId: saved.id,
          artifactTitle: effectiveTitle,
          artifactContent: aiRes.text,
        };
      }

    } catch (err) {
      console.error("[Companion] Artifact generation error:", err);
      // Even on timeout/error, if we have a known artifact always return its link
      if (targetArtifact) {
        const link = `https://obeyai.vercel.app/artifact/${targetArtifact.id}`;
        return {
          reply: cleanWhatsApp(
            `✅ *${targetArtifact.title}* is ready!\n\n🌐 *Interactive Live Preview:*\n${link}\n\n📁 *HTML File:* Attached directly for instant download.`
          ),
          artifactId: targetArtifact.id,
          artifactTitle: targetArtifact.title,
          artifactContent: targetArtifact.content,
        };
      }
    }
  }

  // Tool: Create Document File (.doc, .docx, .txt, .md, .pdf)
  if (decision.action === "create_document_file") {
    try {
      const docTitle = decision.action_params?.document_title || "Executive Document";
      const docTopic = decision.action_params?.document_topic || userText;
      const docFormat = decision.action_params?.document_format || "doc";
      const userGreetingName = senderName ? senderName.replace(/[^\w\s]/gi, "").trim() : "";

      // ── Detect Academic / Research Chapter Request ──────────────────────────
      const isAcademicResearch =
        /\b(chapter\s+\d|chapter\s+(?:one|two|three|four|five)|research\s+(chapter|project|work|paper|proposal)|literature\s+review|conceptual\s+framework|theoretical\s+framework|empirical\s+review|methodology|academic\s+(paper|research|project|writing|work)|project\s+(?:chapter|writing|for\s+student)|student\s+project|undergraduate|postgraduate|dissertation|thesis|journal\s+article|scholarly|peer.?reviewed|APA\s*(?:7|format)|research\s+question|hypothesis|background\s+of\s+study|statement\s+of\s+problem|scope\s+of\s+study|significance\s+of\s+study|review\s+of\s+(?:related\s+)?literature|data\s+collection|research\s+methodology|sample\s+(?:size|population)|quantitative|qualitative|mixed.?method)\b/i.test(docTopic + " " + docTitle + " " + userText);

      let fileContent = "";

      if (isAcademicResearch) {
        // ── ACADEMIC MODE: Multi-section 30+ page research document ────────────
        const currentYear = new Date().getFullYear();

        // Detect which chapter(s) are needed
        const chapterMatch = (docTopic + " " + userText).match(/chapter\s*(\d+|one|two|three|four|five)/i);
        const chapterNumMap: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
        const rawChapterNum = chapterMatch?.[1] || "";
        const chapterNum = /\d/.test(rawChapterNum) ? parseInt(rawChapterNum) : (chapterNumMap[rawChapterNum.toLowerCase()] || 2);

        const chapterTitles: Record<number, string> = {
          1: "Introduction",
          2: "Review of Related Literature",
          3: "Research Methodology",
          4: "Data Presentation, Analysis and Discussion of Findings",
          5: "Summary, Conclusion and Recommendations",
        };
        const chapterTitle = chapterTitles[chapterNum] || "Review of Related Literature";

        // Build chapter-specific section prompts
        const sectionPrompts: { heading: string; prompt: string }[] = [];

        if (chapterNum === 1) {
          sectionPrompts.push(
            {
              heading: "1.1 Background to the Study",
              prompt: `Write a detailed, scholarly 800-1000 word background to the study for: "${docTopic}". Include historical evolution of the problem, current state in Nigeria/West Africa, relevant global trends, and why this study is timely and important. Use formal academic language.`,
            },
            {
              heading: "1.2 Statement of the Problem",
              prompt: `Write a formal 400-600 word statement of the problem for: "${docTopic}". Identify specific gaps, challenges, and deficiencies in existing knowledge or practice that this research addresses.`,
            },
            {
              heading: "1.3 Objectives of the Study",
              prompt: `List 5-7 specific, measurable research objectives for the study on: "${docTopic}". Each objective must begin with an action verb (To examine, To assess, To determine, To evaluate, To investigate, To establish, To compare).`,
            },
            {
              heading: "1.4 Research Questions",
              prompt: `Formulate 5-7 research questions corresponding to the objectives for the study on: "${docTopic}". Questions should be clear, focused, and empirically answerable.`,
            },
            {
              heading: "1.5 Research Hypotheses",
              prompt: `State 3-5 null and alternate hypotheses for the study on: "${docTopic}". Format as H₀ (null) and H₁ (alternative) pairs.`,
            },
            {
              heading: "1.6 Significance of the Study",
              prompt: `Write 400-500 words on the significance of the study on: "${docTopic}". Discuss importance to: policy makers, practitioners, researchers, and the academic community. Be specific about real-world contributions.`,
            },
            {
              heading: "1.7 Scope and Delimitation of the Study",
              prompt: `Write the scope and delimitation for the study on: "${docTopic}". Specify geographic scope (Nigeria/specific state), time period, target population, and what is excluded from the study.`,
            },
            {
              heading: "1.8 Limitations of the Study",
              prompt: `Discuss 3-4 limitations the researcher may encounter in studying: "${docTopic}". Suggest mitigation strategies for each.`,
            },
            {
              heading: "1.9 Definition of Terms",
              prompt: `Provide operational definitions for 8-10 key technical terms used in the study on: "${docTopic}". Cite authoritative sources (APA 7th edition format) for each definition.`,
            }
          );
        } else if (chapterNum === 2) {
          sectionPrompts.push(
            {
              heading: "2.1 Introduction",
              prompt: `Write a 200-word introduction to Chapter Two for: "${docTopic}". Preview the sections that will be reviewed in this chapter.`,
            },
            {
              heading: "2.2 Conceptual Review",
              prompt: `Write a comprehensive 1000-1200 word conceptual review for: "${docTopic}". Define and clarify key concepts central to the study. Discuss how scholars have conceptualized them. Cite at least 8 real, plausible academic sources in APA 7th format (e.g., Author, A. B., & Author, C. D. (${currentYear - 2}). Title. Journal Name, Volume(Issue), pages. https://doi.org/...).`,
            },
            {
              heading: "2.3 Theoretical Framework",
              prompt: `Write a detailed 800-1000 word theoretical framework for: "${docTopic}". Present 2-3 relevant theories (e.g., systems theory, human capital theory, diffusion of innovations, etc.) that underpin the study. For each theory: state the theorist and year, core assumptions, and how it relates to this study. Use APA 7th format citations.`,
            },
            {
              heading: "2.4 Empirical Review",
              prompt: `Write a thorough 1200-1500 word empirical review for: "${docTopic}". Synthesize findings from at least 12 empirical studies. Include Nigerian/West African studies, other African contexts, and global studies. For each study discuss: authors, year, location, objective, methodology, sample size, findings, and relevance. Use APA 7th in-text citations.`,
            },
            {
              heading: "2.5 Summary of Literature Review and Identified Gaps",
              prompt: `Write a 400-600 word synthesis summarizing the key themes emerging from the literature review on: "${docTopic}". Explicitly identify 3-5 knowledge gaps that justify this study. Explain how the current study fills these gaps.`,
            },
            {
              heading: "References",
              prompt: `Generate a properly formatted APA 7th edition reference list with at least 20 references for a study on: "${docTopic}". Include: journal articles, books, book chapters, government reports, and online sources. Mix Nigerian, African, and international authors. Use realistic DOIs and publisher information. Format each entry properly hanging-indent style.`,
            }
          );
        } else if (chapterNum === 3) {
          sectionPrompts.push(
            {
              heading: "3.1 Introduction",
              prompt: `Write a 150-word introduction to Chapter Three (Research Methodology) for: "${docTopic}".`,
            },
            {
              heading: "3.2 Research Design",
              prompt: `Write 400-500 words describing the research design adopted for: "${docTopic}". Justify the choice (descriptive survey, correlational, experimental, etc.) with scholarly references (APA 7th).`,
            },
            {
              heading: "3.3 Area of Study",
              prompt: `Write 300-400 words describing the area of study for the research on: "${docTopic}". Include geographic, demographic, and institutional context of the research site in Nigeria.`,
            },
            {
              heading: "3.4 Population of the Study",
              prompt: `Write 300-400 words detailing the population of the study for: "${docTopic}". State the total accessible population and describe their characteristics.`,
            },
            {
              heading: "3.5 Sample Size and Sampling Technique",
              prompt: `Write 400-500 words on sample size determination and sampling technique for: "${docTopic}". Use Taro Yamane or Krejcie and Morgan formula if relevant. Justify the sampling method chosen (stratified, purposive, random, etc.).`,
            },
            {
              heading: "3.6 Instrument for Data Collection",
              prompt: `Write 400-500 words describing the research instrument for: "${docTopic}". Describe the questionnaire structure, scale used (Likert, etc.), and each section. Include a sample of 5-item questionnaire items.`,
            },
            {
              heading: "3.7 Validity of the Instrument",
              prompt: `Write 250-350 words on how the validity of the research instrument was established for: "${docTopic}". Reference face validity, content validity, and expert review process.`,
            },
            {
              heading: "3.8 Reliability of the Instrument",
              prompt: `Write 250-350 words on the reliability testing of the instrument for: "${docTopic}". Reference Cronbach's alpha coefficient, pilot study, and acceptable threshold values.`,
            },
            {
              heading: "3.9 Method of Data Collection",
              prompt: `Write 250-350 words on the method of data collection for: "${docTopic}". Describe the procedure for administering and retrieving questionnaires.`,
            },
            {
              heading: "3.10 Method of Data Analysis",
              prompt: `Write 300-400 words on methods of data analysis for: "${docTopic}". Specify statistical tools: descriptive statistics (mean, standard deviation, frequency, percentage), and inferential statistics (t-test, ANOVA, Pearson r, regression) as appropriate. Reference SPSS or relevant software.`,
            }
          );
        }

        // If no specific chapter detected or generic research, default to Chapter 2
        if (sectionPrompts.length === 0) {
          sectionPrompts.push(
            {
              heading: "2.1 Conceptual Review",
              prompt: `Write a comprehensive 1000-word conceptual review for: "${docTopic}". Define key concepts with APA 7th citations.`,
            },
            {
              heading: "2.2 Theoretical Framework",
              prompt: `Write a detailed 800-word theoretical framework for: "${docTopic}". Present 2 relevant theories, explain their core assumptions and relevance.`,
            },
            {
              heading: "2.3 Empirical Review",
              prompt: `Write a thorough 1200-word empirical review for: "${docTopic}" with at least 10 empirical studies including Nigerian/African studies.`,
            },
            {
              heading: "2.4 Summary and Gaps",
              prompt: `Write a 500-word synthesis of the literature and identify 3-5 research gaps for: "${docTopic}".`,
            }
          );
        }

        // Generate each section sequentially and assemble
        const academicSystemPrompt = `You are Dr. Obey, an expert academic researcher and university professor specializing in research methodology. You write in formal, scholarly Nigerian academic English. You are producing a section for a full academic research project. Write with depth, precision, and academic rigour. Use REAL plausible citations in APA 7th edition format. Each section you write should be SUBSTANTIAL — minimum 400 words unless specified otherwise. Do NOT add introductory filler like "Certainly!" or "Here is the section". Output ONLY the academic content.`;

        const sectionResults: string[] = [];
        for (const section of sectionPrompts) {
          try {
            const sRes = await executeAICompletion({
              systemPrompt: academicSystemPrompt,
              userPrompt: `${section.prompt}\n\nWrite the complete section now:`,
              temperature: 0.4,
              maxTokens: 2000,
            });
            sectionResults.push(`<h2>${section.heading}</h2>\n<p>${sRes.text.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`);
          } catch (sErr) {
            console.warn(`[Companion] Research section error (${section.heading}):`, sErr);
          }
        }

        const chapterBodyHtml = sectionResults.join("\n\n");

        fileContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${docTitle}</title>
<style>
  body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 2.0; color: #000; max-width: 850px; margin: auto; padding: 60px 80px; }
  h1 { font-size: 14pt; text-align: center; font-weight: bold; text-transform: uppercase; margin-bottom: 6px; }
  h2 { font-size: 13pt; font-weight: bold; margin-top: 28px; margin-bottom: 8px; }
  h3 { font-size: 12pt; font-weight: bold; font-style: italic; margin-top: 18px; }
  p { text-align: justify; margin-bottom: 14px; text-indent: 0.5in; }
  .cover { text-align: center; padding: 80px 0; }
  .cover h1 { font-size: 16pt; text-transform: uppercase; }
  .cover p { text-indent: 0; text-align: center; }
  .chapter-heading { text-align: center; text-transform: uppercase; font-size: 14pt; font-weight: bold; margin: 40px 0 20px; }
  hr { margin: 40px 0; border: none; border-top: 1px solid #ccc; }
</style>
</head>
<body>
<div class="cover">
  <h1>${docTitle}</h1>
  <p style="margin-top:40px;">CHAPTER ${chapterNum}</p>
  <p><strong>${chapterTitle.toUpperCase()}</strong></p>
  <p style="margin-top:60px;">Prepared by Obey AI Research Assistant<br>${watDate}</p>
</div>
<hr>
<div class="chapter-heading">CHAPTER ${chapterNum}<br>${chapterTitle.toUpperCase()}</div>
${chapterBodyHtml}
</body>
</html>`;

      } else {
        // ── BUSINESS MODE: Original executive document ──────────────────────────
        const docPrompt = `You are Obey, an elite executive assistant and business architect.
Generate a comprehensive, beautifully structured, publication-grade executive document for: "${docTitle}".
Full context & source details discussed: "${docTopic}".
User/Recipient: ${userGreetingName || "Leader"}

Structure the document with:
1. Document Header & Date (${watDate})
2. Executive Summary
3. Vision & Core Value Proposition
4. Detailed Operational / Business Breakdown
5. Key Implementation Milestones & Roadmap
6. Resource Requirements & Next Steps

Format the output in clean, elegant Word-compatible HTML markup with clear <h1>, <h2>, <h3>, <p>, <ul>, and <table> styling:
(Use clean inline CSS: font-family: Arial, sans-serif; line-height: 1.6; color: #111; max-width: 800px; margin: auto; padding: 30px;).
Ensure it looks stunning and opens natively in Microsoft Word, Google Docs, or an internet browser!
Return ONLY the complete HTML document starting with <!DOCTYPE html><html>...</html>.`;

        const docRes = await executeAICompletion({
          systemPrompt: "You are an elite executive document writer. Generate professional, polished, high-value business documents and proposals.",
          userPrompt: docPrompt,
          temperature: 0.3,
        });
        fileContent = docRes.text;
      }

      const safeTitle = docTitle.replace(/[^\w\s-]/gi, "").trim().replace(/\s+/g, "_") || "Document";

      // Save as artifact so it has a permanent web link
      const saved = await saveArtifact({
        title: docTitle,
        type: "document",
        content: fileContent,
        user_identifier: userIdentifier,
      });

      const link = `https://obeyai.vercel.app/artifact/${saved.id}`;

      // If channel is WhatsApp, dispatch the .doc / .txt / .md file directly to the chat!
      if (channel === "whatsapp") {
        const ext = docFormat === "pdf" ? ".pdf" : docFormat === "txt" ? ".txt" : docFormat === "md" ? ".md" : ".doc";
        const mime = docFormat === "pdf" ? "application/pdf" : docFormat === "txt" ? "text/plain" : docFormat === "md" ? "text/markdown" : "application/msword";
        await sendWhatsAppDocument(fileContent, `${safeTitle}${ext}`, userIdentifier, `📄 *${docTitle}*`, mime);
      }

      const isResearchMsg = isAcademicResearch
        ? `📚 *${docTitle} — Chapter Complete!*

I've written the full academic chapter with detailed sections, literature citations (APA 7th), theoretical frameworks, and empirical studies.

📄 *Word-compatible document attached above*
🌐 *Live link:* ${link}

You can open it in Microsoft Word or Google Docs. Let me know which other chapter you need next!`
        : `📄 *${docTitle} is ready!*

I've converted the pitch and plan into a complete, professional executive document and dispatched the file directly here for you.

🌐 *Live Interactive Document:*
${link}

📁 *Word & Google Docs Compatible:*
Open the attached file in Microsoft Word, Google Docs, or on your phone anytime.`;

      return {
        reply: cleanWhatsApp(isResearchMsg),
        artifactId: saved.id,
        artifactTitle: docTitle,
        artifactContent: fileContent,
      };
    } catch (err) {
      console.error("[Companion] Document generation error:", err);
    }
  }


  // Tool: Generate Production-Ready n8n Workflow JSON (.json)
  if (decision.action === "generate_n8n_workflow") {
    try {
      const flowTitle = decision.action_params?.workflow_title || "n8n AI Automation Workflow";
      const flowDesc = decision.action_params?.workflow_description || userText;
      const nodesSummary = decision.action_params?.workflow_nodes_summary || "Webhook, AI Agent, Data Store, Notifications";

      const n8nSystemPrompt = `You are an elite n8n Automation Architect & Senior Workflow Engineer.
Generate a 100% syntactically valid, production-ready n8n Workflow JSON file that can be imported directly into n8n canvas via "Import from File" or copied and pasted directly via Ctrl+V.

CRITICAL N8N SCHEMA RULES (MUST FOLLOW STRICTLY):
1. Output MUST be ONLY valid JSON matching the official n8n workflow schema.
2. The root object MUST have:
   - "name": "${flowTitle}"
   - "nodes": array of node objects
   - "connections": connections mapping object
   - "active": false
   - "pinData": {}
   - "settings": { "executionOrder": "v1" }
   - "versionId": string UUID
   - "meta": { "templateCredsSetupCompleted": true }
3. Each node MUST have:
   - "id": a valid RFC4122 UUID v4 string (e.g. "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")
   - "name": human-readable unique string (e.g. "Webhook Intake", "AI Lead Scoring", "Save to Supabase", "Dispatch WhatsApp Alert")
   - "type": valid standard n8n node type from "n8n-nodes-base.*" (e.g. "n8n-nodes-base.webhook", "n8n-nodes-base.openAi", "n8n-nodes-base.httpRequest", "n8n-nodes-base.supabase", "n8n-nodes-base.googleSheets", "n8n-nodes-base.gmail", "n8n-nodes-base.if", "n8n-nodes-base.set", "n8n-nodes-base.code", "n8n-nodes-base.scheduleTrigger")
   - CRITICAL: DO NOT use "@n8n/n8n-nodes-langchain.*" sub-nodes in linear workflows because LangChain nodes require secondary subgraph connections and will cause canvas validation/import errors. Use "n8n-nodes-base.openAi" or "n8n-nodes-base.httpRequest" instead!
   - "typeVersion": number (e.g. 1 or 2)
   - "position": [x, y] coordinates spaced 240px apart horizontally (e.g. [240, 300], [480, 300], [720, 300], [960, 300])
   - "parameters": object with realistic parameters, expressions like "={{ $json.body.email }}", or prompts
4. The "connections" object:
   - Keys MUST match the exact "name" of source nodes.
   - Values link output ports to target nodes:
     "Source Node Name": {
       "main": [
         [
           {
             "node": "Target Node Name",
             "type": "main",
             "index": 0
           }
         ]
       ]
     }
5. Provide clear, helpful parameter values so the user only needs to paste their API key/credentials to run it.
6. NO markdown backticks, NO explanations, NO surrounding text. Output ONLY the raw JSON object.`;

      const n8nUserPrompt = `Workflow Title: ${flowTitle}\nObjectives: ${flowDesc}\nKey Nodes & Integrations: ${nodesSummary}\nConversation Context: ${historyText || "User requested an n8n workflow."}\n\nGenerate the complete, valid n8n Workflow JSON:`;

      const aiRes = await executeAICompletion({
        systemPrompt: n8nSystemPrompt,
        userPrompt: n8nUserPrompt,
        temperature: 0.2,
      });

      let jsonText = aiRes.text.trim();
      jsonText = jsonText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

      let parsedWorkflow: any = null;
      try {
        parsedWorkflow = JSON.parse(jsonText);
      } catch (jsonErr) {
        const match = jsonText.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            parsedWorkflow = JSON.parse(match[0]);
            jsonText = JSON.stringify(parsedWorkflow, null, 2);
          } catch {}
        }
      }

      if (!parsedWorkflow || !Array.isArray(parsedWorkflow.nodes) || parsedWorkflow.nodes.length === 0) {
        const id1 = randomUUID();
        const id2 = randomUUID();
        const id3 = randomUUID();
        const id4 = randomUUID();

        parsedWorkflow = {
          name: flowTitle,
          nodes: [
            {
              parameters: {
                httpMethod: "POST",
                path: "lead-intake",
                responseMode: "responseNode",
                options: {}
              },
              id: id1,
              name: "Webhook Intake Trigger",
              type: "n8n-nodes-base.webhook",
              typeVersion: 2,
              position: [240, 300]
            },
            {
              parameters: {
                resource: "chat",
                operation: "complete",
                model: "gpt-4o-mini",
                prompt: {
                  messages: [
                    {
                      role: "system",
                      content: "You are an AI Lead Scoring agent. Score lead quality from 1-10 and extract contact details."
                    },
                    {
                      role: "user",
                      content: "={{ $json.body.message || $json.body.lead_text }}"
                    }
                  ]
                }
              },
              id: id2,
              name: "AI Lead Scoring Agent",
              type: "n8n-nodes-base.openAi",
              typeVersion: 1,
              position: [480, 300]
            },
            {
              parameters: {
                operation: "append",
                schema: "public",
                table: "leads",
                columns: "name, phone, score, summary"
              },
              id: id3,
              name: "Supabase Lead Storage",
              type: "n8n-nodes-base.supabase",
              typeVersion: 1,
              position: [720, 300]
            },
            {
              parameters: {
                method: "POST",
                url: "https://api.whatsapp.com/send",
                sendHeaders: true,
                headerParameters: {
                  parameters: [{ name: "Content-Type", value: "application/json" }]
                }
              },
              id: id4,
              name: "Dispatch WhatsApp Alert",
              type: "n8n-nodes-base.httpRequest",
              typeVersion: 4.2,
              position: [960, 300]
            }
          ],
          connections: {
            "Webhook Intake Trigger": {
              main: [[{ node: "AI Lead Scoring Agent", type: "main", index: 0 }]]
            },
            "AI Lead Scoring Agent": {
              main: [[{ node: "Supabase Lead Storage", type: "main", index: 0 }]]
            },
            "Supabase Lead Storage": {
              main: [[{ node: "Dispatch WhatsApp Alert", type: "main", index: 0 }]]
            }
          },
          pinData: {},
          settings: { executionOrder: "v1" },
          versionId: randomUUID(),
          meta: { templateCredsSetupCompleted: true },
          tags: [],
          active: false
        };
      }

      // Ensure standard n8n v1+ root properties
      parsedWorkflow.name = flowTitle;
      parsedWorkflow.active = false;
      parsedWorkflow.pinData = parsedWorkflow.pinData || {};
      parsedWorkflow.settings = { executionOrder: "v1", ...(parsedWorkflow.settings || {}) };
      parsedWorkflow.versionId = parsedWorkflow.versionId || randomUUID();
      parsedWorkflow.meta = { templateCredsSetupCompleted: true, ...(parsedWorkflow.meta || {}) };
      parsedWorkflow.tags = parsedWorkflow.tags || [];

      // Validate & sanitize nodes to ensure valid RFC4122 UUIDs and standard node types
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const validNodeNames = new Set<string>();

      parsedWorkflow.nodes = parsedWorkflow.nodes.map((node: any, idx: number) => {
        const nodeId = (node.id && uuidRegex.test(node.id)) ? node.id : randomUUID();
        const nodeName = typeof node.name === "string" && node.name.trim() ? node.name.trim() : `Node ${idx + 1}`;
        validNodeNames.add(nodeName);

        let nodeType = node.type || "n8n-nodes-base.httpRequest";
        // Convert incompatible langchain nodes to standard n8n-nodes-base.openAi
        if (nodeType.includes("langchain")) {
          nodeType = "n8n-nodes-base.openAi";
        }

        const position = Array.isArray(node.position) && node.position.length === 2 && typeof node.position[0] === "number" && typeof node.position[1] === "number"
          ? node.position
          : [240 + idx * 240, 300];

        return {
          parameters: node.parameters || {},
          id: nodeId,
          name: nodeName,
          type: nodeType,
          typeVersion: typeof node.typeVersion === "number" ? node.typeVersion : 1,
          position,
        };
      });

      // Validate connections: ensure source and target exist in validNodeNames
      if (parsedWorkflow.connections && typeof parsedWorkflow.connections === "object") {
        const sanitizedConnections: Record<string, any> = {};
        for (const [sourceName, conn] of Object.entries(parsedWorkflow.connections)) {
          if (!validNodeNames.has(sourceName)) continue;
          if (conn && typeof conn === "object" && Array.isArray((conn as any).main)) {
            const cleanMain = (conn as any).main.map((group: any) => {
              if (!Array.isArray(group)) return [];
              return group.filter((target: any) => target && typeof target.node === "string" && validNodeNames.has(target.node));
            }).filter((group: any[]) => group.length > 0);

            if (cleanMain.length > 0) {
              sanitizedConnections[sourceName] = { main: cleanMain };
            }
          }
        }
        parsedWorkflow.connections = sanitizedConnections;
      } else {
        parsedWorkflow.connections = {};
      }

      const formattedJson = JSON.stringify(parsedWorkflow, null, 2);
      const safeTitle = flowTitle.replace(/[^\w\s-]/gi, "").trim().replace(/\s+/g, "_") || "n8n_workflow";

      // Save as artifact with type "n8n_workflow"
      const saved = await saveArtifact({
        title: flowTitle,
        type: "n8n_workflow",
        content: formattedJson,
        description: flowDesc,
        user_identifier: userIdentifier,
      });

      const artifactLink = `https://obeyai.vercel.app/artifact/${saved.id}`;

      // Dispatch .json file directly to WhatsApp as a document attachment!
      if (channel === "whatsapp") {
        await sendWhatsAppDocument(
          formattedJson,
          `${safeTitle}.json`,
          userIdentifier,
          `⚡ *${flowTitle}* (Ready-to-Import n8n JSON)`,
          "application/json"
        );
      }

      const nodeCount = parsedWorkflow.nodes.length;
      const nodeNames = parsedWorkflow.nodes.map((n: any) => `• *${n.name}* (${n.type.replace(/^.*[./]/, "")})`).join("\n");

      return {
        reply: cleanWhatsApp(
          `🚀 *${flowTitle} is ready!*

I've engineered a complete, production-ready n8n workflow JSON file with *${nodeCount} connected nodes* ready to import directly into your n8n canvas.

📦 *Included Nodes & Architecture:*
${nodeNames}

🌐 *Interactive Flow & 1-Click Copy:*
${artifactLink}

📁 *Ready-to-Import JSON Attached:*
I've attached the *${safeTitle}.json* file directly below.

⚡ *How to import into n8n:*
1. Download the *${safeTitle}.json* file attached above (or copy the raw JSON from the link).
2. In your n8n workspace, click the three dots (⋮) in the top-right ➔ *Import from File* (or simply press *Ctrl + V* directly on an empty canvas).
3. The nodes will appear fully wired! Insert your API keys in the marked credential slots and click *Active*!

If you encounter any error or want to adjust or diagnose any node, send me a screenshot or description and I'll debug it with you immediately!`
        ),
        artifactId: saved.id,
        artifactTitle: flowTitle,
        artifactContent: formattedJson,
      };
    } catch (err) {
      console.error("[Companion] n8n workflow generation error:", err);
    }
  }

  // Tool: Direct Voice Call WebRTC link
  if (decision.action === "direct_voice_call") {
    const cleanUserPhone = userIdentifier.replace(/\D/g, "");
    const targetSlug = (workspaceId && workspaceId !== "ws_femi_default" && workspaceId !== "default") ? workspaceId : "femi-adeleke";
    const callUrl = `https://obeyai.vercel.app/call?biz=${targetSlug}&phone=${cleanUserPhone}&name=${encodeURIComponent(senderName || "")}`;
    return {
      reply: cleanWhatsApp(
        `🎙️ *I'd love to speak with you live!* You have two ways to connect with me on voice right now:\n\n` +
        `📞 *Option 1: Direct Phone Call (Hotline)*\n` +
        `Dial my direct line: *+1 (302) 927 8209*\n` +
        `_(Note: Standard international carrier airtime charges apply)_\n\n` +
        `🌐 *Option 2: 100% Free Instant Voice Call (Recommended)*\n` +
        `Tap this secure WebRTC link to talk directly using your phone mic with zero airtime charges:\n` +
        `👉 ${callUrl}\n\n` +
        `_Note: All calls are recorded for quality and to deliver your transcript and voice notes afterward. Which option works best for you?_`
      ),
    };
  }

  // Tool: Search Live Web (Tavily)
  let liveSearchFindings = "";
  if (decision.action === "search_live_web") {
    try {
      const query = decision.action_params?.search_query || userText;
      const tavilyRes = await searchTavily(query, { maxResults: 5 });
      if (tavilyRes.success && tavilyRes.results.length > 0) {
        liveSearchFindings = (tavilyRes.answer ? `Synthesized AI Summary: ${tavilyRes.answer}\n\n` : "") +
          tavilyRes.results
            .map((r) => `• [${r.title}](${r.url}): ${r.content.slice(0, 300)}`)
            .join("\n");
      }
    } catch (e) {
      console.warn("[Companion] Live web search fallback:", e);
    }
  }

  // Autonomous Fallback Search: If decision chose "none", but query is asking for factual facts, music, lyrics, or person info:
  if (!liveSearchFindings) {
    const lookupPattern = /\b(lyrics?|sing|song|track|album|who is|who be|who's|full name|real name|government name|what does .* stand for|meaning of|what is|search (?:the )?(?:web|online|google)|look up|tavily|current price|naira rate|dollar rate|exchange rate|artist|minister)\b/i;
    if (lookupPattern.test(userText) || (decision.thought && /search|look\s*up|verify|lyrics|who is|artist|singer|real name/i.test(decision.thought))) {
      try {
        const cleanQuery = userText
          .replace(/^(can you|please|kindly|oya|help me|tell me|send me|give me|what is|who is|complete)\s+/i, "")
          .replace(/(\s+(?:and send it as vn|as vn|in vn|vn|voice note|please|nau))$/i, "")
          .trim();
        const searchRes = await searchTavily(cleanQuery.length > 3 ? cleanQuery : userText, { maxResults: 5 });
        if (searchRes.success && searchRes.results.length > 0) {
          liveSearchFindings = (searchRes.answer ? `Synthesized AI Summary: ${searchRes.answer}\n\n` : "") +
            searchRes.results
              .map((r) => `• [${r.title}](${r.url}): ${r.content.slice(0, 300)}`)
              .join("\n");
        }
      } catch (fallbackSearchErr) {
        console.warn("[Companion] Autonomous fallback live search error:", fallbackSearchErr);
      }
    }
  }

  // 5. COMPANION & CONVERSATIONAL SYNTHESIS (Concise, 100% Human, Deep Emotional Intelligence)
  // Load dynamic workspace knowledge & business catalog ONLY when user explicitly asks about hiring Femi or custom software/developer services
  let workspaceCatalogContext = "";
  try {
    const isAskingAboutUserOwnBusiness = /\b(my (?:work|business|craft|services|price|prices|pricing|clients|salon|shop|sister)|draft (?:a )?(?:simple )?price|price list for me|set my prices|my handiwork)\b/i.test(userText);
    const asksAboutSoftwareServices = !isAskingAboutUserOwnBusiness && /\b(hire femi|femi's services|build (?:a )?(?:custom )?(?:website|app|software)|femi's software rates|how much does femi charge)\b/i.test(userText);
    if (asksAboutSoftwareServices) {
      const wsSettings = await dbGetWorkspaceSettings("ws_femi_default");
      if (wsSettings) {
        if (wsSettings.catalog_summary) {
          workspaceCatalogContext += `\nVERIFIED BUSINESS SERVICES & CATALOG PRICING:\n${wsSettings.catalog_summary}\n`;
        }
        if (wsSettings.business_bio) {
          workspaceCatalogContext += `\nBUSINESS OVERVIEW & POLICIES:\n${wsSettings.business_bio}\n`;
        }
      }
    }
  } catch (wsErr) {
    console.warn("[Companion] Workspace knowledge fetch error:", wsErr);
  }

  const userGreetingName = senderName ? senderName.replace(/[^\w\s]/gi, "").trim() : "";
  const hasHistory = Boolean(historyText && historyText.trim().length > 10);

  const companionSystemPrompt = `You are Obey, an ultra-intelligent, magnetic, witty, and deeply empathetic AI companion.
${isFemi
  ? "You are speaking with FEMI ADELEKE, your boss, creator, and owner. Address him respectfully as 'Boss' or 'Sir'."
  : `You are speaking with ${userGreetingName ? `"${userGreetingName}"` : "your friend/user"}. You are THEIR dedicated 24/7 personal companion, confidant, and executive assistant ready to assist them directly with any tasks, automations, writing, workflows, research, or daily conversation. Address them warmly. NEVER introduce yourself as someone else's personal agent trying to pitch them services!`
}

YOUR VIBE & PERSONALITY:
- Sound like a cool, sharp, energetic friend they can gist with effortlessly.
- Be funny, sarcastic when playful, witty, culturally savvy, and genuinely supportive.
- Feel free to sprinkle in natural Nigerian Pidgin ("How you dey?", "No wahala", "I dey with you!", "Wetin dey sup?", "Omo!", "Na so we see am") whenever it adds warmth or humor, but adapt smoothly to how the user speaks.
- Gist about what is happening in Nigeria (afrobeats, tech, trends, everyday life) and the world.
- Be their therapist, empathetic listener, and advisor when they are stressed, down, or seeking advice.
- Tell beautiful, vivid stories, make them laugh, and never sound like a robotic corporate IVR!
- If they ask you to sing, hum or playfully sing for them!
- If they speak Yoruba, Igbo, Hausa, or Pidgin, flow with them naturally!
- You are conversing on ${channel}.

CONCISENESS & NATURAL CONVERSATION (CRITICAL RULES):
1. BE CONCISE & PUNCHY (NO UNNECESSARY TALK):
   - Deliver crisp, direct answers. Many responses should simply be 1 to 3 clear, engaging sentences.
   - For school questions, multiple choice, or quick facts: state the direct answer immediately with 1 brief explanation. Never dump multi-paragraph lectures when a short answer suffices.
   - Match the user's brevity: if the user sends a short question, give a short, precise answer.

2. NATURAL GREETINGS & ONGOING CHAT:
   - When the user sends a greeting (e.g. "Hello", "Good morning", "Hey"): ALWAYS reciprocate warmly and ask how you can help! NEVER reply with a bare URL or stale links!
   ${hasHistory
     ? "- For ongoing questions or follow-up tasks (where the user did not send a greeting): Jump straight into answering without robotic greeting filler."
     : "- For the first message of the day: A brief warm greeting is great."}

3. NEVER POLICE SLEEP OR NAG ABOUT TIME:
   - NEVER tell the user to 'go to sleep', 'close your books', 'turn off the lights', 'get some rest', or 'call it a night', regardless of what time it is. If the user is studying or chatting late at night, treat them with respect and answer their questions without acting like a nagging parent.

4. ELIMINATE REPETITIVE CRUTCHES & FILLER:
   - NEVER start messages with repetitive verbal crutches like:
     * "I'm all ears..."
     * "I'm listening..."
     * "What's that one more thing?"
     * "Take all the time you need..."
     * "Challenge accepted!"
     * "Tell me about..."
     * "Let's slice right through this!"
   - Jump directly into answering or conversing naturally.

5. CRITICAL CONTEXTUAL MEMORY & CHAT CONTINUITY:
   - NEVER say "I don't have access to your personal chat history" or "I don't have access to your messages"! You have direct access to recent conversation history in the dialogue below.
   - When the user asks about an idea, pitch, topic, story, or person discussed earlier (e.g. "the pitch", "the agricultural idea", "this", "him", "my boyfriend", "Havilah Farms", or recent WhatsApp status replies), NEVER ask "What is 'this'?" or "Which idea are we revisiting?". Look directly at the dialogue history, connect the dots, and answer with 100% intelligence and empathy!
   - Understand pronouns and references in context: if the user says "Can you turn it to docs?", "it" refers to the pitch or topic just discussed!

6. WHO YOU ARE TALKING TO & YOUR ROLE:
   ${isFemi
     ? "- You are speaking with FEMI ADELEKE, your boss, creator, and owner. Address him respectfully as 'Boss' or 'Sir'."
     : `- You are speaking with ${userGreetingName ? `"${userGreetingName}"` : "your user/client"}. You are THEIR dedicated personal AI Agent, companion, and executive assistant. Address them warmly and respectfully. You work for THEM to solve their tasks, brainstorm ideas, write workflows, code, analyze docs, and assist their daily life.`}

7. CREATOR ATTRIBUTION, PORTFOLIO & SHOWING OFF:
   - Main Obey (This Bot's Direct WhatsApp Chat Link): https://wa.me/2349161488564 (+2349161488564). Share this whenever anyone wants your direct WhatsApp number to chat with you!
   - Femi Adeleke Creator Contact: Direct WhatsApp Link: https://wa.me/2348120934828 (+2348120934828)
   - Femi's Official Portfolio: https://obeyai.vercel.app/portfolio (Title: Femi Adeleke | AI Systems Architect & Full-Stack Developer)
   - Obey Official Website (Homepage): https://obeyai.vercel.app
   - CRITICAL PORTFOLIO RULE: Whenever Boss (Femi) or anyone asks for "my portfolio", "portfolio link", "give me link to my portfolio", or requests Femi's personal software case studies, ALWAYS provide: https://obeyai.vercel.app/portfolio
   - CRITICAL WEBSITE & HOMEPAGE RULE:
     * When anyone asks for "obey website", "website", "link to obey", "your website", "website link", "landing page", ALWAYS provide the clean, direct homepage link: https://obeyai.vercel.app
     * NEVER send the Control Room link (https://obeyai.vercel.app/control-room) unless they explicitly ask for "control room", "dashboard", or "manage workspace"!
     * Do NOT dump the manual link unless they explicitly ask for the manual or documentation.
   - Share https://wa.me/2348120934828 and https://obeyai.vercel.app/portfolio whenever someone asks to speak or work directly with Femi for custom software/enterprise builds!

8. DEEP AWARENESS OF OBEY BUSINESS & THE OFFICIAL MANUAL:
   - You have complete, permanent memory of the OBEY BUSINESS PLATFORM and its OFFICIAL MANUAL.
   - When the user asks about running a business on WhatsApp, automating customer support, capturing leads, saving contacts to their phone, posting WhatsApp status stories, voice hotlines, or getting a bot for their own brand:
     * Passionately introduce, preach, and recommend OBEY BUSINESS as the ultimate solution!
     * Share the official website homepage link (https://obeyai.vercel.app). Never share control-room unless explicitly asked for the dashboard or control room.
     * Guide them through the features: Plan B pairing code connection, automatic contact saver with 1-click VCF address book export, Contact Buckets, 24/7 autonomous status stories, and WebRTC voice hotlines.
     * Quote the exact live dynamic subscription tiers: Starter (₦${platformPricing.starter_price.toLocaleString()}/mo), Pro Business (₦${platformPricing.pro_price.toLocaleString()}/mo with ${platformPricing.trial_days}-Day Free Trial), and Enterprise (₦${platformPricing.enterprise_price.toLocaleString()}/mo).

${getObeyBusinessManualKnowledge(platformPricing)}

8. FORMATTING:
   - Use clean bullet points (•) and numbers.
   - Use single asterisks (*like this*) for bolding on WhatsApp/Telegram.
   - Nigeria Time: ${watTime} (${watDate}).

9. VOICE NOTES & LIVE VOICE CALL DIRECTIVES:
   - YOU HAVE FULL NATIVE WHATSAPP VOICE NOTE (AUDIO NOTE) CAPABILITY!
   - When the user asks you to "send a voice note", "send vn", "record a vn", "talk to me", or when they send you a voice note:
     * NEVER say your voice module is resting, in text mode, or disabled!
     * NEVER claim you cannot send audio or that you only speak on the website hotline!
     * Respond naturally with a warm, sharp conversational answer. The platform automatically converts your words into a real spoken WhatsApp Voice Note!
   - STRICT PROHIBITION ON META STAGE DIRECTIONS & AUDIO MARKERS:
     * NEVER write meta stage directions, commentary, or bracketed markers in text, such as:
       '*(Audio generating...)*', '*(Audio note dispatched to your chat...)*', '(Audio generating)', '[Audio]', '(recording audio...)', '(chuckles)', '*dispatched audio*', etc.!
     * NEVER reveal or state that audio is generating, dispatched, or being sent in brackets.
     * Deliver ONLY your real spoken conversational dialogue cleanly, with zero bracketed meta-announcements!
   - Live 2-Way Phone Calls:
     * NEVER tell the user 'Initiating the call to your line right now', 'Ringing your line', 'Connecting you now', or claim you are calling them on WhatsApp.
     * Obey does NOT place unprompted outbound cellular phone calls. When someone wants a live 2-way phone call, provide the free WebRTC hotline link (https://obeyai.vercel.app/call).

10. RECENT ACTIVITY & ACTION DISPATCH LOG:
${latestExecutedAction ? `   - You recently dispatched an approved message to +${latestExecutedAction.target_recipient} at ${latestExecutedAction.executed_at || latestExecutedAction.created_at}.
   - Exact message text dispatched: "${latestExecutedAction.payload || ""}".
   - If the user asks who you messaged, what you said, or why it was sent, refer directly to these exact details with honesty and warmth!` : "   - No actions recently dispatched."}

11. LIVE PLATFORM PRICING & OBEY COMMERCIAL PACKAGES (ACTIVE FROM DATABASE):
• Starter Plan: ₦${platformPricing.starter_price.toLocaleString()}/month (1 single workspace, 250 auto-saved customer leads, 10 auto-responders, 15h WebRTC voice).
• Pro Business Plan (Most Popular): ₦${platformPricing.pro_price.toLocaleString()}/month (${platformPricing.trial_days}-day 100% free trial, UNLIMITED customer leads, 50 auto-responders, 50h WebRTC voice, audio recordings & transcripts on WhatsApp, custom catalog).
• Enterprise / Founder Plan: ₦${platformPricing.enterprise_price.toLocaleString()}/month (multi-business up to 2 distinct workspaces, full multi-tenant WhatsApp bot, UNLIMITED voice hotline, autonomous n8n workflows & web apps, 24/7 dedicated priority support).
CRITICAL DISTINCTION & PRICING RULES:
- ONLY quote these Obey/Femi figures if the user is explicitly asking about subscribing to OBEY PLATFORM or hiring FEMI for custom software engineering/apps!
- If the user is asking for advice, coaching, or asking you to draft a price list / pricing guide for THEIR OWN business or craft (e.g. nail technician, hair salon, eyelashes, fashion, makeup, catering, photography, beauty services for their clients):
  * NEVER EVER quote Obey packages or Femi's ₦2.2M software tiers! That is completely irrelevant and breaks trust.
  * Act as their brilliant business coach and craft a realistic, tailored price guide for THEIR specific craft (e.g. for nails/lashes: Gel Polish: ₦5,000 - ₦8,000; Acrylic Full Set: ₦12,000 - ₦18,000; Pedicure: ₦6,000 - ₦10,000; Classic Lashes: ₦10,000 - ₦15,000) factoring in materials cost + margin!
- When anyone asks about Obey platform pricing or subscription packages, quote the live database figures above accurately!

12. STRICT PROHIBITION OF FAKE WORKFLOWS, ARTIFACTS, & ATTACHMENTS (CRITICAL):
- Real files and artifacts can ONLY be dispatched by executing real system tools and saving them to the database.
- NEVER tell the user "Pipeline is ready!", "Ready-to-Import JSON Attached", "I've engineered a workflow... ready to import", or claim a file is attached in conversational text!
- NEVER fabricate fake artifact URLs (e.g. https://.../artifact/... or /artifact/art-...)!
- When a user asks or speaks about building a chatbot (e.g. WhatsApp chatbot), automation, n8n workflow, or scraper:
  You MUST act as an elite Senior Solutions Architect:
  1. Dig Deeper: Ask 2 to 3 sharp clarifying technical questions (e.g., API gateway: Meta Cloud API vs. Evolution API/Baileys? Persistence: Supabase vs. Neon vs. Google Sheets? LLM model & memory buffer? Any CRM or payment hooks?).
  2. Propose 2 Architectural Methods: Method 1 (Lean & Direct) vs. Method 2 (Production Agentic with Tools & Persistence).
  3. Map the node pipeline [Node 1] ➔ [Node 2] ➔ [Node 3].
  4. Invite them to answer the questions or pick Method 1 vs. 2 before you build and generate the production n8n JSON file!

13. STRICT FACTUAL ACCURACY & ZERO HALLUCINATION MANDATE (CRITICAL):
- ABSOLUTE POLICY: NEVER GUESS, FABRICATE, OR INVENT FACTS, NAMES, ACRONYMS, LYRICS, BIOGRAPHIES, OR REAL-WORLD INFORMATION!
- NEVER make up what an acronym or artist moniker stands for (e.g. claiming BBO stands for "Builders of Grace" when you don't know).
- NEVER fabricate song lyrics or invent lines to "complete" a song (e.g. inventing "My business is growing, my cup is running over" or fake verses).
- When asked to complete lyrics, identify a person's full name, or quote a fact:
  * Check the LIVE WEB SEARCH RESULTS provided in your prompt.
  * If live search results are present, use them accurately and cite the authentic words.
  * If the answer is not in your training data or search results, BE HONEST AND DIRECT: state what you know and do not know (e.g. "I don't have their verified full name/lyrics right now, Boss", or "Let me look that up for you!"), rather than making up answers with "pure vibes and guessing"!

${workspaceCatalogContext ? `${workspaceCatalogContext}\n` : ""}${liveSearchFindings ? `\nLIVE WEB SEARCH RESULTS:\n${liveSearchFindings}\n` : ""}`;

  // Build MCQ context-break prefix to prevent hallucination lock-in
  const mcqBreakPrefix = mcqHallucinationBreakNeeded
    ? `⚠️ CRITICAL CONTEXT RESET REQUIRED ⚠️
The previous messages in this conversation contained multiple-choice examination questions and answers about biology/physics topics. 
The user's LATEST message ("${userText}") is a COMPLETELY DIFFERENT and FRESH question — it is NOT another multiple-choice question. 
DO NOT answer as if it is an MCQ option. DO NOT mention "Red blood cells", "D", or any previous biology/physics topic.
Answer ONLY what the user JUST asked in their latest message, completely ignoring the MCQ subject matter from prior turns.
If they asked "?" or sent a very short message, acknowledge the shift and ask what they'd like to know.
FRESH QUESTION FROM USER:

`
    : "";

  const companionUserPrompt = historyText
    ? `${mcqBreakPrefix}Prior dialogue between you and the user:\n${historyText}\n\nUser: "${userText}"\n\nObey (concise, direct answer):`
    : `${mcqBreakPrefix}User: "${userText}"\n\nObey (concise, direct answer):`;

  try {
    const aiRes = await executeAICompletion({
      systemPrompt: companionSystemPrompt,
      userPrompt: companionUserPrompt,
      mediaBase64,
      mimeType: mediaMimeType,
      temperature: 0.3,
    });

    let finalReply = aiRes.text;

    // Post-generation guard: If conversational text hallucinates an artifact link or fake attachment claim
    const hasHallucinatedArtifact =
      /https?:\/\/[^\s]*\/artifact\//i.test(finalReply) ||
      /\b(?:Ready-to-Import JSON Attached|Pipeline is ready|workflow JSON file with \d+ connected nodes)\b/i.test(finalReply);

    if (hasHallucinatedArtifact) {
      console.warn("[Companion] Intercepted hallucinated artifact/workflow reply. Rerouting to architect consultation.");
      try {
        const consultRes = await executeAICompletion({
          systemPrompt: `You are an elite Senior Automation Architect & n8n Systems Engineer named Obey (Femi Adeleke's AI Co-Pilot).
The user is discussing building an automation/chatbot: "${userText}".
DO NOT generate raw JSON yet! DO NOT say "Pipeline is ready" or claim a file is attached! DO NOT output fake artifact URLs!
Act as an elite solutions architect to make sure the user gets the best possible pipeline:
1. Enthusiastic Acknowledgment: Validate their vision (e.g. WhatsApp chatbot, lead intake, CRM sync).
2. Dig Deeper: Ask 2 to 3 sharp clarifying technical questions (e.g., API gateway, database/storage, LLM model, triggers/actions).
3. Recommend 2 Architectural Methods:
   - *Method 1 (Lean & Direct):* Fast, lightweight, minimal nodes.
   - *Method 2 (Intelligent & Production-Grade):* High reliability with AI validation/scoring, state persistence, and instant alerts.
4. Node Connection Blueprint: Map out the exact proposed node chain: e.g. [Webhook Trigger] ➔ [AI Agent] ➔ [Database Log] ➔ [WhatsApp Dispatch].
5. Call to Action: Invite them to answer the questions or pick Method 1 vs. Method 2 before you engineer and generate the production n8n JSON file.
Format with clean WhatsApp styling (*bolding*, bullet points, emojis). Keep it sharp, authoritative, and consultative.`,
          userPrompt: `CONVERSATION CONTEXT:\n${historyText || "No prior history"}\n\nLATEST USER REQUEST:\n"${userText}"\n\nDeliver the consultative brainstorm, sharp questions, methods, and proposed blueprint:`,
          temperature: 0.3,
        });
        if (consultRes?.text) {
          finalReply = consultRes.text;
        }
      } catch (e) {
        console.warn("[Companion] Consultation fallback error:", e);
      }
    }

    let finalReplyClean = cleanWhatsApp(finalReply);
    if (/^https?:\/\/[^\s]+$/i.test(finalReplyClean.trim())) {
      finalReplyClean = `Here is the official link:\n${finalReplyClean.trim()}`;
    }

    return {
      reply: finalReplyClean,
    };
  } catch (err: any) {
    console.error("[Companion] AI error:", err);
    let fallback = decision.conversational_response || "Please, I am busy right now. Check back with me in a moment. Thanks!";
    if (/^https?:\/\/[^\s]+$/i.test(fallback.trim())) {
      fallback = `Here is the official link:\n${fallback.trim()}`;
    }
    return {
      reply: cleanWhatsApp(fallback),
    };
  }
}

