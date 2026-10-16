import { NextRequest, NextResponse } from "next/server";
import { dbGetWorkspaceBySlug, dbGetWorkspaceLeads } from "@/lib/db";
import { sendWhatsAppMessage } from "@/lib/whatsapp-gateway";

export const maxDuration = 60;

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
    const { template, statusFilter = "all" } = body;

    if (!template || !template.trim()) {
      return NextResponse.json(
        { error: "Broadcast message template is required" },
        { status: 400 }
      );
    }

    const allLeads = await dbGetWorkspaceLeads(ws.id);
    const targetLeads = allLeads.filter((lead) => {
      if (statusFilter === "all") return true;
      return lead.status === statusFilter;
    });

    if (targetLeads.length === 0) {
      return NextResponse.json({
        success: true,
        dispatchedCount: 0,
        message: "No leads matched the selected filter.",
      });
    }

    let dispatchedCount = 0;
    const errors: string[] = [];

    for (const lead of targetLeads) {
      const recipientName = (lead.name || "there").trim();
      const personalizedMessage = template
        .replace(/\{name\}/gi, recipientName)
        .replace(/\{business\}/gi, ws.name);

      try {
        const res = await sendWhatsAppMessage(personalizedMessage, lead.phone);
        if (res.success) {
          dispatchedCount++;
        } else {
          errors.push(`Failed for +${lead.phone}: ${res.error || "Send error"}`);
        }
      } catch (err: any) {
        errors.push(`Error for +${lead.phone}: ${err.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      totalTargets: targetLeads.length,
      dispatchedCount,
      errors: errors.slice(0, 5),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to dispatch broadcast" },
      { status: 500 }
    );
  }
}
