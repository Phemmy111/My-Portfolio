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
    const contentType = req.headers.get("content-type") || "";

    // 1. Multipart Form Data upload (direct file picker / drag-and-drop)
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return NextResponse.json({ error: "No file provided in form-data" }, { status: 400 });
      }

      const mimeType = file.type || "application/octet-stream";
      const isVideo = mimeType.startsWith("video/");
      const isImage = mimeType.startsWith("image/");

      if (!isImage && !isVideo) {
        return NextResponse.json(
          { error: "Only images (JPEG, PNG, WEBP, GIF) and videos (MP4, MOV, WEBM) are supported" },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Upload to Cloudinary using upload_stream
      const uploadResult = await new Promise<{
        secure_url: string;
        resource_type: string;
        format?: string;
      }>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "obey-status-media",
            resource_type: isVideo ? "video" : "image",
          },
          (error, result) => {
            if (error || !result) {
              return reject(error || new Error("Cloudinary upload failed with empty result"));
            }
            resolve(result as any);
          }
        );
        stream.end(buffer);
      });

      return NextResponse.json({
        success: true,
        url: uploadResult.secure_url,
        resource_type: uploadResult.resource_type === "video" ? "video" : "image",
        format: uploadResult.format,
      });
    }

    // 2. JSON Base64 upload fallback
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const { dataUri, isVideo } = body;

      if (!dataUri) {
        return NextResponse.json({ error: "Missing dataUri in request" }, { status: 400 });
      }

      const uploadResult = await cloudinary.uploader.upload(dataUri, {
        folder: "obey-status-media",
        resource_type: isVideo ? "video" : "auto",
      });

      return NextResponse.json({
        success: true,
        url: uploadResult.secure_url,
        resource_type: uploadResult.resource_type === "video" ? "video" : "image",
        format: uploadResult.format,
      });
    }

    return NextResponse.json(
      { error: "Unsupported Content-Type. Please send multipart/form-data or application/json." },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("[Upload API] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to upload file to Cloudinary" },
      { status: 500 }
    );
  }
}
