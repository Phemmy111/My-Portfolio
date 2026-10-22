import { NextResponse } from "next/server";
import { generateAIImage, getImageProvidersStatus } from "@/lib/image-generator";
import { sendWhatsAppImage } from "@/lib/whatsapp-gateway";

const USER_PHONE = "2348120934828";
const INSTANCE = "obey";

export async function GET() {
  const providers = getImageProvidersStatus();
  const results = [];

  const testCases = [
    {
      name: "1. Square (1024x1024) - African Tech Founder Portrait",
      prompt: "A sharp photorealistic commercial portrait of a young charismatic African tech founder in a sleek glass Lagos office at sunset, warm cinematic studio lighting, 8k",
      options: { width: 1024, height: 1024 }
    },
    {
      name: "2. Portrait Flyer (1024x1792) - Beauty Salon Luxury Ad",
      prompt: "Luxury beauty salon promotional flyer: glossy gel nails with gold leaf accents, glowing skin, soft champagne rose studio lighting, high fashion commercial ad",
      options: { width: 1024, height: 1792 }
    },
    {
      name: "3. Landscape (1792x1024) - Lagos Future Smart City",
      prompt: "Futuristic sustainable smart city in Lagos Nigeria, glass skyscrapers, lush rooftop gardens, hyperloop rail, solar glass, ultra-detailed architectural concept art, photorealistic",
      options: { width: 1792, height: 1024 }
    }
  ];

  for (const tc of testCases) {
    const start = Date.now();
    try {
      const imgRes = await generateAIImage(tc.prompt, tc.options);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);

      if (imgRes.success && imgRes.imageUrl) {
        const caption = `🎨 *${tc.name}*\n\n📐 *Dimensions:* ${tc.options.width}x${tc.options.height}\n⚡ *Time:* ${elapsed}s\n\n📝 *Prompt:* "${imgRes.revisedPrompt.slice(0, 160)}..."`;
        const waRes = await sendWhatsAppImage(imgRes.imageUrl, USER_PHONE, caption, INSTANCE);
        results.push({ name: tc.name, success: true, url: imgRes.imageUrl, wa: waRes, elapsed });
      } else {
        results.push({ name: tc.name, success: false, error: imgRes.error, elapsed });
      }
    } catch (err: any) {
      results.push({ name: tc.name, success: false, error: err.message });
    }
  }

  return NextResponse.json({ success: true, providers, results });
}
