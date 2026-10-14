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
  temperature?: number;
  maxTokens?: number;
}

/**
 * Executes an AI completion across the user-configured multi-key Provider Pool in sequential priority.
 * Seamlessly fails over from Key 1 -> Key 2 -> Key 3 (even across multiple Gemini or Grok accounts).
 */
export async function executeAICompletion(options: PromptOptions): Promise<AICompletionResult> {
  const {
    systemPrompt = "You are Obey, an autonomous AI executive assistant for Femi Adeleke.",
    userPrompt,
    temperature = 0.7,
    maxTokens = 2048,
  } = options;

  const errors: string[] = [];
  const pool = await getAIProvidersPool();
  const activeProviders = pool.filter((p) => p.enabled && p.apiKey?.trim());

  for (let i = 0; i < activeProviders.length; i++) {
    const p = activeProviders[i];

    try {
      // 1. Google Gemini
      if (p.provider === "gemini") {
        const targetModel = p.model?.trim() || "gemini-flash-lite-latest";
        const candidateModels = [
          targetModel,
          "gemini-flash-lite-latest",
          "gemini-3.5-flash-lite",
          "gemini-3.1-flash-lite",
          "gemini-3.8-flash",
          "gemini-3.7-flash",
          "gemini-3.6-flash",
        ];
        const uniqueModels = Array.from(new Set(candidateModels.filter(Boolean)));

        for (const m of uniqueModels) {
          try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${p.apiKey.trim()}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: userPrompt }] }],
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
            }
          } catch (modelErr: any) {
            errors.push(`${p.name} (${m}) error: ${modelErr.message}`);
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
            "HTTP-Referer": "https://femiadelekeportfolio.vercel.app",
            "X-Title": "Femi Adeleke AI Agent Obey",
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
