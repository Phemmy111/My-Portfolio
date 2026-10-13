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

    // 1. Direct Evolution API dispatch (Self-hosted on Render connected to Neon DB)
    const evoUrl = process.env.EVOLUTION_API_URL || "https://evolution-api-latest-cx3y.onrender.com";
    const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
    if (evoUrl && waPhone) {
      try {
        const cleanPhone = waPhone.replace(/\D/g, "");
        const res = await fetch(`${evoUrl}/message/sendText/obey-session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: evoKey,
          },
          body: JSON.stringify({
            number: cleanPhone,
            text: text,
          }),
        });
        if (res.ok) return { success: true };
      } catch (err) {
        console.warn("Direct Evolution API dispatch fallback:", err);
      }
    }

    // 2. If custom n8n / automation webhook is provided, dispatch payload directly
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
