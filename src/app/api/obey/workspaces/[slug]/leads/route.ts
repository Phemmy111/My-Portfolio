import { NextRequest, NextResponse } from "next/server";
import {
  dbGetWorkspaceBySlug,
  dbGetWorkspaceLeads,
  dbUpsertWorkspaceLead,
} from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ws = await dbGetWorkspaceBySlug(slug);
    if (!ws) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format");
    const leads = await dbGetWorkspaceLeads(ws.id);

    if (format === "csv") {
      const headers = ["Name", "Phone", "Email", "Status", "Source", "Summary", "Date Captured"];
      const rows = leads.map((l) => [
        `"${(l.name || "Anonymous").replace(/"/g, '""')}"`,
        `"${l.phone}"`,
        `"${l.email || ""}"`,
        `"${l.status}"`,
        `"${l.source}"`,
        `"${(l.intent_summary || l.last_message || "").replace(/"/g, '""')}"`,
        `"${l.created_at ? new Date(l.created_at).toISOString() : ""}"`,
      ]);

      const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${ws.slug}-leads.csv"`,
        },
      });
    }

    if (format === "vcf") {
      const vcards = leads.map((l) => {
        const cleanName = (l.name || `Lead +${l.phone}`).replace(/[\r\n]/g, " ").trim();
        const cleanPhone = l.phone.startsWith("+") ? l.phone : `+${l.phone}`;
        const note = `Auto-saved via ${ws.name} | ${l.intent_summary || "Lead"}`;
        return [
          "BEGIN:VCARD",
          "VERSION:3.0",
          `FN:${cleanName}`,
          `TEL;TYPE=CELL:${cleanPhone}`,
          l.email ? `EMAIL:${l.email}` : "",
          `NOTE:${note}`,
          "END:VCARD",
        ]
          .filter(Boolean)
          .join("\r\n");
      });

      const vcfContent = vcards.join("\r\n\r\n");
      return new NextResponse(vcfContent, {
        status: 200,
        headers: {
          "Content-Type": "text/vcard; charset=utf-8",
          "Content-Disposition": `attachment; filename="${ws.slug}-contacts.vcf"`,
        },
      });
    }

    return NextResponse.json({ leads });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch leads" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ws = await dbGetWorkspaceBySlug(slug);
    if (!ws) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const body = await req.json();
    const { phone, name, email, source, status, intent_summary, last_message, metadata } = body;

    if (!phone) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    const lead = await dbUpsertWorkspaceLead({
      workspace_id: ws.id,
      phone,
      name,
      email,
      source: source || "manual",
      status: status || "lead",
      intent_summary,
      last_message,
      metadata,
    });

    return NextResponse.json({ success: true, lead }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to save lead" },
      { status: 500 }
    );
  }
}
