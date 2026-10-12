import { NextRequest, NextResponse } from "next/server";
import { addInquiry } from "@/lib/admin-store";
import { sendAdminInquiryAlert, sendClientAutoReply } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { name, email, service, message } = await req.json();

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Name, email, and message are required" },
        { status: 400 }
      );
    }

    // 1. Save to local store (works immediately; swap for Neon DB once DATABASE_URL is set)
    const inquiry = addInquiry({
      name,
      email,
      service: service || "General Inquiry",
      message,
    });

    // 2. Send alerts via SMTP (only if SMTP is configured)
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        // Notify Femi instantly
        await sendAdminInquiryAlert({
          clientName: name,
          clientEmail: email,
          service: service || "General Inquiry",
          message,
          inquiryId: inquiry.id,
        });

        // Send auto-reply to client
        await sendClientAutoReply({
          clientName: name,
          clientEmail: email,
          service: service || "General Inquiry",
        });
      } catch (emailErr) {
        // Don't fail the whole request if SMTP fails — just log it
        console.error("SMTP send failed:", emailErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Message received successfully! Femi will respond shortly.",
      inquiryId: inquiry.id,
    });
  } catch (error) {
    console.error("Contact API error:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
