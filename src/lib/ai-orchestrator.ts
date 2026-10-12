import { getSetting } from "./settings";

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
 * Executes an AI completion using a resilient multi-provider fallback waterfall.
 * Priority: Gemini -> OpenRouter -> Grok -> Groq -> OpenAI -> Local Fallback
 */
export async function executeAICompletion(options: PromptOptions): Promise<AICompletionResult> {
  const { systemPrompt = "You are Obey, an autonomous AI executive assistant for Femi Adeleke.", userPrompt, temperature = 0.7, maxTokens = 2048 } = options;
  const errors: string[] = [];

  // 1. Google Gemini (with model preference and sibling model auto-retry)
  const geminiKey = await getSetting("GEMINI_API_KEY");
  if (geminiKey) {
    const preferredModel = (await getSetting("GEMINI_MODEL")) || "gemini-2.5-flash";
    const candidateModels = [preferredModel];
    if (preferredModel !== "gemini-2.5-flash-lite") candidateModels.push("gemini-2.5-flash-lite");
    if (preferredModel !== "gemini-flash-latest") candidateModels.push("gemini-flash-latest");

    for (const modelName of candidateModels) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`, {
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
              provider: "Google Gemini",
              model: modelName,
              fallbackTriggered: errors.length > 0 || modelName !== preferredModel,
              errorsEncountered: errors,
            };
          }
        } else {
          const errText = await res.text();
          errors.push(`Gemini (${modelName}) HTTP ${res.status}: ${errText.slice(0, 100)}`);
        }
      } catch (err: any) {
        errors.push(`Gemini (${modelName}) exception: ${err.message}`);
      }
    }
  }

  // 2. OpenRouter (Multi-model aggregator)
  const openRouterKey = await getSetting("OPENROUTER_API_KEY");
  if (openRouterKey) {
    const openRouterModel = (await getSetting("OPENROUTER_MODEL")) || "meta-llama/llama-3.3-70b-instruct";
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openRouterKey}`,
          "HTTP-Referer": "https://femiadelekeportfolio.vercel.app",
          "X-Title": "Femi Adeleke AI Agent Obey",
        },
        body: JSON.stringify({
          model: openRouterModel,
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
            provider: "OpenRouter",
            model: openRouterModel,
            fallbackTriggered: true,
            errorsEncountered: errors,
          };
        }
      } else {
        const errText = await res.text();
        errors.push(`OpenRouter HTTP ${res.status}: ${errText.slice(0, 100)}`);
      }
    } catch (err: any) {
      errors.push(`OpenRouter exception: ${err.message}`);
    }
  }

  // 3. xAI / Grok
  const grokKey = await getSetting("GROK_API_KEY");
  if (grokKey) {
    const grokModel = (await getSetting("GROK_MODEL")) || "grok-2-latest";
    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${grokKey}`,
        },
        body: JSON.stringify({
          model: grokModel,
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
            provider: "xAI (Grok)",
            model: grokModel,
            fallbackTriggered: true,
            errorsEncountered: errors,
          };
        }
      } else {
        const errText = await res.text();
        errors.push(`Grok HTTP ${res.status}: ${errText.slice(0, 100)}`);
      }
    } catch (err: any) {
      errors.push(`Grok exception: ${err.message}`);
    }
  }

  // 4. Groq (High-speed LPU)
  const groqKey = await getSetting("GROQ_API_KEY");
  if (groqKey) {
    const groqModel = (await getSetting("GROQ_MODEL")) || "llama-3.3-70b-versatile";
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: groqModel,
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
            provider: "Groq",
            model: groqModel,
            fallbackTriggered: true,
            errorsEncountered: errors,
          };
        }
      } else {
        const errText = await res.text();
        errors.push(`Groq HTTP ${res.status}: ${errText.slice(0, 100)}`);
      }
    } catch (err: any) {
      errors.push(`Groq exception: ${err.message}`);
    }
  }

  // 5. OpenAI
  const openAIKey = await getSetting("OPENAI_API_KEY");
  if (openAIKey) {
    const openAIModel = (await getSetting("OPENAI_MODEL")) || "gpt-4o-mini";
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openAIKey}`,
        },
        body: JSON.stringify({
          model: openAIModel,
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
            provider: "OpenAI",
            model: openAIModel,
            fallbackTriggered: true,
            errorsEncountered: errors,
          };
        }
      } else {
        const errText = await res.text();
        errors.push(`OpenAI HTTP ${res.status}: ${errText.slice(0, 100)}`);
      }
    } catch (err: any) {
      errors.push(`OpenAI exception: ${err.message}`);
    }
  }

  // 6. Built-in Deterministic Fallback Engine (always reliable)
  return {
    text: generateDeterministicAgentResponse(userPrompt),
    provider: "Obey Core Engine (Deterministic Fallback)",
    model: "obey-v1-rule-engine",
    fallbackTriggered: true,
    errorsEncountered: errors,
  };
}

/**
 * Built-in fallback rule engine if all external models are offline or exhausted
 */
function generateDeterministicAgentResponse(userPrompt: string): string {
  const lower = userPrompt.toLowerCase();

  if (lower.includes("proposal") || lower.includes("bid")) {
    return `Here is a custom high-converting technical bid tailored to Femi's verified stack:\n\n` +
      `"I have engineered similar high-performance Next.js and automation systems recently, including OKIKI Store and AutoLearn Spot.\n\n` +
      `My approach:\n` +
      `1. Architecture Alignment: Zero-friction integration with sub-second page transitions.\n` +
      `2. Resilient Pipeline: Fail-safe webhook retries and automated state handling.\n` +
      `3. Production Deployment: Instant Vercel CI/CD and verification.\n\n` +
      `Portfolio & Code: https://github.com/Phemmy111\nAvailable for a brief alignment call today."`;
  }

  if (lower.includes("email") || lower.includes("cold") || lower.includes("pitch")) {
    return `Subject: Streamlining manual bottlenecks with automated workflows\n\n` +
      `Hi there,\n\nI noticed you might be navigating manual operational workflows between customer inquiries, tracking, and messaging.\n\n` +
      `I help fast-growing teams automate their entire pipeline using n8n and AI agents, cutting repetitive tasks down to zero.\n\n` +
      `Would you be open to a brief 5-minute chat this week to explore how we can optimize this?\n\n` +
      `Best regards,\nFemi Adeleke\nFull-Stack Developer & Automation Architect`;
  }

  return `I have processed your request across my operational pipeline. You can command me to scout live Upwork jobs, hunt real B2B decision-makers, or review pending approvals anytime.`;
}
