import { NextRequest, NextResponse } from "next/server";
import { dbGetAllGuestConversations } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "json";

  const rows = await dbGetAllGuestConversations();

  if (format === "csv") {
    const headers = ["ID", "Phone Number", "Sender Name", "Role", "Message", "Timestamp"];
    const csvLines = [headers.join(",")];

    for (const r of rows) {
      const cleanContent = `"${(r.content || "").replace(/"/g, '""').replace(/\n/g, " ")}"`;
      csvLines.push([
        r.id,
        r.phone_number,
        `"${(r.sender_name || "").replace(/"/g, '""')}"`,
        r.role,
        cleanContent,
        new Date(r.created_at).toISOString(),
      ].join(","));
    }

    return new NextResponse(csvLines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="whatsapp-conversations-${Date.now()}.csv"`,
      },
    });
  }

  return NextResponse.json({
    total: rows.length,
    conversations: rows,
  });
}
