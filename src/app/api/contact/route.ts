import { NextRequest, NextResponse } from "next/server";
import { addInquiry } from "@/lib/admin-store";
import { dbAddInquiry } from "@/lib/db";
import { sendAdminInquiryAlert, sendClientAutoReply } from "@/lib/email";
import { triggerInstantProactiveAlert } from "@/lib/proactive-engine";

export async function POST(req: NextRequest) {
  try {
    const { name, email, service, message } = await req.json();

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Name, email, and message are required" },
        { status: 400 }
      );
    }

    const inquiryId = `inq-${Date.now()}`;

    // 1. Save directly to Neon DB
    try {
      await dbAddInquiry({
        id: inquiryId,
        name,
        email,
        service: service || "General Inquiry",
        message,
      });
    } catch (dbErr) {
      console.warn("dbAddInquiry fallback to memory:", dbErr);
      addInquiry({
        name,
        email,
        service: service || "General Inquiry",
        message,
      });
    }

    // 2. Trigger instant proactive push alert to Femi's phone (Telegram / WhatsApp)
    triggerInstantProactiveAlert({
      title: "New Client Inquiry Received!",
      body: `**From:** ${name} (${email})\n**Service:** ${service || "General Inquiry"}\n**Message:**\n${message}`,
      link: `${process.env.NEXT_PUBLIC_APP_URL || "https://femiadelekeportfolio.vercel.app"}/admin`,
    }).catch((err) => console.warn("Proactive contact alert failed:", err));

    // 3. Send alerts via SMTP (only if SMTP is configured)
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        await sendAdminInquiryAlert({
          clientName: name,
          clientEmail: email,
          service: service || "General Inquiry",
          message,
          inquiryId,
        });

        await sendClientAutoReply({
          clientName: name,
          clientEmail: email,
          service: service || "General Inquiry",
        });
      } catch (emailErr) {
        console.error("SMTP send failed:", emailErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Message received successfully! Femi will respond shortly.",
      inquiryId,
    });
  } catch (error) {
    console.error("Contact API error:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
