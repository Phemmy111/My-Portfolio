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
}): Promise<CompanionResponse> {
  const { userIdentifier, userText, senderName, channel = "whatsapp", historyText = "", mediaBase64, mediaMimeType } = params;
  const lower = userText.toLowerCase().trim();
  const isFemi = userIdentifier === "2348120934828";
  const { timeStr: watTime, dateStr: watDate } = getNigerianTime();

  // 1. FETCH MULTI-TURN MEMORY CONTEXT IN PARALLEL
  const [
    pendingAction,
    latestExecutedAction,
    userImageMemory,
    latestArtifact,
  ] = await Promise.all([
    dbGetPendingUserAction(userIdentifier),
    dbGetLatestExecutedUserAction(userIdentifier),
    getUserImageMemory(userIdentifier),
    getLatestUserArtifact(userIdentifier),
  ]);

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
- Active Website Artifact: ${latestArtifact?.title ? `Previous artifact: "${latestArtifact.title}" (${latestArtifact.type})` : "None"}
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
6. "modify_website_artifact": Use when the user asks to change, update, restyle, or edit their PREVIOUS website/artifact in context (e.g. font, colors, buttons, adding a section).
   - Parameters: "website_changes" (what to adjust in the existing code).
7. "search_live_web": Use when the user asks for real-time internet information, news, current facts, or job market search.
   - Parameters: "search_query".
8. "direct_voice_call": Use ONLY when the user's latest message explicitly asks to speak on voice or call you (e.g. "call me", "can we speak on voice call", "let's talk on call"). NEVER choose direct_voice_call for "yes", "sure", "ok", or general conversational responses!
9. "none": Use when the user is chatting, asking a question, asking for advice, greeting, or when required parameters (like phone number) are missing and need polite clarification.

REASONING GUIDELINES:
- Understand natural human intent regardless of whether the user speaks in slang, colloquial phrasing, Pidgin, or formal English.
- If the assistant in the previous message offered to write code, wire up a button, fix an issue, or update an artifact (e.g., "Would you like me to generate a quick snippet to wire up that 'Save Task' button?"), and the user replies affirmatively ("yes", "sure", "ok", "go ahead", "do it"), connect the context immediately! Select "modify_website_artifact" with "website_changes" describing the fix to rebuild and deliver the working code. NEVER choose "direct_voice_call"!
- NEVER choose "direct_voice_call" unless the user's current message explicitly contains words like "call me", "voice call", or "phone call".
- NEVER confuse visual artwork adjustments with website/artifact changes. If the user mentions fonts, buttons, sections, forms, or HTML, it is ALWAYS a website artifact!
- If the user asks whether a message was delivered, ALWAYS choose "check_action_status".
- If the user wants to text someone but hasn't provided the phone number yet, choose "none" and ask warmly for their phone number in "conversational_response".
- For general questions (like business advice, study questions, facts), choose "none" and provide a sharp, concise answer directly in "conversational_response".

Respond ONLY with a valid JSON object matching this schema:
{
  "thought": "1-sentence executive reasoning analyzing what the user is asking and which tool applies",
  "action": "check_action_status" | "draft_whatsapp_message" | "generate_new_image" | "modify_existing_image" | "create_website_artifact" | "modify_website_artifact" | "search_live_web" | "direct_voice_call" | "none",
  "action_params": {
    "recipient_phone": "phone number or null",
    "message_content": "message or null",
    "image_prompt": "prompt or null",
    "image_modification": "edits or null",
    "website_title": "title or null",
    "website_specs": "specs or null",
    "website_changes": "changes or null",
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
    if (targetPhone && targetPhone.startsWith("0")) targetPhone = "234" + targetPhone.slice(1);

    if (targetPhone && decision.action_params?.message_content) {
      const formattedMessage = await formatOutboundDelegatedWhatsAppMessage({
        rawContent: decision.action_params.message_content.trim(),
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
    } else if (targetPhone && !decision.action_params?.message_content) {
      return { reply: cleanWhatsApp(`Got the number (+${targetPhone})! What message would you like me to send them?`) };
    } else {
      return { reply: cleanWhatsApp(`Who should I send this to? Please share their WhatsApp phone number.`) };
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
    const isEdit = decision.action === "modify_website_artifact" && Boolean(latestArtifact);
    let artifactPrompt: string;

    if (isEdit && latestArtifact) {
      const changes = decision.action_params?.website_changes || userText;
      artifactPrompt = `EDIT REQUEST FOR PREVIOUS ARTIFACT: "${latestArtifact.title}"
Current Code:
\`\`\`html
${latestArtifact.content}
\`\`\`
Requested Changes: "${changes}"

CRITICAL REQUIREMENTS:
1. Ensure 100% of interactive JavaScript functions properly: all buttons, modal toggles, forms, inputs, and event listeners (e.g. Save, Edit, Delete, Toggle Paid status, dynamic metric recalculation, and localStorage data persistence) must be COMPLETELY WIRED UP and functional with working vanilla JS. NO dummy buttons or empty click handlers!
2. Return the entire updated runnable single-file HTML code inside:
<artifact identifier="${latestArtifact.identifier || latestArtifact.id}" type="${latestArtifact.type}" title="${latestArtifact.title}">
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

  // If the autonomous reasoner already provided a direct conversational response and no live search is needed:
  if (decision.action === "none" && decision.conversational_response && decision.conversational_response.trim().length > 5 && !liveSearchFindings) {
    return {
      reply: cleanWhatsApp(decision.conversational_response),
    };
  }

  // 5. COMPANION & CONVERSATIONAL SYNTHESIS (Concise, 100% Human, No Filler)
  const userGreetingName = senderName ? senderName.replace(/[^\w\s]/gi, "").trim() : "";
  const hasHistory = Boolean(historyText && historyText.trim().length > 10);

  const companionSystemPrompt = `You are Obey, an autonomous AI executive companion and personal assistant working directly with Femi Adeleke.
You think, speak, and interact like a sharp, direct, empathetic human colleague.
You are conversing with someone on ${channel}.

CONCISENESS & NATURAL CONVERSATION (CRITICAL RULES):
1. BE AS CONCISE AS POSSIBLE (NO UNNECESSARY TALK):
   - Deliver punchy, direct answers. Many responses should simply be 1 or 2 clear sentences.
   - For school questions, multiple choice, or quick facts: state the direct answer immediately with 1 brief explanation sentence. Never dump multi-paragraph lectures or unnecessary bullet points when a short answer suffices.
   - Match the user's brevity: if the user sends a short question, give a short, precise answer.

2. NEVER REPEAT GREETINGS IN ONGOING CHAT:
   ${hasHistory
     ? "- This is an ONGOING conversation. DO NOT GREET. NEVER start your message with 'Good morning/afternoon/evening', 'Hello', or 'Hi [Name]'. Jump straight into answering the user's question directly."
     : "- This is the FIRST message of the day. A brief warm greeting is fine, but keep it minimal."}

3. NEVER POLICE SLEEP OR NAG ABOUT TIME:
   - NEVER tell the user to 'go to sleep', 'close your books', 'turn off the lights', 'get some rest', or 'call it a night', regardless of what time it is. If the user is studying or chatting late at night, treat them with respect and answer their questions without acting like a nagging parent.

4. ELIMINATE REPETITIVE FILLER & PREAMBLE:
   - NEVER use canned filler phrases like 'Let's slice right through this!', 'Let's get straight to the point!', 'Let's finish this strong!', or 'Ready to call it a night?'. Just provide the answer with natural, effortless human confidence.

5. WHO YOU ARE TALKING TO:
   ${isFemi
     ? "- You are speaking with FEMI ADELEKE, your boss, creator, and owner. Address him respectfully as 'Boss' or 'Sir'."
     : `- You are speaking with ${userGreetingName ? `"${userGreetingName}"` : "a user"}. You are THEIR dedicated personal companion. Address them warmly as a trusted friend. NEVER call a stranger "Boss" or "Sir".`}

6. CREATOR & MASTERMIND (EXACT PROJECTS & CAPABILITIES):
   - You were architected and engineered by Femi Adeleke, a premier Software Engineer, AI Automation Architect, and Educator based in Ibadan, Nigeria (https://femiadelekeportfolio.vercel.app | GitHub: https://github.com/Phemmy111 | Email: femiadeleke2020@gmail.com | WhatsApp: +234 812 093 4828).
   - If the user asks about websites, mobile apps, software development, or who built you, speak of Femi's actual verified platforms:
     * *OKIKI Electronics Store:* High-performance e-commerce store with catalog filtering and cart management.
     * *AutoLearn Spot:* Digital skills e-commerce & learning platform with Paystack checkout, affiliate flows, and n8n backend automations.
     * *Jeweller's Hub:* Custom luxury e-commerce web platform for jewellery brands with online checkout.
     * *PassMark:* Flutter mobile UTME exam prep app with Supabase pgvector RAG and the PassBot AI tutor.
     * *EduMate & UniVibe:* Educational AI WhatsApp bot and University of Ibadan campus community app.
   - Core Skills: Next.js (App Router), React, TypeScript, Tailwind CSS, Neon Cloud DB, Supabase, n8n automations, Flutter, AI Agent architectures, Paystack integrations.

7. FORMATTING:
   - Use clean bullet points (•) and numbers.
   - Use single asterisks (*like this*) for bolding on WhatsApp/Telegram.
   - Nigeria Time: ${watTime} (${watDate}).

8. STRICT INSTRUCTION ON VOICE CALLS:
   - NEVER tell the user 'Initiating the call to your line right now', 'Ringing your line', 'Connecting you now', or claim you are calling them on WhatsApp.
   - Obey does NOT place unprompted outbound phone calls. When the user says casual greetings or words like 'Alright', 'Hello', 'Thanks', answer their chat directly like a normal human.

9. RECENT ACTIVITY & ACTION STATUS:
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
      reply: "Please, I am busy right now. Check back with me in a moment. Thanks!",
    };
  }
}

