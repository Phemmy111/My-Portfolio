import { getSetting } from "@/lib/settings";

export interface SheetRowPayload {
  timestamp?: string;
  phoneNumber: string;
  senderName?: string;
  role: "user" | "assistant";
  message: string;
  intent?: string;
}

/**
 * Forwards conversation turns to a Google Sheet via Webhook (Google Apps Script or n8n).
 */
export async function logToGoogleSheet(payload: SheetRowPayload): Promise<boolean> {
  try {
    const webhookUrl =
      (await getSetting("CRM_WEBHOOK_URL")) ||
      process.env.CRM_WEBHOOK_URL;

    if (!webhookUrl || !webhookUrl.startsWith("http")) {
      return false;
    }

    const body = {
      timestamp: payload.timestamp || new Date().toISOString(),
      phoneNumber: payload.phoneNumber,
      senderName: payload.senderName || "Unknown Contact",
      role: payload.role,
      message: payload.message,
      intent: payload.intent || "General Dialogue",
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    return res.ok;
  } catch (err) {
    console.warn("[Sheets Logger] Error logging to Google Sheet:", err);
    return false;
  }
}
