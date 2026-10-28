import nodemailer from "nodemailer";

// ==============================================================
// SMTP TRANSPORTER
// Works with Gmail App Password (recommended) or any SMTP host
// ==============================================================
const smtpUser =
  process.env.SMTP_USER && process.env.SMTP_USER !== "femiadeleke2020@gmail.com"
    ? process.env.SMTP_USER
    : process.env.GMAIL_USER || "obeyaibusiness@gmail.com";
const smtpPass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || "npejlispqthpexwi";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === "true", // false for port 587 (TLS)
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
});

// ==============================================================
// EMAIL: Admin Alert — New Contact Form Inquiry
// ==============================================================
export async function sendAdminInquiryAlert(params: {
  clientName: string;
  clientEmail: string;
  service: string;
  message: string;
  inquiryId: string;
}) {
  const { clientName, clientEmail, service, message, inquiryId } = params;
  const adminEmail = process.env.ADMIN_ALERT_EMAIL || "femiadeleke2020@gmail.com";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://obeyai.vercel.app";

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"Obey AI" <${process.env.SMTP_USER || "obeyaibusiness@gmail.com"}>`,
    to: adminEmail,
    subject: `🔔 New Inquiry from ${clientName} — ${service}`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #09090b; color: #e4e4e7; border-radius: 12px;">
        <div style="margin-bottom: 24px;">
          <h1 style="font-size: 24px; font-weight: 900; color: #ffffff; margin: 0;">📬 New Portfolio Inquiry</h1>
          <p style="color: #71717a; font-size: 13px; margin: 4px 0 0;">Submitted via your portfolio contact form</p>
        </div>
        
        <div style="background: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #a1a1aa; font-size: 12px; font-weight: 700; text-transform: uppercase; width: 120px;">Name</td>
              <td style="padding: 6px 0; color: #ffffff; font-weight: 700;">${clientName}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #a1a1aa; font-size: 12px; font-weight: 700; text-transform: uppercase;">Email</td>
              <td style="padding: 6px 0; color: #ffffff; font-weight: 700;">${clientEmail}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #a1a1aa; font-size: 12px; font-weight: 700; text-transform: uppercase;">Project</td>
              <td style="padding: 6px 0; color: #ffffff; font-weight: 700;">${service}</td>
            </tr>
          </table>
        </div>
        
        <div style="background: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <p style="color: #a1a1aa; font-size: 12px; font-weight: 700; text-transform: uppercase; margin: 0 0 8px;">Message</p>
          <p style="color: #e4e4e7; font-size: 14px; line-height: 1.6; margin: 0;">${message}</p>
        </div>
        
        <div style="display: flex; gap: 12px;">
          <a href="mailto:${clientEmail}?subject=Re: Your inquiry regarding ${service}" 
             style="background: #ffffff; color: #09090b; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">
            Reply via Email
          </a>
          <a href="${appUrl}/admin" 
             style="background: #18181b; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; font-size: 14px; border: 1px solid #27272a; display: inline-block;">
            Open Admin Dashboard
          </a>
        </div>
        
        <p style="color: #3f3f46; font-size: 11px; margin: 24px 0 0;">
          Inquiry ID: ${inquiryId} · Powered by Femi Adeleke Command Center
        </p>
      </div>
    `,
  });
}

// ==============================================================
// EMAIL: Auto-Reply to Client — Acknowledgment
// ==============================================================
export async function sendClientAutoReply(params: {
  clientName: string;
  clientEmail: string;
  service: string;
}) {
  const { clientName, clientEmail, service } = params;
  const firstName = clientName.split(" ")[0];

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"Femi Adeleke · Obey AI" <${process.env.SMTP_USER || "obeyaibusiness@gmail.com"}>`,
    to: clientEmail,
    subject: `Got your message, ${firstName}! — Femi Adeleke`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #09090b; color: #e4e4e7; border-radius: 12px;">
        <h2 style="color: #ffffff; font-size: 22px; font-weight: 900; margin: 0 0 16px;">Hi ${firstName}, message received! 🙌</h2>
        <p style="font-size: 14px; line-height: 1.7; color: #a1a1aa;">
          Thanks for reaching out regarding <strong style="color: #ffffff;">${service}</strong>. I've received your message and will review it personally and get back to you within <strong style="color: #ffffff;">24 hours</strong>.
        </p>
        <p style="font-size: 14px; line-height: 1.7; color: #a1a1aa;">
          If you need a quicker response, feel free to WhatsApp me directly.
        </p>
        <a href="https://wa.me/2348120934828" 
           style="background: #16a34a; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block; margin-top: 8px;">
          💬 Chat on WhatsApp
        </a>
        <hr style="border: none; border-top: 1px solid #27272a; margin: 24px 0;" />
        <p style="font-size: 12px; color: #52525b;">
          Femi Adeleke · Full-Stack Developer & Automation Engineer<br />
          Founder, AutoLearn Spot · <a href="https://github.com/Phemmy111" style="color: #52525b;">GitHub</a>
        </p>
      </div>
    `,
  });
}

// ==============================================================
// EMAIL: Cold Outreach Delivery (send a drafted cold pitch)
// ==============================================================
export async function sendColdEmail(params: {
  to: string;
  subject: string;
  body: string;
}) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"Obey AI Business" <${process.env.SMTP_USER || "obeyaibusiness@gmail.com"}>`,
    to: params.to,
    subject: params.subject,
    text: params.body,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        ${params.body.split("\n").map((line) => `<p style="margin: 0 0 12px; font-size: 14px; line-height: 1.7; color: #1a1a1a;">${line}</p>`).join("")}
      </div>
    `,
  });
}

export async function sendProactiveBriefingEmail(params: {
  subject: string;
  markdownContent: string;
}) {
  const adminEmail = process.env.ADMIN_ALERT_EMAIL || "femiadeleke2020@gmail.com";
  const formattedHtml = params.markdownContent
    .split("\n\n")
    .map((p) => `<p style="margin: 0 0 12px; font-size: 14px; line-height: 1.7; color: #e4e4e7;">${p.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #ffffff;">$1</strong>').replace(/\n/g, "<br/>")}</p>`)
    .join("");

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"Agent Obey" <${process.env.SMTP_USER || "obeyaibusiness@gmail.com"}>`,
    to: adminEmail,
    subject: params.subject,
    html: `
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px; border-bottom: 1px solid #18181b; padding-bottom: 16px;">
          <img src="https://obeyai.vercel.app/obey-avatar.png" alt="Obey AI" width="42" height="42" style="border-radius: 50%; border: 1.5px solid #10b981; display: inline-block; vertical-align: middle;" />
          <div>
            <h1 style="font-size: 18px; font-weight: 900; color: #10b981; margin: 0; line-height: 1.2;">Agent Obey</h1>
            <span style="font-size: 11px; color: #a1a1aa; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Proactive Operational Briefing</span>
          </div>
        </div>
        <div style="background: #111113; border: 1px solid #1f1f23; border-radius: 12px; padding: 20px;">
          ${formattedHtml}
        </div>
        <div style="margin-top: 24px; text-align: center;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://obeyai.vercel.app"}/admin" style="display: inline-block; background: #10b981; color: #000000; font-weight: 800; text-decoration: none; padding: 10px 20px; border-radius: 10px; font-size: 13px;">Open Command Center</a>
        </div>
      </div>
    `,
  });
}

export async function sendOtpEmail(params: {
  to: string;
  code: string;
  purpose?: string;
}) {
  const { to, code, purpose = "login" } = params;
  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"Obey Business" <${process.env.SMTP_USER || "obeyaibusiness@gmail.com"}>`,
    to,
    subject: `🔐 Your Obey Verification Code: ${code}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 24px; background: #0c0d0e; color: #f4f4f5; border-radius: 20px; border: 1px solid #27272a;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="font-size: 22px; font-weight: 900; color: #ffffff; margin: 0; letter-spacing: -0.5px;">Obey Business AI</h1>
          <p style="color: #10b981; font-size: 12px; font-weight: 700; text-transform: uppercase; margin: 6px 0 0; letter-spacing: 1px;">Security Verification</p>
        </div>
        
        <div style="background: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 20px;">
          <p style="color: #a1a1aa; font-size: 13px; margin: 0 0 14px;">Your 6-digit authentication passcode for your Business Control Room is:</p>
          <div style="font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #10b981; font-family: monospace; padding: 12px 0;">
            ${code}
          </div>
          <p style="color: #71717a; font-size: 11px; margin: 12px 0 0;">Valid for 10 minutes. Never share this code with anyone.</p>
        </div>
        
        <p style="color: #52525b; font-size: 11px; text-align: center; margin: 0;">
          If you did not request this verification code, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

export async function sendNewRegistrationAlertEmail(params: {
  businessName: string;
  slug: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail?: string;
  plan?: string;
}) {
  const { businessName, slug, ownerName, ownerPhone, ownerEmail, plan = "trial" } = params;
  const adminEmail = process.env.ADMIN_ALERT_EMAIL || "femiadeleke2020@gmail.com";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://obeyai.vercel.app";

  await transporter.sendMail({
    from: `"Obey Business AI" <${smtpUser}>`,
    to: adminEmail,
    subject: `🚀 New Business Registration: ${businessName} (${ownerName})`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; background: #09090b; color: #e4e4e7; border-radius: 16px; border: 1px solid #27272a;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="font-size: 22px; font-weight: 800; color: #10b981; margin: 0;">🎉 New Obey Business Registration!</h1>
          <p style="color: #a1a1aa; font-size: 13px; margin: 6px 0 0;">A new client just registered on your Obey AI platform.</p>
        </div>

        <div style="background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 8px 0; color: #a1a1aa; font-weight: 600; width: 140px;">Business:</td>
              <td style="padding: 8px 0; color: #ffffff; font-weight: 700;">${businessName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #a1a1aa; font-weight: 600;">Handle:</td>
              <td style="padding: 8px 0; color: #10b981; font-weight: 700;">/call?biz=${slug}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #a1a1aa; font-weight: 600;">Owner:</td>
              <td style="padding: 8px 0; color: #ffffff; font-weight: 700;">${ownerName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #a1a1aa; font-weight: 600;">WhatsApp:</td>
              <td style="padding: 8px 0; color: #ffffff; font-weight: 700;">+${ownerPhone}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #a1a1aa; font-weight: 600;">Email:</td>
              <td style="padding: 8px 0; color: #ffffff; font-weight: 700;">${ownerEmail || "Not provided"}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #a1a1aa; font-weight: 600;">Plan:</td>
              <td style="padding: 8px 0; color: #38bdf8; font-weight: 700; text-transform: uppercase;">${plan}</td>
            </tr>
          </table>
        </div>

        <div style="text-align: center; margin-top: 24px;">
          <a href="${appUrl}/admin" style="background: #10b981; color: #000000; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; display: inline-block;">
            Open Master Control Room →
          </a>
        </div>
      </div>
    `,
  });
}

export { transporter };


