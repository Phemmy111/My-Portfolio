import { sql } from "@/lib/db";
import { executeAICompletion } from "@/lib/ai-orchestrator";
import { sendWhatsAppAudio, sendWhatsAppMessage } from "@/lib/whatsapp-gateway";
import { getNigerianTime } from "@/lib/utils";

/**
 * Generates and delivers the Proactive Morning Executive Voice Note Briefing
 * to Femi Adeleke (+2348120934828) or any workspace owner.
 */
export async function dispatchMorningExecutiveBriefing(params?: {
  force?: boolean;
  recipientPhone?: string;
}): Promise<{ success: boolean; reason?: string; transcript?: string }> {
  try {
    const { timeStr, dateStr } = getNigerianTime();
    const now = new Date();
    const watNow = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
    const hour = watNow.getHours();
    const todayYmd = watNow.toISOString().split("T")[0];

    // Only auto-trigger between 7:00 AM and 9:00 AM WAT unless force is true
    if (!params?.force) {
      if (hour < 7 || hour >= 9) {
        return { success: false, reason: `Outside morning briefing window (current hour: ${hour}:00 WAT)` };
      }
    }

    const targetPhone = params?.recipientPhone || "2348120934828";

    // 1. Check if already dispatched today
    if (!params?.force && sql) {
      try {
        await sql`
          CREATE TABLE IF NOT EXISTS obey_executive_briefings (
            id TEXT PRIMARY KEY,
            briefing_date TEXT NOT NULL,
            recipient_phone TEXT NOT NULL,
            transcript TEXT NOT NULL,
            audio_generated BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
        `;
        const existing = await sql`
          SELECT id FROM obey_executive_briefings
          WHERE briefing_date = ${todayYmd} AND recipient_phone = ${targetPhone}
          LIMIT 1
        `;
        if (existing && existing.length > 0) {
          return { success: false, reason: "Morning briefing already dispatched today" };
        }
      } catch (tableErr) {
        console.warn("[Morning Briefing] Table check error:", tableErr);
      }
    }

    // 2. Fetch pending tasks & reminders for today
    let pendingTasksSummary = "No scheduled tasks on your calendar yet.";
    if (sql) {
      try {
        const tasks = await sql`
          SELECT prompt, scheduled_at, task_type
          FROM obey_scheduled_tasks
          WHERE status = 'pending' AND recipient_phone = ${targetPhone}
          ORDER BY scheduled_at ASC
          LIMIT 5
        `;
        if (tasks && tasks.length > 0) {
          pendingTasksSummary = tasks
            .map((t: any) => `• ${t.task_type === 'research' ? 'Research' : 'Reminder'}: "${t.prompt}"`)
            .join("\n");
        }
      } catch (taskErr) {
        console.warn("[Morning Briefing] Tasks query error:", taskErr);
      }
    }

    // 3. Fetch overnight new leads across workspaces
    let newLeadsCount = 0;
    if (sql) {
      try {
        const leadRows = await sql`
          SELECT COUNT(*)::int as count
          FROM workspace_leads
          WHERE created_at >= NOW() - INTERVAL '14 HOURS'
        `;
        if (leadRows && leadRows[0]?.count) {
          newLeadsCount = leadRows[0].count;
        }
      } catch (leadErr) {
        console.warn("[Morning Briefing] Leads query error:", leadErr);
      }
    }

    // 4. Generate the charismatic executive briefing script via AI
    const aiPrompt = `You are Obey, the elite executive AI partner and right-hand for Boss Femi Adeleke.
Current Nigerian Time: ${timeStr} WAT, ${dateStr}.
Pending Tasks Today:
${pendingTasksSummary}
Overnight Leads: ${newLeadsCount} new incoming leads logged across your workspaces.

TASK:
Write a punchy, ultra-charismatic, energetic 40-second spoken morning briefing.
Tone: High-executive, warm, sharp, confident, Nigerian-savvy executive vibe (blend standard English with tasteful executive momentum like "Let's win today, Boss").
Word count limit: Maximum 75 words (MUST be spoken in under 35 seconds).
DO NOT use markdown, emojis, asterisks, or bullet points in the spoken script. Write pure spoken text suitable for Text-to-Speech synthesis.`;

    const aiRes = await executeAICompletion({
      systemPrompt: "You write elite spoken executive morning audio briefings.",
      userPrompt: aiPrompt,
      temperature: 0.7,
    });

    const spokenScript = aiRes.text.replace(/[*_#`~]/g, "").trim();

    // 5. Generate Voice Note Audio via OpenAI TTS or high-fidelity synthesis
    let audioBase64: string | null = null;
    const openAiKey = process.env.OPENAI_API_KEY;

    if (openAiKey) {
      try {
        const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openAiKey}`,
          },
          body: JSON.stringify({
            model: "tts-1",
            voice: "onyx", // Deep, charismatic, executive male voice
            input: spokenScript,
          }),
        });

        if (ttsRes.ok) {
          const arrayBuffer = await ttsRes.arrayBuffer();
          audioBase64 = Buffer.from(arrayBuffer).toString("base64");
        } else {
          console.warn("[Morning Briefing] OpenAI TTS error:", await ttsRes.text());
        }
      } catch (ttsErr) {
        console.warn("[Morning Briefing] TTS generation exception:", ttsErr);
      }
    }

    // 6. Deliver Voice Note Audio to WhatsApp
    let audioSent = false;
    if (audioBase64) {
      const audioSendRes = await sendWhatsAppAudio(
        audioBase64,
        targetPhone,
        undefined,
        "obey"
      );
      audioSent = audioSendRes.success;
    }

    // 7. Deliver formatted Executive Summary card text
    const summaryCard =
      `🎙️ *Morning Executive Briefing | Obey AI*\n` +
      `📅 *${dateStr}* (7:30 AM WAT)\n\n` +
      `Good morning Boss Femi! 🌅\n\n` +
      `📊 *Overnight Leads:* ${newLeadsCount > 0 ? `${newLeadsCount} new leads captured 🔥` : "Pipeline steady"}\n` +
      `📋 *Agenda Today:*\n${pendingTasksSummary}\n\n` +
      `💬 *Executive Voice Briefing delivered above!* Let's take the day! 🚀`;

    await sendWhatsAppMessage(summaryCard, targetPhone, "obey");

    // 8. Record in DB so it doesn't duplicate
    if (sql) {
      try {
        const briefingId = `brf_${Date.now()}`;
        await sql`
          INSERT INTO obey_executive_briefings (id, briefing_date, recipient_phone, transcript, audio_generated)
          VALUES (${briefingId}, ${todayYmd}, ${targetPhone}, ${spokenScript}, ${audioSent})
        `;
      } catch (saveErr) {
        console.warn("[Morning Briefing] Save error:", saveErr);
      }
    }

    return {
      success: true,
      transcript: spokenScript,
    };
  } catch (err: any) {
    console.error("[Morning Briefing] Dispatch error:", err);
    return { success: false, reason: err.message };
  }
}
