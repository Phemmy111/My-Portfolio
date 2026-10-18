import { sql } from "@/lib/db";
import { executeAICompletion } from "@/lib/ai-orchestrator";
import { sendWhatsAppMessage } from "@/lib/whatsapp-gateway";

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

/**
 * Checks for leads in Obey Business workspaces who inquired > 2 hours ago
 * but haven't converted or received a follow-up.
 * Dispatches an autonomous high-converting sales follow-up.
 */
export async function runAutonomousLeadCloser(): Promise<{ followedUp: number }> {
  if (!sql) return { followedUp: 0 };
  try {
    await dbEnsureLeadFollowupTable();

    // Find leads from the last 24 hours where last message was > 2 hours ago
    const candidates = await sql`
      SELECT l.id, l.workspace_id, l.phone, l.name, l.last_message, l.intent_summary,
             w.name as workspace_name, w.whatsapp_instance_name, w.slug as workspace_slug
      FROM workspace_leads l
      JOIN workspaces w ON l.workspace_id = w.id
      WHERE l.created_at >= NOW() - INTERVAL '24 HOURS'
        AND l.created_at <= NOW() - INTERVAL '2 HOURS'
        AND l.phone NOT IN (SELECT lead_phone FROM obey_lead_followups)
        AND l.phone NOT LIKE '%@g.us'
      ORDER BY l.created_at DESC
      LIMIT 3
    `;

    if (!candidates || candidates.length === 0) {
      return { followedUp: 0 };
    }

    let count = 0;

    for (const lead of candidates) {
      try {
        const cleanPhone = lead.phone.replace(/\D/g, "");
        if (cleanPhone.length < 10) continue;

        const instance = lead.whatsapp_instance_name || (lead.workspace_slug ? `obey-${lead.workspace_slug}` : "obey");

        // Generate tailored high-converting follow-up
        const aiPrompt = `You are the lead sales specialist for "${lead.workspace_name}".
Customer name: ${lead.name || "there"}.
Customer's previous inquiry: "${lead.last_message || lead.intent_summary || "course pricing"}".

TASK:
Write a warm, respectful, zero-pressure 2-sentence follow-up on WhatsApp.
Tone: Helpful, inviting, professional Nigerian business vibe.
Objective: Ask if they need help enrolling or completing their access.
DO NOT sound like spam or a robot. Be genuinely helpful. Keep under 40 words.`;

        const aiRes = await executeAICompletion({
          systemPrompt: "You write elite, natural WhatsApp sales re-engagement follow-ups.",
          userPrompt: aiPrompt,
          temperature: 0.6,
        });

        const followUpText = aiRes.text.replace(/[*_#`~]/g, "").trim();

        const fullMessage =
          `👋 Hello ${lead.name && lead.name !== "WhatsApp User" ? lead.name : "there"}!\n\n` +
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
    return { followedUp: 0 };
  }
}
