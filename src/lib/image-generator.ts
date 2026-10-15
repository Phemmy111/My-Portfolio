/**
 * Obey AI Image Generation Engine
 * Uses state-of-the-art FLUX / SDXL models via Pollinations with zero extra subscriptions or rate limits.
 */

export interface GeneratedImageResult {
  success: boolean;
  imageUrl: string;
  revisedPrompt: string;
  error?: string;
}

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

    // Clean and sanitize prompt for URL
    const cleanedPrompt = userPrompt
      .replace(/^(generate an image of|create an image of|draw|show me|design a picture of|generate|create a logo for)\s*/i, "")
      .trim();

    const encodedPrompt = encodeURIComponent(cleanedPrompt || "modern high-tech creative software design");

    // Pollinations FLUX engine URL
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=${enhance}&model=flux`;

    return {
      success: true,
      imageUrl,
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
