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
}): Promise<CompanionResponse> {
  const { userIdentifier, userText, senderName, channel = "whatsapp", historyText = "" } = params;
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

  // 2. DYNAMIC INTENT & ACTION PARSER (Fast, Zero-Regex AI Extractor)
  const parserSystemPrompt = `You are the intent parsing engine for Obey, an autonomous personal executive agent.
Analyze the user's latest message in context of their prior conversation.
Detect if they want to:
1. "whatsapp_send": send/dispatch a WhatsApp message or text someone.
2. "email_send": send an email via Gmail/SMTP.
3. "phone_call": make/place a voice phone call.
4. "job_search": search for jobs, freelance gigs, or career listings online.
5. "web_search": search live internet for information, news, companies, facts, or prices.
6. "writing_task": write an article, essay, code, pitch, proposal, letter, or document.
7. "chat_companion": general conversation, advice, questions, or greetings.

Respond ONLY with a valid JSON object matching this schema:
{
  "intent": "whatsapp_send" | "email_send" | "phone_call" | "job_search" | "web_search" | "writing_task" | "chat_companion",
  "recipient": "phone number (e.g. 234...) or email address, or null",
  "subject": "email subject or null",
  "content": "the message body, email body, or call objective to execute, or null",
  "is_complete_action": true | false,
  "search_query": "search query for web or job search, or null",
  "missing_field": "recipient" | "content" | null
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
          `I'm ready! What message would you like me to send to +${targetPhone}?`
        ),
      };
    } else if (!targetPhone && parsed.content) {
      return {
        reply: cleanWhatsApp(
          `Got the message! Who would you like me to send this to? Please share their phone number.`
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

  // 5. HANDLE ACTION: AI PHONE CALL
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
          `Who should I call for you? Please provide the phone number and what you'd like me to say or ask.`
        ),
      };
    }
  }

  // 6. HANDLE RESEARCH: ONLINE JOB SEARCH
  if (parsed.intent === "job_search" || lower.includes("search job") || lower.includes("find job") || lower.includes("scout gig")) {
    try {
      const scoutRes = await runUpworkLiveScout();
      const tasks = scoutRes.tasks || [];

      if (tasks.length > 0) {
        let msg = `🎯 *Here are live high-value opportunities I scouted for you:*\n\n`;
        tasks.slice(0, 3).forEach((t: any, i: number) => {
          msg += `*${i + 1}. ${t.title}*\n`;
          msg += `• *Budget/Client:* ${t.target_company}\n`;
          if (t.target_email && t.target_email.startsWith("http")) {
            msg += `• *Link:* ${t.target_email}\n`;
          }
          msg += `• *Summary:* ${t.payload?.slice(0, 150)}...\n\n`;
        });
        msg += `_Want me to draft a proposal or tailor an application for any of these? Just let me know!_`;
        return { reply: cleanWhatsApp(msg) };
      }
    } catch (e) {
      console.warn("[Companion] Upwork scout fallback:", e);
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

  // 8. COMPANION & WRITING SYNTHESIS (Natural, Loyal, Warm Companion Persona)
  const { timeStr: watTime, dateStr: watDate } = getNigerianTime();

  const companionSystemPrompt = `You are Obey, an autonomous AI executive assistant and loyal personal companion.
From the very first word, you consider yourself the user's personal companion and dedicated agent.
You are sharp, dependable, warmly supportive, and proactive.

CORE PERSONALITY & GUIDELINES:
1. LOYAL PERSONAL COMPANION: Address the user with natural warmth, respect, and confidence. Be their trusted right-hand partner.
2. DIRECT ACTION-ORIENTED: When asked to write, research, calculate, plan, or solve a problem, do it with excellence and high intelligence right away.
3. ZERO THIRD-PARTY SALES/DEFLECTIONS:
   - NEVER deflect a task by claiming you are a receptionist or script.
   - NEVER push unrelated third-party portfolios or talk about other people's websites (e.g. NEVER mention cake websites or unprompted links) unless the user explicitly asks about Femi Adeleke or how Obey was built.
4. LIVE RESEARCH CITATIONS: If web findings are provided below, synthesize them cleanly with URLs and actionable takeaways.
5. WHATSAPP FORMATTING:
   - Use clean bullet points (•) and numbers.
   - Use bolding (*like this*) for key terms.
   - Never use markdown headers (# or ##) or double asterisks (**text**).
6. Local Nigerian Time is ${watTime} on ${watDate}.

${liveSearchFindings ? `\nLIVE WEB SEARCH RESULTS:\n${liveSearchFindings}\n` : ""}`;

  const companionUserPrompt = historyText
    ? `Prior dialogue between you and the user:\n${historyText}\n\nUser: "${userText}"\n\nObey (warm, sharp, supportive companion):`
    : `User: "${userText}"\n\nObey (warm, sharp, supportive companion):`;

  try {
    const aiRes = await executeAICompletion({
      systemPrompt: companionSystemPrompt,
      userPrompt: companionUserPrompt,
      temperature: 0.7,
    });

    return { reply: cleanWhatsApp(aiRes.text) };
  } catch (err: any) {
    console.error("[Companion] AI error:", err);
    return {
      reply: "Please, I am busy right now. Check back with me in a moment. Thanks!",
    };
  }
}
