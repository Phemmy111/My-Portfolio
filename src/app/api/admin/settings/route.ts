import { NextRequest, NextResponse } from "next/server";
import {
  getAllSettingsMasked,
  setSetting,
  KNOWN_KEYS,
  getAIProvidersPool,
  setAIProvidersPool,
  AIProviderConfig,
} from "@/lib/settings";

export async function GET() {
  try {
    const [settings, pool] = await Promise.all([
      getAllSettingsMasked(),
      getAIProvidersPool(),
    ]);
    return NextResponse.json({ success: true, settings, pool });
  } catch (err: any) {
    console.error("Settings GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1. Save Multi-Key Provider Pool
    if (body.action === "save_pool" && Array.isArray(body.pool)) {
      await setAIProvidersPool(body.pool as AIProviderConfig[]);
      const updatedPool = await getAIProvidersPool();
      return NextResponse.json({
        success: true,
        message: "AI Provider Pool saved to database successfully!",
        pool: updatedPool,
      });
    }

    // 2. Fetch Real-Time Models Action
    if (body.action === "fetch_models") {
      const { provider, key } = body;
      const modelsResult = await fetchProviderLiveModels(provider, key);
      return NextResponse.json(modelsResult);
    }

    // 3. Connection Test Action
    if (body.action === "test") {
      const { provider, key, model } = body;
      const testResult = await testProviderConnection(provider, key, model);
      return NextResponse.json(testResult);
    }

    // 4. Save General Settings Action
    const { updates } = body;
    if (updates && typeof updates === "object") {
      for (const [k, v] of Object.entries(updates)) {
        if (KNOWN_KEYS.includes(k as any) && typeof v === "string") {
          await setSetting(k, v);
        }
      }
    }

    const [updatedSettings, updatedPool] = await Promise.all([
      getAllSettingsMasked(),
      getAIProvidersPool(),
    ]);

    return NextResponse.json({
      success: true,
      message: "API keys & preferences saved to persistent database successfully!",
      settings: updatedSettings,
      pool: updatedPool,
    });
  } catch (err: any) {
    console.error("Settings POST error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Fetches real-time available models from provider API
 */
async function fetchProviderLiveModels(provider: string, key: string): Promise<{ success: boolean; models: string[]; message?: string }> {
  if (!key || !key.trim()) {
    return { success: false, models: [], message: "Provide an API key to fetch live models." };
  }

  const cleanKey = key.trim();
  const prov = provider.toLowerCase();

  try {
    // 1. Google Gemini
    if (prov === "gemini" || prov === "gemini_api_key") {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`);
      if (!res.ok) {
        const err = await res.text();
        return { success: false, models: [], message: `Gemini API error (${res.status}): ${err.slice(0, 100)}` };
      }

      const data = await res.json();
      const rawModels: any[] = data.models || [];
      const generateModels = rawModels
        .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""))
        .filter((name) => !name.includes("embedding") && !name.includes("aqa") && !name.includes("tts"));

      // Prioritize flash and pro models at the top
      const sorted = generateModels.sort((a, b) => {
        if (a.includes("flash") && !b.includes("flash")) return -1;
        if (!a.includes("flash") && b.includes("flash")) return 1;
        return a.localeCompare(b);
      });

      return { success: true, models: sorted };
    }

    // 2. OpenRouter
    if (prov === "openrouter" || prov === "openrouter_api_key") {
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${cleanKey}` },
      });
      if (!res.ok) {
        return { success: false, models: [], message: `OpenRouter returned HTTP ${res.status}` };
      }
      const data = await res.json();
      const models = (data.data || []).map((m: any) => m.id).slice(0, 50);
      return { success: true, models };
    }

    // 3. Groq
    if (prov === "groq" || prov === "groq_api_key") {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${cleanKey}` },
      });
      if (!res.ok) {
        return { success: false, models: [], message: `Groq returned HTTP ${res.status}` };
      }
      const data = await res.json();
      const models = (data.data || []).map((m: any) => m.id);
      return { success: true, models };
    }

    // 4. xAI Grok
    if (prov === "grok" || prov === "grok_api_key") {
      const res = await fetch("https://api.x.ai/v1/models", {
        headers: { Authorization: `Bearer ${cleanKey}` },
      });
      if (!res.ok) {
        return { success: false, models: [], message: `xAI Grok returned HTTP ${res.status}` };
      }
      const data = await res.json();
      const models = (data.data || []).map((m: any) => m.id);
      return { success: true, models };
    }

    // 5. OpenAI
    if (prov === "openai" || prov === "openai_api_key") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${cleanKey}` },
      });
      if (!res.ok) {
        return { success: false, models: [], message: `OpenAI returned HTTP ${res.status}` };
      }
      const data = await res.json();
      const models = (data.data || [])
        .map((m: any) => m.id)
        .filter((id: string) => id.startsWith("gpt") || id.startsWith("o1") || id.startsWith("chatgpt"))
        .sort();
      return { success: true, models };
    }

    return { success: false, models: [], message: "No live models endpoint for this provider." };
  } catch (err: any) {
    return { success: false, models: [], message: `Model fetch error: ${err.message}` };
  }
}

/**
 * Tests provider key against its actual API endpoint
 */
async function testProviderConnection(
  provider: string,
  key: string,
  model?: string
): Promise<{ success: boolean; message: string; latencyMs?: number }> {
  if (!key || !key.trim()) {
    return { success: false, message: "Key cannot be empty." };
  }

  const start = Date.now();
  const cleanKey = key.trim();
  const prov = provider.toLowerCase();

  try {
    if (prov === "gemini" || prov === "gemini_api_key") {
      const targetModel = model?.trim() || "gemini-2.5-flash";
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${cleanKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "ping" }] }],
          generationConfig: { maxOutputTokens: 2 },
        }),
      });

      const latencyMs = Date.now() - start;
      if (res.ok) {
        return { success: true, message: `Connected to Gemini (${targetModel}) successfully (${latencyMs}ms)!`, latencyMs };
      }
      const err = await res.text();
      if (res.status === 503) {
        return {
          success: false,
          message: `Model '${targetModel}' is overloaded (503). Click 'Fetch Live Models' and pick another model (e.g. gemini-2.5-flash-lite or gemini-2.5-flash).`,
        };
      }
      return { success: false, message: `Gemini rejected key (${res.status}): ${err.slice(0, 100)}` };
    }

    if (prov === "apollo" || prov === "apollo_api_key") {
      const res = await fetch("https://api.apollo.io/v1/mixed_people/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: cleanKey,
          page: 1,
          per_page: 1,
        }),
      });

      const latencyMs = Date.now() - start;
      if (res.ok) {
        return { success: true, message: `Connected to Apollo.io Lead Engine (${latencyMs}ms)!`, latencyMs };
      }
      return { success: false, message: `Apollo rejected key (HTTP ${res.status}). Verify API key permissions.` };
    }

    if (prov === "openrouter" || prov === "openrouter_api_key") {
      const targetModel = model?.trim() || "meta-llama/llama-3.3-70b-instruct";
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cleanKey}`,
        },
        body: JSON.stringify({
          model: targetModel,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 2,
        }),
      });

      const latencyMs = Date.now() - start;
      if (res.ok) {
        return { success: true, message: `Connected to OpenRouter (${targetModel}) successfully (${latencyMs}ms)!`, latencyMs };
      }
      return { success: false, message: `OpenRouter rejected test (HTTP ${res.status}).` };
    }

    if (prov === "grok" || prov === "grok_api_key") {
      const targetModel = model?.trim() || "grok-2-latest";
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cleanKey}`,
        },
        body: JSON.stringify({
          model: targetModel,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 2,
        }),
      });

      const latencyMs = Date.now() - start;
      if (res.ok) {
        return { success: true, message: `Connected to xAI Grok (${targetModel}) successfully (${latencyMs}ms)!`, latencyMs };
      }
      return { success: false, message: `Grok rejected test (HTTP ${res.status}).` };
    }

    if (prov === "groq" || prov === "groq_api_key") {
      const targetModel = model?.trim() || "llama-3.3-70b-versatile";
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cleanKey}`,
        },
        body: JSON.stringify({
          model: targetModel,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 2,
        }),
      });

      const latencyMs = Date.now() - start;
      if (res.ok) {
        return { success: true, message: `Connected to Groq (${targetModel}) successfully (${latencyMs}ms)!`, latencyMs };
      }
      return { success: false, message: `Groq rejected test (HTTP ${res.status}).` };
    }

    if (prov === "openai" || prov === "openai_api_key") {
      const targetModel = model?.trim() || "gpt-4o-mini";
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cleanKey}`,
        },
        body: JSON.stringify({
          model: targetModel,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 2,
        }),
      });

      const latencyMs = Date.now() - start;
      if (res.ok) {
        return { success: true, message: `Connected to OpenAI (${targetModel}) successfully (${latencyMs}ms)!`, latencyMs };
      }
      return { success: false, message: `OpenAI rejected test (HTTP ${res.status}).` };
    }

    return { success: true, message: "Key saved." };
  } catch (err: any) {
    return { success: false, message: `Connection error: ${err.message}` };
  }
}
