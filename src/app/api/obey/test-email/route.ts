import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER || "obeyaibusiness@gmail.com";
  const smtpPass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || "npejlispqthpexwi";
  const adminEmail = process.env.ADMIN_ALERT_EMAIL || "femiadeleke2020@gmail.com";

  const configState = {
    hasSmtpUser: Boolean(process.env.SMTP_USER),
    smtpUserValue: process.env.SMTP_USER ? `${process.env.SMTP_USER.slice(0, 4)}***` : "NOT_SET",
    hasSmtpPass: Boolean(process.env.SMTP_PASS),
    smtpPassLength: process.env.SMTP_PASS ? process.env.SMTP_PASS.length : 0,
    hasGmailUser: Boolean(process.env.GMAIL_USER),
    hasGmailPass: Boolean(process.env.GMAIL_APP_PASSWORD),
    effectiveUser: smtpUser,
    effectivePassLength: smtpPass.length,
    adminEmail,
  };

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    console.log("[TestEmail] Verifying transporter...");
    await transporter.verify();

    console.log("[TestEmail] Sending test email to:", adminEmail);
    const info = await transporter.sendMail({
      from: `"Obey Business" <${smtpUser}>`,
      to: adminEmail,
      subject: `⚡ Obey AI Live Verification — ${new Date().toLocaleTimeString()} WAT`,
      html: `
        <div style="font-family: sans-serif; padding: 24px; background: #09090b; color: #ffffff; border-radius: 12px; max-width: 550px;">
          <h2 style="color: #10b981; margin-top: 0;">⚡ Obey Email Engine Confirmed!</h2>
          <p>Hello Boss Femi,</p>
          <p>This email confirms that Obey's automated email dispatcher is 100% operational in live production.</p>
          <div style="background: #18181b; padding: 14px; border-radius: 8px; font-size: 13px; font-family: monospace; color: #a1a1aa; margin: 16px 0;">
            Sender: ${smtpUser}<br/>
            Recipient: ${adminEmail}<br/>
            Dispatched at: ${new Date().toISOString()}
          </div>
          <p style="font-size: 12px; color: #71717a;">Sent automatically by Obey AI.</p>
        </div>
      `,
    });

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      accepted: info.accepted,
      configState,
    });
  } catch (err: any) {
    console.error("[TestEmail] Dispatch error:", err);
    return NextResponse.json({
      success: false,
      error: err.message,
      code: err.code,
      response: err.response,
      configState,
    }, { status: 500 });
  }
}
