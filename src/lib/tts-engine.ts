import { getSetting } from "./settings";

export interface SpeechSynthesisOptions {
  text: string;
  voice?: string;
  personality?: string;
  gender?: "male" | "female";
  speaker?: string;
}

/**
 * Cleans input text for natural spoken delivery:
 * Removes markdown symbols, links, asterisks, hashes, and emojis
 * so Text-to-Speech engines pronounce fluent, articulate words.
 */
export function cleanTextForSpeech(text: string): string {
  if (!text) return "";
  return text
    .replace(/https?:\/\/\S+/gi, "") // strip URLs
    .replace(/\([^)]*\)/g, " ") // strip anything inside parentheses (e.g. stage directions, audio markers, asides)
    .replace(/\[[^\]]*\]/g, " ") // strip anything inside square brackets
    .replace(/\{[^}]*\}/g, " ") // strip anything inside curly braces
    .replace(/[*#_~`<>]/g, " ") // strip markdown characters without deleting text
    .replace(/•\s+/g, " ") // strip bullet symbols
    .replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
      ""
    ) // strip emojis
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolves the optimal TTS voice based on personality, gender, and regional preference.
 */
function resolveVoiceName(personality?: string, gender?: string): string {
  if (gender === "female") {
    return "en-NG-EzinneNeural";
  }
  // Executive default: Deep, authoritative, articulate Nigerian Male (Abeo)
  return "en-NG-AbeoNeural";
}

async function synthesizeWithCloudflareTTS(
  text: string,
  speaker: string = "zeus"
): Promise<Buffer | null> {
  try {
    const rawTokens =
      (await getSetting("CLOUDFLARE_API_TOKENS")) ||
      (await getSetting("CLOUDFLARE_API_TOKEN")) ||
      process.env.CLOUDFLARE_API_TOKENS ||
      process.env.CLOUDFLARE_API_TOKEN ||
      "";

    const rawAccounts =
      (await getSetting("CLOUDFLARE_ACCOUNT_ID")) ||
      (await getSetting("CLOUDFLARE_ACCOUNT_IDS")) ||
      process.env.CLOUDFLARE_ACCOUNT_ID ||
      process.env.CLOUDFLARE_ACCOUNT_IDS ||
      "";

    const token = String(rawTokens).split(/[\s,]+/)[0]?.trim();
    const accountId = String(rawAccounts).split(/[\s,]+/)[0]?.trim();

    if (!token || !accountId) return null;

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/deepgram/aura-2-en`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          speaker: speaker || "zeus",
        }),
        signal: AbortSignal.timeout(12000),
      }
    );

    if (res.ok) {
      const arrayBuf = await res.arrayBuffer();
      const buf = Buffer.from(arrayBuf);
      if (buf && buf.length > 0) {
        return buf;
      }
    } else {
      const err = await res.text();
      console.warn(`[Cloudflare TTS] HTTP ${res.status}: ${err.slice(0, 100)}`);
    }
  } catch (err: any) {
    console.warn("[Cloudflare TTS] Synthesis error notice:", err?.message || err);
  }
  return null;
}

/**
 * Universal Speech Audio Synthesizer:
 * Generates high-fidelity MP3 voice notes using Cloudflare Workers AI Deepgram Aura 2,
 * Edge Neural TTS, ElevenLabs, or OpenAI TTS.
 */
export async function generateSpeechAudio(
  input: string | SpeechSynthesisOptions
): Promise<{ buffer: Buffer; base64: string; mimeType: string } | null> {
  const options: SpeechSynthesisOptions =
    typeof input === "string" ? { text: input } : input;

  const rawText = options.text || "";
  const cleanedText = cleanTextForSpeech(rawText);

  if (!cleanedText || cleanedText.length < 2) {
    console.warn("[TTS Engine] Empty or too short text for synthesis");
    return null;
  }

  // 1. Primary: Microsoft Edge Neural TTS with Sec-MS-GEC v2 (en-NG-AbeoNeural for pure authentic Nigerian male vibe)
  try {
    const selectedVoice =
      options.voice || resolveVoiceName(options.personality, options.gender);

    const { synthesizeEdgeTTS } = await import("./edge-tts-client");
    const buffer = await synthesizeEdgeTTS(cleanedText, selectedVoice, 12000);

    if (buffer && buffer.length > 0) {
      return {
        buffer,
        base64: buffer.toString("base64"),
        mimeType: "audio/mp3",
      };
    }
  } catch (edgeErr) {
    console.warn("[TTS Engine] Native Edge TTS synthesis notice, attempting fallbacks:", edgeErr);
  }

  // 2. Secondary Fallback: Lightning-fast Cloudflare Workers AI Deepgram Aura 2 (@cf/deepgram/aura-2-en)
  try {
    const selectedSpeaker =
      options.gender === "female" ? "luna" : (options.speaker || "zeus");
    const cfBuffer = await synthesizeWithCloudflareTTS(cleanedText, selectedSpeaker);
    if (cfBuffer && cfBuffer.length > 0) {
      return {
        buffer: cfBuffer,
        base64: cfBuffer.toString("base64"),
        mimeType: "audio/mp3",
      };
    }
  } catch (cfErr) {
    console.warn("[TTS Engine] Cloudflare TTS notice, falling back:", cfErr);
  }

  // 2. Secondary Fallback: ElevenLabs (Only if explicit male/custom voice ID configured)
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  const elevenVoiceId = process.env.ELEVENLABS_VOICE_ID;
  if (elevenKey && elevenVoiceId && elevenVoiceId !== "21m00Tcm4TlvDq8ikWAM") {
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elevenVoiceId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": elevenKey,
        },
        body: JSON.stringify({
          text: cleanedText,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
          },
        }),
      });

      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        return {
          buffer,
          base64: buffer.toString("base64"),
          mimeType: "audio/mp3",
        };
      }
    } catch (elevenErr) {
      console.warn("[TTS Engine] ElevenLabs error, falling back:", elevenErr);
    }
  }

  // 3. Fallback: OpenAI TTS (onyx for male)
  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey) {
    try {
      const res = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: "tts-1",
          voice: options.gender === "female" ? "nova" : "onyx",
          input: cleanedText,
        }),
      });

      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        return {
          buffer,
          base64: buffer.toString("base64"),
          mimeType: "audio/mp3",
        };
      }
    } catch (openAiErr) {
      console.warn("[TTS Engine] OpenAI TTS error, falling back:", openAiErr);
    }
  }

  return null;
}
