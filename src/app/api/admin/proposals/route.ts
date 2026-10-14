import { NextRequest, NextResponse } from "next/server";
import { getProposals, saveProposal, deleteProposal } from "@/lib/admin-store";
import { dbGetProposals, dbSaveProposal, dbDeleteProposal } from "@/lib/db";
import { generateGigProposal } from "@/lib/gig-generator";

function checkAuth(req: NextRequest): boolean {
  const session = req.cookies.get("femi_admin_session");
  return session?.value === "authenticated_session_token";
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const dbRows = await dbGetProposals();
    const proposals = (dbRows || []).map((row: any) => ({
      id: row.id,
      platform: row.platform,
      jobTitle: row.job_title,
      jobDescription: row.job_description,
      angle: row.angle,
      generatedProposal: row.generated_proposal,
      relevantProjects: row.relevant_projects || [],
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    }));
    return NextResponse.json({ proposals });
  } catch (err) {
    console.warn("[Admin Proposals] Falling back to admin-store:", err);
    const proposals = getProposals();
    return NextResponse.json({ proposals });
  }
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { platform, jobTitle, jobDescription, angle } = body;

    if (!jobTitle || !jobDescription) {
      return NextResponse.json({ error: "Job title and description are required" }, { status: 400 });
    }

    const result = generateGigProposal({
      platform: platform || "Upwork",
      jobTitle,
      jobDescription,
      angle: angle || "High Authority Lead",
    });

    const proposalId = `prop-${Date.now()}`;

    try {
      const savedRow = await dbSaveProposal({
        id: proposalId,
        platform: platform || "Upwork",
        job_title: jobTitle,
        job_description: jobDescription,
        angle: angle || "High Authority Lead",
        generated_proposal: result.proposal,
        relevant_projects: result.recommendedProjects,
      });

      const saved = {
        id: savedRow.id,
        platform: savedRow.platform,
        jobTitle: savedRow.job_title,
        jobDescription: savedRow.job_description,
        angle: savedRow.angle,
        generatedProposal: savedRow.generated_proposal,
        relevantProjects: savedRow.relevant_projects,
        createdAt: new Date().toISOString(),
      };

      return NextResponse.json({ proposal: saved, meta: result });
    } catch {
      const saved = saveProposal({
        platform: platform || "Upwork",
        jobTitle,
        jobDescription,
        angle: angle || "High Authority Lead",
        generatedProposal: result.proposal,
        relevantProjects: result.recommendedProjects,
      });
      return NextResponse.json({ proposal: saved, meta: result });
    }
  } catch {
    return NextResponse.json({ error: "Failed to generate proposal" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Proposal ID required" }, { status: 400 });
  }

  try {
    await dbDeleteProposal(id);
    deleteProposal(id);
    return NextResponse.json({ success: true });
  } catch {
    const deleted = deleteProposal(id);
    return NextResponse.json({ success: deleted });
  }
}
