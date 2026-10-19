import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

export interface SpeechSynthesisOptions {
  text: string;
  voice?: string;
  personality?: string;
  gender?: "male" | "female";
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
    .replace(/[*#_~`[\]()<>]/g, " ") // strip markdown characters
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
  if (personality === "nigerian_pidgin" || personality === "nigerian" || personality === "naija") {
    return gender === "female" ? "en-NG-EzinneNeural" : "en-NG-AbeoNeural";
  }
  if (personality === "friendly" || personality === "warm") {
    return gender === "female" ? "en-US-JennyNeural" : "en-US-GuyNeural";
  }
  if (personality === "direct") {
    return "en-US-ChristopherNeural";
  }
  // Executive default: Deep, authoritative, articulate Nigerian or International Male
  return gender === "female" ? "en-NG-EzinneNeural" : "en-NG-AbeoNeural";
}

/**
 * Universal Speech Audio Synthesizer:
 * Generates high-fidelity MP3 voice notes using ElevenLabs (if key present),
 * OpenAI TTS (if key present), or zero-config Microsoft Edge Neural TTS.
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

  // 1. Primary & Authentic: Microsoft Edge Neural TTS (en-NG-AbeoNeural for Obey)
  try {
    const selectedVoice =
      options.voice || resolveVoiceName(options.personality, options.gender);

    const tts = new MsEdgeTTS();
    await tts.setMetadata(
      selectedVoice,
      OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
    );

    const { audioStream } = tts.toStream(cleanedText);

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      audioStream.on("data", (chunk: Buffer) => chunks.push(chunk));
      audioStream.on("end", () => resolve(Buffer.concat(chunks)));
      audioStream.on("error", (err: any) => reject(err));
    });

    if (buffer && buffer.length > 0) {
      return {
        buffer,
        base64: buffer.toString("base64"),
        mimeType: "audio/mp3",
      };
    }
  } catch (edgeErr) {
    console.warn("[TTS Engine] MsEdgeTTS synthesis error, attempting fallbacks:", edgeErr);
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
