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
          message: msgObj,
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

/**
 * Dispatches a recorded audio file / voice note via Evolution API to WhatsApp
 */
export async function sendWhatsAppAudio(
  audioUrl: string,
  recipient: string,
  caption?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const evoUrl =
      process.env.EVOLUTION_API_URL ||
      "https://evolution-api-latest-cx3y.onrender.com";
    const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
    const instanceName = process.env.EVOLUTION_INSTANCE_NAME || "obey";

    let cleaned = (recipient || "2348120934828")
      .replace(/@s\.whatsapp\.net|@lid|@g\.us/g, "")
      .replace(/\D/g, "");
    if (!cleaned || cleaned.length > 13 || cleaned.length < 10) {
      cleaned = "2348120934828";
    }

    // 1. Try sending as native WhatsApp Voice Note
    const res = await fetch(`${evoUrl}/message/sendWhatsAppAudio/${instanceName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evoKey,
      },
      body: JSON.stringify({
        number: cleaned,
        audio: audioUrl,
      }),
    });

    if (res.ok) {
      return { success: true };
    }

    // 2. Fallback: Send as audio media file
    const mediaRes = await fetch(`${evoUrl}/message/sendMedia/${instanceName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evoKey,
      },
      body: JSON.stringify({
        number: cleaned,
        media: audioUrl,
        mediatype: "audio",
        mimetype: "audio/mp3",
        caption: caption || "🎙️ Call Audio Recording",
      }),
    });

    if (mediaRes.ok) {
      return { success: true };
    }

    const err = await mediaRes.text();
    return { success: false, error: err };
  } catch (err: any) {
    console.error("[WhatsApp] sendWhatsAppAudio error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Dispatches an image file or generated AI artwork via Evolution API to WhatsApp
 */
export async function sendWhatsAppImage(
  imageUrl: string,
  recipient: string,
  caption?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const evoUrl =
      process.env.EVOLUTION_API_URL ||
      "https://evolution-api-latest-cx3y.onrender.com";
    const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
    const instanceName = process.env.EVOLUTION_INSTANCE_NAME || "obey";

    let cleaned = (recipient || "2348120934828")
      .replace(/@s\.whatsapp\.net|@lid|@g\.us/g, "")
      .replace(/\D/g, "");
    if (!cleaned || cleaned.length > 13 || cleaned.length < 10) {
      cleaned = "2348120934828";
    }

    const res = await fetch(`${evoUrl}/message/sendMedia/${instanceName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evoKey,
      },
      body: JSON.stringify({
        number: cleaned,
        media: imageUrl,
        mediatype: "image",
        caption: caption || "🎨 Generated by Obey AI",
      }),
    });

    if (res.ok) {
      return { success: true };
    }

    const err = await res.text();
    return { success: false, error: err };
  } catch (err: any) {
    console.error("[WhatsApp] sendWhatsAppImage error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Dispatches an HTML file, code artifact, or document via Evolution API to WhatsApp as a native file attachment
 */
export async function sendWhatsAppDocument(
  fileContent: string,
  fileName: string,
  recipient: string,
  caption?: string,
  mimetype: string = "text/html"
): Promise<{ success: boolean; error?: string }> {
  try {
    const evoUrl =
      process.env.EVOLUTION_API_URL ||
      "https://evolution-api-latest-cx3y.onrender.com";
    const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
    const instanceName = process.env.EVOLUTION_INSTANCE_NAME || "obey";

    let cleaned = (recipient || "2348120934828")
      .replace(/@s\.whatsapp\.net|@lid|@g\.us/g, "")
      .replace(/\D/g, "");
    if (!cleaned || cleaned.length > 13 || cleaned.length < 10) {
      cleaned = "2348120934828";
    }

    const base64Data = Buffer.from(fileContent, "utf-8").toString("base64");

    const res = await fetch(`${evoUrl}/message/sendMedia/${instanceName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evoKey,
      },
      body: JSON.stringify({
        number: cleaned,
        media: base64Data,
        mediatype: "document",
        mimetype: mimetype,
        fileName: fileName.endsWith(".html") ? fileName : `${fileName}.html`,
        caption: caption || `📄 ${fileName}`,
      }),
    });

    if (res.ok) {
      return { success: true };
    }

    const err = await res.text();
    console.warn("[WhatsApp] sendWhatsAppDocument warning:", err);
    return { success: false, error: err };
  } catch (err: any) {
    console.error("[WhatsApp] sendWhatsAppDocument error:", err);
    return { success: false, error: err.message };
  }
}




