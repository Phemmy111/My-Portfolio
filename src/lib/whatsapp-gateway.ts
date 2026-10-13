import { getSetting } from "@/lib/settings";

/**
 * Dispatches a WhatsApp notification to Femi's phone
 * Supports Twilio, Meta Cloud API, or custom n8n Webhook
 */
export async function sendWhatsAppMessage(
  text: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const webhookUrl = await getSetting("CRM_WEBHOOK_URL");
    const waToken = await getSetting("WHATSAPP_API_TOKEN");
    const waPhone = await getSetting("WHATSAPP_PHONE_NUMBER");

    // 1. If custom n8n / automation webhook is provided, dispatch payload directly
    if (webhookUrl && webhookUrl.startsWith("http")) {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "whatsapp",
          recipient: waPhone || "08120934828",
          message: text,
          timestamp: new Date().toISOString(),
        }),
      });
      if (res.ok) return { success: true };
    }

    // 2. If Meta Cloud API token is configured
    if (waToken && waPhone) {
      // Meta Graph API WhatsApp call
      const res = await fetch(`https://graph.facebook.com/v19.0/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${waToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: waPhone.replace(/\D/g, ""),
          type: "text",
          text: { body: text },
        }),
      });

      const data = await res.json();
      if (data.messages) return { success: true };
      return { success: false, error: data.error?.message || "Meta API error" };
    }

    return { success: false, error: "WhatsApp credentials / webhook not configured" };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
