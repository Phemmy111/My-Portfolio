import { v2 as cloudinary } from "cloudinary";
import { neon } from "@neondatabase/serverless";
import { executeAICompletion } from "./ai-orchestrator";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export interface GeneratedImageResult {
  success: boolean;
  imageUrl: string;
  revisedPrompt: string;
  seed: number;
  error?: string;
}

export function getSql() {
  const url = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_aT9yHdvzhRL3@ep-ancient-water-b45hpwr0-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require";
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url);
}

let memoryTableChecked = false;
export async function ensureMemoryTable() {
  if (memoryTableChecked) return;
  try {
    const sql = getSql();
    await sql`
      CREATE TABLE IF NOT EXISTS obey_user_memory (
        user_identifier TEXT PRIMARY KEY,
        last_image_prompt TEXT,
        last_image_url TEXT,
        last_image_seed INTEGER,
        last_artifact_id TEXT,
        gender TEXT,
        user_notes TEXT,
        user_name TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    try {
      await sql`ALTER TABLE obey_user_memory ADD COLUMN IF NOT EXISTS last_image_seed INTEGER;`;
      await sql`ALTER TABLE obey_user_memory ADD COLUMN IF NOT EXISTS gender TEXT;`;
      await sql`ALTER TABLE obey_user_memory ADD COLUMN IF NOT EXISTS user_notes TEXT;`;
      await sql`ALTER TABLE obey_user_memory ADD COLUMN IF NOT EXISTS user_name TEXT;`;
    } catch {}
    memoryTableChecked = true;
  } catch (err) {
    console.warn("[Memory] Could not ensure obey_user_memory table:", err);
  }
}

export async function saveUserImageMemory(
  userIdentifier: string,
  prompt: string,
  imageUrl: string,
  seed?: number
): Promise<void> {
  try {
    await ensureMemoryTable();
    const sql = getSql();
    const cleanSeed = seed !== undefined ? Math.floor(seed) : null;
    await sql`
      INSERT INTO obey_user_memory (user_identifier, last_image_prompt, last_image_url, last_image_seed, updated_at)
      VALUES (${userIdentifier}, ${prompt}, ${imageUrl}, ${cleanSeed}, NOW())
      ON CONFLICT (user_identifier) DO UPDATE SET
        last_image_prompt = EXCLUDED.last_image_prompt,
        last_image_url = EXCLUDED.last_image_url,
        last_image_seed = COALESCE(EXCLUDED.last_image_seed, obey_user_memory.last_image_seed),
        updated_at = NOW();
    `;
  } catch (err) {
    console.warn("[Memory] Could not save user image memory:", err);
  }
}

export async function getUserImageMemory(
  userIdentifier: string
): Promise<{ last_image_prompt: string; last_image_url: string; last_image_seed?: number } | null> {
  try {
    await ensureMemoryTable();
    const sql = getSql();
    const rows = await sql`
      SELECT last_image_prompt, last_image_url, last_image_seed
      FROM obey_user_memory
      WHERE user_identifier = ${userIdentifier}
      LIMIT 1;
    `;
    if (rows.length === 0 || !rows[0].last_image_prompt) return null;
    return {
      last_image_prompt: rows[0].last_image_prompt,
      last_image_url: rows[0].last_image_url,
      last_image_seed: rows[0].last_image_seed !== null ? Number(rows[0].last_image_seed) : undefined,
    };
  } catch (err) {
    console.warn("[Memory] Could not get user image memory:", err);
    return null;
  }
}

export async function getUserFullMemory(userIdentifier: string): Promise<{
  gender?: string;
  user_notes?: string;
  user_name?: string;
  last_image_prompt?: string;
  last_image_url?: string;
  last_image_seed?: number;
} | null> {
  try {
    await ensureMemoryTable();
    const sql = getSql();
    const rows = await sql`
      SELECT user_identifier, gender, user_notes, user_name, last_image_prompt, last_image_url, last_image_seed
      FROM obey_user_memory
      WHERE user_identifier = ${userIdentifier}
      LIMIT 1;
    `;
    if (rows.length === 0) return null;
    return {
      gender: rows[0].gender || undefined,
      user_notes: rows[0].user_notes || undefined,
      user_name: rows[0].user_name || undefined,
      last_image_prompt: rows[0].last_image_prompt || undefined,
      last_image_url: rows[0].last_image_url || undefined,
      last_image_seed: rows[0].last_image_seed !== null ? Number(rows[0].last_image_seed) : undefined,
    };
  } catch (err) {
    console.warn("[Memory] Could not get user full memory:", err);
    return null;
  }
}

export async function saveUserPersonalMemory(params: {
  userIdentifier: string;
  gender?: string;
  userNotes?: string;
  userName?: string;
}): Promise<void> {
  try {
    await ensureMemoryTable();
    const sql = getSql();
    const { userIdentifier, gender, userNotes, userName } = params;
    await sql`
      INSERT INTO obey_user_memory (user_identifier, gender, user_notes, user_name, updated_at)
      VALUES (${userIdentifier}, ${gender || null}, ${userNotes || null}, ${userName || null}, NOW())
      ON CONFLICT (user_identifier) DO UPDATE SET
        gender = COALESCE(EXCLUDED.gender, obey_user_memory.gender),
        user_notes = CASE
          WHEN EXCLUDED.user_notes IS NOT NULL AND obey_user_memory.user_notes IS NOT NULL
            THEN obey_user_memory.user_notes || E'\n• ' || EXCLUDED.user_notes
          ELSE COALESCE(EXCLUDED.user_notes, obey_user_memory.user_notes)
        END,
        user_name = COALESCE(EXCLUDED.user_name, obey_user_memory.user_name),
        updated_at = NOW();
    `;
  } catch (err) {
    console.warn("[Memory] Could not save user personal memory:", err);
  }
}

/**
 * Checks if a user's prompt is requesting a visual edit/revision to their existing artwork.
 */
export function isImageRevisionRequest(userText: string, hasPreviousImage: boolean): boolean {
  if (!hasPreviousImage) return false;
  const lower = userText.toLowerCase().trim();
  // Exclude web, coding, and UI artifact terms so artifact edits are never misclassified as image revisions
  if (/\b(font|button|buttons|html|css|navbar|header|footer|section|website|webpage|landing page|card|cards|pricing|layout|code|script|link|text|page|table|form|input|hero)\b/i.test(lower)) {
    return false;
  }
  // Check for common edit/modification verbs
  const hasEditVerb = /\b(change|make|turn|switch|adjust|replace|recolor|modify|add|remove|update|now make|make it|set the|paint the|put|give|wear|dress|style|draw|recreate|edit|redesign)\b/i.test(lower);

  // Check for visual subjects, clothing, accessories, facial features, styling, background, and lighting
  const hasVisualTarget = /\b(color|colour|blue|red|green|black|white|yellow|orange|purple|pink|silver|gold|grey|gray|rain|raining|snow|night|day|sunset|sunrise|background|wheels|sky|cyberpunk|anime|style|lighting|weather|car|tree|city|room|landscape|beret|hat|cap|glasses|sunglasses|suit|dress|clothes|clothing|outfit|shirt|pants|jacket|hoodie|shoes|jewelry|necklace|earrings|ring|hair|hairstyle|braids|dreads|afro|blonde|brunette|beard|mustache|smile|smiling|eyes|face|expression|makeup|tattoo|wings|crown|cape|tie|watch|bag|handbag|look|vibe|scenery|ocean|beach|mountains|forest|office|studio|neon|vintage|retro|cartoon|3d|cinematic|photorealistic)\b/i.test(lower);

  // Direct edit patterns like "make her wear beret", "put sunglasses on him", "give her a smile", "add a golden chain"
  const hasDirectEditPhrase = /\b(make\s+(?:her|him|them|it)\s+(?:wear|look|have|into|more)|put\s+(?:a|an|the)?\s*[\w\s]+\s+on\s+(?:her|him|them|it)|add\s+(?:a|an|the)?\s*[\w\s]+\s+to\s+(?:her|him|it|the\s+image|the\s+picture|the\s+photo)|give\s+(?:her|him|them)\s+(?:a|an)?\s*[\w\s]+)\b/i.test(lower);

  return (hasEditVerb && hasVisualTarget) || hasDirectEditPhrase;
}

/**
 * Synthesizes a revised image prompt using previous context.
 */
export async function synthesizeImageRevisionPrompt(
  previousPrompt: string,
  revisionInstruction: string
): Promise<string> {
  try {
    const aiRes = await executeAICompletion({
      systemPrompt: "You are an expert AI visual prompt modifier. Modify the previous artwork description to apply the requested edit (e.g. car color, rain, lighting, time of day) while keeping the same core subject, model, styling, and scene intact. Return ONLY the concise descriptive prompt string. Do NOT add quotes or explanations.",
      userPrompt: `PREVIOUS PROMPT: "${previousPrompt}"\nREQUESTED ADJUSTMENT: "${revisionInstruction}"\n\nUPDATED PROMPT:`,
      temperature: 0.2,
      maxTokens: 300,
    });
    return aiRes.text.trim().replace(/^["']|["']$/g, "") || `${previousPrompt}, ${revisionInstruction}`;
  } catch {
    return `${previousPrompt}, ${revisionInstruction}`;
  }
}

/**
 * Generates AI artwork and automatically frames out any watermark via Cloudinary.
 * Supports consistent seed preservation for adjusting existing images.
 */
/**
 * Synthesizes a high-definition commercial graphic or advertising prompt for Flux.
 */
async function synthesizeCommercialGraphicPrompt(
  rawPrompt: string
): Promise<{ expandedPrompt: string; isPortraitFlyer: boolean }> {
  const lower = rawPrompt.toLowerCase();
  const isGraphicOrFlyer = /\b(flyer|poster|banner|ad|advertisement|graphic|logo|promo|promotional|beauty|salon|nails|pedicure|facial|eyelash|lashes|spa|catalog|branding|price list)\b/i.test(lower);
  const isPortrait = /\b(flyer|poster|ad|promo|instagram)\b/i.test(lower);

  if (!isGraphicOrFlyer) {
    return { expandedPrompt: rawPrompt, isPortraitFlyer: isPortrait };
  }

  try {
    const aiRes = await executeAICompletion({
      systemPrompt: `You are an elite Creative Director and Commercial Advertising Photographer.
Transform the user's raw brief into an ultra-sharp, photorealistic, luxury commercial visual prompt for FLUX.
RULES:
- Compose a stunning, high-fashion, high-end commercial visual: 8k resolution, Hasselblad medium format photography, luxury aesthetic, soft studio beauty lighting, pristine depth of field.
- If the brief mentions beauty/services (nails, pedicure, lashes, facial, salon): showcase immaculate nail art with glossy top coat, flawless glowing skin, pristine eyelash extensions, elegant luxury salon interior in soft background blur with golden hour or champagne-rose studio lighting.
- Focus strictly on photographic visual aesthetics, pristine subject matter, and immaculate composition.
- Return ONLY the final visual prompt (maximum 75 words). No quotes, no markdown, no conversational commentary.`,
      userPrompt: `BRIEF: "${rawPrompt}"\n\nCOMMERCIAL FLUX PROMPT:`,
      temperature: 0.3,
      maxTokens: 180,
    });
    const expanded = aiRes.text.trim().replace(/^["']|["']$/g, "");
    return {
      expandedPrompt: expanded || rawPrompt,
      isPortraitFlyer: isPortrait,
    };
  } catch (err) {
    return { expandedPrompt: rawPrompt, isPortraitFlyer: isPortrait };
  }
}

// Multi-key helper: extracts unique keys from comma/space/newline separated values across multiple env vars
export function getKeyPool(envVarNames: string[]): string[] {
  const keys: string[] = [];
  for (const name of envVarNames) {
    const val = process.env[name];
    if (val) {
      val.split(/[\s,]+/).forEach((k) => {
        const trimmed = k.trim();
        if (trimmed && !keys.includes(trimmed)) {
          keys.push(trimmed);
        }
      });
    }
  }
  return keys;
}

// Database-aware key pool: checks environment variables, agent_settings, and PostgreSQL workspace_settings
export async function getKeyPoolAsync(
  envVarNames: string[],
  dbColumn?: "gemini_api_keys" | "huggingface_api_keys" | "cloudflare_api_tokens" | "cloudflare_account_id" | "openai_api_keys" | "fal_ai_api_keys" | "segmind_api_keys" | string,
  workspaceId?: string
): Promise<string[]> {
  const keys: string[] = getKeyPool(envVarNames);

  // Check agent_settings table (used by Admin settings page)
  try {
    const sql = getSql();
    for (const varName of envVarNames) {
      try {
        const rows = await sql`SELECT value FROM agent_settings WHERE key = ${varName} LIMIT 1`;
        if (rows && rows.length > 0 && rows[0].value) {
          String(rows[0].value).split(/[\s,]+/).forEach((k) => {
            const trimmed = k.trim();
            if (trimmed && !keys.includes(trimmed)) {
              keys.push(trimmed);
            }
          });
        }
      } catch {}
    }

    // Automatically inherit keys from AI_PROVIDERS_POOL if matching provider
    if (dbColumn === "gemini_api_keys" || envVarNames.some((v) => v.includes("GEMINI"))) {
      try {
        const poolRows = await sql`SELECT value FROM agent_settings WHERE key = 'AI_PROVIDERS_POOL' LIMIT 1`;
        if (poolRows && poolRows.length > 0 && poolRows[0].value) {
          const parsedPool = JSON.parse(poolRows[0].value);
          if (Array.isArray(parsedPool)) {
            for (const item of parsedPool) {
              if (item.provider === "gemini" && item.apiKey) {
                const k = String(item.apiKey).trim();
                if (k && !keys.includes(k)) {
                  keys.push(k);
                }
              }
            }
          }
        }
      } catch {}
    }

    if (dbColumn === "openai_api_keys" || envVarNames.some((v) => v.includes("OPENAI"))) {
      try {
        const poolRows = await sql`SELECT value FROM agent_settings WHERE key = 'AI_PROVIDERS_POOL' LIMIT 1`;
        if (poolRows && poolRows.length > 0 && poolRows[0].value) {
          const parsedPool = JSON.parse(poolRows[0].value);
          if (Array.isArray(parsedPool)) {
            for (const item of parsedPool) {
              if (item.provider === "openai" && item.apiKey) {
                const k = String(item.apiKey).trim();
                if (k && !keys.includes(k)) {
                  keys.push(k);
                }
              }
            }
          }
        }
      } catch {}
    }
  } catch {}

  if (dbColumn) {
    try {
      const sql = getSql();
      let rows: any[] = [];
      if (workspaceId) {
        rows = await sql`
          SELECT gemini_api_keys, huggingface_api_keys, cloudflare_api_tokens, cloudflare_account_id, openai_api_keys
          FROM workspace_settings
          WHERE workspace_id = ${workspaceId}
          LIMIT 1
        `;
      }
      if (!rows.length || !rows[0]?.[dbColumn]) {
        // Fallback to latest configured workspace_settings
        rows = await sql`
          SELECT gemini_api_keys, huggingface_api_keys, cloudflare_api_tokens, cloudflare_account_id, openai_api_keys
          FROM workspace_settings
          ORDER BY updated_at DESC
          LIMIT 1
        `;
      }
      if (rows.length && rows[0]?.[dbColumn]) {
        const val = String(rows[0][dbColumn]);
        val.split(/[\s,]+/).forEach((k) => {
          const trimmed = k.trim();
          if (trimmed && !keys.includes(trimmed)) {
            keys.push(trimmed);
          }
        });
      }
    } catch (err) {
      console.warn(`[Image Generator] Could not read ${dbColumn} from database:`, err);
    }
  }

  return keys;
}

export async function getImageProvidersStatus(workspaceId?: string) {
  const geminiKeys = await getKeyPoolAsync(["GEMINI_API_KEYS", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_AI_KEYS"], "gemini_api_keys", workspaceId);
  const hfKeys = await getKeyPoolAsync(["HUGGINGFACE_API_KEYS", "HUGGINGFACE_API_KEY", "HF_TOKEN", "HF_TOKENS"], "huggingface_api_keys", workspaceId);
  const cfKeys = await getKeyPoolAsync(["CLOUDFLARE_API_TOKENS", "CLOUDFLARE_API_TOKEN", "CF_API_TOKEN"], "cloudflare_api_tokens", workspaceId);
  const cfAccounts = await getKeyPoolAsync(["CLOUDFLARE_ACCOUNT_IDS", "CLOUDFLARE_ACCOUNT_ID", "CF_ACCOUNT_ID"], "cloudflare_account_id", workspaceId);
  const openaiKeys = await getKeyPoolAsync(["OPENAI_API_KEYS", "OPENAI_API_KEY"], "openai_api_keys", workspaceId);

  return {
    gemini: { activeKeys: geminiKeys.length, enabled: geminiKeys.length > 0 },
    huggingface: { activeKeys: hfKeys.length, enabled: hfKeys.length > 0 },
    cloudflare: { activeKeys: cfKeys.length, accounts: cfAccounts.length, enabled: cfKeys.length > 0 && cfAccounts.length > 0 },
    openai: { activeKeys: openaiKeys.length, enabled: openaiKeys.length > 0 },
  };
}

export async function generateAIImage(
  userPrompt: string,
  options?: {
    width?: number;
    height?: number;
    enhance?: boolean;
    seed?: number;
    model?: string;
    workspaceId?: string;
  }
): Promise<GeneratedImageResult> {
  try {
    // 1. Expand prompt if this is a flyer, graphic, promotional design, or beauty service
    const { expandedPrompt, isPortraitFlyer } = await synthesizeCommercialGraphicPrompt(userPrompt);

    const seed = options?.seed !== undefined ? options.seed : Math.floor(Math.random() * 1000000);
    const width = options?.width || (isPortraitFlyer ? 1024 : 1024);
    const height = options?.height || (isPortraitFlyer ? 1792 : 1024);

    // Clean and sanitize prompt
    const cleanedPrompt = expandedPrompt
      .replace(/^(generate (an? )?(image|picture|photo|logo|flyer|banner|poster|mockup|graphic|illustration) of|create (an? )?(image|picture|photo|logo|flyer|banner|poster|mockup) of|draw (me )?|show me|design a (logo|picture|banner|flyer|mockup) for|generate|create a logo for)\s*/i, "")
      .trim();

    // ────────────────────────────────────────────────────────────────────────
    // PROVIDER 1: Google Gemini Image Models (gemini-2.5-flash-image / gemini-3.1-flash-image)
    // Supports rotating pool via Admin Dashboard, GEMINI_API_KEYS="key1,key2,key3", or GEMINI_API_KEY
    // ────────────────────────────────────────────────────────────────────────
    const geminiKeys = await getKeyPoolAsync(
      ["GEMINI_API_KEYS", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_AI_KEYS"],
      "gemini_api_keys",
      options?.workspaceId
    );
    for (let i = 0; i < geminiKeys.length; i++) {
      const gKey = geminiKeys[i];
      try {
        console.log(`[Image Generator] Trying Google Gemini Image with key ${i + 1}/${geminiKeys.length}...`);
        const gRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(gKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: cleanedPrompt || "modern creative high-tech design" }] }],
            }),
          }
        );

        if (gRes.ok) {
          const gData = await gRes.json();
          const parts = gData?.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            if (part?.inlineData?.data) {
              const base64Data = part.inlineData.data;
              const mime = part.inlineData.mimeType || "image/jpeg";
              const dataUri = `data:${mime};base64,${base64Data}`;

              // Upload to Cloudinary for fast permanent CDN hosting
              if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
                const cloudRes = await cloudinary.uploader.upload(dataUri, {
                  folder: "obey-artwork",
                  resource_type: "image",
                });
                return {
                  success: true,
                  imageUrl: cloudRes.secure_url || dataUri,
                  revisedPrompt: cleanedPrompt,
                  seed,
                };
              }
              return { success: true, imageUrl: dataUri, revisedPrompt: cleanedPrompt, seed };
            }
          }
        } else {
          const errText = await gRes.text();
          console.warn(`[Image Generator] Google Gemini Image error (${gRes.status}) on key ${i + 1}:`, errText);
          if (errText.includes("limit: 0") || (gRes.status === 429 && i >= 1)) {
            console.log("[Image Generator] Google Gemini Image free-tier quota unavailable, cascading immediately to next provider...");
            break;
          }
        }
      } catch (gErr) {
        console.warn(`[Image Generator] Google Gemini Image exception on key ${i + 1}:`, gErr);
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // PROVIDER 2: Hugging Face (FLUX.1-dev / SDXL via Router, or FLUX.1-schnell API)
    // Supports rotating pool via Admin Dashboard, HUGGINGFACE_API_KEYS="token1,token2", or HF_TOKEN
    // ────────────────────────────────────────────────────────────────────────
    const hfKeys = await getKeyPoolAsync(
      ["HUGGINGFACE_API_KEYS", "HUGGINGFACE_API_KEY", "HF_TOKEN", "HF_TOKENS"],
      "huggingface_api_keys",
      options?.workspaceId
    );
    // NOTE: HF free tier (hf-inference provider) has deprecated FLUX and SDXL endpoints (all return 410).
    // Paid provider routing (together, fal-ai, replicate, nebius) requires HF account billing/credits.
    // The endpoints below will skip gracefully if the account has no paid credits.
    const hfEndpointCascade = [
      // These require HF Pro or billing credits — kept for future use when account is funded
      { url: "https://router.huggingface.co/together/models/black-forest-labs/FLUX.1-schnell", body: JSON.stringify({ inputs: cleanedPrompt || "modern creative high-tech design" }) },
      { url: "https://router.huggingface.co/together/models/black-forest-labs/FLUX.1-dev", body: JSON.stringify({ inputs: cleanedPrompt || "modern creative high-tech design" }) },
      { url: "https://router.huggingface.co/fal-ai/models/black-forest-labs/FLUX.1-schnell", body: JSON.stringify({ inputs: cleanedPrompt || "modern creative high-tech design" }) },
    ];
    for (let i = 0; i < hfKeys.length; i++) {
      const hfKey = hfKeys[i];
      for (const endpoint of hfEndpointCascade) {
        try {
          console.log(`[Image Generator] Trying Hugging Face ${endpoint.url} (key ${i + 1}/${hfKeys.length})...`);
          const hfRes = await fetch(endpoint.url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${hfKey}`,
              "Content-Type": "application/json",
            },
            body: endpoint.body,
          });

          if (hfRes.ok) {
            const arrayBuffer = await hfRes.arrayBuffer();
            const base64Data = Buffer.from(arrayBuffer).toString("base64");
            const dataUri = `data:image/jpeg;base64,${base64Data}`;

            if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
              const cloudRes = await cloudinary.uploader.upload(dataUri, {
                folder: "obey-artwork",
                resource_type: "image",
              });
              return {
                success: true,
                imageUrl: cloudRes.secure_url || dataUri,
                revisedPrompt: cleanedPrompt,
                seed,
              };
            }
            return { success: true, imageUrl: dataUri, revisedPrompt: cleanedPrompt, seed };
          } else {
            const errTxt = await hfRes.text();
            console.warn(`[Image Generator] Hugging Face ${endpoint.url} error (${hfRes.status}):`, errTxt.slice(0, 200));
          }
        } catch (hfErr) {
          console.warn(`[Image Generator] Hugging Face ${endpoint.url} exception on key ${i + 1}:`, hfErr);
        }
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // PROVIDER 3: Cloudflare Workers AI (@cf/black-forest-labs/flux-1-schnell)
    // 10,000 free daily neurons per account
    // Supports Admin Dashboard, CLOUDFLARE_API_TOKENS="tok1,tok2" + CLOUDFLARE_ACCOUNT_ID
    // ────────────────────────────────────────────────────────────────────────
    const cfTokens = await getKeyPoolAsync(
      ["CLOUDFLARE_API_TOKENS", "CLOUDFLARE_API_TOKEN", "CF_API_TOKEN"],
      "cloudflare_api_tokens",
      options?.workspaceId
    );
    const cfAccounts = await getKeyPoolAsync(
      ["CLOUDFLARE_ACCOUNT_IDS", "CLOUDFLARE_ACCOUNT_ID", "CF_ACCOUNT_ID"],
      "cloudflare_account_id",
      options?.workspaceId
    );
    if (cfTokens.length > 0 && cfAccounts.length > 0) {
      for (let i = 0; i < cfTokens.length; i++) {
        const cfToken = cfTokens[i];
        const cfAccount = cfAccounts[i % cfAccounts.length];
        try {
          console.log(`[Image Generator] Trying Cloudflare Workers AI FLUX with token ${i + 1}/${cfTokens.length}...`);
          const cfRes = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfAccount)}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${cfToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                prompt: cleanedPrompt || "modern creative high-tech design",
                steps: 4,
              }),
            }
          );

          if (cfRes.ok) {
            const contentType = cfRes.headers.get("content-type") || "";
            let dataUri = "";
            if (contentType.includes("application/json")) {
              const cfData = await cfRes.json();
              const imgBase64 = cfData?.result?.image;
              if (imgBase64) dataUri = `data:image/jpeg;base64,${imgBase64}`;
            } else {
              const arrayBuffer = await cfRes.arrayBuffer();
              const base64Data = Buffer.from(arrayBuffer).toString("base64");
              dataUri = `data:image/jpeg;base64,${base64Data}`;
            }

            if (dataUri) {
              if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
                const cloudRes = await cloudinary.uploader.upload(dataUri, {
                  folder: "obey-artwork",
                  resource_type: "image",
                });
                return {
                  success: true,
                  imageUrl: cloudRes.secure_url || dataUri,
                  revisedPrompt: cleanedPrompt,
                  seed,
                };
              }
              return { success: true, imageUrl: dataUri, revisedPrompt: cleanedPrompt, seed };
            }
          } else {
            console.warn(`[Image Generator] Cloudflare error (${cfRes.status}) on token ${i + 1}:`, await cfRes.text());
          }
        } catch (cfErr) {
          console.warn(`[Image Generator] Cloudflare exception on token ${i + 1}:`, cfErr);
        }
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // PROVIDER 4: OpenAI DALL-E 3 HD (If Admin Dashboard or OPENAI_API_KEYS has balance)
    // ────────────────────────────────────────────────────────────────────────
    const openaiKeys = await getKeyPoolAsync(
      ["OPENAI_API_KEYS", "OPENAI_API_KEY"],
      "openai_api_keys",
      options?.workspaceId
    );
    for (let i = 0; i < openaiKeys.length; i++) {
      const oKey = openaiKeys[i];
      try {
        console.log(`[Image Generator] Trying OpenAI DALL-E 3 with key ${i + 1}/${openaiKeys.length}...`);
        const dalleSize = isPortraitFlyer ? "1024x1792" : "1024x1024";
        const dalleRes = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${oKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "dall-e-3",
            prompt: cleanedPrompt || "modern creative high-tech design",
            n: 1,
            size: dalleSize,
            quality: "hd",
            style: "vivid",
          }),
        });

        if (dalleRes.ok) {
          const dalleData = await dalleRes.json();
          const tempUrl = dalleData?.data?.[0]?.url || "";
          const revisedByDalle = dalleData?.data?.[0]?.revised_prompt || cleanedPrompt;

          if (tempUrl) {
            let finalUrl = tempUrl;
            if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
              try {
                const uploadRes = await cloudinary.uploader.upload(tempUrl, {
                  folder: "obey-artwork",
                  resource_type: "image",
                });
                finalUrl = cloudinary.url(uploadRes.public_id, {
                  transformation: [{ quality: "auto:best" }],
                  secure: true,
                }) || tempUrl;
              } catch (cloudErr) {
                console.warn("[Image Generator] Cloudinary upload fallback for DALL-E:", cloudErr);
              }
            }

            return {
              success: true,
              imageUrl: finalUrl,
              revisedPrompt: revisedByDalle,
              seed,
            };
          }
        } else {
          console.warn(`[Image Generator] DALL-E error (${dalleRes.status}) on key ${i + 1}:`, await dalleRes.text());
        }
      } catch (dalleErr) {
        console.warn(`[Image Generator] DALL-E exception on key ${i + 1}:`, dalleErr);
      }
    }


    // All providers exhausted
    console.warn("[Image Generator] All image generation providers exhausted.");
    return {
      success: false,
      imageUrl: "",
      revisedPrompt: cleanedPrompt,
      seed,
      error: "Image generation is temporarily unavailable. Please try again in a moment.",
    };
  } catch (err: any) {
    console.error("[Image Generator] Error generating image:", err);
    return {
      success: false,
      imageUrl: "",
      revisedPrompt: userPrompt,
      seed: 0,
      error: err.message,
    };
  }
}

/**
 * Detects if user specifically wants a direct photo face swap (swapping Face A onto Body B).
 */
export function isFaceSwapRequest(userText: string): boolean {
  const lower = (userText || "").toLowerCase();
  return /\b(face\s*swap|swap\s*(?:the|her|his|my|their)?\s*face|put\s*my\s*face|put\s*(?:his|her)\s*face\s*on|change\s*the\s*face)\b/i.test(lower);
}

/**
 * Text-guided Face-Lock Image Modification via Fal.ai (FLUX PuLID / InstantID)
 * Maintains 100% facial features from reference image while synthesizing the requested text modifications.
 */
export async function generateFaceLockWithFal(params: {
  referenceImageUrl: string;
  prompt: string;
  seed?: number;
  workspaceId?: string;
}): Promise<GeneratedImageResult> {
  const falKeys = await getKeyPoolAsync(
    ["FAL_KEY", "FAL_AI_API_KEYS", "FAL_API_KEY"],
    undefined,
    params.workspaceId
  );

  if (falKeys.length === 0) {
    return {
      success: false,
      imageUrl: "",
      revisedPrompt: params.prompt,
      seed: params.seed || 0,
      error: "No Fal.ai API key configured. Add your free key in AI Settings to enable face-locking.",
    };
  }

  const seed = params.seed !== undefined ? params.seed : Math.floor(Math.random() * 1000000);

  for (let i = 0; i < falKeys.length; i++) {
    const key = falKeys[i];
    try {
      console.log(`[Face Lock] Trying Fal.ai FLUX PuLID with key ${i + 1}/${falKeys.length}...`);
      // 1. Primary Model: FLUX PuLID on Fal.ai
      const res = await fetch("https://fal.run/fal-ai/flux-pulid", {
        method: "POST",
        headers: {
          Authorization: `Key ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: params.prompt,
          reference_image_url: params.referenceImageUrl,
          id_weight: 1.0,
          guidance_scale: 4.0,
          num_inference_steps: 20,
          seed,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const rawUrl = data.images?.[0]?.url || data.image?.url;
        if (rawUrl) {
          let finalUrl = rawUrl;
          if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
            try {
              const uploadRes = await cloudinary.uploader.upload(rawUrl, {
                folder: "obey-facelock",
                resource_type: "image",
              });
              finalUrl = uploadRes.secure_url || rawUrl;
            } catch (cloudErr) {
              console.warn("[Face Lock] Cloudinary upload fallback:", cloudErr);
            }
          }
          return {
            success: true,
            imageUrl: finalUrl,
            revisedPrompt: params.prompt,
            seed,
          };
        }
      } else {
        const errText = await res.text();
        console.warn(`[Face Lock] Fal.ai FLUX PuLID failed (${res.status}): ${errText.slice(0, 200)}`);

        // 2. Fallback Model: InstantID on Fal.ai
        console.log(`[Face Lock] Trying fallback to InstantID on Fal.ai...`);
        const instantRes = await fetch("https://fal.run/fal-ai/instant-id", {
          method: "POST",
          headers: {
            Authorization: `Key ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: params.prompt,
            face_image_url: params.referenceImageUrl,
            seed,
          }),
        });

        if (instantRes.ok) {
          const instantData = await instantRes.json();
          const rawUrl = instantData.images?.[0]?.url || instantData.image?.url;
          if (rawUrl) {
            return {
              success: true,
              imageUrl: rawUrl,
              revisedPrompt: params.prompt,
              seed,
            };
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Face Lock] Fal.ai exception on key ${i + 1}:`, err);
    }
  }

  return {
    success: false,
    imageUrl: "",
    revisedPrompt: params.prompt,
    seed,
    error: "Fal.ai face-lock generation failed.",
  };
}

/**
 * Direct Photo-to-Photo Face Swap via Segmind (100 free requests/day)
 */
export async function generateFaceSwapWithSegmind(params: {
  inputImageUrl: string;
  faceImageUrl: string;
  workspaceId?: string;
}): Promise<GeneratedImageResult> {
  const segmindKeys = await getKeyPoolAsync(
    ["SEGMIND_API_KEY", "SEGMIND_API_KEYS"],
    undefined,
    params.workspaceId
  );

  if (segmindKeys.length === 0) {
    return {
      success: false,
      imageUrl: "",
      revisedPrompt: "Face Swap",
      seed: 0,
      error: "No Segmind API key configured. Add your free key in AI Settings to enable instant face swapping.",
    };
  }

  for (let i = 0; i < segmindKeys.length; i++) {
    const key = segmindKeys[i];
    try {
      console.log(`[Face Swap] Trying Segmind Face Swap with key ${i + 1}/${segmindKeys.length}...`);
      const res = await fetch("https://api.segmind.com/v1/faceswap-v4", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input_image: params.inputImageUrl,
          face_image: params.faceImageUrl,
          output_format: "jpeg",
        }),
      });

      if (res.ok) {
        const contentType = res.headers.get("content-type") || "";
        let dataUri = "";

        if (contentType.includes("application/json")) {
          const data = await res.json();
          if (data.image) {
            dataUri = `data:image/jpeg;base64,${data.image}`;
          } else if (data.image_url) {
            dataUri = data.image_url;
          }
        } else {
          const buffer = await res.arrayBuffer();
          dataUri = `data:image/jpeg;base64,${Buffer.from(buffer).toString("base64")}`;
        }

        if (dataUri) {
          let finalUrl = dataUri;
          if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
            try {
              const uploadRes = await cloudinary.uploader.upload(dataUri, {
                folder: "obey-faceswap",
                resource_type: "image",
              });
              finalUrl = uploadRes.secure_url || dataUri;
            } catch (cloudErr) {
              console.warn("[Face Swap] Cloudinary upload fallback:", cloudErr);
            }
          }
          return {
            success: true,
            imageUrl: finalUrl,
            revisedPrompt: "Face Swap",
            seed: 0,
          };
        }
      } else {
        const errText = await res.text();
        console.warn(`[Face Swap] Segmind error (${res.status}): ${errText.slice(0, 200)}`);
      }
    } catch (err: any) {
      console.warn(`[Face Swap] Segmind exception on key ${i + 1}:`, err);
    }
  }

  return {
    success: false,
    imageUrl: "",
    revisedPrompt: "Face Swap",
    seed: 0,
    error: "Segmind face swap failed.",
  };
}

/**
 * 100% Free Image-to-Image / Instruction Manipulation via Cloudflare Workers AI
 * Preserves the composition, face, and geometry of the uploaded reference image
 * while styling or modifying elements based on natural language instructions.
 */
export async function generateImageToImageWithCloudflare(params: {
  referenceImageBase64: string;
  prompt: string;
  strength?: number;
  workspaceId?: string;
}): Promise<GeneratedImageResult> {
  const { referenceImageBase64, prompt, strength = 0.65, workspaceId } = params;
  const cfTokens = await getKeyPoolAsync(
    ["CLOUDFLARE_API_TOKENS", "CLOUDFLARE_API_TOKEN", "CF_API_TOKEN"],
    "cloudflare_api_tokens",
    workspaceId
  );
  const cfAccounts = await getKeyPoolAsync(
    ["CLOUDFLARE_ACCOUNT_IDS", "CLOUDFLARE_ACCOUNT_ID", "CF_ACCOUNT_ID"],
    "cloudflare_account_id",
    workspaceId
  );

  if (cfTokens.length === 0 || cfAccounts.length === 0) {
    return { success: false, imageUrl: "", revisedPrompt: prompt, seed: 0, error: "Cloudflare credentials not found" };
  }

  const cleanB64 = referenceImageBase64.replace(/^data:[^;]+;base64,/, "").trim();
  const seed = Math.floor(Math.random() * 1000000);
  const imgBuffer = Buffer.from(cleanB64, "base64");
  const imgArray = Array.from(imgBuffer);

  for (let i = 0; i < cfTokens.length; i++) {
    const cfToken = cfTokens[i];
    const cfAccount = cfAccounts[i % cfAccounts.length];

    try {
      console.log(`[Image Generator] Trying Cloudflare Workers AI image manipulation with token ${i + 1}/${cfTokens.length}...`);
      const cfRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfAccount)}/ai/run/@cf/runwayml/stable-diffusion-v1-5-inpainting`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cfToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt,
            image: imgArray,
            mask: imgArray,
            strength: Math.min(Math.max(strength, 0.45), 0.7),
            num_steps: 20,
          }),
          signal: AbortSignal.timeout(35000),
        }
      );

      if (cfRes.ok) {
        const arrayBuffer = await cfRes.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString("base64");
        const dataUri = `data:image/png;base64,${base64Data}`;

        if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
          try {
            const cloudRes = await cloudinary.uploader.upload(dataUri, {
              folder: "obey-user-edits",
              resource_type: "image",
            });
            return {
              success: true,
              imageUrl: cloudRes.secure_url || dataUri,
              revisedPrompt: prompt,
              seed,
            };
          } catch (cloudErr) {
            console.warn("[Image Generator] Cloudinary upload notice, using dataUri:", cloudErr);
          }
        }
        return { success: true, imageUrl: dataUri, revisedPrompt: prompt, seed };
      } else {
        const errText = await cfRes.text();
        console.warn(`[Image Generator] Cloudflare image edit error (${cfRes.status}):`, errText);
      }
    } catch (err: any) {
      console.warn(`[Image Generator] Cloudflare image edit exception:`, err?.message || err);
    }
  }

  return { success: false, imageUrl: "", revisedPrompt: prompt, seed: 0, error: "Cloudflare image manipulation failed on all tokens" };
}

/**
 * 100% Free Instruction-Based Photo Manipulation via Hugging Face Space Gradio Client (InstructPix2Pix).
 * Modifies an existing reference photograph based on natural language instructions
 * (e.g. "make her wear a white beret", "change hair to blonde", "put sunglasses on him")
 * while strictly preserving the person's face, body, and overall photo identity.
 */
export async function editImageWithInstructPix2Pix(params: {
  referenceImageBase64?: string;
  referenceImageUrl?: string;
  instruction: string;
  steps?: number;
  imageGuidanceScale?: number;
  textGuidanceScale?: number;
  workspaceId?: string;
}): Promise<GeneratedImageResult> {
  const {
    referenceImageBase64,
    referenceImageUrl,
    instruction,
    steps = 25,
    imageGuidanceScale = 1.5,
    textGuidanceScale = 7.5,
    workspaceId,
  } = params;

  try {
    let imgBuffer: Buffer | null = null;
    let mimeType = "image/jpeg";

    if (referenceImageBase64) {
      const cleanB64 = referenceImageBase64.replace(/^data:[^;]+;base64,/, "").trim();
      imgBuffer = Buffer.from(cleanB64, "base64");
      const mimeMatch = referenceImageBase64.match(/^data:([^;]+);base64,/);
      if (mimeMatch) mimeType = mimeMatch[1];
    } else if (referenceImageUrl) {
      const fetchRes = await fetch(referenceImageUrl);
      if (fetchRes.ok) {
        const ab = await fetchRes.arrayBuffer();
        imgBuffer = Buffer.from(ab);
        mimeType = fetchRes.headers.get("content-type") || "image/jpeg";
      }
    }

    if (!imgBuffer || imgBuffer.length === 0) {
      return {
        success: false,
        imageUrl: "",
        revisedPrompt: instruction,
        seed: 0,
        error: "No valid image buffer found for editing",
      };
    }

    const blob = new Blob([new Uint8Array(imgBuffer)], { type: mimeType });

    const hfTokens = await getKeyPoolAsync(
      ["HUGGINGFACE_API_KEY", "HUGGINGFACE_API_TOKENS", "HF_TOKEN"],
      undefined,
      workspaceId
    );
    const hfToken = hfTokens[0];

    const spaces = [
      "timbrooks/instruct-pix2pix",
      "diffusers/instruct-pix2pix",
      "hysts/instruct-pix2pix",
    ];

    const { Client } = await import("@gradio/client");

    for (const spaceName of spaces) {
      try {
        console.log(`[Image Editor] Connecting to free Hugging Face Space: ${spaceName}...`);
        const client = await Client.connect(spaceName, {
          headers: hfToken ? { Authorization: `Bearer ${hfToken}` } : undefined,
        });

        const seed = Math.floor(Math.random() * 1000000);
        console.log(`[Image Editor] Submitting instruction: "${instruction}" to ${spaceName}...`);

        const result: any = await client.predict("/generate", [
          blob,
          instruction,
          steps,
          "Randomize Seed",
          seed,
          "Fix CFG",
          textGuidanceScale,
          imageGuidanceScale,
        ]);

        let outputUrl = "";
        if (result?.data && Array.isArray(result.data)) {
          for (const item of result.data) {
            if (item && typeof item === "object" && item.url) {
              outputUrl = item.url;
              break;
            }
          }
        }

        if (outputUrl) {
          console.log(`[Image Editor] Edited image generated from ${spaceName}: ${outputUrl}`);

          try {
            const imgRes = await fetch(outputUrl);
            if (imgRes.ok) {
              const arrayBuf = await imgRes.arrayBuffer();
              const base64Out = Buffer.from(arrayBuf).toString("base64");
              const contentType = imgRes.headers.get("content-type") || "image/webp";
              const dataUri = `data:${contentType};base64,${base64Out}`;

              if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
                try {
                  const cloudRes = await cloudinary.uploader.upload(dataUri, {
                    folder: "obey-user-edits",
                    resource_type: "image",
                  });
                  return {
                    success: true,
                    imageUrl: cloudRes.secure_url || dataUri,
                    revisedPrompt: instruction,
                    seed,
                  };
                } catch (cloudErr) {
                  console.warn("[Image Editor] Cloudinary upload notice, using dataUri:", cloudErr);
                }
              }

              return {
                success: true,
                imageUrl: dataUri,
                revisedPrompt: instruction,
                seed,
              };
            }
          } catch (dlErr) {
            console.warn("[Image Editor] Direct download notice, using outputUrl:", dlErr);
            return {
              success: true,
              imageUrl: outputUrl,
              revisedPrompt: instruction,
              seed,
            };
          }
        }
      } catch (spaceErr: any) {
        console.warn(`[Image Editor] Space ${spaceName} notice:`, spaceErr?.message || spaceErr);
      }
    }
  } catch (err: any) {
    console.warn("[Image Editor] Error in editImageWithInstructPix2Pix:", err?.message || err);
  }

  return {
    success: false,
    imageUrl: "",
    revisedPrompt: params.instruction,
    seed: 0,
    error: "Free instruction-based image editing failed across all available community spaces",
  };
}



