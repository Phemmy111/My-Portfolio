import { NextRequest, NextResponse } from "next/server";
import { getAgentTasks, runAutonomousLeadHunter, executeAgentTask, rejectAgentTask } from "@/lib/obey-agent";

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
    const { action, id, token } = await req.json();

    if (action === "hunt") {
      const created = await runAutonomousLeadHunter();
      return NextResponse.json({ 
        success: true, 
        message: `Agent Obey hunted and created ${created.length} new targeted approval tasks!`,
        tasks: created 
      });
    }

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
