import { NextRequest, NextResponse } from "next/server";
import { getSyncedEmails, runGmailInboxSync, processIncomingEmail, sendEmailReply } from "@/lib/gmail-reader";

// GET: Retrieve list of synced emails
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sync = searchParams.get("sync") === "true";

    if (sync) {
      const syncResult = await runGmailInboxSync();
      return NextResponse.json({ ok: true, sync: syncResult });
    }

    const emails = await getSyncedEmails(25);
    return NextResponse.json({ ok: true, emails });
  } catch (err: any) {
    console.error("Gmail route GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Actions (process new incoming webhook or send auto-reply)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || "sync";

    if (action === "reply") {
      const { emailId, replyText } = body;
      if (!emailId) {
        return NextResponse.json({ error: "Missing emailId" }, { status: 400 });
      }
      const res = await sendEmailReply(emailId, replyText);
      return NextResponse.json(res);
    }

    if (action === "incoming_webhook") {
      // Endpoint for n8n, Zapier, or Google Pub/Sub Webhooks
      const { sender, senderEmail, subject, body: emailBody, id } = body;
      const msg = await processIncomingEmail({
        id: id || `hook-${Date.now()}`,
        sender: sender || "Client Lead",
        senderEmail: senderEmail || "client@example.com",
        subject: subject || "Project Inquiry",
        body: emailBody || "",
      });
      return NextResponse.json({ ok: true, email: msg });
    }

    if (action === "sync") {
      const syncResult = await runGmailInboxSync();
      return NextResponse.json({ ok: true, result: syncResult });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("Gmail route POST error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
