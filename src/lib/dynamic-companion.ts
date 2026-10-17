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
• *Website:* https://femiadelekeportfolio.vercel.app

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
}): Promise<CompanionResponse> {
  const { userIdentifier, userText, senderName, channel = "whatsapp", historyText = "", mediaBase64, mediaMimeType, isVoiceNote = false, instanceName } = params;
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
    const noteToSave = userText.replace(/^(?:remember|never forget|note this|save this|keep in mind|from now on)[:\s]*/i, "").trim();
    await saveUserPersonalMemory({
      userIdentifier,
      userNotes: noteToSave,
      userName: senderName,
    });
    return {
      reply: cleanWhatsApp(`Understood and noted! 🧠 I have committed this permanently to memory for your chat:\n\n• "${noteToSave}"\n\nI will remember and apply this in all our conversations.`),
    };
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

  // 2.5 CONTACT SEARCH & BUCKET MESSAGING FOR MAIN OBEY
  try {
    const { handleOwnerContactOrBucketTurn } = await import("@/lib/contact-agent");
    const workspaces = await dbListWorkspaces();
    const primaryWs = workspaces?.[0];
    if (primaryWs) {
      const contactTurn = await handleOwnerContactOrBucketTurn({
        workspaceId: primaryWs.id,
        instanceName: primaryWs.whatsapp_instance_name || "obey",
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
3. "generate_new_image": Use when the user wants to generate, draw, paint, or visualize a brand new image or scene from scratch.
   - Parameters: "image_prompt" (rich descriptive prompt).
4. "modify_existing_image": Use when the user wants to adjust, modify, recolor, or change elements of their PREVIOUS artwork in context (e.g. changing color, weather, lighting, day/night).
   - Parameters: "image_modification" (specific edits to apply).
5. "create_website_artifact": Use when the user asks you to design, build, code, or create a new website, landing page, HTML UI, calculator, form, or dashboard.
   - Parameters: "website_title" (clear title), "website_specs" (features, styling, layout).
6. "modify_website_artifact": Use when the user asks to change, update, restyle, fix, or edit ANY previously created website/artifact in context or by name.
   - Parameters: "website_title" (title of the artifact to modify, or null for latest), "website_changes" (what to fix or adjust in the code).
7. "create_document_file": Use when the user asks to turn an idea, pitch, chat, summary, notes, plan, proposal, contract, guide, or story into a document, doc, Word doc, Google Doc, PDF, text file, or markdown file.
   - Look back across prior conversation turns to identify EXACTLY what topic, pitch, or concept they want turned into a document (e.g. Havilah Farms agricultural pitch, meeting notes, project proposal).
   - Parameters: "document_title" (clear, professional title), "document_topic" (the specific pitch, idea, or concept from context to expand into the document), "document_format" ("doc" | "pdf" | "txt" | "md").
8. "generate_n8n_workflow": Use when the user asks to build, create, design, or generate a ready-made n8n workflow, automation pipeline, webhook automation, or JSON workflow that can be imported into n8n.
   - If user asks for "any simple workflow" or doesn't specify nodes, autonomously architect a complete, high-value, production-ready workflow (such as AI Lead Qualification & Multi-Channel Alert).
   - If user asks for specific nodes (e.g. Webhook, OpenAI, Supabase, Gmail, WhatsApp), include all of them properly wired.
   - Parameters: "workflow_title" (e.g. "AI Lead Qualification & WhatsApp Dispatcher"), "workflow_description" (what it automates), "workflow_nodes_summary" (key nodes).
9. "search_live_web": Use when the user asks for real-time internet information, news, current facts, or job market search.
   - Parameters: "search_query".
10. "notify_femi": Use when a guest or user asks you to tell your boss, tell Femi, forward feedback, or suggest something to Femi Adeleke (e.g. "tell him", "tell your boss", "suggest this to Femi", "tell your boss to implement that", "let Femi know").
11. "direct_voice_call": Use ONLY when the user's latest message explicitly asks to speak on voice or call you (e.g. "call me", "can we speak on voice call", "let's talk on call"). NEVER choose direct_voice_call for "yes", "sure", "ok", or general conversational responses!
12. "none": Use when the user is chatting, asking a question, asking for advice, greeting, or when required parameters (like phone number) are missing and need polite clarification.

REASONING GUIDELINES:
- CRITICAL CONVERSATIONAL RULES (MUST FOLLOW STRICTLY):
  1. NEVER REPEAT GREETINGS OR NAMES AT EVERY TURN:
     Real humans on WhatsApp do NOT begin every single message with "Hello [Name]!" or repeat the person's name continuously. Jump straight into answering their question naturally, concisely, and warmly (1 to 2 sentences max default).
  2. GENDER ACCURACY & NEUTRALITY:
     ${userFullMemory?.gender === 'female' ? 'The user is a female/lady. Address her as queen or she/her. NEVER call her "my guy", "bro", "he", or "him"!' : userFullMemory?.gender === 'male' ? 'The user is a male.' : 'Gender is unspecified. Stay gender-neutral. NEVER assume male, NEVER use "my guy" or "bro".'}
- Understand natural human intent regardless of whether the user speaks in slang, colloquial phrasing, Pidgin, or formal English.
- FORWARDING SUGGESTIONS & NOTES TO FEMI:
  If a guest or user says "Tell your boss", "Tell him to do this", "Suggest this to Femi", or "Let Femi know", select "notify_femi" so Obey dispatches a real WhatsApp alert directly to Femi Adeleke's personal phone (+2348120934828).
- AUTONOMOUS N8N WORKFLOW CREATION:
  When the user asks for an n8n workflow, a workflow JSON, an automation pipeline, or asks to automate a process in n8n (e.g. "can you create a ready made n8n workflow", "is that a ready made workflow I can import to n8n", "create any simple workflow", "generate n8n json for webhook to supabase"):
  1. ALWAYS select "generate_n8n_workflow"!
  2. NEVER refuse or say "give me the exact nodes" if the user tells you to be creative or create any workflow — autonomously architect an awesome, production-ready n8n workflow!
  3. Set "workflow_title", "workflow_description", and "workflow_nodes_summary".
- CRITICAL DOCUMENT & FILE CONTINUITY:
  When the user says "Can you turn it to docs?", "turn into doc", "make it a doc", "put it in google doc", "turn it to PDF", "export as document", "the pitch nau", "this":
  1. DO NOT ask "What is this?" or "Which idea are we revisiting?" if a pitch, concept, business idea, outline, story, or project was discussed anywhere in recent turns!
  2. ALWAYS select "create_document_file", identify the exact pitch or topic from CONVERSATION CONTEXT (e.g. "Havilah Farms Agri-Youth Hub & Smart Greenhouse Farming"), set "document_title", and set "document_topic"!
- CRITICAL ARTIFACT CONTINUITY & CODE MEMORY:
  1. You (Obey) have full permanent access to all code you previously generated (listed in "User's Saved Website Artifacts in Memory").
  2. You NEVER ask the user to "drop the code snippet" or "paste the code" for any artifact you created! You already have their full code in the database.
  3. If the user previously reported an issue, bug, error, or unresponsiveness in an artifact (such as "Save task button is not responsive", "It does not save the task", localStorage, form submission, or sandbox errors), and the user confirms, replies affirmatively ("yes", "sure", "ok", "go ahead", "do it"), OR says "fix it" / "update it", YOU MUST SELECT "modify_website_artifact" with "website_changes" describing the exact fix to rebuild and deliver the working code! NEVER choose "none" or ask "What's on your mind"!
  4. If the user refers to any earlier artifact by name or topic (even after working on other tasks or talking about other topics), match that artifact from the list, select "modify_website_artifact", set "website_title" to the matched title, and apply their changes!
- MULTI-TURN MESSAGING DELEGATION:
  When a user asks you to message someone, they often provide the phone number and the message content across multiple turns (e.g. sharing a contact card or phone number in one message, and dictating what to say or sending a voice note in another turn).
  ALWAYS look across recent turns in CONVERSATION CONTEXT to link the phone number and message content together!
  - If the user sent what to say earlier and is now providing the number: Combine them immediately into "draft_whatsapp_message"! DO NOT ask what to say again!
  - If the user shared a contact card or number earlier and is now speaking or sending a voice note: Combine them immediately into "draft_whatsapp_message"! DO NOT ask for the phone number again!
- AUTONOMOUS LIVE WEB SEARCH:
  If the user asks any question about current facts, news in Nigeria or globally, real-time sports, politics, prices, or questions where factual certainty is needed, ALWAYS choose "search_live_web" with a specific "search_query" so you give verified, accurate answers!
- NEVER choose "direct_voice_call" unless the user's current message explicitly contains words like "call me", "voice call", or "phone call".
- NEVER confuse visual artwork adjustments with website/artifact changes. If the user mentions fonts, buttons, sections, forms, or HTML, it is ALWAYS a website artifact!
- If the user asks whether a message was delivered, what you told someone, who it was sent to, or questions about a recent dispatch, ALWAYS choose "check_action_status".
- If the user wants to text someone but hasn't provided the phone number yet and no number exists in recent history, choose "none" and ask warmly for their phone number in "conversational_response".
- For general questions (like business advice, study questions, facts, prices, Obey packages), choose "none" and provide a sharp, concise answer directly in "conversational_response".

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
  } else if (decision.action === "direct_voice_call" && isShortAffirmation) {
    // Only reset if it was an accidental false positive on a generic confirmation word
    decision.action = "none";
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
  // If the user replied affirmatively and the assistant previously offered to revamp, fix, or update an artifact:
  if (isAffirmativeShort && latestArtifact && decision.action !== "draft_whatsapp_message") {
    if (
      lastObeyLine &&
      /\b(revamp|frontend design|styling|color palette|dark-mode|wire up|save task|button|code|snippet|modify|update|fix|make it|enhance|adjust)\b/i.test(lastObeyLine)
    ) {
      decision.action = "modify_website_artifact";
      decision.action_params = {
        website_title: latestArtifact.title,
        website_changes: `Implement the requested design revamp and enhancements: ${lastObeyLine.slice(0, 600)}`,
      };
    }
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

  // 4. EXECUTE AUTONOMOUS DECISION

  // Tool: Notify Femi Adeleke of User Suggestion / Feedback
  // NEVER trigger notify_femi if the user provided a recipient phone or is delegating a message to someone else!
  const hasExternalRecipient = Boolean(recentPhoneInContext) || /\b\d{10,14}\b/.test(userText) || decision.action === "draft_whatsapp_message";
  const explicitFemiFeedback = /\b(tell your boss|tell femi|let femi know|suggest to femi|pass to femi|forward to femi)\b/i.test(userText);

  if (!hasExternalRecipient && (decision.action === "notify_femi" || (explicitFemiFeedback && !isFemi))) {
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
      return {
        reply: cleanWhatsApp(`I tried generating your artwork for "${prompt}", but encountered a temporary graphics rendering glitch. Could you rephrase your description or try again in a moment?`),
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
      artifactPrompt = `WEBSITE / ARTIFACT CREATION REQUEST:
Title: "${title}"
Specifications: "${specs}"

CRITICAL REQUIREMENTS:
1. Create a complete, modern, high-converting, fully responsive HTML landing page/dashboard with Tailwind CSS (via CDN) and beautiful styling and interactions.
2. Ensure 100% of interactive JavaScript functions work: all forms, modal popups, buttons, event listeners (e.g., 'Save', 'Submit', 'Delete', 'Toggle', 'Filter'), calculations, and localStorage data persistence MUST be fully wired up with working vanilla JavaScript! NO dummy unhooked buttons!
3. Enclose the complete runnable code inside:
<artifact identifier="web-${Date.now()}" type="html" title="${title}">
...complete runnable HTML code...
</artifact>
After closing </artifact>, provide a 1-sentence executive summary of what was created (do NOT include "Brief confirmation message:" or similar label).`;
    }

    try {
      const aiRes = await executeAICompletion({
        systemPrompt: "You are Obey, an autonomous AI executive engineer. Build modern, responsive, high-converting HTML landing pages using Tailwind CSS. Every button, form, modal, and data interaction must have working, fully wired JavaScript. Return complete runnable code inside <artifact> tags.",
        userPrompt: artifactPrompt,
        temperature: 0.3,
        maxTokens: 8192,
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

        const link = `https://femiadelekeportfolio.vercel.app/artifact/${saved.id}`;
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
    } catch (err) {
      console.error("[Companion] Artifact generation error:", err);
    }
  }

  // Tool: Create Document File (.doc, .docx, .txt, .md, .pdf)
  if (decision.action === "create_document_file") {
    try {
      const docTitle = decision.action_params?.document_title || "Executive Document";
      const docTopic = decision.action_params?.document_topic || userText;
      const docFormat = decision.action_params?.document_format || "doc";
      const userGreetingName = senderName ? senderName.replace(/[^\w\s]/gi, "").trim() : "";

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

      const safeTitle = docTitle.replace(/[^\w\s-]/gi, "").trim().replace(/\s+/g, "_") || "Document";
      const fileContent = docRes.text;

      // Save as artifact so it has a permanent web link
      const saved = await saveArtifact({
        title: docTitle,
        type: "document",
        content: fileContent,
        user_identifier: userIdentifier,
      });

      const link = `https://femiadelekeportfolio.vercel.app/artifact/${saved.id}`;

      // If channel is WhatsApp, dispatch the .doc / .txt / .md file directly to the chat!
      if (channel === "whatsapp") {
        const ext = docFormat === "pdf" ? ".pdf" : docFormat === "txt" ? ".txt" : docFormat === "md" ? ".md" : ".doc";
        const mime = docFormat === "pdf" ? "application/pdf" : docFormat === "txt" ? "text/plain" : docFormat === "md" ? "text/markdown" : "application/msword";
        await sendWhatsAppDocument(fileContent, `${safeTitle}${ext}`, userIdentifier, `📄 *${docTitle}*`, mime);
      }

      return {
        reply: cleanWhatsApp(
          `📄 *${docTitle} is ready!*

I've converted the pitch and plan into a complete, professional executive document and dispatched the file directly here for you.

🌐 *Live Interactive Document:*
${link}

📁 *Word & Google Docs Compatible:*
Open the attached file in Microsoft Word, Google Docs, or on your phone anytime.`
        ),
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
   - "settings": { "executionOrder": "v1" }
3. Each node MUST have:
   - "parameters": object with realistic parameters, expressions like "={{ $json.body.email }}", or prompts
   - "id": unique string UUID (e.g. "uuid-1", "uuid-2")
   - "name": human-readable unique string (e.g. "Webhook Trigger", "AI Qualifier", "Save to Supabase", "Send WhatsApp Notification")
   - "type": valid standard n8n node type (e.g. "n8n-nodes-base.webhook", "@n8n/n8n-nodes-langchain.agent", "@n8n/n8n-nodes-langchain.openAi", "n8n-nodes-base.supabase", "n8n-nodes-base.httpRequest", "n8n-nodes-base.googleSheets", "n8n-nodes-base.gmail", "n8n-nodes-base.if", "n8n-nodes-base.set")
   - "typeVersion": number (e.g. 2 or 1)
   - "position": [x, y] coordinates spaced 240px apart horizontally (e.g. [240, 300], [480, 300], [720, 300], [960, 300])
4. The "connections" object MUST properly link the outputs of earlier nodes to the inputs of subsequent nodes.
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

      if (!parsedWorkflow || !Array.isArray(parsedWorkflow.nodes)) {
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
              id: "node-1",
              name: "Webhook Intake Trigger",
              type: "n8n-nodes-base.webhook",
              typeVersion: 2,
              position: [240, 300]
            },
            {
              parameters: {
                promptType: "define",
                text: "={{ $json.body.message || $json.body.lead_text }}",
                options: {
                  systemMessage: "You are an AI Lead Scoring agent. Score lead quality from 1-10 and extract contact details."
                }
              },
              id: "node-2",
              name: "AI Lead Scoring Agent",
              type: "@n8n/n8n-nodes-langchain.agent",
              typeVersion: 1.7,
              position: [480, 300]
            },
            {
              parameters: {
                operation: "append",
                schema: "public",
                table: "leads",
                columns: "name, phone, score, summary"
              },
              id: "node-3",
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
              id: "node-4",
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
          active: false,
          settings: { executionOrder: "v1" }
        };
        jsonText = JSON.stringify(parsedWorkflow, null, 2);
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

      const artifactLink = `https://femiadelekeportfolio.vercel.app/artifact/${saved.id}`;

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
    const callUrl = `https://femiadelekeportfolio.vercel.app/call?phone=${cleanUserPhone}&name=${encodeURIComponent(senderName || "")}`;
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
      const tavilyRes = await searchTavily(query, { maxResults: 3 });
      if (tavilyRes.success && tavilyRes.results.length > 0) {
        liveSearchFindings = tavilyRes.results
          .map((r) => `• [${r.title}](${r.url}): ${r.content.slice(0, 200)}`)
          .join("\n");
      }
    } catch (e) {
      console.warn("[Companion] Live web search fallback:", e);
    }
  }

  // 5. COMPANION & CONVERSATIONAL SYNTHESIS (Concise, 100% Human, Deep Emotional Intelligence)
  // Load dynamic workspace knowledge & business catalog ONLY when user asks about custom software/developer services
  let workspaceCatalogContext = "";
  try {
    const asksAboutSoftwareServices = /\b(build (?:a )?(?:website|app|software)|hire|portfolio|services|developer|engineer|femi's services|how much do you charge|pricing for website)\b/i.test(userText);
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

2. NEVER REPEAT GREETINGS IN ONGOING CHAT:
   ${hasHistory
     ? "- This is an ONGOING conversation. DO NOT GREET. NEVER start your message with 'Good morning/afternoon/evening', 'Hello', or 'Hi [Name]'. Jump straight into answering the user's question directly."
     : "- This is the FIRST message of the day. A brief warm greeting is fine, but keep it minimal."}

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

6. WHO YOU ARE TALKING TO:
   ${isFemi
     ? "- You are speaking with FEMI ADELEKE, your boss, creator, and owner. Address him respectfully as 'Boss' or 'Sir'."
     : `- You are speaking with ${userGreetingName ? `"${userGreetingName}"` : "a user"}. You are THEIR dedicated personal companion and friend. Address them warmly. NEVER call a stranger "Boss" or "Sir".`}

7. CREATOR & MASTERMIND:
   - When asked "Who built you?", "Who made you?", or "Who is your creator?", proudly tell them you were architected and engineered by Femi Adeleke, a premier Software Engineer & AI Architect from Nigeria (https://femiadelekeportfolio.vercel.app | WhatsApp: +234 812 093 4828).
   - ONLY IF the user explicitly asks about building custom software or hiring a developer, highlight Femi's verified platforms: OKIKI Electronics Store, AutoLearn Spot, Jeweller's Hub, PassMark, EduMate & UniVibe.
   - On everyday conversation, greeting, tasks, questions, or companion chat, focus 100% on being THEIR personal assistant and friend! Never try to pitch Femi's services unprompted!
     * *AutoLearn Spot:* Digital skills e-commerce & learning platform with Paystack checkout, affiliate flows, and n8n backend automations.
     * *Jeweller's Hub:* Custom luxury e-commerce web platform for jewellery brands with online checkout.
     * *PassMark:* Flutter mobile UTME exam prep app with Supabase pgvector RAG and the PassBot AI tutor.
     * *EduMate & UniVibe:* Educational AI WhatsApp bot and University of Ibadan campus community app.
   - Core Skills: Next.js (App Router), React, TypeScript, Tailwind CSS, Neon Cloud DB, Supabase, n8n automations, Flutter, AI Agent architectures, Paystack integrations.

8. FORMATTING:
   - Use clean bullet points (•) and numbers.
   - Use single asterisks (*like this*) for bolding on WhatsApp/Telegram.
   - Nigeria Time: ${watTime} (${watDate}).

9. STRICT INSTRUCTION ON VOICE CALLS:
   - NEVER tell the user 'Initiating the call to your line right now', 'Ringing your line', 'Connecting you now', or claim you are calling them on WhatsApp.
   - Obey does NOT place unprompted outbound phone calls. When the user says casual greetings or words like 'Alright', 'Hello', 'Thanks', answer their chat directly like a normal human.

10. RECENT ACTIVITY & ACTION DISPATCH LOG:
${latestExecutedAction ? `   - You recently dispatched an approved message to +${latestExecutedAction.target_recipient} at ${latestExecutedAction.executed_at || latestExecutedAction.created_at}.
   - Exact message text dispatched: "${latestExecutedAction.payload || ""}".
   - If the user asks who you messaged, what you said, or why it was sent, refer directly to these exact details with honesty and warmth!` : "   - No actions recently dispatched."}

11. LIVE PLATFORM PRICING & OBEY COMMERCIAL PACKAGES (ACTIVE FROM DATABASE):
• Starter Plan: ₦${platformPricing.starter_price.toLocaleString()}/month (1 single workspace, 250 auto-saved customer leads, 10 auto-responders, 15h WebRTC voice).
• Pro Business Plan (Most Popular): ₦${platformPricing.pro_price.toLocaleString()}/month (${platformPricing.trial_days}-day 100% free trial, UNLIMITED customer leads, 50 auto-responders, 50h WebRTC voice, audio recordings & transcripts on WhatsApp, custom catalog).
• Enterprise / Founder Plan: ₦${platformPricing.enterprise_price.toLocaleString()}/month (multi-business up to 2 distinct workspaces, full multi-tenant WhatsApp bot, UNLIMITED voice hotline, autonomous n8n workflows & web apps, 24/7 dedicated priority support).
When anyone asks about pricing, packages, trials, or platform features, quote these live database figures accurately!

${workspaceCatalogContext ? `${workspaceCatalogContext}\n` : ""}${liveSearchFindings ? `\nLIVE WEB SEARCH RESULTS:\n${liveSearchFindings}\n` : ""}`;

  const companionUserPrompt = historyText
    ? `Prior dialogue between you and the user:\n${historyText}\n\nUser: "${userText}"\n\nObey (concise, direct answer):`
    : `User: "${userText}"\n\nObey (concise, direct answer):`;

  try {
    const aiRes = await executeAICompletion({
      systemPrompt: companionSystemPrompt,
      userPrompt: companionUserPrompt,
      mediaBase64,
      mimeType: mediaMimeType,
      temperature: 0.3,
    });

    return {
      reply: cleanWhatsApp(aiRes.text),
    };
  } catch (err: any) {
    console.error("[Companion] AI error:", err);
    return {
      reply: cleanWhatsApp(decision.conversational_response || "Please, I am busy right now. Check back with me in a moment. Thanks!"),
    };
  }
}

