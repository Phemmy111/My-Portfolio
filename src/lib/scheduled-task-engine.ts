import { sql } from "@/lib/db";
import { executeAICompletion } from "@/lib/ai-orchestrator";
import { sendWhatsAppMessage } from "@/lib/whatsapp-gateway";
import { getNigerianTime, formatToWAT, formatDateTimeWAT } from "@/lib/utils";

export interface ScheduledTask {
  id: string;
  workspace_id?: string | null;
  instance_name?: string | null;
  recipient_phone: string;
  sender_name?: string | null;
  task_type: "reminder" | "research" | "custom";
  prompt: string;
  context?: string | null;
  status: "pending" | "completed" | "cancelled" | "failed" | "processing";
  scheduled_at: string;
  executed_at?: string | null;
  result_text?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * In-memory map of active short-term timeouts (under 10 minutes)
 * to ensure sub-minute precision delivery.
 */
const activeTimeouts = new Map<string, NodeJS.Timeout>();

/**
 * Initializes the scheduled tasks table and index if not already present.
 */
export async function dbEnsureScheduledTasksTable() {
  if (!sql) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS obey_scheduled_tasks (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        instance_name TEXT,
        recipient_phone TEXT NOT NULL,
        sender_name TEXT,
        task_type TEXT NOT NULL DEFAULT 'reminder',
        prompt TEXT NOT NULL,
        context TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        scheduled_at TIMESTAMPTZ NOT NULL,
        executed_at TIMESTAMPTZ,
        result_text TEXT,
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_obey_scheduled_tasks_due 
      ON obey_scheduled_tasks (status, scheduled_at)
    `;
  } catch (err) {
    console.warn("[Scheduled Task] Table ensure warning:", err);
  }
}

/**
 * Schedules a new reminder or background research task.
 */
export async function dbScheduleTask(params: {
  workspace_id?: string | null;
  instance_name?: string | null;
  recipient_phone: string;
  sender_name?: string | null;
  task_type?: "reminder" | "research" | "custom";
  prompt: string;
  context?: string | null;
  scheduled_at: string | Date;
}): Promise<ScheduledTask | null> {
  if (!sql) return null;
  try {
    await dbEnsureScheduledTasksTable();
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const scheduledIso =
      params.scheduled_at instanceof Date
        ? params.scheduled_at.toISOString()
        : new Date(params.scheduled_at).toISOString();

    const rows = await sql`
      INSERT INTO obey_scheduled_tasks (
        id,
        workspace_id,
        instance_name,
        recipient_phone,
        sender_name,
        task_type,
        prompt,
        context,
        status,
        scheduled_at,
        created_at,
        updated_at
      ) VALUES (
        ${taskId},
        ${params.workspace_id || null},
        ${params.instance_name || "obey"},
        ${params.recipient_phone},
        ${params.sender_name || "Obey"},
        ${params.task_type || "reminder"},
        ${params.prompt},
        ${params.context || null},
        'pending',
        ${scheduledIso},
        NOW(),
        NOW()
      )
      RETURNING *
    `;

    const task = rows?.[0] as ScheduledTask;
    if (task) {
      // If due within 10 minutes, arm in-memory timer for precision delivery
      armInMemoryTimerIfSoon(task);
    }
    return task;
  } catch (err) {
    console.error("[Scheduled Task] Schedule error:", err);
    return null;
  }
}

/**
 * Arms an in-memory setTimeout if the task is due within 10 minutes.
 */
function armInMemoryTimerIfSoon(task: ScheduledTask) {
  try {
    const dueTime = new Date(task.scheduled_at).getTime();
    const now = Date.now();
    const diffMs = dueTime - now;

    // Only set timeout if due between 1 second and 10 minutes
    if (diffMs > 1000 && diffMs <= 10 * 60 * 1000) {
      if (activeTimeouts.has(task.id)) {
        clearTimeout(activeTimeouts.get(task.id));
      }
      const t = setTimeout(() => {
        activeTimeouts.delete(task.id);
        executeSingleScheduledTask(task.id).catch((e) =>
          console.warn(`[Scheduled Task] Precision dispatch error on ${task.id}:`, e)
        );
      }, diffMs);
      activeTimeouts.set(task.id, t);
    }
  } catch (e) {
    console.warn("[Scheduled Task] arm timer error:", e);
  }
}

/**
 * Executes a single due scheduled task by ID.
 */
export async function executeSingleScheduledTask(taskId: string): Promise<boolean> {
  if (!sql) return false;
  try {
    const rows = await sql`
      SELECT * FROM obey_scheduled_tasks 
      WHERE id = ${taskId} AND status = 'pending'
      LIMIT 1
    `;
    if (!rows || rows.length === 0) return false;
    const task = rows[0] as ScheduledTask;

    // Atomically lock task to 'processing'
    await sql`
      UPDATE obey_scheduled_tasks
      SET status = 'processing', updated_at = NOW()
      WHERE id = ${task.id} AND status = 'pending'
    `;

    let deliveryText = "";
    const cleanPhone = task.recipient_phone.replace(/\D/g, "");
    const instance = task.instance_name || "obey";

    if (task.task_type === "research") {
      // Run AI live research on the topic
      const researchAI = await executeAICompletion({
        systemPrompt: `You are Obey AI, the executive operations assistant for ${task.sender_name || "Boss"}.
You were asked to go online, research, and report back on a specific topic.
Provide a clear, well-structured, up-to-date briefing with emojis and bullet points. Output only the finished report.`,
        userPrompt: `Topic to research and report on: "${task.prompt}". Extra context: ${task.context || "None"}.`,
        temperature: 0.6,
      });

      deliveryText =
        `🔍 *Scheduled Research Report for Boss!*\n\n` +
        `You asked me to check into:\n*${task.prompt}*\n\n` +
        `📋 *Here is your briefing:*\n\n` +
        `${researchAI.text}\n\n` +
        `💡 *Task completed on schedule.* Have a productive day! 🚀`;
    } else {
      // Standard reminder
      deliveryText =
        `⏰ *Scheduled Reminder, Boss!*\n\n` +
        `Hey Boss, this is your scheduled reminder:\n` +
        `👉 *${task.prompt}*\n\n` +
        `🕒 *Scheduled for:* ${formatToWAT(task.scheduled_at)} WAT\n\n` +
        `Hope this helps you stay ahead of everything! 🚀`;
    }

    // Send WhatsApp message
    const sendRes = await sendWhatsAppMessage(deliveryText, cleanPhone, instance);

    if (sendRes.success) {
      await sql`
        UPDATE obey_scheduled_tasks
        SET status = 'completed',
            executed_at = NOW(),
            result_text = ${deliveryText},
            updated_at = NOW()
        WHERE id = ${task.id}
      `;
      console.log(`[Scheduled Task] Successfully dispatched task ${task.id} to ${cleanPhone}`);
      return true;
    } else {
      await sql`
        UPDATE obey_scheduled_tasks
        SET status = 'failed',
            error_message = ${sendRes.error || "Evolution dispatch failed"},
            updated_at = NOW()
        WHERE id = ${task.id}
      `;
      console.warn(`[Scheduled Task] Failed to dispatch task ${task.id}:`, sendRes.error);
      return false;
    }
  } catch (err: any) {
    console.error(`[Scheduled Task] Exception executing task ${taskId}:`, err);
    try {
      if (sql) {
        await sql`
          UPDATE obey_scheduled_tasks
          SET status = 'failed', error_message = ${err.message || "Execution exception"}, updated_at = NOW()
          WHERE id = ${taskId}
        `;
      }
    } catch {}
    return false;
  }
}

/**
 * Checks for any pending scheduled tasks where scheduled_at <= NOW()
 * and delivers them to the respective WhatsApp numbers.
 */
export async function dispatchDueScheduledTasks(): Promise<{
  processed: number;
  successes: number;
  failures: number;
}> {
  if (!sql) return { processed: 0, successes: 0, failures: 0 };
  try {
    await dbEnsureScheduledTasksTable();
    const dueRows = await sql`
      SELECT id FROM obey_scheduled_tasks
      WHERE status = 'pending' AND scheduled_at <= NOW()
      ORDER BY scheduled_at ASC
      LIMIT 10
    `;

    if (!dueRows || dueRows.length === 0) {
      return { processed: 0, successes: 0, failures: 0 };
    }

    let successes = 0;
    let failures = 0;

    for (const r of dueRows) {
      const ok = await executeSingleScheduledTask(r.id);
      if (ok) successes++;
      else failures++;
    }

    return { processed: dueRows.length, successes, failures };
  } catch (err) {
    console.error("[Scheduled Task] Global dispatch error:", err);
    return { processed: 0, successes: 0, failures: 0 };
  }
}

/**
 * Retrieves pending scheduled tasks for a given phone number.
 */
export async function dbGetPendingTasksForPhone(phone: string): Promise<ScheduledTask[]> {
  if (!sql) return [];
  try {
    const cleanPhone = phone.replace(/\D/g, "");
    const rows = await sql`
      SELECT * FROM obey_scheduled_tasks
      WHERE (recipient_phone = ${cleanPhone} OR recipient_phone = ${phone})
        AND status = 'pending'
      ORDER BY scheduled_at ASC
      LIMIT 10
    `;
    return (rows || []) as ScheduledTask[];
  } catch (err) {
    console.error("[Scheduled Task] Get pending error:", err);
    return [];
  }
}

/**
 * Cancels a pending scheduled task for a user.
 */
export async function dbCancelTask(taskId: string, phone: string): Promise<boolean> {
  if (!sql) return false;
  try {
    const cleanPhone = phone.replace(/\D/g, "");
    const res = await sql`
      UPDATE obey_scheduled_tasks
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = ${taskId} 
        AND (recipient_phone = ${cleanPhone} OR recipient_phone = ${phone})
        AND status = 'pending'
      RETURNING id
    `;
    if (activeTimeouts.has(taskId)) {
      clearTimeout(activeTimeouts.get(taskId));
      activeTimeouts.delete(taskId);
    }
    return Boolean(res && res.length > 0);
  } catch (err) {
    console.error("[Scheduled Task] Cancel error:", err);
    return false;
  }
}

/**
 * Intelligent parser that identifies if a user's message is asking to schedule a reminder,
 * research a topic later, check pending tasks, or cancel an existing task.
 */
export async function handleScheduledTaskConversation(params: {
  userText: string;
  historyText?: string;
  recipientPhone: string;
  workspaceId?: string | null;
  instanceName?: string | null;
  senderName?: string | null;
}): Promise<{ handled: boolean; replyText?: string }> {
  const { userText, historyText = "", recipientPhone, workspaceId, instanceName, senderName } = params;
  const lower = userText.toLowerCase().trim();

  // Fast pre-filter: Check if message has task/reminder keywords
  const isListQuery =
    /^(?:what(?:'s|\s+are)?\s+(?:my\s+)?(?:scheduled\s+)?(?:tasks|reminders)|show\s+(?:my\s+)?(?:scheduled\s+)?(?:tasks|reminders)|list\s+(?:my\s+)?(?:scheduled\s+)?(?:tasks|reminders)|do\s+i\s+have\s+any\s+(?:reminders|scheduled\s+tasks))\b/i.test(lower);

  const isCancelQuery =
    /^(?:cancel|delete|remove|clear)\s+(?:task|reminder|scheduled\s+task)\b/i.test(lower) ||
    /^(?:cancel|delete|remove)\s+(?:all\s+)?(?:my\s+)?(?:reminders|tasks)\b/i.test(lower);

  const isTaskOrReminderRequest =
    /\b(remind|reminder|set\s+a\s+reminder|put\s+a\s+reminder|schedule\s+a\s+task|scheduled\s+task)\b/i.test(lower) ||
    /\b(go\s+online|search\s+online|look\s+up|research|find\s+out)\b.*\b(later|get\s+back\s+to\s+me|at\s+\d+|in\s+\d+|tomorrow|tonight)\b/i.test(lower) ||
    (/\b(later|in\s+\d+\s*(?:mins?|minutes?|hours?|hrs?|days?)|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|tomorrow)\b/i.test(lower) &&
      historyText.toLowerCase().includes("when should i remind you"));

  if (!isListQuery && !isCancelQuery && !isTaskOrReminderRequest) {
    return { handled: false };
  }

  const { timeStr: currentWatTime, dateStr: currentWatDate } = getNigerianTime();
  const now = new Date();

  // 1. Handle List Query
  if (isListQuery) {
    const pending = await dbGetPendingTasksForPhone(recipientPhone);
    if (pending.length === 0) {
      return {
        handled: true,
        replyText:
          `📋 *No Pending Scheduled Tasks, Boss!*\n\n` +
          `You don't have any reminders or research tasks queued right now.\n\n` +
          `💡 *Try telling me:*\n` +
          `• "Remind me to call John in 30 minutes"\n` +
          `• "Remind me tomorrow at 9 AM to review accounts"\n` +
          `• "Go online and look for iPhone 16 price, get back to me in 2 hours"`,
      };
    }

    const taskList = pending
      .map((t, idx) => {
        const icon = t.task_type === "research" ? "🔍" : "📌";
        return `${idx + 1}. ${icon} *${t.prompt}*\n   🕒 *Due:* ${formatDateTimeWAT(t.scheduled_at)} WAT`;
      })
      .join("\n\n");

    return {
      handled: true,
      replyText:
        `📋 *Your Active Scheduled Tasks & Reminders (${pending.length}):*\n\n` +
        `${taskList}\n\n` +
        `💡 *To cancel a task*, simply say: "Cancel task 1" or "Cancel reminder for [topic]"`,
    };
  }

  // 2. Handle Cancel Query
  if (isCancelQuery) {
    const pending = await dbGetPendingTasksForPhone(recipientPhone);
    if (pending.length === 0) {
      return {
        handled: true,
        replyText: `You don't have any active reminders or scheduled tasks to cancel right now, Boss! 👍`,
      };
    }

    // Check if user specified a number like "cancel task 1"
    const numberMatch = lower.match(/(?:task|reminder)\s*#?\s*(\d+)/i);
    if (numberMatch && numberMatch[1]) {
      const idx = parseInt(numberMatch[1], 10) - 1;
      if (idx >= 0 && idx < pending.length) {
        const target = pending[idx];
        await dbCancelTask(target.id, recipientPhone);
        return {
          handled: true,
          replyText: `🗑️ *Task Cancelled!*\n\nI have cancelled your scheduled reminder:\n👉 *${target.prompt}*`,
        };
      }
    }

    // Check if user said "cancel all"
    if (lower.includes("all")) {
      for (const t of pending) {
        await dbCancelTask(t.id, recipientPhone);
      }
      return {
        handled: true,
        replyText: `🗑️ *All Done!* I have cancelled all ${pending.length} of your pending scheduled reminders.`,
      };
    }

    // Otherwise, cancel the most recently scheduled one
    const mostRecent = pending[0];
    await dbCancelTask(mostRecent.id, recipientPhone);
    return {
      handled: true,
      replyText: `🗑️ *Task Cancelled!*\n\nI have cancelled your scheduled reminder:\n👉 *${mostRecent.prompt}*`,
    };
  }

  // 3. Handle Schedule / Ask-Time Request with AI Parsing
  try {
    const parsingPrompt = `You are a high-precision time & scheduling parser for Obey AI.
Your job is to parse the user's request for a reminder or scheduled task.

Current Nigerian Local Time (WAT): ${currentWatTime}
Current Date (WAT): ${currentWatDate}
Current Reference UTC Timestamp: ${now.toISOString()}

Determine the user's intent:
1. Is the user asking to be reminded of something or asking Obey to research something later?
2. What is the task prompt (what to remind or research)?
3. Did the user specify a time or delay (e.g. "in 10 minutes", "in 2 hours", "tomorrow at 9am", "at 4:30 pm", "later")?
4. If the user said "remind me later" WITHOUT specifying any time or duration, set "needs_time": true.
5. If the time is provided or inferred, compute "scheduled_iso": the exact future ISO 8601 string calculated relative to the current WAT time.
6. Provide "scheduled_human": a friendly string describing when it is due in WAT (e.g. "Today at 4:00 AM WAT (in 45 minutes)", "Tomorrow at 9:00 AM WAT").

Return ONLY a valid JSON object matching this schema:
{
  "is_task": boolean,
  "needs_time": boolean,
  "task_type": "reminder" | "research",
  "task_prompt": string,
  "scheduled_iso": string | null,
  "scheduled_human": string | null
}`;

    const userContext = `${historyText ? `RECENT CONVERSATION:\n${historyText}\n\n` : ""}User message: "${userText}"`;

    const aiRes = await executeAICompletion({
      systemPrompt: parsingPrompt,
      userPrompt: userContext,
      temperature: 0.1,
    });

    const cleanedJson = aiRes.text.replace(/```json/gi, "").replace(/```/g, "").trim();
    let parsed: any = null;
    try {
      parsed = JSON.parse(cleanedJson);
    } catch {
      const match = cleanedJson.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    if (!parsed || !parsed.is_task) {
      return { handled: false };
    }

    // Case A: User said "remind me later" or didn't provide a time
    if (parsed.needs_time || !parsed.scheduled_iso) {
      const promptSnippet = parsed.task_prompt || "this task";
      return {
        handled: true,
        replyText:
          `Sure Boss! When should I remind you about *${promptSnippet}*? ⏰\n\n` +
          `• *In a few minutes:* e.g. "In 15 minutes"\n` +
          `• *In a few hours:* e.g. "In 2 hours"\n` +
          `• *At a specific time:* e.g. "At 4:30 PM" or "Tomorrow at 9:00 AM"`,
      };
    }

    // Case B: Time is resolved -> Schedule the task!
    const targetDate = new Date(parsed.scheduled_iso);
    if (isNaN(targetDate.getTime()) || targetDate.getTime() <= now.getTime()) {
      // If parsed time is in the past or invalid, ask for clarification
      return {
        handled: true,
        replyText: `Boss, please specify a time in the future! E.g. "In 30 minutes", "In 2 hours", or "Tomorrow at 8 AM".`,
      };
    }

    const scheduled = await dbScheduleTask({
      workspace_id: workspaceId,
      instance_name: instanceName || "obey",
      recipient_phone: recipientPhone,
      sender_name: senderName || "Obey",
      task_type: parsed.task_type || "reminder",
      prompt: parsed.task_prompt || userText,
      scheduled_at: targetDate,
    });

    if (!scheduled) {
      return {
        handled: true,
        replyText: `⚠️ Could not save the scheduled task right now. Please try again!`,
      };
    }

    const humanTime = parsed.scheduled_human || `${formatDateTimeWAT(targetDate)} WAT`;

    if (parsed.task_type === "research") {
      return {
        handled: true,
        replyText:
          `🔍 *Research Task Scheduled, Boss!*\n\n` +
          `📌 *Topic:* ${parsed.task_prompt}\n` +
          `🕒 *Briefing Due:* ${humanTime}\n\n` +
          `I will research this online and deliver a full report right here on WhatsApp when it's time! 🚀`,
      };
    }

    return {
      handled: true,
      replyText:
        `⏰ *Reminder Scheduled, Boss!*\n\n` +
        `📌 *Task:* ${parsed.task_prompt}\n` +
        `🕒 *Due:* ${humanTime}\n\n` +
        `I will ping you right here on WhatsApp when it's time. Relax, I've got your back! 🚀`,
    };
  } catch (err) {
    console.error("[Scheduled Task] Parsing error:", err);
    return { handled: false };
  }
}
