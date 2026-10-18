import { sql } from "@/lib/db";
import { executeAICompletion } from "@/lib/ai-orchestrator";
import { sendWhatsAppMessage } from "@/lib/whatsapp-gateway";

export interface WebWatcher {
  id: string;
  user_phone: string;
  workspace_id?: string;
  target_subject: string;
  search_query: string;
  target_url?: string;
  active_from: Date;
  active_until: Date;
  status: "active" | "completed" | "expired";
  last_polled_at?: Date;
  detected_result?: string;
}

export async function dbEnsureWebWatchersTable() {
  if (!sql) return;
  await sql`
    CREATE TABLE IF NOT EXISTS obey_web_watchers (
      id TEXT PRIMARY KEY,
      user_phone TEXT NOT NULL,
      workspace_id TEXT DEFAULT 'ws_femi_default',
      target_subject TEXT NOT NULL,
      search_query TEXT NOT NULL,
      target_url TEXT,
      active_from TIMESTAMPTZ NOT NULL,
      active_until TIMESTAMPTZ NOT NULL,
      status TEXT DEFAULT 'active',
      last_polled_at TIMESTAMPTZ,
      detected_result TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
}

export async function createWebWatcher(params: {
  user_phone: string;
  workspace_id?: string;
  target_subject: string;
  search_query: string;
  target_url?: string;
  active_from: Date;
  active_until: Date;
}): Promise<WebWatcher | null> {
  if (!sql) return null;
  try {
    await dbEnsureWebWatchersTable();
    const id = `watch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const [row] = await sql`
      INSERT INTO obey_web_watchers (
        id, user_phone, workspace_id, target_subject, search_query, target_url, active_from, active_until, status
      ) VALUES (
        ${id}, ${params.user_phone}, ${params.workspace_id || 'ws_femi_default'},
        ${params.target_subject}, ${params.search_query}, ${params.target_url || null},
        ${params.active_from.toISOString()}, ${params.active_until.toISOString()}, 'active'
      ) RETURNING *
    `;
    return row as WebWatcher;
  } catch (err) {
    console.error("[Web Watcher] create error:", err);
    return null;
  }
}

/**
 * Checks and executes any currently active Ghost Hunter watchers.
 * Triggered every 20 seconds via the keepalive loop.
 */
export async function runActiveWebWatchers(): Promise<number> {
  if (!sql) return 0;
  try {
    await dbEnsureWebWatchersTable();

    // 1. Mark expired watchers
    await sql`
      UPDATE obey_web_watchers
      SET status = 'expired', updated_at = NOW()
      WHERE status = 'active' AND active_until < NOW()
    `;

    // 2. Fetch active watchers in their live window
    const activeRows = await sql`
      SELECT * FROM obey_web_watchers
      WHERE status = 'active' 
        AND active_from <= NOW() 
        AND active_until >= NOW()
        AND (last_polled_at IS NULL OR last_polled_at < NOW() - INTERVAL '15 SECONDS')
      LIMIT 3
    `;

    if (!activeRows || activeRows.length === 0) return 0;

    let triggeredCount = 0;

    for (const w of activeRows as WebWatcher[]) {
      try {
        await sql`
          UPDATE obey_web_watchers 
          SET last_polled_at = NOW(), updated_at = NOW() 
          WHERE id = ${w.id}
        `;

        // Search live web for the target query
        const aiInvestigation = await executeAICompletion({
          systemPrompt: `You are Ghost Hunter for Obey AI. You monitor real-time web, social media drops, and promo codes.
Target subject: "${w.target_subject}".
Target search query: "${w.search_query}".
Determine if the promo code, voucher, drop, or announcement has been posted or made public yet.
If FOUND, extract:
1. The exact code / key
2. The security question and its correct answer
3. Clear instructions to claim immediately.

If NOT yet posted or unclear, reply with "STILL_SEARCHING".`,
          userPrompt: `Live web check at ${new Date().toISOString()} for: "${w.search_query}". Check if anything was dropped or announced.`,
          temperature: 0.2,
        });

        const resultText = aiInvestigation.text.trim();

        if (resultText && !resultText.includes("STILL_SEARCHING") && resultText.length > 20) {
          // WE FOUND IT! Deliver instant priority WhatsApp alert!
          const alertMessage =
            `⚡ *GHOST HUNTER ALERT: DROP DETECTED!* 🎯\n\n` +
            `Boss, I caught the drop you asked me to watch!\n\n` +
            `📌 *Target:* ${w.target_subject}\n\n` +
            `${resultText}\n\n` +
            `🚀 *Claim it immediately before it runs out!*`;

          await sendWhatsAppMessage(alertMessage, w.user_phone, "obey");

          await sql`
            UPDATE obey_web_watchers
            SET status = 'completed', detected_result = ${resultText}, updated_at = NOW()
            WHERE id = ${w.id}
          `;

          triggeredCount++;
          console.log(`[Ghost Hunter] Successfully detected drop for watcher ${w.id}!`);
        }
      } catch (pollErr) {
        console.warn(`[Ghost Hunter] Polling error for watcher ${w.id}:`, pollErr);
      }
    }

    return triggeredCount;
  } catch (err) {
    console.error("[Ghost Hunter] Global execution error:", err);
    return 0;
  }
}
