import { NextRequest, NextResponse } from "next/server";
import {
  sql,
  dbGetWorkspaceBySlug,
  dbGetWorkspaceSettings,
  dbUpsertWorkspaceSettings,
  dbGetWorkspaceRules,
  dbGetWorkspaceLeads,
  dbGetWorkspaceCallLogs,
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

    const [settings, rules, leads, callLogs, statuses] = await Promise.all([
      dbGetWorkspaceSettings(ws.id),
      dbGetWorkspaceRules(ws.id),
      dbGetWorkspaceLeads(ws.id),
      dbGetWorkspaceCallLogs(ws.id),
      sql ? sql`SELECT * FROM workspace_statuses WHERE workspace_id = ${ws.id} ORDER BY created_at DESC LIMIT 30` : [],
    ]);

    return NextResponse.json({
      workspace: ws,
      settings: settings || {
        workspace_id: ws.id,
        business_bio: "",
        catalog_summary: "",
        voice_greeting: "",
        whatsapp_welcome: "",
        fallback_action: "ai_reply",
      },
      rules: rules || [],
      leads: leads || [],
      callLogs: callLogs || [],
      statuses: statuses || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to load workspace data" },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
    const {
      business_bio,
      catalog_summary,
      voice_greeting,
      whatsapp_welcome,
      fallback_action,
    } = body;

    const updated = await dbUpsertWorkspaceSettings(ws.id, {
      business_bio,
      catalog_summary,
      voice_greeting,
      whatsapp_welcome,
      fallback_action,
    });

    return NextResponse.json({ success: true, settings: updated });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update workspace settings" },
      { status: 500 }
    );
  }
}
