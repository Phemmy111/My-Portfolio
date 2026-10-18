import {
  dbGetAllWorkspaceInstancesHealth,
  dbGetQueueMetrics,
  WorkspaceInstanceHealthRecord,
} from "@/lib/db";
import { sendWhatsAppMessage } from "@/lib/whatsapp-gateway";

const sentinelAlertCooldowns = new Map<string, number>();
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown per instance

export interface SentinelReport {
  timestamp: string;
  totalInstances: number;
  healthyCount: number;
  disconnectedCount: number;
  instances: WorkspaceInstanceHealthRecord[];
  queue: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    total24h: number;
  };
  alertsSent: string[];
}

/**
 * Enterprise WhatsApp Session Sentinel.
 * Scans real-time connection status across all workspaces in Neon PostgreSQL.
 * If any workspace bot loses connection (status != 'open'), tracks outage duration
 * and alerts the business owner and platform admin with 1-click reconnect steps.
 */
export async function runWhatsAppSessionSentinel(options?: {
  notifyOwners?: boolean;
  notifyAdmin?: boolean;
}): Promise<SentinelReport> {
  const timestamp = new Date().toISOString();
  const instances = await dbGetAllWorkspaceInstancesHealth();
  const queue = await dbGetQueueMetrics();

  const healthy = instances.filter((i) => i.connectionStatus === "open");
  const disconnected = instances.filter((i) => i.connectionStatus !== "open");
  const alertsSent: string[] = [];

  const shouldNotifyOwners = options?.notifyOwners ?? false;
  const shouldNotifyAdmin = options?.notifyAdmin ?? false;
  const adminPhone = "2348120934828"; // Platform founder Femi Adeleke

  for (const item of disconnected) {
    const instKey = item.instanceName;
    const now = Date.now();
    const lastAlertTime = sentinelAlertCooldowns.get(instKey) || 0;

    // Skip if alerted within the last hour
    if (now - lastAlertTime < ALERT_COOLDOWN_MS) {
      continue;
    }

    const wsName = item.workspaceName || item.instanceName;
    const alertMessage =
      `⚠️ *Obey Sentinel Alert: WhatsApp Disconnected*\n\n` +
      `Workspace: *${wsName}*\n` +
      `Instance: \`${item.instanceName}\`\n` +
      `Current State: *${item.connectionStatus.toUpperCase()}*\n\n` +
      `Your automated customer support and status auto-reply are currently paused.\n\n` +
      `👉 *How to Restore:*\n` +
      `1. Open your Obey Settings: https://obeyai.vercel.app/dashboard/settings\n` +
      `2. Click *"Reconnect WhatsApp"*\n` +
      `3. Enter the 8-digit pairing code on your WhatsApp phone.\n\n` +
      `_This is an automated safety alert from Obey Session Sentinel._`;

    // 1. Notify workspace owner if requested
    if (shouldNotifyOwners && item.ownerPhone) {
      try {
        const res = await sendWhatsAppMessage(alertMessage, item.ownerPhone, "obey");
        if (res.success) {
          alertsSent.push(`Owner: ${item.ownerPhone} (${item.instanceName})`);
          sentinelAlertCooldowns.set(instKey, now);
        }
      } catch (err) {
        console.warn(`[Sentinel] Failed to notify owner ${item.ownerPhone}:`, err);
      }
    }

    // 2. Notify platform admin if requested and not the same recipient
    if (shouldNotifyAdmin && item.ownerPhone !== adminPhone) {
      try {
        const adminSummary =
          `🚨 *Sentinel Platform Alert*\n\n` +
          `Instance *${item.instanceName}* (${wsName}) dropped offline.\n` +
          `Owner: ${item.ownerName || "Unknown"} (+${item.ownerPhone || "None"})\n` +
          `Status: *${item.connectionStatus}*`;
        const res = await sendWhatsAppMessage(adminSummary, adminPhone, "obey");
        if (res.success) {
          alertsSent.push(`Admin: ${adminPhone} (${item.instanceName})`);
          sentinelAlertCooldowns.set(instKey, now);
        }
      } catch (err) {
        console.warn(`[Sentinel] Failed to notify admin:`, err);
      }
    }
  }

  return {
    timestamp,
    totalInstances: instances.length,
    healthyCount: healthy.length,
    disconnectedCount: disconnected.length,
    instances,
    queue,
    alertsSent,
  };
}
