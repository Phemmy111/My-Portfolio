import { NextRequest, NextResponse } from "next/server";
import { getLeads, addLead, updateLead, deleteLead, getAdminStats } from "@/lib/admin-store";
import { dbGetLeads, dbAddLead, dbUpdateLead, dbDeleteLead, dbGetStats } from "@/lib/db";
import { generateColdEmail } from "@/lib/gig-generator";

function checkAuth(req: NextRequest): boolean {
  const session = req.cookies.get("femi_admin_session");
  return session?.value === "authenticated_session_token";
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [dbRows, dbStats] = await Promise.all([
      dbGetLeads(),
      dbGetStats(),
    ]);

    const leads = (dbRows || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      company: row.company || "",
      email: row.email,
      serviceNeeded: row.service_needed || "Web Development",
      status: row.status || "new",
      niche: row.niche || "",
      notes: row.notes || "",
      draftSubject: row.draft_subject || "",
      draftBody: row.draft_body || "",
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      lastContactedAt: row.last_contacted_at ? new Date(row.last_contacted_at).toISOString() : null,
    }));

    const stats = {
      totalLeads: Number(dbStats?.total_leads ?? leads.length),
      activeLeads: Number(dbStats?.active_leads ?? leads.filter((l: any) => l.status !== "closed").length),
      convertedLeads: Number(dbStats?.converted_leads ?? leads.filter((l: any) => l.status === "converted").length),
      totalProposals: Number(dbStats?.total_proposals ?? 0),
      totalInquiries: Number(dbStats?.total_inquiries ?? 0),
      unreadInquiries: Number(dbStats?.unread_inquiries ?? 0),
    };

    return NextResponse.json({ leads, stats });
  } catch (err) {
    console.warn("[Admin Leads] Falling back to admin-store:", err);
    const leads = getLeads();
    const stats = getAdminStats();
    return NextResponse.json({ leads, stats });
  }
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, company, email, serviceNeeded, niche, notes, specificPainPoint } = body;

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }

    // Auto-generate cold outreach pitch
    const draft = generateColdEmail({
      leadName: name,
      companyName: company || "your company",
      niche: niche || "business operations",
      serviceNeeded: serviceNeeded || "Web Development",
      specificPainPoint,
    });

    const leadId = `lead-${Date.now()}`;

    try {
      const row = await dbAddLead({
        id: leadId,
        name,
        company: company || "",
        email,
        service_needed: serviceNeeded || "Web Development",
        status: "new",
        niche: niche || "General Tech",
        notes: notes || "",
        draft_subject: draft.subject,
        draft_body: draft.body,
      });

      const newLead = {
        id: row.id,
        name: row.name,
        company: row.company || "",
        email: row.email,
        serviceNeeded: row.service_needed || "Web Development",
        status: row.status || "new",
        niche: row.niche || "",
        notes: row.notes || "",
        draftSubject: row.draft_subject || draft.subject,
        draftBody: row.draft_body || draft.body,
        createdAt: new Date().toISOString(),
      };

      return NextResponse.json({ lead: newLead });
    } catch {
      const newLead = addLead({
        name,
        company: company || "",
        email,
        serviceNeeded: serviceNeeded || "Web Development",
        status: "new",
        niche: niche || "General Tech",
        notes: notes || "",
        draftSubject: draft.subject,
        draftBody: draft.body,
      });
      return NextResponse.json({ lead: newLead });
    }
  } catch {
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Lead ID required" }, { status: 400 });
    }

    try {
      const updatedRow = await dbUpdateLead(id, {
        status: updates?.status,
        notes: updates?.notes,
        draft_subject: updates?.draftSubject,
        draft_body: updates?.draftBody,
        last_contacted_at: updates?.lastContactedAt,
      });
      return NextResponse.json({ lead: updatedRow });
    } catch {
      const updated = updateLead(id, updates);
      return NextResponse.json({ lead: updated });
    }
  } catch {
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Lead ID required" }, { status: 400 });
  }

  try {
    await dbDeleteLead(id);
    deleteLead(id);
    return NextResponse.json({ success: true });
  } catch {
    const deleted = deleteLead(id);
    return NextResponse.json({ success: deleted });
  }
}
