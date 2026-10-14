/**
 * Dispatches a WhatsApp message via the self-hosted Evolution API on Render.
 *
 * @param text      - The message body to send.
 * @param recipient - The E.164 phone number to send TO (e.g. "2348120934828").
 *                    Defaults to Femi's personal number if omitted.
 */
export async function sendWhatsAppMessage(
  text: string,
  recipient?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const evoUrl =
      process.env.EVOLUTION_API_URL ||
      "https://evolution-api-latest-cx3y.onrender.com";
    const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
    const instanceName =
      process.env.EVOLUTION_INSTANCE_NAME || "obey";

    // Femi's personal WhatsApp number — fallback when no recipient supplied
    const targetPhone = (recipient || "2348120934828").replace(/\D/g, "");

    const res = await fetch(
      `${evoUrl}/message/sendText/${instanceName}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: evoKey,
        },
        body: JSON.stringify({
          number: targetPhone,
          text,
        }),
      }
    );

    if (res.ok) {
      return { success: true };
    }

    const errBody = await res.text();
    console.error("[WhatsApp] Evolution API error:", res.status, errBody);
    return { success: false, error: `HTTP ${res.status}: ${errBody}` };
  } catch (err: any) {
    console.error("[WhatsApp] sendWhatsAppMessage exception:", err);
    return { success: false, error: err.message };
  }
}
