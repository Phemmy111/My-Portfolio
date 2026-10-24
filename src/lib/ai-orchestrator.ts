import { getAIProvidersPool, AIProviderConfig } from "./settings";
import { getNigerianTime } from "./utils";

export interface AICompletionResult {
  text: string;
  provider: string;
  model: string;
  fallbackTriggered: boolean;
  errorsEncountered?: string[];
}

export interface PromptOptions {
  systemPrompt?: string;
  userPrompt: string;
  mediaBase64?: string;
  mimeType?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Executes an AI completion across the user-configured multi-key Provider Pool in sequential priority.
 * Supports text, vision (images), documents, and audio through multimodal Gemini and fallbacks.
 */
export async function executeAICompletion(options: PromptOptions): Promise<AICompletionResult> {
  const {
    systemPrompt = "You are Obey, an autonomous AI executive assistant for Femi Adeleke.",
    userPrompt,
    mediaBase64,
    mimeType,
    temperature = 0.7,
    maxTokens = 8192,
  } = options;

  const errors: string[] = [];
  const pool = await getAIProvidersPool();
  const activeProviders = pool.filter((p) => p.enabled && p.apiKey?.trim());

  // Auto-inject OpenAI fallback from environment if not explicitly in pool
  const hasOpenAI = activeProviders.some((p) => p.provider === "openai");
  if (!hasOpenAI && process.env.OPENAI_API_KEY?.trim()) {
    activeProviders.push({
      id: "openai-env-fallback",
      provider: "openai",
      name: "OpenAI Fallback (Env)",
      apiKey: process.env.OPENAI_API_KEY.trim(),
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      enabled: true,
    });
  }

  // Auto-inject Groq fallback from environment if not explicitly in pool
  const hasGroq = activeProviders.some((p) => p.provider === "groq");
  if (!hasGroq && process.env.GROQ_API_KEY?.trim()) {
    activeProviders.push({
      id: "groq-env-fallback",
      provider: "groq",
      name: "Groq Llama Fallback (Env)",
      apiKey: process.env.GROQ_API_KEY.trim(),
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      enabled: true,
    });
  }

  for (let i = 0; i < activeProviders.length; i++) {
    const p = activeProviders[i];

    try {
      // 1. Google Gemini (Multimodal Native: Audio, Images, Documents, Text)
      if (p.provider === "gemini") {
        const isAudioMedia = Boolean(mediaBase64 && mimeType?.startsWith("audio/"));
        const targetModel = p.model?.trim() || "gemini-flash-latest";
        const candidateModels = isAudioMedia
          ? [
              "gemini-2.5-flash",
              "gemini-flash-latest",
              "gemini-2.5-flash-lite",
              "gemini-3.8-flash",
            ]
          : [
              targetModel,
              "gemini-2.5-flash",
              "gemini-flash-latest",
              "gemini-flash-lite-latest",
              "gemini-3.8-flash",
            ];
        const uniqueModels = Array.from(new Set(candidateModels.filter(Boolean)));

        // Build user parts (with media if present)
        const userParts: any[] = [];
        if (mediaBase64) {
          const rawMime = mimeType || "image/jpeg";
          const cleanMime = rawMime.split(";")[0].trim();
          userParts.push({
            inlineData: {
              mimeType: cleanMime,
              data: mediaBase64.replace(/^data:[^;]+;base64,/, ""),
            },
          });
        }
        userParts.push({ text: userPrompt });

        // Generous timeout for large code/artifact generation; responsive timeout for chat & media
        const requestTimeout = maxTokens > 2000 ? 28000 : mediaBase64 ? 14000 : 9000;

        for (const m of uniqueModels) {
          try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${p.apiKey.trim()}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: AbortSignal.timeout(requestTimeout),
              body: JSON.stringify({
                contents: [{ role: "user", parts: userParts }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: { temperature, maxOutputTokens: maxTokens },
              }),
            });

            if (res.ok) {
              const data = await res.json();
              const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (candidate) {
                return {
                  text: candidate.trim(),
                  provider: `${p.name} (${p.provider.toUpperCase()})`,
                  model: m,
                  fallbackTriggered: i > 0 || m !== targetModel,
                  errorsEncountered: errors,
                };
              }
            } else {
              const errText = await res.text();
              errors.push(`${p.name} (${m}) HTTP ${res.status}: ${errText.slice(0, 100)}`);
              // If model-specific quota was hit, continue trying next candidate model on same key before failing over!
              continue;
            }
          } catch (modelErr: any) {
            errors.push(`${p.name} (${m}) error: ${modelErr.message}`);
            // If the request timed out on large generation, don't cascade 3 more identical timeouts on the same key!
            if (modelErr.name === "TimeoutError" || modelErr.message?.includes("aborted") || modelErr.message?.includes("timeout")) {
              break;
            }
          }
        }
      }


      // 2. OpenRouter
      if (p.provider === "openrouter") {
        const targetModel = p.model?.trim() || "meta-llama/llama-3.3-70b-instruct";
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${p.apiKey.trim()}`,
            "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://obeyai.vercel.app",
            "X-Title": "Obey AI Agent",
          },
          body: JSON.stringify({
            model: targetModel,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature,
            max_tokens: maxTokens,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            return {
              text: content.trim(),
              provider: p.name,
              model: targetModel,
              fallbackTriggered: i > 0,
              errorsEncountered: errors,
            };
          }
        } else {
          const errText = await res.text();
          errors.push(`${p.name} HTTP ${res.status}: ${errText.slice(0, 100)}`);
        }
      }

      // 3. xAI Grok
      if (p.provider === "grok") {
        const targetModel = p.model?.trim() || "grok-2-latest";
        const res = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${p.apiKey.trim()}`,
          },
          body: JSON.stringify({
            model: targetModel,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature,
            max_tokens: maxTokens,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            return {
              text: content.trim(),
              provider: p.name,
              model: targetModel,
              fallbackTriggered: i > 0,
              errorsEncountered: errors,
            };
          }
        } else {
          const errText = await res.text();
          errors.push(`${p.name} HTTP ${res.status}: ${errText.slice(0, 100)}`);
        }
      }

      // 4. Groq
      if (p.provider === "groq") {
        const targetModel = p.model?.trim() || "llama-3.3-70b-versatile";
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${p.apiKey.trim()}`,
          },
          body: JSON.stringify({
            model: targetModel,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature,
            max_tokens: maxTokens,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            return {
              text: content.trim(),
              provider: p.name,
              model: targetModel,
              fallbackTriggered: i > 0,
              errorsEncountered: errors,
            };
          }
        } else {
          const errText = await res.text();
          errors.push(`${p.name} HTTP ${res.status}: ${errText.slice(0, 100)}`);
        }
      }

      // 5. OpenAI
      if (p.provider === "openai") {
        const targetModel = p.model?.trim() || "gpt-4o-mini";
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${p.apiKey.trim()}`,
          },
          body: JSON.stringify({
            model: targetModel,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature,
            max_tokens: maxTokens,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            return {
              text: content.trim(),
              provider: p.name,
              model: targetModel,
              fallbackTriggered: i > 0,
              errorsEncountered: errors,
            };
          }
        } else {
          const errText = await res.text();
          errors.push(`${p.name} HTTP ${res.status}: ${errText.slice(0, 100)}`);
        }
      }
    } catch (err: any) {
      errors.push(`${p.name} runtime exception: ${err.message}`);
    }
  }

  // 6. Built-in Deterministic Fallback Engine (always reliable)
  return {
    text: generateDeterministicAgentResponse(userPrompt, systemPrompt),
    provider: "Obey Core Engine (Deterministic Fallback)",
    model: "obey-v1-rule-engine",
    fallbackTriggered: true,
    errorsEncountered: errors,
  };
}

/**
 * Fallback response if all AI models are offline, exhausted, or unavailable.
 * Completely eliminates canned generic scripts so Femi instantly knows when no AI model is active.
 */
function generateDeterministicAgentResponse(userPrompt: string, systemPrompt?: string): string {
  const isGuestOrVisitor = Boolean(
    systemPrompt && (
      systemPrompt.includes("GENDER NEUTRAL") ||
      systemPrompt.includes("Never call this contact") ||
      systemPrompt.includes("visitor") ||
      systemPrompt.includes("visitor inquiry")
    )
  );

  if (isGuestOrVisitor) {
    return "Hello! Please, I am busy right now. Check back with me later, or leave your project details and contact information so Femi can reach out directly. Thanks!";
  }

  // Clear, non-generic message so Femi immediately knows no model is currently active
  return "Please, I am busy right now. Check back with me later. Thanks";
}

/**
 * Transcribes voice notes and audio recordings using multimodal Gemini
 */
export async function transcribeAudio(
  audioBase64: string,
  mimeType: string = "audio/ogg"
): Promise<{ text: string; success: boolean; error?: string }> {
  try {
    const cleanBase64 = audioBase64.replace(/^data:[^;]+;base64,/, "").trim();
    if (!cleanBase64) {
      return { text: "", success: false, error: "Empty audio buffer" };
    }

    const cleanMime = (mimeType || "audio/ogg").split(";")[0].trim();

    const res = await executeAICompletion({
      systemPrompt: "You are an expert audio transcription engine. Listen carefully to this voice note and transcribe the exact words spoken in English or Nigerian Pidgin. Output ONLY the raw spoken words. Do not add quotes, greetings, or explanations. If the audio is completely silent or unrecognizable, output [unclear audio].",
      userPrompt: "Transcribe the attached voice note accurately.",
      mediaBase64: cleanBase64,
      mimeType: cleanMime,
      temperature: 0.1,
      maxTokens: 1024,
    });

    const transcript = res.text.trim().replace(/^["']|["']$/g, "");
    // Guard: deterministic fallback or busy messages must NEVER masquerade as user voice transcript
    if (
      res.provider?.includes("Deterministic") ||
      transcript.includes("Please, I am busy right now") ||
      transcript.includes("Check back with me later") ||
      !transcript ||
      transcript.toLowerCase().includes("[unclear audio]")
    ) {
      return { text: "", success: false, error: "Audio was unclear, silent, or transcription engine unavailable" };
    }

    return { text: transcript, success: true };
  } catch (err: any) {
    console.error("[Transcribe] Audio transcription error:", err);
    return { text: "", success: false, error: err.message };
  }
}

/**
 * Analyzes images, documents, or screenshots with multimodal Gemini
 */
export async function executeAICompletionWithMedia(options: {
  systemPrompt?: string;
  userPrompt: string;
  mediaBase64: string;
  mimeType: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<AICompletionResult> {
  return executeAICompletion(options);
}

