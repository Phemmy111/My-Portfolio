import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { folder = "obey-status-media", resourceType = "auto", eager } = body;

    const timestamp = Math.round(new Date().getTime() / 1000);

    const paramsToSign: Record<string, any> = {
      folder,
      timestamp,
    };

    if (eager) {
      paramsToSign.eager = eager;
    }

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET || ""
    );

    return NextResponse.json({
      signature,
      timestamp,
      apiKey: process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      folder,
    });
  } catch (err: any) {
    console.error("[Upload Sign API] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
