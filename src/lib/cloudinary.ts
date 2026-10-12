import { v2 as cloudinary } from "cloudinary";

// ==============================================================
// CLOUDINARY CONFIGURATION
// Used for uploading project images, portfolio assets,
// and any file attachments from the Admin dashboard
// ==============================================================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/**
 * Upload a file buffer or URL to Cloudinary
 * Returns the secure URL of the uploaded asset
 */
export async function uploadToCloudinary(
  source: string, // file path, URL, or base64 data URI
  options?: {
    folder?: string;
    publicId?: string;
    transformation?: object;
  }
): Promise<{ url: string; publicId: string }> {
  const result = await cloudinary.uploader.upload(source, {
    folder: options?.folder ?? "femi-portfolio",
    public_id: options?.publicId,
    overwrite: true,
    resource_type: "auto",
    transformation: options?.transformation,
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
  };
}

/**
 * Delete an asset from Cloudinary by its public_id
 */
export async function deleteFromCloudinary(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId);
}

/**
 * Generate a signed upload URL for direct browser uploads
 * (use with next-cloudinary on the client side)
 */
export function getCloudinaryUploadPreset(): string {
  return process.env.CLOUDINARY_CLOUD_NAME || "";
}

export { cloudinary };
