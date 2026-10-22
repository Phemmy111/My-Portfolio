import { NextRequest, NextResponse } from "next/server";
import { getKeyPoolAsync } from "@/lib/image-generator";

interface KeyCheckResult {
  provider: "google" | "huggingface" | "cloudflare" | "openai";
  keyMasked: string;
  status: "active" | "invalid" | "rate_limited" | "error";
  message: string;
  latencyMs: number;
}

async function verifyGoogleKey(key: string): Promise<KeyCheckResult> {
  const start = Date.now();
  const masked = key.slice(0, 6) + "..." + key.slice(-4);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
    const latency = Date.now() - start;
    if (res.ok) {
      return {
        provider: "google",
        keyMasked: masked,
        status: "active",
        message: "Key is valid & active on Google AI Studio!",
        latencyMs: latency,
      };
    }
    if (res.status === 429) {
      return {
        provider: "google",
        keyMasked: masked,
        status: "rate_limited",
        message: "Key is valid, but currently rate-limited (quota limit).",
        latencyMs: latency,
      };
    }
    const errText = await res.text();
    return {
      provider: "google",
      keyMasked: masked,
      status: "invalid",
      message: `Google rejected key (${res.status}): ${errText.slice(0, 80)}`,
      latencyMs: latency,
    };
  } catch (err: any) {
    return {
      provider: "google",
      keyMasked: masked,
      status: "error",
      message: err.message,
      latencyMs: Date.now() - start,
    };
  }
}

async function verifyHuggingFaceKey(token: string): Promise<KeyCheckResult> {
  const start = Date.now();
  const masked = token.slice(0, 5) + "..." + token.slice(-4);
  try {
    const res = await fetch("https://huggingface.co/api/whoami-v2", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const latency = Date.now() - start;
    if (res.ok) {
      const data = await res.json();
      return {
        provider: "huggingface",
        keyMasked: masked,
        status: "active",
        message: `Token valid (Account: ${data.name || "Verified"})`,
        latencyMs: latency,
      };
    }
    return {
      provider: "huggingface",
      keyMasked: masked,
      status: "invalid",
      message: `Invalid token (${res.status})`,
      latencyMs: latency,
    };
  } catch (err: any) {
    return {
      provider: "huggingface",
      keyMasked: masked,
      status: "error",
      message: err.message,
      latencyMs: Date.now() - start,
    };
  }
}

async function verifyCloudflareKey(token: string): Promise<KeyCheckResult> {
  const start = Date.now();
  const masked = token.slice(0, 6) + "..." + token.slice(-4);
  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const latency = Date.now() - start;
    if (res.ok) {
      return {
        provider: "cloudflare",
        keyMasked: masked,
        status: "active",
        message: "Token is active on Cloudflare Workers AI",
        latencyMs: latency,
      };
    }
    return {
      provider: "cloudflare",
      keyMasked: masked,
      status: "invalid",
      message: `Cloudflare token invalid (${res.status})`,
      latencyMs: latency,
    };
  } catch (err: any) {
    return {
      provider: "cloudflare",
      keyMasked: masked,
      status: "error",
      message: err.message,
      latencyMs: Date.now() - start,
    };
  }
}

async function verifyOpenAIKey(key: string): Promise<KeyCheckResult> {
  const start = Date.now();
  const masked = key.slice(0, 7) + "..." + key.slice(-4);
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const latency = Date.now() - start;
    if (res.ok) {
      return {
        provider: "openai",
        keyMasked: masked,
        status: "active",
        message: "OpenAI API key is valid & active",
        latencyMs: latency,
      };
    }
    return {
      provider: "openai",
      keyMasked: masked,
      status: "invalid",
      message: `OpenAI key invalid (${res.status})`,
      latencyMs: latency,
    };
  } catch (err: any) {
    return {
      provider: "openai",
      keyMasked: masked,
      status: "error",
      message: err.message,
      latencyMs: Date.now() - start,
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      gemini_api_keys,
      huggingface_api_keys,
      cloudflare_api_tokens,
      openai_api_keys,
      workspace_id,
    } = body;

    const parseList = (val?: string | null): string[] => {
      if (!val) return [];
      return val
        .split(/[\s,]+/)
        .map((k) => k.trim())
        .filter(Boolean);
    };

    // Use passed keys or fall back to DB/env keys
    let gKeys = parseList(gemini_api_keys);
    if (gKeys.length === 0) {
      gKeys = await getKeyPoolAsync(["GEMINI_API_KEYS", "GEMINI_API_KEY", "GOOGLE_API_KEY"], "gemini_api_keys", workspace_id);
    }

    let hfKeys = parseList(huggingface_api_keys);
    if (hfKeys.length === 0) {
      hfKeys = await getKeyPoolAsync(["HUGGINGFACE_API_KEYS", "HUGGINGFACE_API_KEY", "HF_TOKEN"], "huggingface_api_keys", workspace_id);
    }

    let cfKeys = parseList(cloudflare_api_tokens);
    if (cfKeys.length === 0) {
      cfKeys = await getKeyPoolAsync(["CLOUDFLARE_API_TOKENS", "CLOUDFLARE_API_TOKEN"], "cloudflare_api_tokens", workspace_id);
    }

    let oKeys = parseList(openai_api_keys);
    if (oKeys.length === 0) {
      oKeys = await getKeyPoolAsync(["OPENAI_API_KEYS", "OPENAI_API_KEY"], "openai_api_keys", workspace_id);
    }

    const results: KeyCheckResult[] = [];

    // Verify all keys concurrently
    const checks: Promise<any>[] = [
      ...gKeys.map((k) => verifyGoogleKey(k).then((r) => results.push(r))),
      ...hfKeys.map((k) => verifyHuggingFaceKey(k).then((r) => results.push(r))),
      ...cfKeys.map((k) => verifyCloudflareKey(k).then((r) => results.push(r))),
      ...oKeys.map((k) => verifyOpenAIKey(k).then((r) => results.push(r))),
    ];

    await Promise.allSettled(checks);

    return NextResponse.json({
      success: true,
      totalChecked: results.length,
      activeCount: results.filter((r) => r.status === "active").length,
      results,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to verify keys" }, { status: 500 });
  }
}

export async function GET() {
  // Shortcut to verify all currently configured keys in DB
  const gKeys = await getKeyPoolAsync(["GEMINI_API_KEYS", "GEMINI_API_KEY", "GOOGLE_API_KEY"], "gemini_api_keys");
  const hfKeys = await getKeyPoolAsync(["HUGGINGFACE_API_KEYS", "HUGGINGFACE_API_KEY", "HF_TOKEN"], "huggingface_api_keys");
  const cfKeys = await getKeyPoolAsync(["CLOUDFLARE_API_TOKENS", "CLOUDFLARE_API_TOKEN"], "cloudflare_api_tokens");
  const oKeys = await getKeyPoolAsync(["OPENAI_API_KEYS", "OPENAI_API_KEY"], "openai_api_keys");

  const results: KeyCheckResult[] = [];
  const checks: Promise<any>[] = [
    ...gKeys.map((k) => verifyGoogleKey(k).then((r) => results.push(r))),
    ...hfKeys.map((k) => verifyHuggingFaceKey(k).then((r) => results.push(r))),
    ...cfKeys.map((k) => verifyCloudflareKey(k).then((r) => results.push(r))),
    ...oKeys.map((k) => verifyOpenAIKey(k).then((r) => results.push(r))),
  ];

  await Promise.allSettled(checks);

  return NextResponse.json({
    success: true,
    totalChecked: results.length,
    activeCount: results.filter((r) => r.status === "active").length,
    results,
  });
}
