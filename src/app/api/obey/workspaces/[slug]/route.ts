import { NextRequest, NextResponse } from "next/server";
import {
  sql,
  dbGetWorkspaceBySlug,
  dbGetWorkspaceSettings,
  dbUpsertWorkspaceSettings,
  dbGetWorkspaceRules,
  dbGetWorkspaceLeads,
  dbGetWorkspaceCallLogs,
  dbUpdateWorkspaceProfile,
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
        voice_id: "nigerian_male",
        voice_personality: "professional",
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
      owner_name,
      owner_phone,
      name,
      business_bio,
      catalog_summary,
      voice_greeting,
      whatsapp_welcome,
      fallback_action,
      voice_id,
      voice_personality,
    } = body;

    let updatedWorkspace = ws;
    if (owner_name !== undefined || owner_phone !== undefined || name !== undefined) {
      const refreshed = await dbUpdateWorkspaceProfile(ws.id, {
        owner_name,
        owner_phone,
        name,
      });
      if (refreshed) {
        updatedWorkspace = refreshed;
      }
    }

    const updatedSettings = await dbUpsertWorkspaceSettings(ws.id, {
      business_bio,
      catalog_summary,
      voice_greeting,
      whatsapp_welcome,
      fallback_action,
      voice_id,
      voice_personality,
    });

    return NextResponse.json({
      success: true,
      workspace: updatedWorkspace,
      settings: updatedSettings,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update workspace settings" },
      { status: 500 }
    );
  }
}
