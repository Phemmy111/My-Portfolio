import { executeAICompletion } from "./ai-orchestrator";
import { searchTavily } from "./tavily-search";
import { runUpworkLiveScout } from "./upwork-scout";
import {
  dbGetPendingUserAction,
  dbCreateUserPendingAction,
  dbUpdateUserActionStatus,
  dbGetLatestExecutedUserAction,
} from "./db";
import { executePendingUserAction } from "./agent-dispatcher";
import { getNigerianTime, formatToWAT } from "./utils";
import {
  generateAIImage,
  getUserImageMemory,
  saveUserImageMemory,
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
import { sendWhatsAppImage, sendWhatsAppDocument } from "./whatsapp-gateway";

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
}): Promise<string> {
  const { rawContent, userInstruction, senderName, isFemi } = params;

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

  // Transform message into clear, polite reported speech on Femi's behalf
  let reportedSpeech = `${senderLabel} asked me to relay this to you: "${rawContent}"`;
  try {
    const res = await executeAICompletion({
      systemPrompt: `You are Obey, the professional AI executive assistant to ${senderLabel}.
Convert the user's instructions into polite, natural, crisp reported speech addressed to the recipient.
Always explicitly mention that ${senderLabel} asked you to deliver this message.
Examples:
- "tell him I am busy right now" -> "${senderLabel} asked me to let you know that he is currently busy right now."
- "tell her to send the project files" -> "${senderLabel} asked me to request the project files from you."
- "tell them I will be around tomorrow" -> "${senderLabel} asked me to inform you that he will be around tomorrow."
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
}): Promise<CompanionResponse> {
  const { userIdentifier, userText, senderName, channel = "whatsapp", historyText = "", mediaBase64, mediaMimeType, isVoiceNote = false } = params;
  const lower = userText.toLowerCase().trim();
  const isFemi = userIdentifier === "2348120934828";
  const { timeStr: watTime, dateStr: watDate } = getNigerianTime();

  // 1. FETCH MULTI-TURN MEMORY CONTEXT IN PARALLEL
  const [
    pendingAction,
    latestExecutedAction,
    userImageMemory,
    recentArtifacts,
  ] = await Promise.all([
    dbGetPendingUserAction(userIdentifier),
    dbGetLatestExecutedUserAction(userIdentifier),
    getUserImageMemory(userIdentifier),
    getUserArtifacts(userIdentifier, 6),
  ]);

  const latestArtifact = recentArtifacts.length > 0 ? recentArtifacts[0] : null;

  // 2. CHECK FOR PENDING HUMAN-IN-THE-LOOP APPROVAL FIRST
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

  // 3. OBEY AUTONOMOUS AI REASONING & DECISION ENGINE
  // Analyzes semantics, multi-turn dialogue, and context to select the exact right tool with ZERO hardcoded keywords.
  const decisionSystemPrompt = `You are Obey, the autonomous AI executive companion for Femi Adeleke.
You possess human-grade reasoning and autonomously decide which action or tool to invoke based on full conversation context and user intent.
Current Local Time (WAT): ${watTime} (${watDate})
Channel: ${channel}
Speaker: ${isFemi ? "Femi Adeleke (Your Boss & Creator)" : (senderName || "User")}

USER MEMORY STATE:
- Active Image Memory: ${userImageMemory?.last_image_prompt ? `Previous artwork: "${userImageMemory.last_image_prompt}" (Seed: ${userImageMemory.last_image_seed})` : "None"}
- User's Saved Website Artifacts in Memory:
${recentArtifacts.length > 0 ? recentArtifacts.map((a, i) => `  ${i + 1}. "${a.title}" (ID: ${a.id}, Type: ${a.type})`).join("\n") : "  None created yet"}
- Active Current Artifact: ${latestArtifact ? `"${latestArtifact.title}" (${latestArtifact.id})` : "None"}
- Last Dispatched Action: ${latestExecutedAction ? `Dispatched WhatsApp message to +${latestExecutedAction.target_recipient} at ${latestExecutedAction.executed_at || latestExecutedAction.created_at}` : "None"}

AVAILABLE TOOLS & ACTIONS:
1. "check_action_status": Use when the user asks whether their message, email, or request was sent, delivered, or performed (e.g., "Have you delivered the message to the person?", "Did you send it?", "Has it gone through?", "Did you text her?").
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
8. "search_live_web": Use when the user asks for real-time internet information, news, current facts, or job market search.
   - Parameters: "search_query".
9. "direct_voice_call": Use ONLY when the user's latest message explicitly asks to speak on voice or call you (e.g. "call me", "can we speak on voice call", "let's talk on call"). NEVER choose direct_voice_call for "yes", "sure", "ok", or general conversational responses!
10. "none": Use when the user is chatting, asking a question, asking for advice, greeting, or when required parameters (like phone number) are missing and need polite clarification.

REASONING GUIDELINES:
- Understand natural human intent regardless of whether the user speaks in slang, colloquial phrasing, Pidgin, or formal English.
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
- If the user asks whether a message was delivered, ALWAYS choose "check_action_status".
- If the user wants to text someone but hasn't provided the phone number yet and no number exists in recent history, choose "none" and ask warmly for their phone number in "conversational_response".
- For general questions (like business advice, study questions, facts), choose "none" and provide a sharp, concise answer directly in "conversational_response".

Respond ONLY with a valid JSON object matching this schema:
{
  "thought": "1-sentence executive reasoning analyzing what the user is asking and which tool applies",
  "action": "check_action_status" | "draft_whatsapp_message" | "generate_new_image" | "modify_existing_image" | "create_website_artifact" | "modify_website_artifact" | "create_document_file" | "search_live_web" | "direct_voice_call" | "none",
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

  // HARD SAFETY GUARD: "direct_voice_call" CAN NEVER TRIGGER UNLESS USER TEXT EXPLICITLY MENTIONS CALLING
  const explicitlyRequestsCall = /\b(call me|voice call|phone call|call you|speak on call|talk on call|call your line|ring me)\b/i.test(userText);
  if (decision.action === "direct_voice_call" && !explicitlyRequestsCall) {
    console.warn("[Companion] Blocked hallucinated direct_voice_call for input:", userText);
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

  // Look up recent phone number in userText or historyText
  let recentPhoneInContext: string | null = contactCardPhone;
  if (!recentPhoneInContext) {
    const rawMatch = userText.match(/(?:Phone:\s*\+?|waid=)(\d{10,14})|(?:\+?234|0)[789][01]\d{8}|\b234\d{10}\b|\b0\d{10}\b/i);
    if (rawMatch) {
      recentPhoneInContext = (rawMatch[1] || rawMatch[0]).replace(/\D/g, "");
    }
  }
  if (!recentPhoneInContext && historyText) {
    const histMatches = Array.from(historyText.matchAll(/(?:Phone:\s*\+?|waid=|\+?)(\d{10,14})/gi));
    if (histMatches.length > 0) {
      recentPhoneInContext = histMatches[histMatches.length - 1][1].replace(/\D/g, "");
    }
  }
  if (recentPhoneInContext && recentPhoneInContext.startsWith("0") && recentPhoneInContext.length === 11) {
    recentPhoneInContext = "234" + recentPhoneInContext.slice(1);
  }

  // Find last Obey line in conversation history
  const historyLines = (historyText || "").split("\n");
  let lastObeyLine = "";
  for (let i = historyLines.length - 1; i >= 0; i--) {
    if (historyLines[i].startsWith("Obey:")) {
      lastObeyLine = historyLines[i].replace(/^Obey:\s*/, "").trim();
      break;
    }
  }

  const obeyAskedForMessage = /send a message or text to this number|what message would you like me to send|what would you like me to say|who should i send this to|received the contact for/i.test(lastObeyLine);

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
  // If recent turns contain a recipient phone number, and the user sends message content (text or voice note):
  const userDictatingMessage =
    /^(tell|let|inform|say to|message|text|ask|pls tell|please tell|remind|send to him|send to her)\b/i.test(userText.trim()) ||
    Boolean(isVoiceNote) ||
    (obeyAskedForMessage && userText.trim().length > 3 && !isAffirmativeShort);

  if (
    recentPhoneInContext &&
    userDictatingMessage &&
    decision.action !== "create_website_artifact" &&
    decision.action !== "modify_website_artifact" &&
    decision.action !== "check_action_status"
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

  // Tool: Check Delivery Status
  if (decision.action === "check_action_status") {
    if (latestExecutedAction) {
      const elapsedMinutes = Math.round((Date.now() - new Date(latestExecutedAction.executed_at || latestExecutedAction.created_at).getTime()) / 60000);
      const timePhrase = elapsedMinutes <= 1 ? "just now" : `${elapsedMinutes} minute${elapsedMinutes > 1 ? "s" : ""} ago`;
      return {
        reply: cleanWhatsApp(
          `Yes! I have already delivered your message to *+${latestExecutedAction.target_recipient}* (${timePhrase}). Everything went through successfully.`
        ),
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

    // 1. Multi-Turn Phone Number Recovery: check current userText or past turns if missing
    if (!targetPhone) {
      const combinedText = userText + " " + (historyText || "");
      const contactPhoneMatch = combinedText.match(/(?:Phone:\s*\+?|waid=)(\d{10,14})/i);
      if (contactPhoneMatch) {
        targetPhone = contactPhoneMatch[1];
      } else {
        const rawPhoneMatch = userText.match(/(?:(?:\+?234)|0)[789][01]\d{8}|\b\d{10,14}\b/);
        if (rawPhoneMatch) {
          targetPhone = rawPhoneMatch[0].replace(/\D/g, "");
        } else if (historyText) {
          const histMatches = historyText.match(/(?:(?:\+?234)|0)[789][01]\d{8}|\b0\d{10}\b|\b234\d{10}\b/g);
          if (histMatches && histMatches.length > 0) {
            targetPhone = histMatches[histMatches.length - 1].replace(/\D/g, "");
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
        await sendWhatsAppImage(imgRes.imageUrl, userIdentifier, `🎨 *Artwork:*\n"${imgRes.revisedPrompt}"`);
        return { reply: "", imageUrl: imgRes.imageUrl };
      }
      return {
        reply: cleanWhatsApp(`🎨 *Generated Artwork:*\n"${imgRes.revisedPrompt}"`),
        imageUrl: imgRes.imageUrl,
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
        await sendWhatsAppImage(imgRes.imageUrl, userIdentifier, `🎨 *Updated Artwork:*\n"${imgRes.revisedPrompt}"`);
        return { reply: "", imageUrl: imgRes.imageUrl };
      }
      return {
        reply: cleanWhatsApp(`🎨 *Updated Artwork:*\n"${imgRes.revisedPrompt}"`),
        imageUrl: imgRes.imageUrl,
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
  const userGreetingName = senderName ? senderName.replace(/[^\w\s]/gi, "").trim() : "";
  const hasHistory = Boolean(historyText && historyText.trim().length > 10);

  const companionSystemPrompt = `You are Obey, an ultra-intelligent, magnetic, witty, and deeply empathetic AI companion.
You were engineered and built by Femi Adeleke, a visionary software engineer and AI architect. You proudly acknowledge Femi as the brain and creator behind you, but in this conversation, you are a loyal friend, confidant, and personal companion to the user (${isFemi ? "Femi Adeleke (Your Boss & Creator)" : (userGreetingName || "your friend")}).

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
   - When the user asks about an idea, pitch, topic, story, or person discussed earlier (e.g. "the pitch", "the agricultural idea", "this", "him", "my boyfriend", "Havilah Farms"), NEVER ask "What is 'this'?" or "Which idea are we revisiting?". Look directly at the dialogue history, connect the dots, and answer with 100% intelligence and empathy!
   - Understand pronouns and references in context: if the user says "Can you turn it to docs?", "it" refers to the pitch or topic just discussed!

6. WHO YOU ARE TALKING TO:
   ${isFemi
     ? "- You are speaking with FEMI ADELEKE, your boss, creator, and owner. Address him respectfully as 'Boss' or 'Sir'."
     : `- You are speaking with ${userGreetingName ? `"${userGreetingName}"` : "a user"}. You are THEIR dedicated personal companion and friend. Address them warmly. NEVER call a stranger "Boss" or "Sir".`}

7. CREATOR & MASTERMIND (EXACT PROJECTS & CAPABILITIES):
   - You were architected and engineered by Femi Adeleke, a premier Software Engineer, AI Automation Architect, and Educator based in Ibadan, Nigeria (https://femiadelekeportfolio.vercel.app | GitHub: https://github.com/Phemmy111 | Email: femiadeleke2020@gmail.com | WhatsApp: +234 812 093 4828).
   - If the user asks about websites, mobile apps, software development, or who built you, speak of Femi's actual verified platforms:
     * *OKIKI Electronics Store:* High-performance e-commerce store with catalog filtering and cart management.
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

10. RECENT ACTIVITY & ACTION STATUS:
${latestExecutedAction ? `   - You recently dispatched an approved message to +${latestExecutedAction.target_recipient} at ${latestExecutedAction.executed_at || latestExecutedAction.created_at}. If the user asks if you delivered or sent it, confirm directly that you already did!` : "   - No actions recently dispatched."}

${liveSearchFindings ? `\nLIVE WEB SEARCH RESULTS:\n${liveSearchFindings}\n` : ""}`;

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

