import { NextRequest, NextResponse } from "next/server";
import { getLeads, addLead, updateLead, deleteLead, getAdminStats } from "@/lib/admin-store";
import { generateColdEmail } from "@/lib/gig-generator";

function checkAuth(req: NextRequest): boolean {
  const session = req.cookies.get("femi_admin_session");
  return session?.value === "authenticated_session_token";
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const leads = getLeads();
  const stats = getAdminStats();
  return NextResponse.json({ leads, stats });
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

    const updated = updateLead(id, updates);
    if (!updated) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json({ lead: updated });
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

  const deleted = deleteLead(id);
  return NextResponse.json({ success: deleted });
}
