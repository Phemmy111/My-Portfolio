import sharp from "sharp";
import fs from "fs";
import path from "path";

async function generateFavicons() {
  const inputImage = path.join(process.cwd(), "public", "femi-headshot.webp");

  if (!fs.existsSync(inputImage)) {
    console.error("Headshot image not found at:", inputImage);
    process.exit(1);
  }

  // 1. Generate 32x32 PNG (standard favicon)
  await sharp(inputImage)
    .resize(32, 32, { fit: "cover" })
    .png()
    .toFile(path.join(process.cwd(), "public", "favicon-32x32.png"));
  console.log("Generated public/favicon-32x32.png");

  // 2. Generate 16x16 PNG
  await sharp(inputImage)
    .resize(16, 16, { fit: "cover" })
    .png()
    .toFile(path.join(process.cwd(), "public", "favicon-16x16.png"));
  console.log("Generated public/favicon-16x16.png");

  // 3. Generate Next.js App Router icon.png (32x32 or 48x48)
  await sharp(inputImage)
    .resize(48, 48, { fit: "cover" })
    .png()
    .toFile(path.join(process.cwd(), "src", "app", "icon.png"));
  console.log("Generated src/app/icon.png");

  // 4. Generate Apple Touch Icon (180x180)
  await sharp(inputImage)
    .resize(180, 180, { fit: "cover" })
    .png()
    .toFile(path.join(process.cwd(), "src", "app", "apple-icon.png"));
  console.log("Generated src/app/apple-icon.png");

  await sharp(inputImage)
    .resize(180, 180, { fit: "cover" })
    .png()
    .toFile(path.join(process.cwd(), "public", "apple-touch-icon.png"));
  console.log("Generated public/apple-touch-icon.png");

  // 5. Replace src/app/favicon.ico and public/favicon.ico
  // (PNG formatted ICO is standard for modern browsers)
  const icoBuffer = await sharp(inputImage)
    .resize(32, 32, { fit: "cover" })
    .toFormat("png")
    .toBuffer();

  fs.writeFileSync(path.join(process.cwd(), "src", "app", "favicon.ico"), icoBuffer);
  fs.writeFileSync(path.join(process.cwd(), "public", "favicon.ico"), icoBuffer);
  console.log("Overwrote src/app/favicon.ico and public/favicon.ico with Femi's photo!");
}

generateFavicons().catch(console.error);
