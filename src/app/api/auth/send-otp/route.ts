import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendWhatsAppMessage } from "@/lib/whatsapp-gateway";
import { sendOtpEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { phone, email, purpose = "login" } = body;

    if (!phone && !email) {
      return NextResponse.json(
        { error: "Please provide a valid WhatsApp phone number or email address." },
        { status: 400 }
      );
    }

    // Clean phone number (digits only, e.g. 2349074027451)
    let cleanPhone = phone ? phone.replace(/\D/g, "") : "";
    if (cleanPhone.startsWith("0")) {
      cleanPhone = "234" + cleanPhone.slice(1);
    }

    const cleanEmail = email ? email.trim().toLowerCase() : "";

    // Primary lookup identifier
    const identifier = cleanPhone || cleanEmail;

    // Generate 6-digit numeric OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store in Neon DB
    if (sql) {
      // Invalidate any previous unused OTPs for this identifier
      await sql`
        UPDATE auth_otps 
        SET used = TRUE 
        WHERE identifier = ${identifier} AND used = FALSE
      `;

      // Insert fresh OTP
      await sql`
        INSERT INTO auth_otps (identifier, phone, email, code, type, expires_at)
        VALUES (${identifier}, ${cleanPhone || null}, ${cleanEmail || null}, ${code}, ${purpose}, ${expiresAt.toISOString()})
      `;
    }

    const dispatchedChannels: string[] = [];

    // 1. Dispatch via WhatsApp
    if (cleanPhone) {
      try {
        const waText = `🔐 *Obey Business AI Security Passcode*\n\nYour 6-digit verification code is: *${code}*\n\n⏱️ This code is valid for 10 minutes.\nDo not share this code with anyone.`;
        await sendWhatsAppMessage(waText, cleanPhone);
        dispatchedChannels.push("WhatsApp");
      } catch (waErr) {
        console.warn("[OTP] WhatsApp dispatch warning:", waErr);
      }
    }

    // 2. Dispatch via Email (if email supplied)
    if (cleanEmail) {
      try {
        await sendOtpEmail({
          to: cleanEmail,
          code,
          purpose,
        });
        dispatchedChannels.push("Email");
      } catch (mailErr) {
        console.warn("[OTP] Email dispatch warning:", mailErr);
      }
    }

    // 3. Notify Femi Adeleke if a prospective client is verifying or signing up
    if (cleanPhone !== "2348120934828" && cleanEmail !== "femiadeleke2020@gmail.com") {
      const adminNotice = `🔔 *Obey Onboarding Alert*\n\nA prospective client requested an authentication code on Obey Business:\n📱 Phone: +${cleanPhone || "N/A"}\n📧 Email: ${cleanEmail || "N/A"}\n🎯 Flow: ${purpose}`;
      sendWhatsAppMessage(adminNotice, "2348120934828").catch(() => {});
    }

    return NextResponse.json({
      success: true,
      message: `Verification code sent to ${dispatchedChannels.join(" & ")}.`,
      identifier,
      channels: dispatchedChannels,
    });
  } catch (err: any) {
    console.error("[OTP] send-otp error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate and dispatch verification code" },
      { status: 500 }
    );
  }
}
