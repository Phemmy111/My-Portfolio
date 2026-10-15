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
        last_artifact_id TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    memoryTableChecked = true;
  } catch (err) {
    console.warn("[Memory] Could not ensure obey_user_memory table:", err);
  }
}

export async function saveUserImageMemory(
  userIdentifier: string,
  prompt: string,
  imageUrl: string
): Promise<void> {
  try {
    await ensureMemoryTable();
    const sql = getSql();
    await sql`
      INSERT INTO obey_user_memory (user_identifier, last_image_prompt, last_image_url, updated_at)
      VALUES (${userIdentifier}, ${prompt}, ${imageUrl}, NOW())
      ON CONFLICT (user_identifier) DO UPDATE SET
        last_image_prompt = EXCLUDED.last_image_prompt,
        last_image_url = EXCLUDED.last_image_url,
        updated_at = NOW();
    `;
  } catch (err) {
    console.warn("[Memory] Could not save user image memory:", err);
  }
}

export async function getUserImageMemory(
  userIdentifier: string
): Promise<{ last_image_prompt: string; last_image_url: string } | null> {
  try {
    await ensureMemoryTable();
    const sql = getSql();
    const rows = await sql`
      SELECT last_image_prompt, last_image_url
      FROM obey_user_memory
      WHERE user_identifier = ${userIdentifier}
      LIMIT 1;
    `;
    if (rows.length === 0 || !rows[0].last_image_prompt) return null;
    return {
      last_image_prompt: rows[0].last_image_prompt,
      last_image_url: rows[0].last_image_url,
    };
  } catch (err) {
    console.warn("[Memory] Could not get user image memory:", err);
    return null;
  }
}

/**
 * Checks if the user's latest message is asking to modify or revise the previous image.
 */
export function isImageRevisionRequest(userText: string, hasPreviousImage: boolean): boolean {
  if (!hasPreviousImage) return false;
  const lower = userText.toLowerCase().trim();
  return (
    /\b(change|make it|turn it|modify|adjust|edit|switch|replace|repaint|recolor|update the)\b/i.test(lower) ||
    /\b(color to|colour to|background to|now make|in blue|in red|in green|in black|in white|darker|lighter|nighttime|daytime)\b/i.test(lower)
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
      systemPrompt: "You are an AI image prompt engineer. Update the previous image description to incorporate the user's requested changes (e.g. changing color, background, elements, lighting). Return ONLY the final revised descriptive prompt. Do NOT include markdown, explanations, or quotes.",
      userPrompt: `PREVIOUS PROMPT: "${previousPrompt}"\nUSER REVISION: "${revisionInstruction}"\n\nREVISED PROMPT:`,
      temperature: 0.3,
    });
    return aiRes.text.trim().replace(/^["']|["']$/g, "") || `${previousPrompt}, ${revisionInstruction}`;
  } catch {
    return `${previousPrompt}, with change: ${revisionInstruction}`;
  }
}

/**
 * Generates AI artwork and automatically frames out any watermark via Cloudinary.
 */
export async function generateAIImage(
  userPrompt: string,
  options?: {
    width?: number;
    height?: number;
    enhance?: boolean;
    model?: string;
  }
): Promise<GeneratedImageResult> {
  try {
    const width = options?.width || 1024;
    const height = options?.height || 1024;
    const enhance = options?.enhance !== false;
    const seed = Math.floor(Math.random() * 1000000);

    // Clean and sanitize prompt
    const cleanedPrompt = userPrompt
      .replace(/^(generate (an? )?(image|picture|photo|logo|flyer|banner|poster|mockup|graphic|illustration) of|create (an? )?(image|picture|photo|logo|flyer|banner|poster|mockup) of|draw (me )?|show me|design a (logo|picture|banner|flyer|mockup) for|generate|create a logo for)\s*/i, "")
      .trim();

    const encodedPrompt = encodeURIComponent(cleanedPrompt || "modern high-tech creative software design");

    // Base Pollinations URL
    const rawPollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=${enhance}&model=flux`;

    let finalImageUrl = rawPollinationsUrl;

    // Frame out the watermark by uploading to Cloudinary and cropping the top 93% (cropping out the bottom 7% where pollinations watermark sits)
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
      try {
        const uploadRes = await cloudinary.uploader.upload(rawPollinationsUrl, {
          folder: "obey-artwork",
          resource_type: "image",
        });

        // Dynamic URL with bottom watermark completely framed out + best quality
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
    };
  } catch (err: any) {
    console.error("[Image Generator] Error generating image:", err);
    return {
      success: false,
      imageUrl: "",
      revisedPrompt: userPrompt,
      error: err.message,
    };
  }
}
