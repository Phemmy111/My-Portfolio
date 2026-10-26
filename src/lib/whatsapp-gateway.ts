import { sql } from "./db";

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
  customInstance?: string,
  quoted?: any
): Promise<{ success: boolean; error?: string }> {
  try {
    const evoUrl =
      process.env.EVOLUTION_API_URL ||
      "https://obey-whatsapp-api.onrender.com";
    const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
    const instanceName =
      customInstance || process.env.EVOLUTION_INSTANCE_NAME || "obey";

    if (!recipient) {
      return { success: false, error: "Recipient phone number is required" };
    }

    let cleaned = recipient
      .replace(/@s\.whatsapp\.net|@lid|@g\.us/g, "")
      .replace(/\D/g, "");

    // Valid international phone number check (10 to 14 digits)
    if (!cleaned || cleaned.length < 10 || cleaned.length > 14) {
      return { success: false, error: `Invalid recipient phone number format: "${recipient}"` };
    }

    const targetPhone = cleaned;


    const payload: Record<string, any> = {
      number: targetPhone,
      text: cleanWhatsAppFormatting(text),
    };

    if (quoted) {
      payload.quoted = quoted;
    }

    let res: Response | null = null;
    let attempts = 0;
    while (attempts < 2) {
      attempts++;
      try {
        res = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: evoKey,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) {
          return { success: true };
        }
      } catch (fetchErr: any) {
        if (attempts >= 2) throw fetchErr;
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    if (res && res.ok) {
      return { success: true };
    }

    const errBody = res ? await res.text() : "No response from gateway";
    console.error("[WhatsApp] Evolution API error:", res?.status, errBody);
    return { success: false, error: `HTTP ${res?.status}: ${errBody}` };
  } catch (err: any) {
    console.error("[WhatsApp] sendWhatsAppMessage exception:", err);
    return { success: false, error: err.message };
  }
}

export interface WhatsAppButton {
  id: string;
  text: string;
}

export interface WhatsAppListSection {
  title: string;
  rows: Array<{
    id: string;
    title: string;
    description?: string;
  }>;
}

/**
 * Sends native interactive quick-reply buttons via Evolution API.
 * Gracefully falls back to a clean numbered text menu if the instance
 * or device session doesn't support Baileys native interactive buttons.
 */
export async function sendWhatsAppButtons(params: {
  recipient: string;
  text: string;
  buttons: WhatsAppButton[];
  title?: string;
  footer?: string;
  instanceName?: string;
}): Promise<{ success: boolean; fallbackText?: boolean; error?: string }> {
  const { recipient, text, buttons, title, footer, instanceName: customInstance } = params;
  try {
    const evoUrl = process.env.EVOLUTION_API_URL || "https://obey-whatsapp-api.onrender.com";
    const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
    const instanceName = customInstance || process.env.EVOLUTION_INSTANCE_NAME || "obey";

    if (!recipient) return { success: false, error: "Recipient phone is required" };
    const cleaned = recipient.replace(/@s\.whatsapp\.net|@lid|@g\.us/g, "").replace(/\D/g, "");

    // Evolution API button payload format
    const formattedButtons = buttons.slice(0, 3).map((b) => ({
      type: "reply",
      displayText: b.text,
      id: b.id,
    }));

    const payload = {
      number: cleaned,
      title: title || "",
      description: cleanWhatsAppFormatting(text),
      footer: footer || "Tap an option below:",
      buttons: formattedButtons,
    };

    // Format high-converting numbered interactive menu
    const fallbackLines = [
      title ? `*${title}*\n` : "",
      cleanWhatsAppFormatting(text),
      "",
      ...buttons.map((b, idx) => `🔘 *${idx + 1}* - ${b.text}`),
      footer ? `\n_${footer}_` : "\n_Reply with 1, 2, or 3 to select!_",
    ].filter(Boolean);

    // Send formatted interactive menu which renders 100% reliably on all iOS/Android/Web clients
    const textRes = await sendWhatsAppMessage(fallbackLines.join("\n"), cleaned, instanceName);
    
    // Also attempt native buttons in background for Cloud API / supported clients
    try {
      fetch(`${evoUrl}/message/sendButtons/${instanceName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: evoKey },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(6000),
      }).catch(() => {});
    } catch {}

    return { success: textRes.success };
  } catch (err: any) {
    console.warn("[WhatsApp Buttons] Exception:", err.message);
    const fallbackLines = [
      title ? `*${title}*\n` : "",
      text,
      "",
      ...buttons.map((b, idx) => `🔘 *${idx + 1}* - ${b.text}`),
      footer ? `\n_${footer}_` : "\n_Reply with a number to choose!_",
    ].filter(Boolean);
    const textRes = await sendWhatsAppMessage(fallbackLines.join("\n"), recipient, customInstance);
    return { success: textRes.success, fallbackText: true };
  }
}

/**
 * Sends native interactive list picker via Evolution API.
 * Useful for course catalogs, service menus, product selections.
 */
export async function sendWhatsAppList(params: {
  recipient: string;
  title: string;
  description: string;
  buttonText: string;
  sections: WhatsAppListSection[];
  footer?: string;
  instanceName?: string;
}): Promise<{ success: boolean; fallbackText?: boolean; error?: string }> {
  const { recipient, title, description, buttonText, sections, footer, instanceName: customInstance } = params;
  try {
    const evoUrl = process.env.EVOLUTION_API_URL || "https://obey-whatsapp-api.onrender.com";
    const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
    const instanceName = customInstance || process.env.EVOLUTION_INSTANCE_NAME || "obey";

    if (!recipient) return { success: false, error: "Recipient phone is required" };
    const cleaned = recipient.replace(/@s\.whatsapp\.net|@lid|@g\.us/g, "").replace(/\D/g, "");

    const payload = {
      number: cleaned,
      title,
      description: cleanWhatsAppFormatting(description),
      buttonText: buttonText || "View Menu",
      footerText: footer || "AutoLearn Spot • Select an option",
      sections,
    };

    const res = await fetch(`${evoUrl}/message/sendList/${instanceName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evoKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12000),
    });

    if (res.ok) {
      return { success: true };
    }

    // Graceful fallback to rich structured text list
    console.warn(`[WhatsApp List] Gateway returned ${res.status}, using formatted catalog fallback`);
    const fallbackLines = [
      `📋 *${title}*`,
      description,
      "",
    ];
    let counter = 1;
    for (const sec of sections) {
      fallbackLines.push(`*${sec.title.toUpperCase()}*`);
      for (const r of sec.rows) {
        fallbackLines.push(`• *${counter}.* ${r.title}${r.description ? ` - _${r.description}_` : ""}`);
        counter++;
      }
      fallbackLines.push("");
    }
    fallbackLines.push(footer ? `_${footer}_` : "_Reply with the number or title you wish to select!_");
    const textRes = await sendWhatsAppMessage(fallbackLines.join("\n"), cleaned, instanceName);
    return { success: textRes.success, fallbackText: true };
  } catch (err: any) {
    console.warn("[WhatsApp List] Exception, falling back to text:", err.message);
    const fallbackLines = [`📋 *${title}*`, description, ""];
    let counter = 1;
    for (const sec of sections) {
      fallbackLines.push(`*${sec.title.toUpperCase()}*`);
      for (const r of sec.rows) {
        fallbackLines.push(`• *${counter}.* ${r.title}${r.description ? ` - _${r.description}_` : ""}`);
        counter++;
      }
      fallbackLines.push("");
    }
    const textRes = await sendWhatsAppMessage(fallbackLines.join("\n"), recipient, customInstance);
    return { success: textRes.success, fallbackText: true };
  }
}


/**
 * Fetches base64 media for incoming WhatsApp messages (voice notes, images, documents)
 * Checks webhook payload base64 first, falls back to Evolution API endpoint:
 * POST /chat/getBase64FromMediaMessage/${instanceName}
 */
export async function fetchEvolutionMediaBase64(
  msgObj: any,
  instanceOverride?: string
): Promise<{ base64: string; mimetype: string } | null> {
  if (!msgObj) return null;

  // 1. Check if base64 is already attached directly to the message object (from webhookBase64: true)
  const directBase64 =
    msgObj.message?.base64 ||
    msgObj.base64 ||
    msgObj.message?.audioMessage?.base64 ||
    msgObj.message?.imageMessage?.base64 ||
    msgObj.message?.stickerMessage?.base64 ||
    msgObj.message?.documentMessage?.base64;

  const mimetype =
    msgObj.message?.audioMessage?.mimetype ||
    msgObj.message?.imageMessage?.mimetype ||
    msgObj.message?.stickerMessage?.mimetype ||
    msgObj.message?.documentMessage?.mimetype ||
    (msgObj.message?.audioMessage
      ? "audio/ogg"
      : msgObj.message?.imageMessage
      ? "image/jpeg"
      : msgObj.message?.stickerMessage
      ? "image/webp"
      : "application/octet-stream");

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
      "https://obey-whatsapp-api.onrender.com";
    const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
    const instanceName = instanceOverride || process.env.EVOLUTION_INSTANCE_NAME || "obey";

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
        signal: AbortSignal.timeout(10000),
      }
    );

    if (res.ok) {
      const data = await res.json();
      const b64 = data.base64 || data.data?.base64;
      if (b64 && typeof b64 === "string") {
        const rawMime = data.mimetype || mimetype || "application/octet-stream";
        const cleanMime = rawMime.split(";")[0].trim();
        return {
          base64: b64.replace(/^data:[^;]+;base64,/, "").trim(),
          mimetype: cleanMime,
        };
      }
    }
  } catch (err: any) {
    console.warn("[WhatsApp] fetchEvolutionMediaBase64 notice:", err?.name === "TimeoutError" ? "Evolution API fetch timeout (10s)" : err?.message || err);
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
      "https://obey-whatsapp-api.onrender.com";
    const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
    const instanceName = customInstance || process.env.EVOLUTION_INSTANCE_NAME || "obey";

    if (!recipient) {
      return { success: false, error: "Recipient phone number is required" };
    }

    let cleaned = recipient
      .replace(/@s\.whatsapp\.net|@lid|@g\.us/g, "")
      .replace(/\D/g, "");
    if (!cleaned || cleaned.length > 14 || cleaned.length < 10) {
      return { success: false, error: `Invalid recipient phone number format: "${recipient}"` };
    }


    // Clean audio payload: Evolution API v2 expects pure raw base64 string or public URL
    let cleanMedia = audioUrl;
    if (audioUrl && !audioUrl.startsWith("http://") && !audioUrl.startsWith("https://")) {
      cleanMedia = audioUrl.replace(/^data:[^;]+;base64,/, "").trim();
    }

    // 1. Primary: Send as true native WhatsApp Push-to-Talk (PTT) Voice Note with waveform & green mic
    const res = await fetch(`${evoUrl}/message/sendWhatsAppAudio/${instanceName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evoKey,
      },
      body: JSON.stringify({
        number: cleaned,
        audio: cleanMedia,
        encoding: true,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      return { success: true };
    }

    // 2. Secondary fallback: sendMedia
    const mediaRes = await fetch(`${evoUrl}/message/sendMedia/${instanceName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evoKey,
      },
      body: JSON.stringify({
        number: cleaned,
        media: cleanMedia,
        mediatype: "audio",
        mimetype: "audio/mp3",
        ptt: true,
        fileName: "voice_note.mp3",
        caption: caption || undefined,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (mediaRes.ok) {
      return { success: true };
    }

    const err = await mediaRes.text();
    console.error("[WhatsApp] sendWhatsAppAudio failed:", mediaRes.status, err);
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
      "https://obey-whatsapp-api.onrender.com";
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
      "https://obey-whatsapp-api.onrender.com";
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
    "https://obey-whatsapp-api.onrender.com";
  const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
  try {
    const isNumberMode = Boolean(options?.number);
    const cleanedNumber = options?.number ? options.number.replace(/\D/g, "") : undefined;
    const res = await fetch(`${evoUrl}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoKey },
      body: JSON.stringify({
        instanceName,
        token: evoKey,
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
    "https://obey-whatsapp-api.onrender.com";
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
    "https://obey-whatsapp-api.onrender.com";
  const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
  try {
    const webhookUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/obey/whatsapp/webhook`
      : "https://obeyai.vercel.app/api/obey/whatsapp/webhook";
    setEvolutionInstanceWebhook(instanceName, webhookUrl).catch(() => {});
    setEvolutionInstanceSettings(instanceName, { readStatus: true, readMessages: true, alwaysOnline: true }).catch(() => {});

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
    "https://obey-whatsapp-api.onrender.com";
  const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
  try {
    const cleaned = phoneNumber.replace(/\D/g, "");
    if (!cleaned || cleaned.length < 9) {
      return { success: false, error: "Please provide a valid phone number with country code" };
    }

    const webhookUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/obey/whatsapp/webhook`
      : "https://obeyai.vercel.app/api/obey/whatsapp/webhook";

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
      const errStr = JSON.stringify(lastData || {});
      if (errStr.includes("does not exist") || errStr.includes("Not Found")) {
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

    // Always ensure webhook is attached and instance settings are configured
    setEvolutionInstanceWebhook(instanceName, webhookUrl).catch(() => {});
    setEvolutionInstanceSettings(instanceName, { readStatus: true, readMessages: true, alwaysOnline: true }).catch(() => {});

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
    "https://obey-whatsapp-api.onrender.com";
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
    "https://obey-whatsapp-api.onrender.com";
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
    "https://obey-whatsapp-api.onrender.com";
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
  textColor?: string;
  font?: number;
  statusJidList?: string[];
}): Promise<{ success: boolean; error?: string; messageId?: string }> {
  try {
    const evoUrl =
      process.env.EVOLUTION_API_URL ||
      "https://obey-whatsapp-api.onrender.com";
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

    // Build recipient statusJidList:
    let jidList = params.statusJidList ? [...params.statusJidList] : [];

    // Fetch instance bot owner JID to ensure we exclude self from recipient list
    let botOwnerNumber = "";
    try {
      if (sql) {
        const instRows = await sql`
          SELECT "ownerJid" FROM evolution."Instance" WHERE name = ${instance} LIMIT 1
        `;
        if (instRows && instRows[0]?.ownerJid) {
          botOwnerNumber = instRows[0].ownerJid.replace(/[^0-9]/g, "");
        }
      }
    } catch (e) {
      console.warn("[WhatsApp Status] Instance bot owner JID query warning:", e);
    }

    // If no custom recipient list provided, fetch all actual saved contacts for this instance
    if (jidList.length === 0) {
      try {
        if (sql) {
          // 1. Fetch individual contacts from evolution."Contact" for this instance
          const contactRows = await sql`
            SELECT "remoteJid" FROM evolution."Contact"
            WHERE "instanceId" = (SELECT id FROM evolution."Instance" WHERE name = ${instance} LIMIT 1)
              AND "remoteJid" LIKE '%@s.whatsapp.net'
              AND "remoteJid" != '0@s.whatsapp.net'
          `;
          if (contactRows && contactRows.length > 0) {
            for (const r of contactRows) {
              if (r.remoteJid) jidList.push(r.remoteJid);
            }
          }

          // 2. Also ensure workspace owner's phone is included so the owner sees it in their feed
          const wsOwnerRows = await sql`
            SELECT owner_phone FROM workspaces
            WHERE whatsapp_instance_name = ${instance} OR LOWER(slug) = ${instance.replace(/^obey-/, '').toLowerCase()}
            LIMIT 1
          `;
          if (wsOwnerRows && wsOwnerRows[0]?.owner_phone) {
            const cleanOwnerPhone = wsOwnerRows[0].owner_phone.replace(/[^0-9]/g, "");
            if (cleanOwnerPhone) {
              jidList.push(`${cleanOwnerPhone}@s.whatsapp.net`);
            }
          }
        }
      } catch (e) {
        console.warn("[WhatsApp Status] Contact list query warning:", e);
      }
    }

    // 3. CRITICAL: Include the phone's OWN number (botOwnerNumber) in statusJidList!
    // In WhatsApp Multi-Device protocol, linked devices must address the primary phone JID
    // so the device receives the stanza and renders the post under "My status" in the WhatsApp mobile app.
    if (botOwnerNumber) {
      jidList.push(`${botOwnerNumber}@s.whatsapp.net`);
    }

    // Clean, validate and deduplicate recipient JIDs
    jidList = Array.from(new Set(jidList)).filter((jid) => {
      if (!jid || typeof jid !== "string") return false;
      if (!jid.includes("@s.whatsapp.net")) return false;
      const digits = jid.replace(/[^0-9]/g, "");
      if (digits.length < 8) return false;
      if (digits === "0") return false;
      return true;
    });

    // 4. Ensure jidList always has at least one valid recipient JID (Evolution API requires statusJidList)
    if (jidList.length === 0) {
      jidList.push("2348120934828@s.whatsapp.net");
    }

    const payload: any = cleanMediaUrl
      ? {
          type: params.mediaType || "image",
          content: cleanMediaUrl,
          caption: cleanWhatsAppFormatting(params.text),
          statusJidList: jidList,
        }
      : {
          type: "text",
          content: cleanWhatsAppFormatting(params.text),
          backgroundColor: params.backgroundColor || "#075E54",
          textColor: params.textColor || "#FFFFFF",
          font: typeof params.font === "number" && params.font >= 1 && params.font <= 5 ? params.font : 4,
          statusJidList: jidList,
        };


    // Execute with automatic retry for 502/503/504 (handling Render cold-starts gracefully)
    let lastError = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const statusRes = await fetch(`${evoUrl}/message/sendStatus/${encodeURIComponent(instance)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: evoKey,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(20000),
        });

        if (statusRes.ok) {
          const data = await statusRes.json();
          const messageId = data?.key?.id || data?.id || (Array.isArray(data) && data[0]?.key?.id);
          return { success: true, messageId };
        }

        const errText = await statusRes.text();
        lastError = `Evolution status error (${statusRes.status}): ${errText}`;
        console.warn(`[WhatsApp Status] sendStatus attempt ${attempt} failed (${statusRes.status}):`, errText);

        // If 502 Bad Gateway / 503 / 504 (Render cold-start wake up), wait 3s and retry once
        if (attempt === 1 && (statusRes.status === 502 || statusRes.status === 503 || statusRes.status === 504)) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        break;
      } catch (fetchErr: any) {
        lastError = fetchErr.message;
        if (attempt === 1) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
      }
    }

    return { success: false, error: lastError };
  } catch (err: any) {
    console.error("[WhatsApp Status] sendWhatsAppStatusPost error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Deletes a status broadcast post from WhatsApp servers for everyone.
 */
export async function deleteWhatsAppStatusPost(params: {
  instanceName: string;
  messageId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const evoUrl =
      process.env.EVOLUTION_API_URL ||
      "https://obey-whatsapp-api.onrender.com";
    const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
    const instance = params.instanceName || "obey";

    let lastError = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(`${evoUrl}/chat/deleteMessageForEveryone/${encodeURIComponent(instance)}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            apikey: evoKey,
          },
          body: JSON.stringify({
            id: params.messageId,
            remoteJid: "status@broadcast",
            fromMe: true,
          }),
        });

        if (res.ok) {
          return { success: true };
        }
        const err = await res.text();
        lastError = `Evolution delete error (${res.status}): ${err}`;
        console.warn(`[Evolution] deleteWhatsAppStatusPost attempt ${attempt} failed (${res.status}):`, err);

        if (attempt === 1 && (res.status === 502 || res.status === 503 || res.status === 504)) {
          await new Promise((r) => setTimeout(r, 2500));
          continue;
        }
        break;
      } catch (fetchErr: any) {
        lastError = fetchErr.message;
        if (attempt === 1) {
          await new Promise((r) => setTimeout(r, 2500));
          continue;
        }
      }
    }

    return { success: false, error: lastError };
  } catch (err: any) {
    console.error("[Evolution] deleteWhatsAppStatusPost error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Sends an emoji reaction to any WhatsApp message.
 */
export async function sendWhatsAppReaction(params: {
  instanceName?: string;
  remoteJid: string;
  messageId: string;
  reaction: string; // e.g. "👍", "❤️", "🔥", "🙏", "⚡", "😂"
  fromMe?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const evoUrl =
      process.env.EVOLUTION_API_URL ||
      "https://obey-whatsapp-api.onrender.com";
    const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
    const instance = params.instanceName || process.env.EVOLUTION_INSTANCE_NAME || "obey";

    let cleanJid = params.remoteJid.trim();
    if (!cleanJid.includes("@")) {
      const digits = cleanJid.replace(/\D/g, "");
      cleanJid = `${digits}@s.whatsapp.net`;
    }

    const payload = {
      key: {
        remoteJid: cleanJid,
        fromMe: Boolean(params.fromMe),
        id: params.messageId,
      },
      reaction: params.reaction,
    };

    const res = await fetch(`${evoUrl}/message/sendReaction/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evoKey,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      return { success: true };
    }
    const errText = await res.text();
    console.warn(`[Evolution] sendReaction failed (${res.status}):`, errText);
    return { success: false, error: errText };
  } catch (err: any) {
    console.warn("[Evolution] sendReaction exception:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Configure instance settings for auto-read receipts (blue ticks), typing presence, and always online.
 */
export async function setEvolutionInstanceSettings(
  instanceName: string,
  overrides: { readStatus?: boolean; readMessages?: boolean; alwaysOnline?: boolean } = {}
) {
  const evoUrl =
    process.env.EVOLUTION_API_URL ||
    "https://obey-whatsapp-api.onrender.com";
  const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
  try {
    const res = await fetch(`${evoUrl}/settings/set/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoKey },
      body: JSON.stringify({
        rejectCall: false,
        msgCall: "",
        groupsIgnore: false,
        alwaysOnline: overrides.alwaysOnline !== undefined ? overrides.alwaysOnline : true,
        readMessages: overrides.readMessages !== undefined ? overrides.readMessages : true,
        readStatus: overrides.readStatus !== undefined ? overrides.readStatus : true,
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
  participant?: string,
  altParticipant?: string
) {
  const evoUrl =
    process.env.EVOLUTION_API_URL ||
    "https://obey-whatsapp-api.onrender.com";
  const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
  try {
    const jid = remoteJid.includes("@") ? remoteJid : `${remoteJid}@s.whatsapp.net`;
    const readMessages: any[] = [
      {
        remoteJid: jid,
        fromMe: false,
        id: messageId,
        ...(participant ? { participant } : {}),
      },
    ];
    if (altParticipant && altParticipant !== participant) {
      readMessages.push({
        remoteJid: jid,
        fromMe: false,
        id: messageId,
        participant: altParticipant,
      });
    }
    const res = await fetch(`${evoUrl}/chat/markMessageAsRead/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoKey },
      body: JSON.stringify({ readMessages }),
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
    "https://obey-whatsapp-api.onrender.com";
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
