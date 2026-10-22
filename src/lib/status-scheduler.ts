import { dbGetDueScheduledStatuses, dbMarkStatusPosted, sql } from "@/lib/db";
import { sendWhatsAppStatusPost } from "@/lib/whatsapp-gateway";

/**
 * Checks for any scheduled WhatsApp status updates where scheduled_at <= NOW()
 * and automatically publishes them to WhatsApp Status (Stories / status@broadcast).
 */
export async function dispatchDueScheduledStatuses(): Promise<{
  processed: number;
  successes: number;
  failures: number;
}> {
  try {
    const due = await dbGetDueScheduledStatuses();
    if (!due || due.length === 0) {
      return { processed: 0, successes: 0, failures: 0 };
    }

    let successes = 0;
    let failures = 0;

    for (const item of due) {
      try {
        const instanceName = item.whatsapp_instance_name || `obey-${item.workspace_slug}`;
        const res = await sendWhatsAppStatusPost({
          text: item.content || "",
          mediaUrl: item.media_url || undefined,
          mediaType: item.media_type === "video" ? "video" : item.media_type === "image" ? "image" : undefined,
          instanceName,
          backgroundColor: item.background_color || "#075E54",
          textColor: item.text_color || "#FFFFFF",
          font: typeof item.font === "number" && item.font >= 1 ? item.font : 1,
        });

        if (res.success) {
          await dbMarkStatusPosted(item.id, res.messageId);
          successes++;
          console.log(`[Status Scheduler] Successfully posted scheduled status: ${item.id} (msg: ${res.messageId})`);
        } else {
          if (sql) {
            await sql`
              UPDATE workspace_statuses
              SET status = 'failed',
                  error_message = ${res.error || "Evolution broadcast error"},
                  updated_at = NOW()
              WHERE id = ${item.id}
            `;
          }
          failures++;
          console.warn(`[Status Scheduler] Failed to post scheduled status: ${item.id}`, res.error);
        }
      } catch (itemErr: any) {
        console.error(`[Status Scheduler] Exception on status ${item.id}:`, itemErr);
        failures++;
      }
    }

    return { processed: due.length, successes, failures };
  } catch (err: any) {
    console.error("[Status Scheduler] Global error:", err);
    return { processed: 0, successes: 0, failures: 0 };
  }
}
