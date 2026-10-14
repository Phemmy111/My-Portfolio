import { NextRequest, NextResponse } from "next/server";
import {
  getAllSettingsMasked,
  setSetting,
  getSetting,
  KNOWN_KEYS,
  getAIProvidersPool,
  setAIProvidersPool,
  AIProviderConfig,
  getVapiProvidersPool,
  setVapiProvidersPool,
  VapiProviderConfig,
} from "@/lib/settings";
import { sendTelegramMessage } from "@/lib/telegram-bot";
import { dispatchMorningBriefing, dispatchEveningWrapup } from "@/lib/proactive-engine";

export async function GET() {
  try {
    const [settings, pool, vapiPool] = await Promise.all([
      getAllSettingsMasked(),
      getAIProvidersPool(),
      getVapiProvidersPool(),
    ]);
    return NextResponse.json({ success: true, settings, pool, vapiPool });
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

    // 1b. Save Vapi Voice Provider Pool
    if (body.action === "save_vapi_pool" && Array.isArray(body.vapiPool)) {
      await setVapiProvidersPool(body.vapiPool as VapiProviderConfig[]);
      const updatedVapiPool = await getVapiProvidersPool();
      return NextResponse.json({
        success: true,
        message: "Vapi Voice Calling Pool saved to database successfully!",
        vapiPool: updatedVapiPool,
      });
    }

    // 1c. Test Vapi Connection
    if (body.action === "test_vapi") {
      const { apiKey } = body;
      if (!apiKey?.trim()) {
        return NextResponse.json({ success: false, error: "Vapi API Key is required" });
      }
      try {
        const res = await fetch("https://api.vapi.ai/assistant", {
          headers: { Authorization: `Bearer ${apiKey.trim()}` },
        });
        if (res.ok) {
          return NextResponse.json({ success: true, message: "Connected to Vapi.ai successfully! Ready for voice calling." });
        }
        const err = await res.text();
        return NextResponse.json({ success: false, error: `Vapi HTTP ${res.status}: ${err.slice(0, 100)}` });
      } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
      }
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

    // 4. Test Telegram Phone Connection
    if (body.action === "test_telegram") {
      const { token, chatId } = body;
      if (token) await setSetting("TELEGRAM_BOT_TOKEN", token);
      if (chatId) await setSetting("TELEGRAM_CHAT_ID", chatId);

      // Auto-register webhook with Telegram so Obey receives all incoming messages from Femi's phone
      const cleanToken = token || (await getSetting("TELEGRAM_BOT_TOKEN"));
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://femiadelekeportfolio.vercel.app";
      if (cleanToken) {
        try {
          await fetch(`https://api.telegram.org/bot${cleanToken}/setWebhook?url=${encodeURIComponent(`${appUrl}/api/obey/telegram/webhook`)}`);
        } catch (e) {
          console.warn("setWebhook error:", e);
        }
      }

      const res = await sendTelegramMessage(
        "👋 *Hello sir!* This is Obey testing our live phone gateway from your portfolio Command Center.\n\n" +
        "Your phone is successfully paired with Obey! You can now receive proactive briefings, instant lead alerts, and chat with me directly on Telegram whenever you are on the move."
      );
      return NextResponse.json(res);
    }

    // 5. Test Proactive Briefing Trigger
    if (body.action === "test_proactive_brief") {
      const briefType = body.type || "morning";
      if (briefType === "evening") {
        const res = await dispatchEveningWrapup();
        return NextResponse.json(res);
      } else {
        const res = await dispatchMorningBriefing();
        return NextResponse.json(res);
      }
    }

    // 6. Test Gmail Reader & Inbox Sync
    if (body.action === "test_gmail") {
      const { runGmailInboxSync } = await import("@/lib/gmail-reader");
      const res = await runGmailInboxSync();
      return NextResponse.json(res);
    }

    // 7. Live WhatsApp QR Code & Pairing Status (Evolution API on Render)
    if (body.action === "whatsapp_qr" || body.action === "whatsapp_reconnect") {
      const evoUrl = process.env.EVOLUTION_API_URL || "https://evolution-api-latest-cx3y.onrender.com";
      const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
      const instanceName = process.env.EVOLUTION_INSTANCE_NAME || "obey";
      try {
        if (body.force || body.action === "whatsapp_reconnect") {
          try {
            await fetch(`${evoUrl}/instance/restart/${instanceName}`, {
              method: "POST",
              headers: { apikey: evoKey },
            });
          } catch {}
        }

        // Fetch instance object to check real-time connection without stale cached states
        const instRes = await fetch(`${evoUrl}/instance/fetchInstances`, {
          headers: { apikey: evoKey },
        });
        const instances = await instRes.json();
        const inst = Array.isArray(instances) ? instances.find((i: any) => i.name === instanceName) : null;

        const isConnected = Boolean(
          inst &&
          inst.connectionStatus === "open" &&
          !inst.disconnectionReasonCode
        );

        if (isConnected && !body.force) {
          return NextResponse.json({
            success: true,
            connected: true,
            state: "open",
            ownerJid: inst.ownerJid,
          });
        }

        // Fetch fresh QR code
        const connectRes = await fetch(`${evoUrl}/instance/connect/${instanceName}`, {
          headers: { apikey: evoKey },
        });
        const connectData = await connectRes.json();

        return NextResponse.json({
          success: true,
          connected: false,
          base64: connectData?.base64 || null,
          code: connectData?.code || null,
          pairingCode: connectData?.pairingCode || null,
        });
      } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
      }
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
        .filter((name) => !name.includes("embedding") && !name.includes("aqa") && !name.includes("tts"))
        .filter((name) => !name.startsWith("gemini-2.5-")); // Filter out deprecated models that return 404

      // Prioritize flash-lite and active flash models at the top
      const preferred = ["gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-flash-latest"];
      const sorted = generateModels.sort((a, b) => {
        const aIdx = preferred.indexOf(a);
        const bIdx = preferred.indexOf(b);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
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
      const targetModel = model?.trim() || "gemini-flash-lite-latest";
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
          message: `Model '${targetModel}' is overloaded (503). Click 'Fetch Live Models' and pick another model (e.g. gemini-flash-lite-latest or gemini-3.5-flash-lite).`,
        };
      }
      return { success: false, message: `Gemini rejected key (${res.status}): ${err.slice(0, 100)}` };
    }

    if (prov === "apollo" || prov === "apollo_api_key") {
      // Test key validity against Apollo account
      const authRes = await fetch("https://api.apollo.io/v1/email_accounts", {
        method: "GET",
        headers: {
          "x-api-key": cleanKey,
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      });

      const latencyMs = Date.now() - start;
      if (authRes.ok) {
        const authData = await authRes.json();
        const userName = authData?.email_accounts?.[0]?.user_name || "Femi Adeleke";
        const email = authData?.email_accounts?.[0]?.email || "";
        return {
          success: true,
          message: `Connected to Apollo.io account (${userName}${email ? ` · ${email}` : ""}) successfully (${latencyMs}ms)!`,
          latencyMs,
        };
      }

      // Fallback try auth health
      const healthRes = await fetch(`https://api.apollo.io/v1/auth/health?api_key=${cleanKey}`);
      if (healthRes.ok) {
        return {
          success: true,
          message: `Connected to Apollo.io Lead Engine (${Date.now() - start}ms)!`,
          latencyMs: Date.now() - start,
        };
      }

      const errText = await authRes.text();
      return { success: false, message: `Apollo rejected key (HTTP ${authRes.status}): ${errText.slice(0, 100)}` };
    }

    if (prov === "tavily" || prov === "tavily_api_key") {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: cleanKey,
          query: "ping",
          max_results: 1,
        }),
      });

      const latencyMs = Date.now() - start;
      if (res.ok) {
        return {
          success: true,
          message: `Connected to Tavily AI Live Web Search successfully (${latencyMs}ms)!`,
          latencyMs,
        };
      }
      const errText = await res.text();
      return { success: false, message: `Tavily rejected key (HTTP ${res.status}): ${errText.slice(0, 100)}` };
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
