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
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    try {
      await sql`ALTER TABLE obey_user_memory ADD COLUMN IF NOT EXISTS last_image_seed INTEGER;`;
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

/**
 * Checks if a user's prompt is requesting a visual edit/revision to their existing artwork.
 */
export function isImageRevisionRequest(userText: string, hasPreviousImage: boolean): boolean {
  if (!hasPreviousImage) return false;
  const lower = userText.toLowerCase().trim();
  return (
    /\b(change|make|turn|switch|adjust|replace|recolor|modify|add|remove|update|now make|make it|set the|paint the)\b/i.test(lower) &&
    /\b(color|colour|blue|red|green|black|white|yellow|orange|purple|pink|silver|gold|grey|gray|rain|raining|snow|night|day|sunset|sunrise|background|wheels|sky|cyberpunk|anime|style|lighting|weather)\b/i.test(lower)
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
    const width = options?.width || 1024;
    const height = options?.height || 1024;
    const enhance = options?.enhance !== false;
    const seed = options?.seed !== undefined ? options.seed : Math.floor(Math.random() * 1000000);

    // Clean and sanitize prompt
    const cleanedPrompt = userPrompt
      .replace(/^(generate (an? )?(image|picture|photo|logo|flyer|banner|poster|mockup|graphic|illustration) of|create (an? )?(image|picture|photo|logo|flyer|banner|poster|mockup) of|draw (me )?|show me|design a (logo|picture|banner|flyer|mockup) for|generate|create a logo for)\s*/i, "")
      .trim();

    const encodedPrompt = encodeURIComponent(cleanedPrompt || "modern high-tech creative software design");

    // Pollinations URL with consistent seed
    const rawPollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=${enhance}&model=flux`;

    let finalImageUrl = rawPollinationsUrl;

    // Frame out the watermark by uploading to Cloudinary and cropping top 93%
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

        if (framedUrl) {
          finalImageUrl = framedUrl;
        }
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
