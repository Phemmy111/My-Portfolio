import { neon } from "@neondatabase/serverless";
import { executeAICompletion } from "./ai-orchestrator";
import { sendTelegramMessage } from "./telegram-bot";
import { sendWhatsAppMessage } from "./whatsapp-gateway";
import { transporter } from "./email";
import { dbAddChatMessage } from "./db";
import { getSetting } from "./settings";

const dbUrl = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_JjwKqG1xtk4W@ep-dawn-feather-b5pjlp0o.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require";
const sql = neon(dbUrl);

export interface GmailMessage {
  id: string;
  sender: string;
  senderEmail: string;
  subject: string;
  snippet: string;
  body: string;
  receivedAt: string;
  isClientLead: boolean;
  priority: "high" | "medium" | "low" | "spam";
  summary: string;
  draftReply: string;
  status: "unread" | "processed" | "replied" | "ignored";
}

/**
 * Initializes table for Gmail message syncing and logs
 */
export async function ensureGmailTable() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS gmail_lead_syncs (
        id VARCHAR(100) PRIMARY KEY,
        sender VARCHAR(255) NOT NULL,
        sender_email VARCHAR(255) NOT NULL,
        subject TEXT NOT NULL,
        snippet TEXT,
        body TEXT,
        is_client_lead BOOLEAN DEFAULT false,
        priority VARCHAR(20) DEFAULT 'medium',
        summary TEXT,
        draft_reply TEXT,
        status VARCHAR(30) DEFAULT 'unread',
        received_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
  } catch (err) {
    console.warn("ensureGmailTable error:", err);
  }
}

/**
 * Helper to get synced emails from DB
 */
export async function getSyncedEmails(limit: number = 20): Promise<GmailMessage[]> {
  await ensureGmailTable();
  try {
    const rows = await sql`
      SELECT * FROM gmail_lead_syncs ORDER BY received_at DESC LIMIT ${limit}
    ` as any[];

    return rows.map((r) => ({
      id: r.id,
      sender: r.sender,
      senderEmail: r.sender_email,
      subject: r.subject,
      snippet: r.snippet || "",
      body: r.body || "",
      receivedAt: r.received_at,
      isClientLead: Boolean(r.is_client_lead),
      priority: r.priority,
      summary: r.summary || "",
      draftReply: r.draft_reply || "",
      status: r.status,
    }));
  } catch (err) {
    console.warn("getSyncedEmails query failed:", err);
    return [];
  }
}

/**
 * Saves a new incoming email, runs AI lead analysis & drafts response
 */
export async function processIncomingEmail(rawEmail: {
  id: string;
  sender: string;
  senderEmail: string;
  subject: string;
  body: string;
  receivedAt?: string;
}): Promise<GmailMessage> {
  await ensureGmailTable();

  // Check if already processed
  const [existing] = await sql`SELECT * FROM gmail_lead_syncs WHERE id = ${rawEmail.id}` as any[];
  if (existing) {
    return {
      id: existing.id,
      sender: existing.sender,
      senderEmail: existing.sender_email,
      subject: existing.subject,
      snippet: existing.snippet || "",
      body: existing.body || "",
      receivedAt: existing.received_at,
      isClientLead: Boolean(existing.is_client_lead),
      priority: existing.priority,
      summary: existing.summary || "",
      draftReply: existing.draft_reply || "",
      status: existing.status,
    };
  }

  // 1. AI Analysis: Determine if it's a client lead, rate priority, and draft reply
  const systemPrompt = `You are Obey, the AI executive assistant to Femi Adeleke (Full-Stack Engineer & Automation Specialist).
Analyze this incoming email received by Femi:
Sender: "${rawEmail.sender}" <${rawEmail.senderEmail}>
Subject: "${rawEmail.subject}"
Body:
${rawEmail.body.slice(0, 1500)}

Your mission:
1. Is this a potential client, hiring inquiry, business collaboration, or important contact? (isClientLead: true/false)
2. Priority: "high" (serious project inquiry, paid contract, budget mentioned), "medium" (general business inquiry), "low" (newsletter/notification), or "spam".
3. Write a 1-sentence executive summary for Femi.
4. If it is a client/business inquiry, write a warm, professional, high-converting email reply draft on behalf of Femi Adeleke.
   Mention relevant portfolio work (AutoLearn Spot, OKIKI Store, PassMark UTME Prep, or n8n automations) where appropriate.

Output strictly valid JSON:
{
  "isClientLead": boolean,
  "priority": "high" | "medium" | "low" | "spam",
  "summary": "string",
  "draftReply": "string"
}`;

  let isClientLead = true;
  let priority: "high" | "medium" | "low" | "spam" = "medium";
  let summary = `New message from ${rawEmail.sender} regarding ${rawEmail.subject}`;
  let draftReply = `Hi ${rawEmail.sender},\n\nThank you for reaching out! I've received your email and would love to connect further regarding this. I will get back to you with details shortly.\n\nBest regards,\nFemi Adeleke\nFull-Stack Developer & Automation Engineer`;

  try {
    const aiRes = await executeAICompletion({
      systemPrompt,
      userPrompt: "Analyze this email and draft reply JSON.",
      temperature: 0.3,
    });

    const cleanJson = aiRes.text.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanJson);
    isClientLead = Boolean(parsed.isClientLead);
    priority = parsed.priority || "medium";
    if (parsed.summary) summary = parsed.summary;
    if (parsed.draftReply) draftReply = parsed.draftReply;
  } catch (err) {
    console.warn("AI Email Analysis failed, using default fallback:", err);
  }

  const snippet = rawEmail.body.slice(0, 160).trim();

  // 2. Persist to Neon DB
  const [inserted] = await sql`
    INSERT INTO gmail_lead_syncs (
      id, sender, sender_email, subject, snippet, body,
      is_client_lead, priority, summary, draft_reply, status
    )
    VALUES (
      ${rawEmail.id}, ${rawEmail.sender}, ${rawEmail.senderEmail}, ${rawEmail.subject},
      ${snippet}, ${rawEmail.body}, ${isClientLead}, ${priority}, ${summary}, ${draftReply}, 'unread'
    )
    ON CONFLICT (id) DO UPDATE SET
      summary = EXCLUDED.summary,
      draft_reply = EXCLUDED.draft_reply
    RETURNING *
  ` as any[];

  const msgObj: GmailMessage = {
    id: inserted.id,
    sender: inserted.sender,
    senderEmail: inserted.sender_email,
    subject: inserted.subject,
    snippet: inserted.snippet,
    body: inserted.body,
    receivedAt: inserted.received_at,
    isClientLead,
    priority,
    summary,
    draftReply,
    status: inserted.status,
  };

  // 3. Proactive Mobile Dispatch: If it's a client inquiry or high priority, alert Femi immediately on phone!
  if (isClientLead && (priority === "high" || priority === "medium")) {
    const alertText = `📬 *New Client Email Received!*\n\n` +
      `*From:* ${msgObj.sender} (${msgObj.senderEmail})\n` +
      `*Subject:* ${msgObj.subject}\n` +
      `*Summary:* ${msgObj.summary}\n\n` +
      `📝 *Obey Drafted Reply:*\n"${msgObj.draftReply.slice(0, 280)}..."\n\n` +
      `_Tap below to approve instant auto-reply or open your dashboard._`;

    const inlineKeyboard = [
      [
        { text: "✅ Send Drafted Reply", callback_data: `reply_email:${msgObj.id}` },
        { text: "👁️ Mark as Read", callback_data: `mark_read:${msgObj.id}` },
      ],
    ];

    // Dispatch to Telegram
    await sendTelegramMessage(alertText, { inlineKeyboard });

    // Dispatch to WhatsApp
    await sendWhatsAppMessage(alertText);

    // Sync to Obey Chat Log in Neon DB
    await dbAddChatMessage({
      id: `gmail-alert-${msgObj.id}`,
      role: "assistant",
      content: alertText,
    });
  }

  return msgObj;
}

/**
 * Sends the approved email reply back to the sender via Gmail SMTP
 */
export async function sendEmailReply(
  emailId: string,
  customReplyText?: string
): Promise<{ success: boolean; message: string }> {
  await ensureGmailTable();

  const [email] = await sql`SELECT * FROM gmail_lead_syncs WHERE id = ${emailId}` as any[];
  if (!email) {
    return { success: false, message: "Email record not found." };
  }

  const replyBody = customReplyText || email.draft_reply;
  const replySubject = email.subject.startsWith("Re:") ? email.subject : `Re: ${email.subject}`;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `"Femi Adeleke" <${process.env.SMTP_USER}>`,
      to: email.sender_email,
      subject: replySubject,
      text: replyBody,
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 580px; margin: 0 auto; padding: 20px; line-height: 1.6; color: #1a1a1a;">
          ${replyBody.split("\n\n").map((p: string) => `<p style="margin: 0 0 14px 0;">${p.replace(/\n/g, "<br/>")}</p>`).join("")}
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 13px; color: #6b7280; margin: 0;">
            <strong>Femi Adeleke</strong><br/>
            Full-Stack Software Engineer & AI Automation Specialist<br/>
            Founder, AutoLearn Spot · <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://obeyai.vercel.app"}" style="color: #2563eb;">Portfolio & Case Studies</a>
          </p>
        </div>
      `,
    });

    await sql`
      UPDATE gmail_lead_syncs
      SET status = 'replied'
      WHERE id = ${emailId}
    `;

    return {
      success: true,
      message: `Reply sent successfully to ${email.sender} (${email.sender_email})!`,
    };
  } catch (err: any) {
    console.error("sendEmailReply error:", err);
    return { success: false, message: `Failed to dispatch email reply: ${err.message}` };
  }
}

/**
 * Autonomous Gmail Sync Runner:
 * Checks for recent inquiries, syncs incoming messages, evaluates leads, and alerts Femi
 */
export async function runGmailInboxSync(): Promise<{
  success: boolean;
  syncedCount: number;
  emails: GmailMessage[];
}> {
  await ensureGmailTable();

  // Also check if any recent inquiries from the portfolio contact form haven't been synced to gmail_lead_syncs
  try {
    const unreadInquiries = await sql`SELECT * FROM inquiries WHERE status = 'unread' LIMIT 5` as any[];
    for (const inq of unreadInquiries) {
      await processIncomingEmail({
        id: `inq-${inq.id}`,
        sender: inq.name,
        senderEmail: inq.email,
        subject: `Project Inquiry: ${inq.service || "Web / Automation Project"}`,
        body: inq.message,
      });
    }
  } catch (e) {
    console.warn("Syncing inquiries to gmail_lead_syncs fallback:", e);
  }

  const emails = await getSyncedEmails(10);
  return {
    success: true,
    syncedCount: emails.length,
    emails,
  };
}
