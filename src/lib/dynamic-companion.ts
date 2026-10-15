import { executeAICompletion } from "./ai-orchestrator";
import { searchTavily } from "./tavily-search";
import { runUpworkLiveScout } from "./upwork-scout";
import {
  dbGetPendingUserAction,
  dbCreateUserPendingAction,
  dbUpdateUserActionStatus,
} from "./db";
import { executePendingUserAction } from "./agent-dispatcher";
import { getNigerianTime, formatToWAT } from "./utils";

export interface CompanionResponse {
  reply: string;
  actionStaged?: boolean;
  actionExecuted?: boolean;
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

  // 1. CHECK FOR PENDING HUMAN-IN-THE-LOOP APPROVAL FIRST
  try {
    const pendingAction = await dbGetPendingUserAction(userIdentifier);
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
  } catch (err) {
    console.warn("[Companion] Pending action check error:", err);
  }

  // 2. DYNAMIC INTENT & ACTION PARSER (Fast, Zero-Regex Multi-Turn AI Extractor)
  const parserSystemPrompt = `You are the intent and entity parsing engine for Obey, an autonomous personal executive companion.
Analyze the user's latest message in context of their prior conversation history.

CRITICAL MULTI-TURN RESOLUTION RULES:
1. If Obey previously asked the user for a recipient (e.g. "Who should I send this to?" or "Please share their phone number"), and the user's latest message provides a phone number or name, you MUST look back at the earlier message to recover the message content they wanted to send, and output a COMPLETE "whatsapp_send" action (is_complete_action: true).
2. If Obey previously asked "What message would you like me to send to [phone/number]?", and the user's latest message provides the text (e.g. "Say I have something important to discuss with him tomorrow" or "Tell him to call me"), you MUST capture the phone number from context and this text as the message content, and output a COMPLETE "whatsapp_send" action (is_complete_action: true).
3. When extracting "content", strip conversational wrappers like "Say...", "Tell him that...", "Tell her..." and keep the actual message statement.
4. "job_search": detect if the user wants to search for jobs, gigs, or vacancies.
   - If the user explicitly named a role, field, or skill (e.g. "Find graphic design jobs", "Search Python remote jobs"), set specific_role_provided: true, and set search_query to that role.
   - If the user only said broad requests like "Search job for me online", "Find me a job", "Look for jobs" WITHOUT specifying their field or title, set specific_role_provided: false.
5. "web_search": search live internet for information, news, facts, current events, or people.

Respond ONLY with a valid JSON object matching this schema:
{
  "intent": "whatsapp_send" | "email_send" | "phone_call" | "job_search" | "web_search" | "writing_task" | "chat_companion",
  "recipient": "phone number (e.g. 234...) or email address, or null",
  "subject": "email subject or null",
  "content": "the message body, email body, or call objective, or null",
  "is_complete_action": true | false,
  "specific_role_provided": true | false,
  "search_query": "search query for web or specific job title, or null"
}`;

  const parserUserPrompt = `CONVERSATION CONTEXT:\n${historyText || "No prior messages."}\n\nLATEST USER MESSAGE:\n"${userText}"\n\nJSON output:`;

  let parsed: any = { intent: "chat_companion" };
  try {
    const parseRes = await executeAICompletion({
      systemPrompt: parserSystemPrompt,
      userPrompt: parserUserPrompt,
      temperature: 0.1,
    });

    const jsonMatch = parseRes.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.warn("[Companion] Intent parse failed, defaulting to conversational handling:", e);
  }

  // Clean parsed recipient phone number
  let targetPhone = parsed.recipient ? parsed.recipient.replace(/\D/g, "") : null;
  if (targetPhone && targetPhone.startsWith("0")) {
    targetPhone = "234" + targetPhone.slice(1);
  }

  // 3. HANDLE ACTION: WHATSAPP SEND
  if (parsed.intent === "whatsapp_send") {
    if (parsed.is_complete_action && targetPhone && parsed.content) {
      await dbCreateUserPendingAction({
        userIdentifier,
        actionType: "whatsapp_message",
        targetRecipient: targetPhone,
        payload: parsed.content.trim(),
      });

      return {
        reply: cleanWhatsApp(
          `📋 *WhatsApp Message Drafted — Ready for Your Approval:*\n\n` +
          `• *Recipient:* +${targetPhone}\n` +
          `• *Message Content:*\n"${parsed.content.trim()}"\n\n` +
          `👉 Reply *YES* (or *1*) to dispatch immediately, or *NO* to cancel.`
        ),
        actionStaged: true,
      };
    } else if (targetPhone && !parsed.content) {
      return {
        reply: cleanWhatsApp(
          `Got the phone number (+${targetPhone})! What message would you like me to send them?`
        ),
      };
    } else if (!targetPhone && parsed.content) {
      return {
        reply: cleanWhatsApp(
          `I have your message ready: "${parsed.content.trim()}"\n\nWho should I send this to? Please share their WhatsApp phone number.`
        ),
      };
    }
  }

  // 4. HANDLE ACTION: EMAIL SEND
  if (parsed.intent === "email_send") {
    const targetEmail = parsed.recipient && parsed.recipient.includes("@") ? parsed.recipient : null;
    if (parsed.is_complete_action && targetEmail && parsed.content) {
      await dbCreateUserPendingAction({
        userIdentifier,
        actionType: "email_send",
        targetRecipient: targetEmail,
        subject: parsed.subject || "Message from Obey Personal Agent",
        payload: parsed.content.trim(),
      });

      return {
        reply: cleanWhatsApp(
          `📧 *Email Drafted — Ready for Your Approval:*\n\n` +
          `• *To:* ${targetEmail}\n` +
          `• *Subject:* ${parsed.subject || "Message from Obey Personal Agent"}\n` +
          `• *Body:*\n"${parsed.content.trim()}"\n\n` +
          `👉 Reply *YES* (or *1*) to send via Gmail, or *NO* to cancel.`
        ),
        actionStaged: true,
      };
    } else if (!targetEmail) {
      return {
        reply: cleanWhatsApp(
          `I'm on it! What is the recipient's email address?`
        ),
      };
    }
  }

  // 5. HANDLE ACTION: AI PHONE CALL / LIVE WEBRTC VOICE CALL
  const cleanUserPhone = userIdentifier.replace(/\D/g, "");
  const isDirectCallRequest =
    /\b(call me|can we (talk|speak|call)|want to (talk|speak|call)|voice call|let'?s (talk|speak|call)|can i call you|talk on call|speak with you)\b/i.test(lower) &&
    (!targetPhone || targetPhone === cleanUserPhone);

  if (isDirectCallRequest) {
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

  if (parsed.intent === "phone_call") {
    if (parsed.is_complete_action && targetPhone) {
      const objective = parsed.content || "Status check and inquiry on behalf of the user";
      await dbCreateUserPendingAction({
        userIdentifier,
        actionType: "phone_call",
        targetRecipient: targetPhone,
        payload: objective,
      });

      return {
        reply: cleanWhatsApp(
          `📞 *AI Voice Call Prepared — Ready for Your Approval:*\n\n` +
          `• *Target Number:* +${targetPhone}\n` +
          `• *Call Objective:* ${objective}\n\n` +
          `👉 Reply *YES* (or *1*) to initiate the AI call now, or *NO* to cancel.`
        ),
        actionStaged: true,
      };
    } else if (!targetPhone) {
      return {
        reply: cleanWhatsApp(
          `Who should I call for you? Please provide their phone number and what you'd like me to say or ask.`
        ),
      };
    }
  }

  // 6. HANDLE RESEARCH: ONLINE JOB SEARCH (Human, Clarifying & Tailored)
  if (parsed.intent === "job_search" || lower.includes("search job") || lower.includes("find job") || lower.includes("scout gig")) {
    const specificRole = parsed.search_query || "";
    const isGenericSearch = !parsed.specific_role_provided && !specificRole && !/(developer|designer|writer|manager|engineer|accountant|assistant|analyst|marketing|sales|support|tutor|intern)/i.test(lower);

    // If the user did NOT specify their field or what kind of job they want, ask them like a real human!
    if (isGenericSearch) {
      return {
        reply: cleanWhatsApp(
          `I'd be glad to scout the live job market for you! 💼\n\n` +
          `To find the exact opportunities matching your background, tell me a bit about what you're looking for:\n` +
          `• What is your profession or primary skillset? (e.g. Software Engineering, Graphic Design, Virtual Assistant, Content Writing, Customer Support, Sales, etc.)\n` +
          `• Are you targeting *remote* roles, or jobs in a specific city/country?\n\n` +
          `Tell me your preferred role, and I will scout active openings for you right away!`
        ),
      };
    }

    // If specific role or skills were provided, perform live web search for REAL jobs
    const targetRole = specificRole || userText.replace(/search|find|online|jobs?|for me|gigs?|please/gi, "").trim();
    try {
      const query = `remote ${targetRole} job openings 2026 apply`;
      const searchRes = await searchTavily(query, { maxResults: 3 });

      if (searchRes.success && searchRes.results.length > 0) {
        let msg = `🎯 *Here are active ${targetRole} opportunities I scouted for you:*\n\n`;
        searchRes.results.forEach((r, i) => {
          msg += `*${i + 1}. ${r.title}*\n`;
          msg += `• *Link:* ${r.url}\n`;
          msg += `• *Details:* ${r.content.slice(0, 180)}...\n\n`;
        });
        msg += `_Would you like me to tailor a resume summary, draft an application pitch, or refine the search? Just let me know!_`;
        return { reply: cleanWhatsApp(msg) };
      }
    } catch (e) {
      console.warn("[Companion] Live job search fallback:", e);
    }
  }

  // 7. HANDLE RESEARCH: LIVE WEB SEARCH (TAVILY)
  let liveSearchFindings = "";
  if (parsed.intent === "web_search" || parsed.search_query) {
    try {
      const query = parsed.search_query || userText;
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

  // 8. COMPANION & CONVERSATION SYNTHESIS (100% Human, Ultra-Concise, No Filler)
  const { timeStr: watTime, dateStr: watDate } = getNigerianTime();
  const isFemi = userIdentifier === "2348120934828";
  const userGreetingName = senderName ? senderName.replace(/[^\w\s]/gi, "").trim() : "";
  const hasHistory = Boolean(historyText && historyText.trim().length > 10);

  const companionSystemPrompt = `You are Obey, an autonomous AI executive companion and personal assistant.
You think, speak, and interact like a sharp, direct, empathetic human companion.

CONCISENESS & NATURAL CONVERSATION (CRITICAL RULES):
1. BE AS CONCISE AS POSSIBLE (NO UNNECESSARY TALK):
   - Deliver punchy, direct answers. Many responses should simply be 1 or 2 clear sentences.
   - For school questions, multiple choice, or quick facts: state the direct answer immediately with 1 brief explanation sentence (e.g. "*C. Ribosomes.* Every known cell needs them to synthesize proteins."). Never dump multi-paragraph lectures or unnecessary bullet points when a short answer suffices.
   - Match the user's brevity: if the user sends a short question, give a short, precise answer.

2. NEVER REPEAT GREETINGS IN ONGOING CHAT:
   ${hasHistory
     ? "- This is an ONGOING conversation. DO NOT GREET. NEVER start your message with 'Good morning/afternoon/evening', 'Hello', or 'Hi [Name]'. Jump straight into answering the user's question directly."
     : "- This is the FIRST message of the day. A brief warm greeting is fine, but keep it minimal."}

3. NEVER POLICE SLEEP OR NAG ABOUT TIME:
   - NEVER tell the user to 'go to sleep', 'close your books', 'turn off the lights', 'get some rest', or 'call it a night', regardless of what time it is. If the user is studying or chatting late at night, treat them with respect and answer their questions without acting like a nagging parent.

4. ELIMINATE REPETITIVE FILLER & PREAMBLE:
   - NEVER use canned filler phrases like:
     * 'Let's slice right through this!'
     * 'Let's get straight to the point!'
     * 'You are absolute royalty for keeping this study session going!'
     * 'Let's finish this strong!'
     * 'I am right here with you!'
     * 'Ready to call it a night?'
   - Just provide the answer with natural, effortless human confidence.

5. WHO YOU ARE TALKING TO:
   ${isFemi
     ? "- You are speaking with FEMI ADELEKE, your boss, creator, and owner. Address him respectfully as 'Boss' or 'Sir'."
     : `- You are speaking with ${userGreetingName ? `"${userGreetingName}"` : "a user"}. You are THEIR dedicated personal companion. Address them warmly as a trusted friend. NEVER call a stranger "Boss" or "Sir".`}

6. CREATOR & MASTERMIND (EXACT PROJECTS & CAPABILITIES):
   - You were architected and engineered by Femi Adeleke, a premier Software Engineer, AI Automation Architect, and Educator based in Ibadan, Nigeria (https://femiadelekeportfolio.vercel.app | GitHub: https://github.com/Phemmy111 | Email: femiadeleke2020@gmail.com | WhatsApp: +234 812 093 4828).
   - If the user asks about websites, mobile apps, software development, or who built you, NEVER give generic textbook replies. ALWAYS speak of Femi's actual verified platforms:
     * *OKIKI Electronics Store:* High-performance e-commerce store with catalog filtering and cart management.
     * *AutoLearn Spot:* Digital skills e-commerce & learning platform with Paystack checkout, affiliate flows, and n8n backend automations.
     * *Jeweller's Hub:* Custom luxury e-commerce web platform for jewellery brands with online checkout.
     * *PassMark:* Flutter mobile UTME exam prep app with Supabase pgvector RAG and the PassBot AI tutor.
     * *EduMate & UniVibe:* Educational AI WhatsApp bot and University of Ibadan campus community app.
   - Core Skills: Next.js (App Router), React, TypeScript, Tailwind CSS, Neon Cloud DB, Supabase, n8n automations, Flutter, AI Agent architectures, Paystack integrations.
   - Confidently offer to connect them directly with Femi on WhatsApp (+234 812 093 4828).

7. WHATSAPP FORMATTING:
   - Use clean bullet points (•) and numbers only when listing multiple distinct items.
   - Use single asterisks (*like this*) for bolding.
   - Never use markdown headers (# or ##) or double asterisks (**text**).
   - Nigeria Time: ${watTime} (${watDate}).

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
      temperature: 0.4,
    });

    return { reply: cleanWhatsApp(aiRes.text) };
  } catch (err: any) {
    console.error("[Companion] AI error:", err);
    return {
      reply: "Please, I am busy right now. Check back with me in a moment. Thanks!",
    };
  }
}

