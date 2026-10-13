import { dbGetStats, dbAddChatMessage } from "@/lib/db";
import { getAgentTasks } from "@/lib/obey-agent";
import { executeAICompletion } from "@/lib/ai-orchestrator";
import { sendTelegramMessage } from "@/lib/telegram-bot";
import { sendWhatsAppMessage } from "@/lib/whatsapp-gateway";
import { sendProactiveBriefingEmail } from "@/lib/email";
import { getSetting } from "@/lib/settings";

/**
 * Generates and dispatches the 08:00 AM Morning Executive Briefing
 * Obey messages Femi first with today's priorities, incoming leads, and encouragement!
 */
export async function dispatchMorningBriefing(): Promise<{ success: boolean; text: string }> {
  try {
    const isEnabled = (await getSetting("PROACTIVE_MORNING_BRIEF_ENABLED")) !== "false";
    if (!isEnabled) {
      return { success: false, text: "Morning briefing is paused in settings." };
    }

    const [stats, tasks] = await Promise.all([
      dbGetStats(),
      getAgentTasks(),
    ]);

    const pendingCount = tasks.filter((t) => t.status === "pending_approval").length;
    const totalLeads = stats.total_leads || 0;
    const unreadInq = stats.unread_inquiries || 0;

    const systemPrompt = `You are Obey, the dedicated, emotionally intelligent personal AI executive assistant to Femi Adeleke.
This is your proactive 8:00 AM WAT Morning Briefing that you send directly to Femi's phone.
- Greet Femi warmly and respectfully: "Good morning, sir!" or "Good morning, Boss!"
- Ask how he rested and set a positive, confident tone for the day.
- Highlight key operational numbers:
  * ${pendingCount} pending authorizations waiting for his green light.
  * ${totalLeads} total leads tracked in CRM.
  * ${unreadInq} unread client inquiries.
- Suggest 3 high-impact priorities for the day:
  1. Reviewing any pending contract bids or inquiries.
  2. Continuing momentum on AutoLearn Spot and OKIKI Store.
  3. Running new Upwork/B2B scouts if his bandwidth allows.
- Give authentic encouragement. Remind him you are handling the heavy lifting in the background.
- Keep the message crisp, beautifully formatted with bold and clean bullet points for easy mobile reading.`;

    const aiRes = await executeAICompletion({
      systemPrompt,
      userPrompt: `Generate Femi's morning executive briefing for today.`,
      temperature: 0.75,
    });

    const briefText = aiRes.text;

    // 1. Dispatch to Telegram (phone)
    await sendTelegramMessage(briefText);

    // 2. Dispatch to WhatsApp (phone)
    await sendWhatsAppMessage(briefText);

    // 3. Dispatch to Gmail SMTP (inbox)
    try {
      await sendProactiveBriefingEmail({
        subject: `☀️ Good Morning Sir — Obey's Operational Briefing`,
        markdownContent: briefText,
      });
    } catch (e) {
      console.warn("Morning briefing email dispatch failed:", e);
    }

    // 4. Save to Obey Chat Memory in Neon DB
    await dbAddChatMessage({
      id: `brief-morning-${Date.now()}`,
      role: "assistant",
      content: briefText,
    });

    return { success: true, text: briefText };
  } catch (err: any) {
    console.error("Morning briefing error:", err);
    return { success: false, text: err.message };
  }
}

/**
 * Generates and dispatches the 20:00 PM Evening Check-In & Wrap-Up
 * Obey messages Femi first to see how work went and offer relaxing support.
 */
export async function dispatchEveningWrapup(): Promise<{ success: boolean; text: string }> {
  try {
    const isEnabled = (await getSetting("PROACTIVE_EVENING_CHECKIN_ENABLED")) !== "false";
    if (!isEnabled) {
      return { success: false, text: "Evening check-in is paused in settings." };
    }

    const stats = await dbGetStats();

    const systemPrompt = `You are Obey, the dedicated, emotionally intelligent personal AI executive assistant to Femi Adeleke.
This is your proactive 8:00 PM WAT Evening Check-In that you send directly to Femi's phone.
- Greet Femi with warmth, genuine human care, and respect: "Good evening, sir!" or "Good evening, Boss!"
- Ask how today's work went: did everything go smoothly?
- Offer genuine validation and empathy: acknowledge that building software and managing businesses is demanding, and encourage him to wind down, rest, and recharge.
- Reassure him: let him know that our database, outreach queue, and systems are completely secure and steady for tomorrow.
- Ask if there is anything he wants to note down before resting so he won't have to hold it in his head overnight.
- Format cleanly for mobile phone reading.`;

    const aiRes = await executeAICompletion({
      systemPrompt,
      userPrompt: `Generate Femi's evening check-in and wrap-up message.`,
      temperature: 0.75,
    });

    const wrapupText = aiRes.text;

    // 1. Dispatch to Telegram
    await sendTelegramMessage(wrapupText);

    // 2. Dispatch to WhatsApp
    await sendWhatsAppMessage(wrapupText);

    // 3. Dispatch to Gmail SMTP
    try {
      await sendProactiveBriefingEmail({
        subject: `🌙 Good Evening Sir — Obey's Daily Wrap-Up`,
        markdownContent: wrapupText,
      });
    } catch (e) {
      console.warn("Evening wrapup email dispatch failed:", e);
    }

    // 4. Save to Obey Chat Memory in Neon DB
    await dbAddChatMessage({
      id: `brief-evening-${Date.now()}`,
      role: "assistant",
      content: wrapupText,
    });

    return { success: true, text: wrapupText };
  } catch (err: any) {
    console.error("Evening wrapup error:", err);
    return { success: false, text: err.message };
  }
}

/**
 * Instant Proactive Alert:
 * Dispatches immediately to Femi's phone when a new inquiry arrives or an event occurs!
 */
export async function triggerInstantProactiveAlert(params: {
  title: string;
  body: string;
  link?: string;
}): Promise<void> {
  try {
    const isEnabled = (await getSetting("PROACTIVE_INSTANT_ALERTS_ENABLED")) !== "false";
    if (!isEnabled) return;

    const alertMessage = `🚨 *${params.title}*\n\n${params.body}${
      params.link ? `\n\n🔗 [Open Details](${params.link})` : ""
    }`;

    // 1. Telegram
    await sendTelegramMessage(alertMessage);

    // 2. WhatsApp
    await sendWhatsAppMessage(alertMessage);

    // 3. Save to Neon DB Chat Memory
    await dbAddChatMessage({
      id: `alert-${Date.now()}`,
      role: "assistant",
      content: alertMessage,
    });
  } catch (err) {
    console.warn("Instant alert dispatch failed:", err);
  }
}
