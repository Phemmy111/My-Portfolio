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
  recipient?: string,
  customInstance?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const evoUrl =
      process.env.EVOLUTION_API_URL ||
      "https://evolution-api-latest-cx3y.onrender.com";
    const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
    const instanceName =
      customInstance || process.env.EVOLUTION_INSTANCE_NAME || "obey";

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
  caption?: string,
  customInstance?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const evoUrl =
      process.env.EVOLUTION_API_URL ||
      "https://evolution-api-latest-cx3y.onrender.com";
    const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
    const instanceName = customInstance || process.env.EVOLUTION_INSTANCE_NAME || "obey";

    let cleaned = (recipient || "2348120934828")
      .replace(/@s\.whatsapp\.net|@lid|@g\.us/g, "")
      .replace(/\D/g, "");
    if (!cleaned || cleaned.length > 13 || cleaned.length < 10) {
      cleaned = "2348120934828";
    }

    let formattedAudio = audioUrl;
    if (audioUrl && !audioUrl.startsWith("http://") && !audioUrl.startsWith("https://") && !audioUrl.startsWith("data:")) {
      formattedAudio = `data:audio/mp3;base64,${audioUrl}`;
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
        audio: formattedAudio,
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
        media: formattedAudio,
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
  caption?: string,
  customInstance?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const evoUrl =
      process.env.EVOLUTION_API_URL ||
      "https://evolution-api-latest-cx3y.onrender.com";
    const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
    const instanceName = customInstance || process.env.EVOLUTION_INSTANCE_NAME || "obey";

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
  mimetype: string = "text/html",
  customInstance?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const evoUrl =
      process.env.EVOLUTION_API_URL ||
      "https://evolution-api-latest-cx3y.onrender.com";
    const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
    const instanceName = customInstance || process.env.EVOLUTION_INSTANCE_NAME || "obey";

    let cleaned = (recipient || "2348120934828")
      .replace(/@s\.whatsapp\.net|@lid|@g\.us/g, "")
      .replace(/\D/g, "");
    if (!cleaned || cleaned.length > 13 || cleaned.length < 10) {
      cleaned = "2348120934828";
    }

    const base64Data = Buffer.from(fileContent, "utf-8").toString("base64");

    let finalFileName = fileName.trim();
    if (!/\.[a-zA-Z0-9]{2,5}$/.test(finalFileName)) {
      if (mimetype.includes("msword") || mimetype.includes("word") || mimetype.includes("officedocument")) {
        finalFileName += ".doc";
      } else if (mimetype.includes("pdf")) {
        finalFileName += ".pdf";
      } else if (mimetype.includes("markdown")) {
        finalFileName += ".md";
      } else if (mimetype.includes("plain")) {
        finalFileName += ".txt";
      } else {
        finalFileName += ".html";
      }
    }

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
        fileName: finalFileName,
        caption: caption || `📄 ${finalFileName}`,
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

// ==============================================================
// EVOLUTION API MULTI-DEVICE INSTANCE MANAGEMENT
// ==============================================================

export async function createEvolutionInstance(
  instanceName: string,
  options?: { qrcode?: boolean; number?: string }
) {
  const evoUrl =
    process.env.EVOLUTION_API_URL ||
    "https://evolution-api-latest-cx3y.onrender.com";
  const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
  try {
    const isNumberMode = Boolean(options?.number);
    const cleanedNumber = options?.number ? options.number.replace(/\D/g, "") : undefined;
    const res = await fetch(`${evoUrl}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoKey },
      body: JSON.stringify({
        instanceName,
        qrcode: options?.qrcode !== undefined ? options.qrcode : !isNumberMode,
        number: cleanedNumber,
        integration: "WHATSAPP-BAILEYS",
      }),
    });
    return await res.json();
  } catch (err: any) {
    console.error("[Evolution] createEvolutionInstance error:", err);
    return { error: err.message };
  }
}

export async function deleteEvolutionInstance(instanceName: string) {
  const evoUrl =
    process.env.EVOLUTION_API_URL ||
    "https://evolution-api-latest-cx3y.onrender.com";
  const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
  try {
    const res = await fetch(`${evoUrl}/instance/delete/${instanceName}`, {
      method: "DELETE",
      headers: { apikey: evoKey },
    });
    return await res.json();
  } catch (err: any) {
    console.warn("[Evolution] deleteEvolutionInstance warning:", err);
    return { error: err.message };
  }
}

export async function getEvolutionInstanceQR(instanceName: string) {
  const evoUrl =
    process.env.EVOLUTION_API_URL ||
    "https://evolution-api-latest-cx3y.onrender.com";
  const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
  try {
    const res = await fetch(`${evoUrl}/instance/connect/${instanceName}`, {
      headers: { apikey: evoKey },
    });
    return await res.json();
  } catch (err: any) {
    console.error("[Evolution] getEvolutionInstanceQR error:", err);
    return { error: err.message };
  }
}

/**
 * Requests an 8-digit WhatsApp pairing code from Baileys via Evolution API
 * Allows linking a device by phone number without scanning a QR code.
 */
export async function getEvolutionPairingCode(
  instanceName: string,
  phoneNumber: string
): Promise<{ success: boolean; pairingCode?: string; error?: string }> {
  const evoUrl =
    process.env.EVOLUTION_API_URL ||
    "https://evolution-api-latest-cx3y.onrender.com";
  const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
  try {
    const cleaned = phoneNumber.replace(/\D/g, "");
    if (!cleaned || cleaned.length < 9) {
      return { success: false, error: "Please provide a valid phone number with country code" };
    }

    const webhookUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/obey/whatsapp/webhook`
      : "https://femiadelekeportfolio.vercel.app/api/obey/whatsapp/webhook";

    // 1. Check if instance already exists
    let stateRes = await fetch(`${evoUrl}/instance/connectionState/${instanceName}`, {
      headers: { apikey: evoKey },
    }).catch(() => null);
    let stateData = stateRes && stateRes.ok ? await stateRes.json() : null;
    const instanceExists = Boolean(stateData?.instance);

    // 2. If instance doesn't exist, create it immediately in number/pairing mode!
    if (!instanceExists) {
      console.log(`[Evolution] Instance ${instanceName} does not exist. Creating instance...`);
      await createEvolutionInstance(instanceName, { qrcode: false, number: cleaned });
      await setEvolutionInstanceWebhook(instanceName, webhookUrl);
      // Wait for Baileys socket to initialize
      await new Promise((r) => setTimeout(r, 2000));
    }

    // 3. Request pairing code with retry polling
    let code: string | null = null;
    let lastData: any = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(`${evoUrl}/instance/connect/${instanceName}?number=${cleaned}`, {
        headers: { apikey: evoKey },
      });
      lastData = await res.json();
      code = lastData?.pairingCode || (typeof lastData?.code === "string" && lastData.code.length <= 12 ? lastData.code : null);
      if (code && typeof code === "string" && code.length >= 6 && code.length <= 12) {
        break;
      }

      // If instance was missing or error on connect, create it if not created yet
      if (
        lastData?.message?.includes?.("does not exist") ||
        (Array.isArray(lastData?.message) && lastData.message[0]?.includes?.("does not exist"))
      ) {
        await createEvolutionInstance(instanceName, { qrcode: false, number: cleaned });
        await setEvolutionInstanceWebhook(instanceName, webhookUrl);
      }

      await new Promise((r) => setTimeout(r, 1500));
    }

    // 4. If code was still not returned, recreate instance and make final attempts
    if (!code) {
      console.log(`[Evolution] No pairing code on initial attempts for ${instanceName}. Recreating instance...`);
      await deleteEvolutionInstance(instanceName).catch(() => {});
      await new Promise((r) => setTimeout(r, 1000));
      await createEvolutionInstance(instanceName, { qrcode: false, number: cleaned });
      await setEvolutionInstanceWebhook(instanceName, webhookUrl);
      await new Promise((r) => setTimeout(r, 2000));

      for (let attempt = 0; attempt < 4; attempt++) {
        const res = await fetch(`${evoUrl}/instance/connect/${instanceName}?number=${cleaned}`, {
          headers: { apikey: evoKey },
        });
        lastData = await res.json();
        code = lastData?.pairingCode || (typeof lastData?.code === "string" && lastData.code.length <= 12 ? lastData.code : null);
        if (code && typeof code === "string" && code.length >= 6 && code.length <= 12) {
          break;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    // Always ensure webhook is attached
    setEvolutionInstanceWebhook(instanceName, webhookUrl).catch(() => {});

    if (code && typeof code === "string") {
      return { success: true, pairingCode: code };
    }

    return {
      success: false,
      error: lastData?.response?.message || lastData?.message || lastData?.error || "Failed to generate pairing code. Please try again.",
    };
  } catch (err: any) {
    console.error("[Evolution] getEvolutionPairingCode error:", err);
    return { success: false, error: err.message };
  }
}

export async function getEvolutionConnectionState(instanceName: string) {
  const evoUrl =
    process.env.EVOLUTION_API_URL ||
    "https://evolution-api-latest-cx3y.onrender.com";
  const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
  try {
    const res = await fetch(`${evoUrl}/instance/connectionState/${instanceName}`, {
      headers: { apikey: evoKey },
    });
    return await res.json();
  } catch (err: any) {
    console.error("[Evolution] getEvolutionConnectionState error:", err);
    return { error: err.message };
  }
}

export async function setEvolutionInstanceWebhook(instanceName: string, webhookUrl: string) {
  const evoUrl =
    process.env.EVOLUTION_API_URL ||
    "https://evolution-api-latest-cx3y.onrender.com";
  const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
  try {
    const res = await fetch(`${evoUrl}/webhook/set/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoKey },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          byEvents: false,
          base64: true,
          events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE", "CONNECTION_UPDATE"],
        },
      }),
    });
    return await res.json();
  } catch (err: any) {
    console.error("[Evolution] setEvolutionInstanceWebhook error:", err);
    return { error: err.message };
  }
}

export async function logoutEvolutionInstance(instanceName: string) {
  const evoUrl =
    process.env.EVOLUTION_API_URL ||
    "https://evolution-api-latest-cx3y.onrender.com";
  const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
  try {
    const res = await fetch(`${evoUrl}/instance/logout/${instanceName}`, {
      method: "DELETE",
      headers: { apikey: evoKey },
    });
    return await res.json();
  } catch (err: any) {
    console.warn("[Evolution] logoutEvolutionInstance warning:", err);
    return { error: err.message };
  }
}

/**
 * Automates publishing a status update to WhatsApp Status (Stories / status@broadcast)
 */
export async function sendWhatsAppStatusPost(params: {
  text: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  instanceName?: string;
  backgroundColor?: string;
  font?: number;
}): Promise<{ success: boolean; error?: string; messageId?: string }> {
  try {
    const evoUrl =
      process.env.EVOLUTION_API_URL ||
      "https://evolution-api-latest-cx3y.onrender.com";
    const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
    const instance = params.instanceName || process.env.EVOLUTION_INSTANCE_NAME || "obey";

    // Clean media URL (ensure clean extension for video/image without query params)
    let cleanMediaUrl = params.mediaUrl ? params.mediaUrl.trim() : undefined;
    if (cleanMediaUrl && cleanMediaUrl.includes("?")) {
      cleanMediaUrl = cleanMediaUrl.split("?")[0];
    }

    // Ensure Cloudinary video transcode is completely ready on CDN before handing off to Evolution API
    if (cleanMediaUrl && params.mediaType === "video") {
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          const check = await fetch(cleanMediaUrl, { method: "HEAD" });
          if (check.ok) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    // Build proper Evolution API v2 sendStatus payload
    const payload = cleanMediaUrl
      ? {
          type: params.mediaType || "image",
          content: cleanMediaUrl,
          caption: cleanWhatsAppFormatting(params.text),
          allContacts: true,
        }
      : {
          type: "text",
          content: cleanWhatsAppFormatting(params.text),
          backgroundColor: params.backgroundColor || "#075E54",
          font: params.font || 1,
          allContacts: true,
        };

    const statusRes = await fetch(`${evoUrl}/message/sendStatus/${instance}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evoKey,
      },
      body: JSON.stringify(payload),
    });

    if (statusRes.ok) {
      const data = await statusRes.json();
      return { success: true, messageId: data?.key?.id || data?.id };
    }

    const err = await statusRes.text();
    console.error("[WhatsApp Status] sendStatus error:", statusRes.status, err);
    return { success: false, error: `Evolution status error (${statusRes.status}): ${err}` };
  } catch (err: any) {
    console.error("[WhatsApp Status] sendWhatsAppStatusPost error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Configure instance settings for auto-read receipts (blue ticks), typing presence, and always online.
 */
export async function setEvolutionInstanceSettings(instanceName: string) {
  const evoUrl =
    process.env.EVOLUTION_API_URL ||
    "https://evolution-api-latest-cx3y.onrender.com";
  const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
  try {
    const res = await fetch(`${evoUrl}/settings/set/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoKey },
      body: JSON.stringify({
        rejectCall: false,
        msgCall: "",
        groupsIgnore: false,
        alwaysOnline: true,
        readMessages: true,
        readStatus: true,
        syncFullHistory: false,
      }),
    });
    return await res.json();
  } catch (err: any) {
    console.warn("[Evolution] setEvolutionInstanceSettings error:", err);
  }
}

/**
 * Explicitly marks a received WhatsApp message as read to trigger blue double ticks for the sender.
 */
export async function markWhatsAppMessageRead(
  instanceName: string,
  remoteJid: string,
  messageId: string,
  participant?: string
) {
  const evoUrl =
    process.env.EVOLUTION_API_URL ||
    "https://evolution-api-latest-cx3y.onrender.com";
  const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
  try {
    const jid = remoteJid.includes("@") ? remoteJid : `${remoteJid}@s.whatsapp.net`;
    const readItem: any = {
      remoteJid: jid,
      fromMe: false,
      id: messageId,
    };
    if (participant) {
      readItem.participant = participant;
    }
    const res = await fetch(`${evoUrl}/chat/markMessageAsRead/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoKey },
      body: JSON.stringify({
        readMessages: [readItem],
      }),
    });
    return await res.json();
  } catch (err: any) {
    console.warn("[Evolution] markWhatsAppMessageRead error:", err);
  }
}

/**
 * Emits "composing..." (typing) indicator on WhatsApp while Obey generates an answer.
 */
export async function sendWhatsAppPresence(
  instanceName: string,
  number: string,
  presence: "composing" | "recording" | "available" | "unavailable" = "composing",
  delayMs: number = 1500
) {
  const evoUrl =
    process.env.EVOLUTION_API_URL ||
    "https://evolution-api-latest-cx3y.onrender.com";
  const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
  try {
    const cleaned = number.replace(/\D/g, "");
    await fetch(`${evoUrl}/chat/sendPresence/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoKey },
      body: JSON.stringify({
        number: cleaned,
        presence,
        delay: delayMs,
      }),
    });
  } catch {}
}
