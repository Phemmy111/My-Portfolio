import { getSetting, getObeyBrainContext } from "@/lib/settings";
import { executeAICompletion } from "@/lib/ai-orchestrator";
import {
  dbAddChatMessage,
  dbGetChatMessages,
  dbCreateUserPendingAction,
  dbGetPendingUserAction,
  dbUpdateUserActionStatus,
} from "@/lib/db";
import { executePendingUserAction } from "@/lib/agent-dispatcher";
import { processDynamicCompanionTurn } from "@/lib/dynamic-companion";
import { getAgentTasks, executeAgentTask, rejectAgentTask } from "@/lib/obey-agent";
import { runUpworkLiveScout } from "@/lib/upwork-scout";
import { runB2BLeadHunter } from "@/lib/apollo-hunter";
import { getNigerianTime } from "@/lib/utils";

/**
 * Dispatches a proactive message to Femi's Telegram app.
 */
export async function sendTelegramMessage(
  text: string,
  options?: {
    chatId?: string;
    inlineKeyboard?: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
  }
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  try {
    const token = await getSetting("TELEGRAM_BOT_TOKEN");
    const targetChatId = options?.chatId || (await getSetting("TELEGRAM_CHAT_ID"));

    if (!token || !targetChatId) {
      return { success: false, error: "Telegram Bot Token or Chat ID not configured" };
    }

    const payload: Record<string, any> = {
      chat_id: targetChatId,
      text,
      parse_mode: "Markdown",
    };

    if (options?.inlineKeyboard && options.inlineKeyboard.length > 0) {
      payload.reply_markup = {
        inline_keyboard: options.inlineKeyboard,
      };
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (data.ok) {
      return { success: true, messageId: data.result?.message_id };
    } else {
      // Fallback: If markdown formatting failed, try sending plain text
      if (data.description?.includes("can't parse entities")) {
        const plainRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, parse_mode: undefined }),
        });
        const plainData = await plainRes.json();
        if (plainData.ok) {
          return { success: true, messageId: plainData.result?.message_id };
        }
      }
      return { success: false, error: data.description || "Failed to send Telegram message" };
    }
  } catch (err: any) {
    return { success: false, error: err.message || "Telegram network exception" };
  }
}

/**
 * Handles incoming Telegram webhooks (when Femi texts Obey on his phone).
 */
export async function handleTelegramWebhook(body: any): Promise<void> {
  const token = await getSetting("TELEGRAM_BOT_TOKEN");
  if (!token) return;

  // 1. Handle Inline Button Clicks (Approve / Reject Task from Phone)
  if (body.callback_query) {
    const query = body.callback_query;
    const data = query.data || "";
    const chatId = query.message?.chat?.id;
    const messageId = query.message?.message_id;

    if (data.startsWith("approve:")) {
      const taskId = data.replace("approve:", "");
      const tasks = await getAgentTasks();
      const target = tasks.find((t) => t.id === taskId);

      if (target) {
        const execRes = await executeAgentTask(target.id, target.approval_token);
        const replyText = execRes.success
          ? `✅ *Task Approved & Executed!*\n\nDispatched via Gmail SMTP to *${target.target_email || target.target_name}* and logged in Neon DB.`
          : `⚠️ *Execution Failed for ${target.id}:* ${execRes.message}`;

        await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: replyText,
            parse_mode: "Markdown",
          }),
        });
      }
    } else if (data.startsWith("reject:")) {
      const taskId = data.replace("reject:", "");
      const tasks = await getAgentTasks();
      const target = tasks.find((t) => t.id === taskId);

      if (target) {
        await rejectAgentTask(target.id, target.approval_token);
        await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: `❌ *Task Rejected!*\n\nTask \`${target.id}\` marked as cancelled. No email sent.`,
            parse_mode: "Markdown",
          }),
        });
      }
    } else if (data.startsWith("reply_email:")) {
      const emailId = data.replace("reply_email:", "");
      const { sendEmailReply } = await import("@/lib/gmail-reader");
      const res = await sendEmailReply(emailId);

      await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text: res.success ? `✅ *Auto-Reply Dispatched via Gmail!*\n\n${res.message}` : `⚠️ *Failed:* ${res.message}`,
          parse_mode: "Markdown",
        }),
      });
    } else if (data.startsWith("mark_read:")) {
      await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text: `👁️ *Marked as reviewed.* No reply sent.`,
          parse_mode: "Markdown",
        }),
      });
    } else if (data.startsWith("user_act_approve:")) {
      const actId = data.replace("user_act_approve:", "");
      const { sql } = await import("@/lib/db");
      const rows = (await sql`SELECT * FROM agent_user_actions WHERE id = ${actId} LIMIT 1`) as any[];
      if (rows && rows.length > 0) {
        const execRes = await executePendingUserAction(rows[0]);
        await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: execRes.message,
            parse_mode: "Markdown",
          }),
        });
      }
    } else if (data.startsWith("user_act_reject:")) {
      const actId = data.replace("user_act_reject:", "");
      await dbUpdateUserActionStatus(actId, "rejected");
      await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text: `❌ *Action Cancelled.* The drafted operation has been discarded.`,
          parse_mode: "Markdown",
        }),
      });
    }

    // Acknowledge callback
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: query.id }),
    });
    return;
  }

  // 2. Handle Text Messages from Femi
  const message = body.message;
  if (!message || !message.text) return;

  const chatId = message.chat.id;
  const userText = message.text.trim();
  const lower = userText.toLowerCase();

  // Save to Neon DB so conversation syncs with portfolio dashboard
  await dbAddChatMessage({
    id: `tg-${Date.now()}`,
    role: "user",
    content: userText,
  });

  // 0. Pending User Action Confirmation Check (HITL)
  const pendingAction = await dbGetPendingUserAction(chatId.toString());
  if (pendingAction) {
    const isAffirmative = /^(yes|send|approve|confirm|proceed|ok|1)\b/i.test(lower.trim());
    const isNegative = /^(no|cancel|reject|stop|2)\b/i.test(lower.trim());

    if (isAffirmative) {
      const execRes = await executePendingUserAction(pendingAction as any);
      await sendTelegramMessage(execRes.message, { chatId: chatId.toString() });
      return;
    } else if (isNegative) {
      await dbUpdateUserActionStatus(pendingAction.id, "rejected");
      await sendTelegramMessage("❌ *Action Cancelled.* The drafted operation has been discarded.", { chatId: chatId.toString() });
      return;
    }
  }

  // 1. Direct Action Commands on Telegram
  const waMatch = userText.match(/(?:send\s+whatsapp\s+message\s+to|message)\s+(\+?\d{10,14})\s+(?:saying|with|:)\s+([\s\S]+)/i);
  if (waMatch) {
    const targetNumber = waMatch[1].replace(/\D/g, "");
    const messageContent = waMatch[2].trim();

    const act = await dbCreateUserPendingAction({
      userIdentifier: chatId.toString(),
      actionType: "whatsapp_message",
      targetRecipient: targetNumber,
      payload: messageContent,
    });

    const keyboard = act
      ? [
          [
            { text: "✅ Send WhatsApp Now", callback_data: `user_act_approve:${act.id}` },
            { text: "❌ Cancel", callback_data: `user_act_reject:${act.id}` },
          ],
        ]
      : undefined;

    await sendTelegramMessage(
      `📋 *WhatsApp Message Drafted — Approval Required:*\n\n` +
      `• *Recipient:* +${targetNumber}\n` +
      `• *Message Content:*\n"${messageContent}"\n\n` +
      `Click a button below or reply *YES* to dispatch.`,
      { chatId: chatId.toString(), inlineKeyboard: keyboard }
    );
    return;
  }

  const emailMatch = userText.match(/send\s+email\s+to\s+([^\s@]+@[^\s@]+\.[^\s@]+)\s+(?:with\s+subject\s+["']?([^"'\n]+)["']?\s+)?(?:saying|with|:)\s+([\s\S]+)/i);
  if (emailMatch) {
    const targetEmail = emailMatch[1].trim();
    const subject = emailMatch[2]?.trim() || "Important Message from Femi Adeleke";
    const bodyContent = emailMatch[3].trim();

    const act = await dbCreateUserPendingAction({
      userIdentifier: chatId.toString(),
      actionType: "email_send",
      targetRecipient: targetEmail,
      subject,
      payload: bodyContent,
    });

    const keyboard = act
      ? [
          [
            { text: "✅ Send Email Now", callback_data: `user_act_approve:${act.id}` },
            { text: "❌ Cancel", callback_data: `user_act_reject:${act.id}` },
          ],
        ]
      : undefined;

    await sendTelegramMessage(
      `📧 *Email Drafted — Approval Required:*\n\n` +
      `• *To:* ${targetEmail}\n` +
      `• *Subject:* ${subject}\n` +
      `• *Body:*\n"${bodyContent}"\n\n` +
      `Click a button below or reply *YES* to dispatch via Gmail.`,
      { chatId: chatId.toString(), inlineKeyboard: keyboard }
    );
    return;
  }

  // Fast command: Scout Upwork
  if (lower.includes("scout upwork") || lower.includes("find job")) {
    const scoutRes = await runUpworkLiveScout();
    const tasks = scoutRes.tasks || [];

    if (tasks.length === 0) {
      await sendTelegramMessage("I scanned the Upwork feeds, sir, but couldn't find fresh listings in this run. I'll notify you as soon as new gigs drop!", { chatId });
      return;
    }

    const firstTask = tasks[0];
    const keyboard = firstTask.approval_token
      ? [
          [
            { text: "✅ Approve & Send Bid", callback_data: `approve:${firstTask.id}` },
            { text: "❌ Reject", callback_data: `reject:${firstTask.id}` },
          ],
        ]
      : undefined;

    const reply = `Right away, sir! I captured **${tasks.length} high-value Upwork contracts** matching your stack!\n\n` +
      `**Top Match:** ${firstTask.title}\n` +
      `**Company:** ${firstTask.target_company || "Upwork Client"}\n\n` +
      `**Proposal Draft:**\n${firstTask.payload?.slice(0, 400)}...`;

    await sendTelegramMessage(reply, { chatId, inlineKeyboard: keyboard });
    return;
  }

  // Fast command: Hunt B2B leads
  if (lower.includes("hunt lead") || lower.includes("hunt b2b") || lower.includes("cold email")) {
    const huntRes = await runB2BLeadHunter({ industry: "E-Commerce & Digital Logistics" });
    const tasks = huntRes.tasks || [];

    if (tasks.length === 0) {
      await sendTelegramMessage("No fresh B2B leads captured in this run, sir. Let me know if you want me to search another niche.", { chatId });
      return;
    }

    const firstTask = tasks[0];
    const keyboard = [
      [
        { text: "✅ Send Cold Email", callback_data: `approve:${firstTask.id}` },
        { text: "❌ Skip Lead", callback_data: `reject:${firstTask.id}` },
      ],
    ];

    const reply = `Done, sir! I scouted decision-makers and drafted cold outreach pitches.\n\n` +
      `**Target:** ${firstTask.target_name} (${firstTask.target_email})\n` +
      `**Company:** ${firstTask.target_company}\n\n` +
      `**Subject:** ${firstTask.subject}\n` +
      `**Pitch:**\n${firstTask.payload?.slice(0, 350)}...`;

    await sendTelegramMessage(reply, { chatId, inlineKeyboard: keyboard });
    return;
  }

  // Fast command: Check Gmail Inbox
  if (lower.includes("check email") || lower.includes("check gmail") || lower.includes("read mail") || lower.includes("inbox")) {
    const { runGmailInboxSync } = await import("@/lib/gmail-reader");
    const syncRes = await runGmailInboxSync();
    const emails = syncRes.emails || [];

    if (emails.length === 0) {
      await sendTelegramMessage("I reviewed your inbox, sir! No pending unread client emails at the moment. All clear!", { chatId });
      return;
    }

    const unreadLeads = emails.filter((e) => e.status === "unread" || e.isClientLead);
    const targetEmail = unreadLeads[0] || emails[0];

    const keyboard = [
      [
        { text: "✅ Send Drafted Reply", callback_data: `reply_email:${targetEmail.id}` },
        { text: "👁️ Mark as Read", callback_data: `mark_read:${targetEmail.id}` },
      ],
    ];

    const reply = `Here is the latest message from your inbox, sir:\n\n` +
      `**From:** ${targetEmail.sender} (${targetEmail.senderEmail})\n` +
      `**Subject:** ${targetEmail.subject}\n` +
      `**Priority:** ${targetEmail.priority.toUpperCase()}\n` +
      `**Summary:** ${targetEmail.summary}\n\n` +
      `**Drafted Reply:**\n${targetEmail.draftReply.slice(0, 350)}...`;

    await sendTelegramMessage(reply, { chatId, inlineKeyboard: keyboard });
    return;
  }

  // Fetch recent conversation context from Neon DB
  let conversationHistory = "";
  try {
    const rows = await dbGetChatMessages(10);
    if (rows && rows.length > 0) {
      conversationHistory = rows
        .slice(-6)
        .map((r: any) => `${r.role === "user" ? "User" : "Obey"}: ${r.content}`)
        .join("\n\n");
    }
  } catch {}

  const companionRes = await processDynamicCompanionTurn({
    userIdentifier: chatId.toString(),
    userText,
    channel: "telegram",
    historyText: conversationHistory,
  });

  const replyText = companionRes.reply;

  // Persist Obey's reply in Neon DB
  await dbAddChatMessage({
    id: `tg-asst-${Date.now()}`,
    role: "assistant",
    content: replyText,
  });

  let keyboard = undefined;
  if (companionRes.actionStaged) {
    const pending = await dbGetPendingUserAction(chatId.toString());
    if (pending) {
      keyboard = [
        [
          { text: "✅ Approve & Send", callback_data: `user_act_approve:${pending.id}` },
          { text: "❌ Cancel", callback_data: `user_act_reject:${pending.id}` },
        ],
      ];
    }
  }

  await sendTelegramMessage(replyText, { chatId, inlineKeyboard: keyboard });
}
