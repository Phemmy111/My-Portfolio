import { NextRequest, NextResponse } from "next/server";
import { executeAgentTask, rejectAgentTask } from "@/lib/obey-agent";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const token = searchParams.get("token");
  const action = searchParams.get("action");

  if (!id || !token || !action) {
    return new Response(
      renderHtml("Invalid Request", "Missing required parameters (id, token, or action).", false),
      { headers: { "Content-Type": "text/html" }, status: 400 }
    );
  }

  let result: { success: boolean; message: string };

  if (action === "approve") {
    result = await executeAgentTask(id, token);
  } else if (action === "reject") {
    result = await rejectAgentTask(id, token);
  } else {
    return new Response(
      renderHtml("Invalid Action", "Action must be either 'approve' or 'reject'.", false),
      { headers: { "Content-Type": "text/html" }, status: 400 }
    );
  }

  return new Response(
    renderHtml(
      action === "approve" ? "Outreach Approved & Dispatched!" : "Outreach Rejected",
      result.message,
      result.success
    ),
    { headers: { "Content-Type": "text/html" } }
  );
}

function renderHtml(title: string, message: string, success: boolean) {
  const accentColor = success ? "#10b981" : "#ef4444";
  const icon = success ? "⚡" : "🛑";

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} — Agent Obey</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          background-color: #09090b;
          color: #f4f4f5;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }
        .card {
          background-color: #121214;
          border: 1px solid #27272a;
          border-radius: 20px;
          padding: 40px;
          max-width: 480px;
          width: 90%;
          text-align: center;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
        }
        .icon {
          font-size: 48px;
          margin-bottom: 16px;
        }
        h1 {
          font-size: 24px;
          font-weight: 800;
          margin: 0 0 12px 0;
          color: #ffffff;
        }
        p {
          font-size: 15px;
          line-height: 1.6;
          color: #a1a1aa;
          margin: 0 0 28px 0;
        }
        .btn {
          display: inline-block;
          background: #ffffff;
          color: #09090b;
          text-decoration: none;
          font-weight: 700;
          padding: 12px 24px;
          border-radius: 10px;
          font-size: 14px;
          transition: all 0.2s;
        }
        .badge {
          display: inline-block;
          background: #27272a;
          color: ${accentColor};
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 4px 10px;
          border-radius: 999px;
          margin-bottom: 16px;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">${icon}</div>
        <div class="badge">Agent Obey · Autonomous Pipeline</div>
        <h1>${title}</h1>
        <p>${message}</p>
        <a href="/admin" class="btn">Open Command Center</a>
      </div>
    </body>
    </html>
  `;
}
