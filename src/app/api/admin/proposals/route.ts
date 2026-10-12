import { NextRequest, NextResponse } from "next/server";
import { getProposals, saveProposal, deleteProposal } from "@/lib/admin-store";
import { generateGigProposal } from "@/lib/gig-generator";

function checkAuth(req: NextRequest): boolean {
  const session = req.cookies.get("femi_admin_session");
  return session?.value === "authenticated_session_token";
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const proposals = getProposals();
  return NextResponse.json({ proposals });
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

    const saved = saveProposal({
      platform: platform || "Upwork",
      jobTitle,
      jobDescription,
      angle: angle || "High Authority Lead",
      generatedProposal: result.proposal,
      relevantProjects: result.recommendedProjects,
    });

    return NextResponse.json({ proposal: saved, meta: result });
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

  const deleted = deleteProposal(id);
  return NextResponse.json({ success: deleted });
}
