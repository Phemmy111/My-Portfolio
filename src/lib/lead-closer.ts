import { sql } from "@/lib/db";
import { executeAICompletion } from "@/lib/ai-orchestrator";
import { sendWhatsAppMessage } from "@/lib/whatsapp-gateway";
import { getNigerianTime } from "@/lib/utils";

export async function dbEnsureLeadFollowupTable() {
  if (!sql) return;
  await sql`
    CREATE TABLE IF NOT EXISTS obey_lead_followups (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      lead_phone TEXT NOT NULL,
      lead_name TEXT,
      followup_text TEXT NOT NULL,
      sent_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
}

const BUYER_INTENT_REGEX =
  /\b(price|cost|how much|fee|fees|pay|payment|enroll|enrol|register|registration|admission|join|package|pricing|course|buy|purchase|bank|account|discount|installments)\b/i;

/**
 * Autonomous Lead Closer & Sales Follow-Up Engine.
 * Only targets qualified leads who expressed genuine buying/pricing intent,
 * strictly during WAT business hours (9:00 AM - 7:00 PM),
 * strictly when auto_lead_closer_enabled is true for the workspace,
 * strictly excludes the owner phone and group chats,
 * and limits follow-up to exactly 1 per lead lifetime.
 */
export async function runAutonomousLeadCloser(): Promise<{ followedUp: number; reason?: string }> {
  if (!sql) return { followedUp: 0, reason: "no_db" };

  // 1. Business Hours Guard (9:00 AM to 7:00 PM WAT)
  const { timeStr } = getNigerianTime();
  const hourMatch = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (hourMatch) {
    let hour = parseInt(hourMatch[1], 10);
    const ampm = hourMatch[3].toUpperCase();
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    if (hour < 9 || hour >= 19) {
      return { followedUp: 0, reason: `Outside business hours (${timeStr} WAT)` };
    }
  }

  try {
    await dbEnsureLeadFollowupTable();

    // 2. Fetch candidates only for workspaces where auto_lead_closer_enabled = true
    const candidates = await sql`
      SELECT l.id, l.workspace_id, l.phone, l.name, l.last_message, l.intent_summary,
             w.name as workspace_name, w.whatsapp_instance_name, w.slug as workspace_slug,
             w.owner_phone
      FROM workspace_leads l
      JOIN workspaces w ON l.workspace_id = w.id
      WHERE w.auto_lead_closer_enabled = true
        AND l.created_at >= NOW() - INTERVAL '24 HOURS'
        AND l.created_at <= NOW() - INTERVAL '2 HOURS'
        AND l.phone NOT IN (SELECT lead_phone FROM obey_lead_followups)
        AND l.phone NOT LIKE '%@g.us'
        AND l.phone NOT LIKE '%@broadcast'
      ORDER BY l.created_at DESC
      LIMIT 10
    `;

    if (!candidates || candidates.length === 0) {
      return { followedUp: 0, reason: "no_eligible_leads" };
    }

    let count = 0;

    for (const lead of candidates) {
      // Maximum 2 follow-ups per keepalive execution
      if (count >= 2) break;

      try {
        const cleanPhone = (lead.phone || "").replace(/\D/g, "");
        const ownerClean = (lead.owner_phone || "").replace(/\D/g, "");

        // Exclude owner phone or test numbers
        if (!cleanPhone || cleanPhone.length < 11 || cleanPhone.length > 14) continue;
        if (cleanPhone === ownerClean || cleanPhone === "2348120934828") continue;

        // 3. Buyer Intent Filter
        const combinedInquiry = `${lead.last_message || ""} ${lead.intent_summary || ""}`;
        if (!BUYER_INTENT_REGEX.test(combinedInquiry)) {
          continue;
        }

        const instance = lead.whatsapp_instance_name || (lead.workspace_slug ? `obey-${lead.workspace_slug}` : "obey");

        // 4. Generate tailored high-converting follow-up
        const aiPrompt = `You are the lead sales specialist for "${lead.workspace_name}".
Customer name: ${lead.name && lead.name !== "WhatsApp User" ? lead.name : "there"}.
Customer's previous inquiry: "${combinedInquiry.slice(0, 150)}".

TASK:
Write a warm, respectful, zero-pressure 2-sentence follow-up on WhatsApp.
Tone: Helpful, inviting, professional Nigerian business vibe.
Objective: Ask if they need help completing their enrollment or have any questions.
DO NOT sound like spam or a robot. Be genuinely helpful. Keep under 35 words.`;

        const aiRes = await executeAICompletion({
          systemPrompt: "You write elite, natural WhatsApp sales re-engagement follow-ups.",
          userPrompt: aiPrompt,
          temperature: 0.6,
        });

        const followUpText = (aiRes.text || "").replace(/[*_#`~]/g, "").trim();
        if (!followUpText || followUpText.length < 10) continue;

        const greetingName = lead.name && lead.name !== "WhatsApp User" ? lead.name : "there";
        const fullMessage =
          `👋 Hello ${greetingName}!\n\n` +
          `${followUpText}\n\n` +
          `Feel free to reply right here whenever you're ready! 👍`;

        const sendRes = await sendWhatsAppMessage(fullMessage, cleanPhone, instance);

        if (sendRes.success) {
          const fid = `flw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          await sql`
            INSERT INTO obey_lead_followups (id, workspace_id, lead_phone, lead_name, followup_text)
            VALUES (${fid}, ${lead.workspace_id}, ${lead.phone}, ${lead.name}, ${fullMessage})
          `;
          count++;
          console.log(`[Lead Closer] Sent follow-up to ${cleanPhone} for ${lead.workspace_name}`);
        }
      } catch (leadErr) {
        console.warn(`[Lead Closer] Error processing lead ${lead.id}:`, leadErr);
      }
    }

    return { followedUp: count };
  } catch (err) {
    console.error("[Lead Closer] Execution error:", err);
    return { followedUp: 0, reason: "execution_error" };
  }
}

