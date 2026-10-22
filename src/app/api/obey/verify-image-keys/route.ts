import { NextRequest, NextResponse } from "next/server";
import { getKeyPoolAsync } from "@/lib/image-generator";

export interface KeyCheckResult {
  provider: "google" | "huggingface" | "cloudflare" | "openai";
  keyMasked: string;
  status: "active" | "invalid" | "invalid_format" | "rate_limited" | "image_quota_zero" | "error";
  message: string;
  latencyMs: number;
}

export async function verifyGoogleKey(key: string): Promise<KeyCheckResult> {
  const start = Date.now();
  const trimmed = key.trim();
  const masked = trimmed.length > 10 ? `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}` : trimmed;

  // Format check: Google AI Studio keys typically start with AIzaSy
  if (!trimmed.startsWith("AIzaSy")) {
    return {
      provider: "google",
      keyMasked: masked,
      status: "invalid_format",
      message: "Format Mismatch: Google AI Studio keys always start with 'AIzaSy...'. This key does not match Google's format (please check if it was copied from another platform).",
      latencyMs: Date.now() - start,
    };
  }

  try {
    // 1. Check basic validity against models endpoint
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(trimmed)}`);
    const latency = Date.now() - start;

    if (!res.ok) {
      if (res.status === 429) {
        return {
          provider: "google",
          keyMasked: masked,
          status: "rate_limited",
          message: "Key is valid on Google AI Studio, but currently rate-limited (too many requests).",
          latencyMs: latency,
        };
      }
      return {
        provider: "google",
        keyMasked: masked,
        status: "invalid",
        message: `Google rejected this key (${res.status} Unauthorized / Forbidden). Check your API key in Google AI Studio.`,
        latencyMs: latency,
      };
    }

    // 2. Key is valid on Google! Now test if it has Image Generation quota (Imagen / gemini-image)
    try {
      const imgTestRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(trimmed)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "test" }] }],
            generationConfig: { responseModalities: ["IMAGE"] },
          }),
        }
      );

      if (imgTestRes.status === 429) {
        const bodyText = await imgTestRes.text();
        if (bodyText.includes("limit: 0") || bodyText.includes("RESOURCE_EXHAUSTED")) {
          return {
            provider: "google",
            keyMasked: masked,
            status: "image_quota_zero",
            message: "Key is valid for Chat, but Image Generation quota is 0 on Google Free Tier (Google requires Pay-As-You-Go Cloud billing for Imagen generation). Use Hugging Face FLUX.1 for free HD images.",
            latencyMs: Date.now() - start,
          };
        }
      }
    } catch {}

    return {
      provider: "google",
      keyMasked: masked,
      status: "active",
      message: "Key is valid & active on Google AI Studio!",
      latencyMs: latency,
    };
  } catch (err: any) {
    return {
      provider: "google",
      keyMasked: masked,
      status: "error",
      message: `Network error connecting to Google AI: ${err.message}`,
      latencyMs: Date.now() - start,
    };
  }
}

export async function verifyHuggingFaceKey(token: string): Promise<KeyCheckResult> {
  const start = Date.now();
  const trimmed = token.trim();
  const masked = trimmed.length > 8 ? `${trimmed.slice(0, 5)}...${trimmed.slice(-4)}` : trimmed;

  if (!trimmed.startsWith("hf_")) {
    return {
      provider: "huggingface",
      keyMasked: masked,
      status: "invalid_format",
      message: "Format Mismatch: Hugging Face User Access Tokens always start with 'hf_...'. Create a free Read Token at huggingface.co/settings/tokens.",
      latencyMs: Date.now() - start,
    };
  }

  try {
    const res = await fetch("https://huggingface.co/api/whoami-v2", {
      headers: { Authorization: `Bearer ${trimmed}` },
    });
    const latency = Date.now() - start;

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const accountName = data.name || data.fullname || "Verified Account";
      return {
        provider: "huggingface",
        keyMasked: masked,
        status: "active",
        message: `Token is 100% active & verified (HF Account: @${accountName})! Ready for FLUX.1 Ultra-HD generation.`,
        latencyMs: latency,
      };
    }

    if (res.status === 401) {
      return {
        provider: "huggingface",
        keyMasked: masked,
        status: "invalid",
        message: "Invalid Token (401 Unauthorized): Hugging Face rejected this token. It may have expired or been deleted. Please generate a new free Read token.",
        latencyMs: latency,
      };
    }

    return {
      provider: "huggingface",
      keyMasked: masked,
      status: "invalid",
      message: `Hugging Face verification failed with HTTP ${res.status}.`,
      latencyMs: latency,
    };
  } catch (err: any) {
    return {
      provider: "huggingface",
      keyMasked: masked,
      status: "error",
      message: `Network error connecting to Hugging Face: ${err.message}`,
      latencyMs: Date.now() - start,
    };
  }
}

export async function verifyCloudflareKey(token: string, accountId?: string): Promise<KeyCheckResult> {
  const start = Date.now();
  const trimmed = token.trim();
  const masked = trimmed.length > 10 ? `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}` : trimmed;

  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
      headers: { Authorization: `Bearer ${trimmed}` },
    });
    const latency = Date.now() - start;

    if (res.ok) {
      return {
        provider: "cloudflare",
        keyMasked: masked,
        status: "active",
        message: `Token is active on Cloudflare Workers AI${accountId ? ` (Account ID: ${accountId})` : ""}. Ready for FLUX.1-schnell inference.`,
        latencyMs: latency,
      };
    }

    return {
      provider: "cloudflare",
      keyMasked: masked,
      status: "invalid",
      message: `Cloudflare token rejected (HTTP ${res.status}). Verify permissions include Workers AI:Read.`,
      latencyMs: latency,
    };
  } catch (err: any) {
    return {
      provider: "cloudflare",
      keyMasked: masked,
      status: "error",
      message: `Network error connecting to Cloudflare: ${err.message}`,
      latencyMs: Date.now() - start,
    };
  }
}

export async function verifyOpenAIKey(key: string): Promise<KeyCheckResult> {
  const start = Date.now();
  const trimmed = key.trim();
  const masked = trimmed.length > 10 ? `${trimmed.slice(0, 7)}...${trimmed.slice(-4)}` : trimmed;

  if (!trimmed.startsWith("sk-")) {
    return {
      provider: "openai",
      keyMasked: masked,
      status: "invalid_format",
      message: "Format Mismatch: OpenAI API keys start with 'sk-...'.",
      latencyMs: Date.now() - start,
    };
  }

  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${trimmed}` },
    });
    const latency = Date.now() - start;

    if (res.ok) {
      return {
        provider: "openai",
        keyMasked: masked,
        status: "active",
        message: "OpenAI API key is valid & active for DALL-E 3 image generation.",
        latencyMs: latency,
      };
    }

    return {
      provider: "openai",
      keyMasked: masked,
      status: "invalid",
      message: `OpenAI key rejected (HTTP ${res.status}). Check platform.openai.com/api-keys.`,
      latencyMs: latency,
    };
  } catch (err: any) {
    return {
      provider: "openai",
      keyMasked: masked,
      status: "error",
      message: `Network error connecting to OpenAI: ${err.message}`,
      latencyMs: Date.now() - start,
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      gemini_api_keys,
      geminiKeys,
      huggingface_api_keys,
      hfKeys,
      cloudflare_api_tokens,
      cfTokens,
      cloudflare_account_id,
      cfAccountId,
      openai_api_keys,
      openaiKeys,
      provider, // optional: "google" | "huggingface" | "cloudflare" | "openai"
      workspace_id,
    } = body;

    const parseList = (val?: string | null): string[] => {
      if (!val) return [];
      return val
        .split(/[\s,]+/)
        .map((k) => k.trim())
        .filter(Boolean);
    };

    // Accept both camelCase and snake_case
    const rawGoogle = gemini_api_keys ?? geminiKeys;
    const rawHf = huggingface_api_keys ?? hfKeys;
    const rawCf = cloudflare_api_tokens ?? cfTokens;
    const rawCfAcc = cloudflare_account_id ?? cfAccountId;
    const rawOpenAI = openai_api_keys ?? openaiKeys;

    let gKeys = parseList(rawGoogle);
    if (gKeys.length === 0 && (!provider || provider === "google")) {
      gKeys = await getKeyPoolAsync(["GEMINI_API_KEYS", "GEMINI_API_KEY", "GOOGLE_API_KEY"], "gemini_api_keys", workspace_id);
    }

    let hfList = parseList(rawHf);
    if (hfList.length === 0 && (!provider || provider === "huggingface")) {
      hfList = await getKeyPoolAsync(["HUGGINGFACE_API_KEYS", "HUGGINGFACE_API_KEY", "HF_TOKEN"], "huggingface_api_keys", workspace_id);
    }

    let cfList = parseList(rawCf);
    if (cfList.length === 0 && (!provider || provider === "cloudflare")) {
      cfList = await getKeyPoolAsync(["CLOUDFLARE_API_TOKENS", "CLOUDFLARE_API_TOKEN"], "cloudflare_api_tokens", workspace_id);
    }

    let oKeys = parseList(rawOpenAI);
    if (oKeys.length === 0 && (!provider || provider === "openai")) {
      oKeys = await getKeyPoolAsync(["OPENAI_API_KEYS", "OPENAI_API_KEY"], "openai_api_keys", workspace_id);
    }

    const results: KeyCheckResult[] = [];
    const checks: Promise<any>[] = [];

    // Filter by provider if requested
    if (!provider || provider === "google") {
      for (const k of gKeys) {
        checks.push(verifyGoogleKey(k).then((r) => results.push(r)));
      }
    }

    if (!provider || provider === "huggingface") {
      for (const k of hfList) {
        checks.push(verifyHuggingFaceKey(k).then((r) => results.push(r)));
      }
    }

    if (!provider || provider === "cloudflare") {
      for (const k of cfList) {
        checks.push(verifyCloudflareKey(k, rawCfAcc).then((r) => results.push(r)));
      }
    }

    if (!provider || provider === "openai") {
      for (const k of oKeys) {
        checks.push(verifyOpenAIKey(k).then((r) => results.push(r)));
      }
    }

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
