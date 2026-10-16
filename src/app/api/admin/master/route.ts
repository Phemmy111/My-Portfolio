import { NextRequest, NextResponse } from "next/server";
import {
  dbGetAllWorkspacesWithStats,
  dbGetPlatformPricing,
  dbUpdatePlatformPricing,
  dbUpdateWorkspacePlan,
  dbDeleteWorkspace,
  dbGetGlobalActivityFeed,
} from "@/lib/db";

function isAuthorized(req: NextRequest): boolean {
  const session = req.cookies.get("femi_admin_session");
  return session?.value === "authenticated_session_token";
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [workspaces, pricing, activityFeed] = await Promise.all([
      dbGetAllWorkspacesWithStats(),
      dbGetPlatformPricing(),
      dbGetGlobalActivityFeed(40),
    ]);

    const totalWorkspaces = workspaces.length;
    const activePaid = workspaces.filter((w) => w.subscription_status === "active").length;
    const activeTrials = workspaces.filter((w) => w.subscription_status === "trial").length;
    const totalLeads = workspaces.reduce((sum, w) => sum + (w.lead_count || 0), 0);
    const totalCalls = workspaces.reduce((sum, w) => sum + (w.call_count || 0), 0);

    // Revenue calculation
    let mrrEstimate = 0;
    for (const w of workspaces) {
      if (w.subscription_status === "active") {
        if (w.plan === "enterprise") mrrEstimate += pricing.enterprise_price;
        else if (w.plan === "pro") mrrEstimate += pricing.pro_price;
        else if (w.plan === "starter") mrrEstimate += pricing.starter_price;
      }
    }

    return NextResponse.json({
      success: true,
      workspaces,
      pricing,
      stats: {
        totalWorkspaces,
        activePaid,
        activeTrials,
        totalLeads,
        totalCalls,
        mrrEstimate,
      },
      activityFeed,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to load master dashboard data" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // 1. Manually grant or update plan
    if (action === "update_plan") {
      const { workspace_id, plan, subscription_status, extend_trial_days } = body;
      if (!workspace_id) {
        return NextResponse.json({ error: "workspace_id required" }, { status: 400 });
      }

      let trial_ends_at = undefined;
      if (extend_trial_days) {
        const days = Number(extend_trial_days) || 7;
        const d = new Date();
        d.setDate(d.getDate() + days);
        trial_ends_at = d.toISOString();
      }

      const updated = await dbUpdateWorkspacePlan(workspace_id, {
        plan,
        subscription_status,
        trial_ends_at,
      });

      return NextResponse.json({ success: true, workspace: updated });
    }

    // 2. Control package pricing
    if (action === "update_pricing") {
      const { starter_price, pro_price, enterprise_price, trial_days } = body;
      const updatedPricing = await dbUpdatePlatformPricing({
        starter_price: starter_price !== undefined ? Number(starter_price) : undefined,
        pro_price: pro_price !== undefined ? Number(pro_price) : undefined,
        enterprise_price: enterprise_price !== undefined ? Number(enterprise_price) : undefined,
        trial_days: trial_days !== undefined ? Number(trial_days) : undefined,
      });

      return NextResponse.json({ success: true, pricing: updatedPricing });
    }

    // 3. Delete workspace
    if (action === "delete_workspace") {
      const { workspace_id } = body;
      if (!workspace_id) {
        return NextResponse.json({ error: "workspace_id required" }, { status: 400 });
      }
      await dbDeleteWorkspace(workspace_id);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to process master admin action" },
      { status: 500 }
    );
  }
}
