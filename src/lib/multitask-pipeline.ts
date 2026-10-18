import { executeAICompletion } from "@/lib/ai-orchestrator";
import { dbScheduleTask, computeTargetScheduledDate } from "@/lib/scheduled-task-engine";
import { sql } from "@/lib/db";
import { getNigerianTime } from "@/lib/utils";

export interface MultiTaskResult {
  handled: boolean;
  replyText?: string;
  actionsExecuted?: string[];
}

export async function processMultiTaskVoiceOrText(params: {
  userText: string;
  recipientPhone: string;
  workspaceId: string;
  instanceName?: string;
  isVoiceNote?: boolean;
}): Promise<MultiTaskResult> {
  const { userText, recipientPhone, workspaceId, instanceName, isVoiceNote } = params;
  const lower = userText.toLowerCase().trim();

  // Fast check: Check if text contains compound conjunctions and action verbs
  const hasCompoundConj = /\b(and\s+(?:also\s+)?remind|and\s+remind|and\s+schedule|and\s+search|and\s+log|and\s+record|and\s+save)\b/i.test(lower);
  const hasExpenseWord = /\b(expense|spend|spent|paid|cost|bought)\b/i.test(lower) && /\b(\d+(?:k|,\d{3}|\s*naira|\s*thousand)?)\b/i.test(lower);
  const hasReminderWord = /\b(remind|reminder|tomorrow|in\s+\d+|at\s+\d+)\b/i.test(lower);

  // If not a compound request, let single-intent pipeline handle it
  if (!((hasExpenseWord && hasReminderWord) || (hasCompoundConj && hasReminderWord))) {
    return { handled: false };
  }

  try {
    const { timeStr: watTime, dateStr: watDate } = getNigerianTime();
    const prompt = `You are the Multitask Voice-to-Action Parser for Obey AI.
Current WAT Time: ${watTime}, ${watDate}.
User message (${isVoiceNote ? "Spoken voice note" : "Text"}): "${userText}"

Deconstruct the user's message into compound actions:
1. "expense": { "amount_naira": number, "description": string } | null
2. "reminder": { "task_prompt": string, "delay_minutes": number | null, "target_wat_time": string | null } | null
3. "note": string | null

Return ONLY a valid JSON object:
{
  "is_multitask": boolean,
  "expense": { "amount_naira": number, "description": string } | null,
  "reminder": { "task_prompt": string, "delay_minutes": number | null, "target_wat_time": string | null } | null,
  "summary": string
}`;

    const aiRes = await executeAICompletion({
      systemPrompt: "You parse multi-action compound requests into structured JSON.",
      userPrompt: prompt,
      temperature: 0.1,
    });

    const cleaned = aiRes.text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed || !parsed.is_multitask) {
      return { handled: false };
    }

    const executed: string[] = [];

    // 1. Execute expense logging if present
    if (parsed.expense && parsed.expense.amount_naira > 0) {
      if (sql) {
        try {
          await sql`
            CREATE TABLE IF NOT EXISTS obey_business_expenses (
              id TEXT PRIMARY KEY,
              workspace_id TEXT DEFAULT 'ws_femi_default',
              amount NUMERIC NOT NULL,
              description TEXT NOT NULL,
              recorded_by TEXT,
              created_at TIMESTAMPTZ DEFAULT NOW()
            );
          `;
          const expId = `exp_${Date.now()}`;
          await sql`
            INSERT INTO obey_business_expenses (id, workspace_id, amount, description, recorded_by)
            VALUES (${expId}, ${workspaceId}, ${parsed.expense.amount_naira}, ${parsed.expense.description}, ${recipientPhone})
          `;
          executed.push(`💰 *Expense Logged:* ₦${Number(parsed.expense.amount_naira).toLocaleString()} for ${parsed.expense.description}`);
        } catch (expErr) {
          console.warn("[MultiTask] Expense log error:", expErr);
        }
      }
    }

    // 2. Execute reminder / scheduling if present
    if (parsed.reminder && parsed.reminder.task_prompt) {
      const timeParsed = computeTargetScheduledDate({ text: userText });
      let targetDate = timeParsed.targetDate;

      if (!targetDate && parsed.reminder.delay_minutes) {
        targetDate = new Date(Date.now() + parsed.reminder.delay_minutes * 60 * 1000);
      }

      if (targetDate) {
        const scheduled = await dbScheduleTask({
          workspace_id: workspaceId,
          instance_name: instanceName || "obey",
          recipient_phone: recipientPhone,
          sender_name: "Obey",
          task_type: "reminder",
          prompt: parsed.reminder.task_prompt,
          scheduled_at: targetDate,
        });

        if (scheduled) {
          executed.push(`⏰ *Reminder Set:* "${parsed.reminder.task_prompt}" (${timeParsed.humanDescription || targetDate.toLocaleTimeString()})`);
        }
      }
    }

    if (executed.length === 0) {
      return { handled: false };
    }

    const replyText =
      `🚗 *Multitask Voice-to-Action Executed, Boss!*\n\n` +
      executed.map((action, i) => `${i + 1}. ${action}`).join("\n") +
      `\n\nRelax Boss, everything has been captured and automated! 🚀`;

    return {
      handled: true,
      replyText,
      actionsExecuted: executed,
    };
  } catch (err) {
    console.warn("[MultiTask] Processing error:", err);
    return { handled: false };
  }
}
