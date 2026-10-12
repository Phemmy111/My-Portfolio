import nodemailer from "nodemailer";

// ==============================================================
// SMTP TRANSPORTER
// Works with Gmail App Password (recommended) or any SMTP host
// ==============================================================
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === "true", // false for port 587 (TLS)
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
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
  const adminEmail = process.env.ADMIN_ALERT_EMAIL || process.env.SMTP_USER;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://yoursite.com";

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"Femi Adeleke Portfolio" <${process.env.SMTP_USER}>`,
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
    from: process.env.SMTP_FROM || `"Femi Adeleke" <${process.env.SMTP_USER}>`,
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
    from: process.env.SMTP_FROM || `"Femi Adeleke" <${process.env.SMTP_USER}>`,
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

export { transporter };
