/**
 * Dispatches a WhatsApp message via the self-hosted Evolution API on Render.
 *
 * @param text      - The message body to send.
 * @param recipient - The E.164 phone number to send TO (e.g. "2348120934828").
 *                    Defaults to Femi's personal number if omitted.
 */
function cleanWhatsAppFormatting(text: string): string {
  if (!text) return "";
  let clean = text;
  clean = clean.replace(/^\s*\*\s+\*([^*]+)\*:/gm, "• *$1:*");
  clean = clean.replace(/^\s*\*\s+\*([^*]+)\*/gm, "• *$1*");
  clean = clean.replace(/\*\s+\*([^*]+)\*:/g, "• *$1:*");
  clean = clean.replace(/\*\s+\*([^*]+)\*/g, "• *$1*");
  clean = clean.replace(/\*\*([^*]+)\*\*/g, "*$1*");
  clean = clean.replace(/^#{1,4}\s+(.+)$/gm, "*$1*");
  clean = clean.replace(/^[-*]\s+/gm, "• ");
  return clean.trim();
}

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

    // Femi's personal WhatsApp number — fallback when no recipient supplied or when recipient is an internal LID
    let cleaned = (recipient || "2348120934828")
      .replace(/@s\.whatsapp\.net|@lid|@g\.us/g, "")
      .replace(/\D/g, "");

    // If cleaned is not a standard international phone number (e.g. 15-digit internal WhatsApp LID or empty), default to Femi's phone
    if (!cleaned || cleaned.length > 13 || cleaned.length < 10) {
      cleaned = "2348120934828";
    }

    const targetPhone = cleaned;

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
          text: cleanWhatsAppFormatting(text),
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

/**
 * Fetches base64 media for incoming WhatsApp messages (voice notes, images, documents)
 * Checks webhook payload base64 first, falls back to Evolution API endpoint:
 * POST /chat/getBase64FromMediaMessage/${instanceName}
 */
export async function fetchEvolutionMediaBase64(
  msgObj: any
): Promise<{ base64: string; mimetype: string } | null> {
  if (!msgObj) return null;

  // 1. Check if base64 is already attached directly to the message object (from webhookBase64: true)
  const directBase64 =
    msgObj.message?.base64 ||
    msgObj.base64 ||
    msgObj.message?.audioMessage?.base64 ||
    msgObj.message?.imageMessage?.base64 ||
    msgObj.message?.documentMessage?.base64;

  const mimetype =
    msgObj.message?.audioMessage?.mimetype ||
    msgObj.message?.imageMessage?.mimetype ||
    msgObj.message?.documentMessage?.mimetype ||
    (msgObj.message?.audioMessage ? "audio/ogg" : msgObj.message?.imageMessage ? "image/jpeg" : "application/octet-stream");

  if (directBase64 && typeof directBase64 === "string" && directBase64.length > 50) {
    return {
      base64: directBase64.replace(/^data:[^;]+;base64,/, ""),
      mimetype,
    };
  }

  // 2. Fall back to calling Evolution API getBase64FromMediaMessage endpoint
  try {
    const evoUrl =
      process.env.EVOLUTION_API_URL ||
      "https://evolution-api-latest-cx3y.onrender.com";
    const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
    const instanceName = process.env.EVOLUTION_INSTANCE_NAME || "obey";

    if (!msgObj.key?.id) return null;

    const res = await fetch(
      `${evoUrl}/chat/getBase64FromMediaMessage/${instanceName}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: evoKey,
        },
        body: JSON.stringify({
          message: {
            key: msgObj.key,
          },
          convertToMp4: false,
        }),
      }
    );

    if (res.ok) {
      const data = await res.json();
      const b64 = data.base64 || data.data?.base64;
      if (b64 && typeof b64 === "string") {
        return {
          base64: b64.replace(/^data:[^;]+;base64,/, ""),
          mimetype: data.mimetype || mimetype,
        };
      }
    }
  } catch (err) {
    console.warn("[WhatsApp] fetchEvolutionMediaBase64 error:", err);
  }

  return null;
}

