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
        const targetModel = p.model?.trim() || "gemini-2.5-flash";
        const candidateModels = [targetModel];
        if (targetModel !== "gemini-2.5-flash-lite") candidateModels.push("gemini-2.5-flash-lite");
        if (targetModel !== "gemini-flash-latest") candidateModels.push("gemini-flash-latest");

        for (const m of candidateModels) {
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

  // Compute accurate Nigerian local time in West Africa Time (Africa/Lagos, UTC+1)
  const { hour: watHour } = getNigerianTime();
  let timeGreeting = "Good afternoon, sir";
  if (watHour >= 5 && watHour < 12) timeGreeting = "Good morning, sir";
  else if (watHour >= 12 && watHour < 17) timeGreeting = "Good afternoon, sir";
  else timeGreeting = "Good evening, sir";

  // Greetings & warm human check-in
  if (
    lower.includes("hello") ||
    lower.includes("hi ") ||
    lower === "hi" ||
    lower.includes("hey") ||
    lower.includes("good morning") ||
    lower.includes("good afternoon") ||
    lower.includes("good evening") ||
    lower.includes("how far") ||
    lower.includes("greeting")
  ) {
    return (
      `${timeGreeting}! How was today's work, sir? I hope everything went smoothly.\n\n` +
      `How can I help you right now, sir? What are the key things or ideas we need to note down or tackle together?`
    );
  }

  // Empathy, stress, and fatigue support
  if (lower.includes("stress") || lower.includes("tired") || lower.includes("exhaust") || lower.includes("omo")) {
    return (
      `Omo, take it easy, sir! You have been putting in tremendous work, Boss. Please make sure to get some rest and breathe.\n\n` +
      `Don't stress about the pending pipelines—I have everything tracked safely in our Neon cloud database. If there's anything you'd like me to draft, scout, or line up for tomorrow so you can rest today, just say the word, sir!`
    );
  }

  // Priorities and "What to note"
  if (lower.includes("what to note") || lower.includes("things to note") || lower.includes("note down")) {
    return (
      `Here are the key operational priorities for us to keep top of mind, sir:\n\n` +
      `1. **Flagship Portfolios:** Keep **AutoLearn Spot** and **OKIKI Store** prominently cited as live case studies in every client proposal.\n` +
      `2. **Inflow Streams:** Run our Upwork and B2B scouts to ensure a steady pipeline of contract opportunities.\n` +
      `3. **Strategic Architecture:** Focus your engineering on scalable n8n workflows and Next.js full-stack systems where your ROI is highest.\n` +
      `4. **Energy Management:** Prioritize high-impact deliverables and let me handle the outreach drafts and scouting.\n\n` +
      `What would you like us to focus on next, sir?`
    );
  }

  // AutoLearn Spot
  if (lower.includes("autolearn") || lower.includes("auto learn") || lower.includes("spot")) {
    return (
      "Yes, sir! Of course I know **AutoLearn Spot**! It is your premier EdTech platform and learning portal built to provide students with accessible, high-speed educational tools and curriculum management. It's one of your cornerstone projects alongside OKIKI Store and your n8n automation suites.\n\n" +
      "Are we looking to review its performance, update features, or reference it in a new proposal, sir? I'm all ears!"
    );
  }

  // OKIKI Store
  if (lower.includes("okiki") || lower.includes("store") || lower.includes("ecommerce") || lower.includes("e-commerce")) {
    return (
      "Yes, sir! **OKIKI Electronics Store** is your premier high-performance e-commerce platform engineered with Next.js and Tailwind CSS. It features seamless cart management, blazing fast search, responsive checkout, and rock-solid state management."
    );
  }

  // About Femi / Who am I / Projects
  if (
    lower.includes("about me") ||
    lower.includes("who am i") ||
    lower.includes("who is femi") ||
    lower.includes("my project") ||
    lower.includes("my stack") ||
    lower.includes("what do you know")
  ) {
    return (
      "You are **Femi Adeleke**, sir—a premier Full-Stack Developer & Automation Architect from Nigeria working with global teams. You have engineered high-impact platforms including **AutoLearn Spot**, **OKIKI Electronics Store**, **PassMark UTME Prep App**, and multi-system **n8n automation pipelines** (WhatsApp webhook bots, CRM sync, and automated billing).\n\n" +
      "I am Obey, your personal AI executive assistant. I have all your project credentials, Neon database state, and outreach tools ready. What shall we tackle next, sir?"
    );
  }

  if (lower.includes("proposal") || lower.includes("bid")) {
    return (
      `Here is a custom high-converting technical bid tailored to your verified stack, sir:\n\n` +
      `"I have engineered similar high-performance Next.js and automation systems recently, including OKIKI Store and AutoLearn Spot.\n\n` +
      `My approach:\n` +
      `1. Architecture Alignment: Zero-friction integration with sub-second page transitions.\n` +
      `2. Resilient Pipeline: Fail-safe webhook retries and automated state handling.\n` +
      `3. Production Deployment: Instant Vercel CI/CD and verification.\n\n` +
      `Portfolio & Code: https://github.com/Phemmy111\nAvailable for a brief alignment call today."`
    );
  }

  if (lower.includes("email") || lower.includes("cold") || lower.includes("pitch")) {
    return (
      `Subject: Streamlining manual bottlenecks with automated workflows\n\n` +
      `Hi there,\n\nI noticed you might be navigating manual operational workflows between customer inquiries, tracking, and messaging.\n\n` +
      `I help fast-growing teams automate their entire pipeline using n8n and AI agents, cutting repetitive tasks down to zero.\n\n` +
      `Would you be open to a brief 5-minute chat this week to explore how we can optimize this?\n\n` +
      `Best regards,\nFemi Adeleke\nFull-Stack Developer & Automation Architect`
    );
  }

  return `I am standing by right beside you, sir! Everything across your database, email dispatches, and project records is active. How can I help you right now, sir? Are there specific leads to hunt or tasks to note down?`;
}
