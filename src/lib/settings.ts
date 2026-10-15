import { neon } from "@neondatabase/serverless";

const dbUrl = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_JjwKqG1xtk4W@ep-dawn-feather-b5pjlp0o.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require";
const sql = neon(dbUrl);

export interface SystemSetting {
  key: string;
  value: string;
  updated_at?: string;
}

export interface AIProviderConfig {
  id: string;
  provider: "gemini" | "openrouter" | "grok" | "groq" | "openai";
  name: string;
  apiKey: string;
  model: string;
  enabled: boolean;
}

export interface VapiProviderConfig {
  id: string;
  name: string;
  apiKey: string;
  assistantId?: string;
  phoneNumberId?: string;
  enabled: boolean;
}

export const KNOWN_KEYS = [
  "AI_PROVIDERS_POOL",
  "VAPI_PROVIDERS_POOL",
  "VAPI_API_KEY",
  "VAPI_PUBLIC_KEY",
  "VAPI_ASSISTANT_ID",
  "VAPI_PHONE_NUMBER_ID",
  "OBEY_BRAIN_KNOWLEDGE",
  "OBEY_CUSTOM_INSTRUCTIONS",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "APOLLO_API_KEY",
  "TAVILY_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "GROK_API_KEY",
  "GROK_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "GROQ_API_KEY",
  "GROQ_MODEL",
  "UPWORK_FEED_URL",
  "CRM_WEBHOOK_URL",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "WHATSAPP_PHONE_NUMBER",
  "WHATSAPP_API_TOKEN",
  "PROACTIVE_MORNING_BRIEF_ENABLED",
  "PROACTIVE_EVENING_CHECKIN_ENABLED",
  "PROACTIVE_INSTANT_ALERTS_ENABLED",
] as const;

export type KnownKey = typeof KNOWN_KEYS[number];

/**
 * Retrieves a single setting, prioritizing database then process.env
 */
export async function getSetting(key: string): Promise<string> {
  try {
    const rows = await sql`SELECT value FROM agent_settings WHERE key = ${key} LIMIT 1` as Array<{ value: string }>;
    if (rows && rows.length > 0 && rows[0].value?.trim()) {
      return rows[0].value.trim();
    }
  } catch (err) {
    console.warn(`Failed to fetch setting ${key} from DB, falling back to env:`, err);
  }

  return (process.env[key] || "").trim();
}

/**
 * Retrieves Obey's permanent knowledge and custom behavior directives for prompt injection
 */
export async function getObeyBrainContext(): Promise<{ knowledge: string; instructions: string; formattedPrompt: string }> {
  try {
    const [knowledge, instructions] = await Promise.all([
      getSetting("OBEY_BRAIN_KNOWLEDGE"),
      getSetting("OBEY_CUSTOM_INSTRUCTIONS"),
    ]);

    const parts: string[] = [];
    if (knowledge?.trim()) {
      parts.push(`\n🧠 OBEY BRAIN · PERMANENT MEMORY & CORE FACTS (NEVER FORGET):\n${knowledge.trim()}`);
    }
    if (instructions?.trim()) {
      parts.push(`\n⚡ OBEY BRAIN · CUSTOM BEHAVIOR DIRECTIVES & OVERRIDES:\n${instructions.trim()}`);
    }

    return {
      knowledge: knowledge?.trim() || "",
      instructions: instructions?.trim() || "",
      formattedPrompt: parts.join("\n"),
    };
  } catch (err) {
    console.warn("Failed to get Obey brain context:", err);
    return { knowledge: "", instructions: "", formattedPrompt: "" };
  }
}

/**
 * Saves or updates a setting in the persistent database
 */
export async function setSetting(key: string, value: string): Promise<void> {
  await sql`
    INSERT INTO agent_settings (key, value, updated_at)
    VALUES (${key}, ${value.trim()}, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
  `;
}

/**
 * Retrieves the full AI Providers Pool (multi-key list)
 */
export async function getAIProvidersPool(): Promise<AIProviderConfig[]> {
  try {
    const raw = await getSetting("AI_PROVIDERS_POOL");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("Failed to parse AI_PROVIDERS_POOL:", err);
  }

  // Fallback / Auto-migration from singular keys
  const pool: AIProviderConfig[] = [];
  const geminiKey = await getSetting("GEMINI_API_KEY");
  const geminiModel = (await getSetting("GEMINI_MODEL")) || "gemini-flash-lite-latest";
  if (geminiKey) {
    pool.push({
      id: "gemini-default",
      provider: "gemini",
      name: "Google Gemini (Primary)",
      apiKey: geminiKey,
      model: geminiModel,
      enabled: true,
    });
  }

  const openRouterKey = await getSetting("OPENROUTER_API_KEY");
  if (openRouterKey) {
    pool.push({
      id: "openrouter-default",
      provider: "openrouter",
      name: "OpenRouter Fallback",
      apiKey: openRouterKey,
      model: (await getSetting("OPENROUTER_MODEL")) || "meta-llama/llama-3.3-70b-instruct",
      enabled: true,
    });
  }

  const grokKey = await getSetting("GROK_API_KEY");
  if (grokKey) {
    pool.push({
      id: "grok-default",
      provider: "grok",
      name: "xAI Grok Fallback",
      apiKey: grokKey,
      model: (await getSetting("GROK_MODEL")) || "grok-2-latest",
      enabled: true,
    });
  }

  const groqKey = await getSetting("GROQ_API_KEY");
  if (groqKey) {
    pool.push({
      id: "groq-default",
      provider: "groq",
      name: "Groq Llama Fallback",
      apiKey: groqKey,
      model: (await getSetting("GROQ_MODEL")) || "llama-3.3-70b-versatile",
      enabled: true,
    });
  }

  const openAIKey = await getSetting("OPENAI_API_KEY");
  if (openAIKey) {
    pool.push({
      id: "openai-default",
      provider: "openai",
      name: "OpenAI Fallback",
      apiKey: openAIKey,
      model: (await getSetting("OPENAI_MODEL")) || "gpt-4o-mini",
      enabled: true,
    });
  }

  return pool;
}

/**
 * Saves the AI Providers Pool to Neon DB
 */
export async function setAIProvidersPool(pool: AIProviderConfig[]): Promise<void> {
  await setSetting("AI_PROVIDERS_POOL", JSON.stringify(pool));
}

/**
 * Retrieves the full Vapi Voice Call Providers Pool (multi-account/multi-key list)
 */
export async function getVapiProvidersPool(): Promise<VapiProviderConfig[]> {
  try {
    const raw = await getSetting("VAPI_PROVIDERS_POOL");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("Failed to parse VAPI_PROVIDERS_POOL:", err);
  }

  // Fallback / Auto-migration from singular key
  const pool: VapiProviderConfig[] = [];
  const singleKey = await getSetting("VAPI_API_KEY");
  const assistantId = await getSetting("VAPI_ASSISTANT_ID");
  const phoneNumberId = await getSetting("VAPI_PHONE_NUMBER_ID");
  if (singleKey) {
    pool.push({
      id: "vapi-default",
      name: "Vapi Primary Account (Free Trial)",
      apiKey: singleKey,
      assistantId,
      phoneNumberId,
      enabled: true,
    });
  }
  return pool;
}

/**
 * Saves the Vapi Voice Call Providers Pool to Neon DB
 */
export async function setVapiProvidersPool(pool: VapiProviderConfig[]): Promise<void> {
  await setSetting("VAPI_PROVIDERS_POOL", JSON.stringify(pool));
}


/**
 * Retrieves all known settings with sensitive values masked for UI display
 */
export async function getAllSettingsMasked(): Promise<Record<string, { value: string; isSet: boolean; masked: string }>> {
  const result: Record<string, { value: string; isSet: boolean; masked: string }> = {};

  let dbRows: Array<{ key: string; value: string }> = [];
  try {
    dbRows = await sql`SELECT key, value FROM agent_settings` as Array<{ key: string; value: string }>;
  } catch (err) {
    console.warn("Failed to load settings table:", err);
  }

  const dbMap = new Map(dbRows.map((r) => [r.key, r.value]));

  for (const k of KNOWN_KEYS) {
    const val = (dbMap.get(k) || process.env[k] || "").trim();
    const isSet = Boolean(val);

    let masked = "";
    if (isSet) {
      if (k === "AI_PROVIDERS_POOL") {
        masked = "[Configured Multi-Provider Pool]";
      } else if (val.length <= 8) {
        masked = "••••••••";
      } else {
        masked = `${val.slice(0, 4)}••••••••${val.slice(-4)}`;
      }
    }

    result[k] = {
      value: val,
      isSet,
      masked,
    };
  }

  return result;
}
