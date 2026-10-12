import { NextRequest, NextResponse } from "next/server";
import { getAgentTasks, executeAgentTask, rejectAgentTask } from "@/lib/obey-agent";
import { runUpworkLiveScout } from "@/lib/upwork-scout";
import { runB2BLeadHunter } from "@/lib/apollo-hunter";

export async function GET() {
  try {
    const tasks = await getAgentTasks();
    return NextResponse.json({ tasks });
  } catch (err: any) {
    console.error("Obey tasks GET error:", err);
    return NextResponse.json({ error: err.message, tasks: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action, id, token, industry } = await req.json();

    // 1. Live Upwork Job Scout
    if (action === "hunt_upwork") {
      const result = await runUpworkLiveScout();
      return NextResponse.json(result);
    }

    // 2. Real B2B / Apollo Lead Hunter
    if (action === "hunt_b2b") {
      const result = await runB2BLeadHunter({ industry });
      return NextResponse.json(result);
    }

    // 3. Combined Dual-Stream Scan
    if (action === "hunt" || action === "hunt_all") {
      const [b2bResult, upworkResult] = await Promise.all([
        runB2BLeadHunter({ industry }),
        runUpworkLiveScout(),
      ]);

      const allTasks = [...(b2bResult.tasks || []), ...(upworkResult.tasks || [])];

      return NextResponse.json({
        success: true,
        message: `Obey captured ${allTasks.length} real opportunities across Upwork Live & B2B Decision Makers!`,
        tasks: allTasks,
      });
    }

    // Task Execution (HITL)
    if (action === "approve" && id && token) {
      const res = await executeAgentTask(id, token);
      return NextResponse.json(res);
    }

    if (action === "reject" && id && token) {
      const res = await rejectAgentTask(id, token);
      return NextResponse.json(res);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("Obey tasks POST error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
