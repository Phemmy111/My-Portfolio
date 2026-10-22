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

function getSql() {
  const url = process.env.DATABASE_URL;
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
  return (
    /\b(change|make|turn|switch|adjust|replace|recolor|modify|add|remove|update|now make|make it|set the|paint the)\b/i.test(lower) &&
    /\b(color|colour|blue|red|green|black|white|yellow|orange|purple|pink|silver|gold|grey|gray|rain|raining|snow|night|day|sunset|sunrise|background|wheels|sky|cyberpunk|anime|style|lighting|weather|car|tree|city|room|landscape)\b/i.test(lower)
  );
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

export function getImageProvidersStatus() {
  const geminiKeys = getKeyPool(["GEMINI_API_KEYS", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_AI_KEYS"]);
  const hfKeys = getKeyPool(["HUGGINGFACE_API_KEYS", "HUGGINGFACE_API_KEY", "HF_TOKEN", "HF_TOKENS"]);
  const cfKeys = getKeyPool(["CLOUDFLARE_API_TOKENS", "CLOUDFLARE_API_TOKEN", "CF_API_TOKEN"]);
  const cfAccounts = getKeyPool(["CLOUDFLARE_ACCOUNT_IDS", "CLOUDFLARE_ACCOUNT_ID", "CF_ACCOUNT_ID"]);
  const openaiKeys = getKeyPool(["OPENAI_API_KEYS", "OPENAI_API_KEY"]);

  return {
    gemini: { activeKeys: geminiKeys.length, enabled: geminiKeys.length > 0 },
    huggingface: { activeKeys: hfKeys.length, enabled: hfKeys.length > 0 },
    cloudflare: { activeKeys: cfKeys.length, accounts: cfAccounts.length, enabled: cfKeys.length > 0 && cfAccounts.length > 0 },
    openai: { activeKeys: openaiKeys.length, enabled: openaiKeys.length > 0 },
    pollinations: { enabled: true, fallback: true },
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
    // Supports rotating pool via GEMINI_API_KEYS="key1,key2,key3" or GEMINI_API_KEY
    // ────────────────────────────────────────────────────────────────────────
    const geminiKeys = getKeyPool(["GEMINI_API_KEYS", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_AI_KEYS"]);
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
          console.warn(`[Image Generator] Google Gemini Image error (${gRes.status}) on key ${i + 1}:`, await gRes.text());
        }
      } catch (gErr) {
        console.warn(`[Image Generator] Google Gemini Image exception on key ${i + 1}:`, gErr);
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // PROVIDER 2: Hugging Face Serverless (FLUX.1-schnell)
    // Supports rotating pool via HUGGINGFACE_API_KEYS="token1,token2" or HF_TOKEN
    // ────────────────────────────────────────────────────────────────────────
    const hfKeys = getKeyPool(["HUGGINGFACE_API_KEYS", "HUGGINGFACE_API_KEY", "HF_TOKEN", "HF_TOKENS"]);
    for (let i = 0; i < hfKeys.length; i++) {
      const hfKey = hfKeys[i];
      try {
        console.log(`[Image Generator] Trying Hugging Face FLUX.1 with key ${i + 1}/${hfKeys.length}...`);
        const hfRes = await fetch("https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${hfKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inputs: cleanedPrompt || "modern creative high-tech design",
            parameters: { width, height },
          }),
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
          console.warn(`[Image Generator] Hugging Face error (${hfRes.status}) on key ${i + 1}:`, await hfRes.text());
        }
      } catch (hfErr) {
        console.warn(`[Image Generator] Hugging Face exception on key ${i + 1}:`, hfErr);
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // PROVIDER 3: Cloudflare Workers AI (@cf/black-forest-labs/flux-1-schnell)
    // 10,000 free daily neurons per account
    // Supports CLOUDFLARE_API_TOKENS="tok1,tok2" + CLOUDFLARE_ACCOUNT_ID
    // ────────────────────────────────────────────────────────────────────────
    const cfTokens = getKeyPool(["CLOUDFLARE_API_TOKENS", "CLOUDFLARE_API_TOKEN", "CF_API_TOKEN"]);
    const cfAccounts = getKeyPool(["CLOUDFLARE_ACCOUNT_IDS", "CLOUDFLARE_ACCOUNT_ID", "CF_ACCOUNT_ID"]);
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
    // PROVIDER 4: OpenAI DALL-E 3 HD (If OPENAI_API_KEYS or OPENAI_API_KEY has balance)
    // ────────────────────────────────────────────────────────────────────────
    const openaiKeys = getKeyPool(["OPENAI_API_KEYS", "OPENAI_API_KEY"]);
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

    // ────────────────────────────────────────────────────────────────────────
    // PROVIDER 5: Pollinations FLUX Engine (Always-free, unlimited safety net)
    // Automatically frames out any watermark via Cloudinary crop
    // ────────────────────────────────────────────────────────────────────────
    console.log("[Image Generator] Using Pollinations FLUX safety net...");
    const enhance = options?.enhance !== false;
    const encodedPrompt = encodeURIComponent(cleanedPrompt || "modern high-tech creative software design");
    const rawPollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=${enhance}&model=flux`;

    let finalImageUrl = rawPollinationsUrl;

    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
      try {
        const uploadRes = await cloudinary.uploader.upload(rawPollinationsUrl, {
          folder: "obey-artwork",
          resource_type: "image",
        });
        const framedUrl = cloudinary.url(uploadRes.public_id, {
          transformation: [
            { height: 0.93, crop: "crop", gravity: "north" },
            { quality: "auto:best" },
          ],
          secure: true,
        });
        if (framedUrl) finalImageUrl = framedUrl;
      } catch (cloudErr) {
        console.warn("[Image Generator] Cloudinary framing fallback:", cloudErr);
      }
    }

    return {
      success: true,
      imageUrl: finalImageUrl,
      revisedPrompt: cleanedPrompt,
      seed,
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

