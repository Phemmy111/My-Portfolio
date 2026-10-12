import { NextRequest, NextResponse } from "next/server";
import { getAllSettingsMasked, setSetting, KNOWN_KEYS } from "@/lib/settings";

export async function GET() {
  try {
    const settings = await getAllSettingsMasked();
    return NextResponse.json({ success: true, settings });
  } catch (err: any) {
    console.error("Settings GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1. Connection Test Action
    if (body.action === "test") {
      const { provider, key } = body;
      const testResult = await testProviderConnection(provider, key);
      return NextResponse.json(testResult);
    }

    // 2. Save Settings Action
    const { updates } = body;
    if (!updates || typeof updates !== "object") {
      return NextResponse.json({ error: "Invalid updates format" }, { status: 400 });
    }

    for (const [k, v] of Object.entries(updates)) {
      if (KNOWN_KEYS.includes(k as any) && typeof v === "string") {
        await setSetting(k, v);
      }
    }

    const updatedSettings = await getAllSettingsMasked();
    return NextResponse.json({
      success: true,
      message: "API keys & provider settings saved to persistent database successfully!",
      settings: updatedSettings,
    });
  } catch (err: any) {
    console.error("Settings POST error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Tests provider key against its actual API endpoint
 */
async function testProviderConnection(provider: string, key: string): Promise<{ success: boolean; message: string; latencyMs?: number }> {
  if (!key || !key.trim()) {
    return { success: false, message: "Key cannot be empty." };
  }

  const start = Date.now();
  const cleanKey = key.trim();

  try {
    if (provider === "GEMINI_API_KEY") {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${cleanKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "ping" }] }],
          generationConfig: { maxOutputTokens: 2 },
        }),
      });

      const latencyMs = Date.now() - start;
      if (res.ok) {
        return { success: true, message: `Connected to Google Gemini successfully (${latencyMs}ms)!`, latencyMs };
      }
      const err = await res.text();
      return { success: false, message: `Gemini rejected key (${res.status}): ${err.slice(0, 80)}` };
    }

    if (provider === "APOLLO_API_KEY") {
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

    if (provider === "OPENROUTER_API_KEY") {
      const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: { Authorization: `Bearer ${cleanKey}` },
      });

      const latencyMs = Date.now() - start;
      if (res.ok) {
        return { success: true, message: `Connected to OpenRouter (${latencyMs}ms)!`, latencyMs };
      }
      return { success: false, message: `OpenRouter rejected key (HTTP ${res.status}).` };
    }

    if (provider === "GROK_API_KEY") {
      const res = await fetch("https://api.x.ai/v1/models", {
        headers: { Authorization: `Bearer ${cleanKey}` },
      });

      const latencyMs = Date.now() - start;
      if (res.ok) {
        return { success: true, message: `Connected to xAI Grok (${latencyMs}ms)!`, latencyMs };
      }
      return { success: false, message: `Grok rejected key (HTTP ${res.status}).` };
    }

    if (provider === "GROQ_API_KEY") {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${cleanKey}` },
      });

      const latencyMs = Date.now() - start;
      if (res.ok) {
        return { success: true, message: `Connected to Groq Llama (${latencyMs}ms)!`, latencyMs };
      }
      return { success: false, message: `Groq rejected key (HTTP ${res.status}).` };
    }

    if (provider === "OPENAI_API_KEY") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${cleanKey}` },
      });

      const latencyMs = Date.now() - start;
      if (res.ok) {
        return { success: true, message: `Connected to OpenAI (${latencyMs}ms)!`, latencyMs };
      }
      return { success: false, message: `OpenAI rejected key (HTTP ${res.status}).` };
    }

    return { success: true, message: "Key saved." };
  } catch (err: any) {
    return { success: false, message: `Connection error: ${err.message}` };
  }
}
