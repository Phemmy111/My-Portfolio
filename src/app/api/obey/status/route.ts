import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendWhatsAppStatusPost } from "@/lib/whatsapp-gateway";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    const workspaceId = searchParams.get("workspace_id");

    if (!sql) {
      return NextResponse.json({ statuses: [] });
    }

    let targetWorkspaceId = workspaceId;

    if (!targetWorkspaceId && slug) {
      const wsRows = await sql`
        SELECT id FROM workspaces WHERE LOWER(slug) = ${slug.toLowerCase().trim()} LIMIT 1
      `;
      if (wsRows && wsRows.length > 0) {
        targetWorkspaceId = wsRows[0].id;
      }
    }

    if (!targetWorkspaceId) {
      return NextResponse.json({ error: "workspace_id or slug is required" }, { status: 400 });
    }

    const statuses = await sql`
      SELECT * FROM workspace_statuses
      WHERE workspace_id = ${targetWorkspaceId}
      ORDER BY created_at DESC
      LIMIT 50
    `;

    return NextResponse.json({ statuses: statuses || [] });
  } catch (err: any) {
    console.error("[Status API] GET error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch statuses" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      workspace_id,
      slug,
      content,
      media_url,
      media_type = "text",
      auto_post_now = true,
      auto_status_enabled,
      auto_status_interval,
    } = body;

    if (!sql) {
      return NextResponse.json({ error: "Database not connected" }, { status: 500 });
    }

    // Lookup workspace
    let ws = null;
    if (workspace_id) {
      const wsRows = await sql`SELECT * FROM workspaces WHERE id = ${workspace_id} LIMIT 1`;
      if (wsRows && wsRows.length > 0) ws = wsRows[0];
    } else if (slug) {
      const wsRows = await sql`SELECT * FROM workspaces WHERE LOWER(slug) = ${slug.toLowerCase().trim()} LIMIT 1`;
      if (wsRows && wsRows.length > 0) ws = wsRows[0];
    }

    if (!ws) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // If updating automation schedule settings
    if (auto_status_enabled !== undefined || auto_status_interval !== undefined) {
      await sql`
        UPDATE workspaces
        SET auto_status_enabled = COALESCE(${auto_status_enabled}, auto_status_enabled),
            auto_status_interval = COALESCE(${auto_status_interval}, auto_status_interval),
            updated_at = NOW()
        WHERE id = ${ws.id}
      `;
    }

    // If posting a new status update
    if (content && content.trim()) {
      const instanceName = ws.whatsapp_instance_name || `obey-${ws.slug}`;
      const statusId = `stat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      let postSuccess = false;
      let errorMsg: string | null = null;

      if (auto_post_now) {
        const dispatchRes = await sendWhatsAppStatusPost({
          text: content.trim(),
          mediaUrl: media_url || undefined,
          mediaType: media_type === "image" ? "image" : undefined,
          instanceName,
        });

        postSuccess = dispatchRes.success;
        if (!dispatchRes.success) {
          errorMsg = dispatchRes.error || "Evolution API broadcast failed";
        }
      }

      await sql`
        INSERT INTO workspace_statuses (
          id, workspace_id, content, media_url, media_type, status, error_message, posted_at
        ) VALUES (
          ${statusId},
          ${ws.id},
          ${content.trim()},
          ${media_url || null},
          ${media_type},
          ${postSuccess ? "posted" : auto_post_now ? "failed" : "scheduled"},
          ${errorMsg},
          ${postSuccess ? new Date().toISOString() : null}
        )
      `;

      return NextResponse.json({
        success: postSuccess,
        statusId,
        message: postSuccess
          ? "Status successfully published to WhatsApp Broadcast!"
          : errorMsg || "Status saved",
      });
    }

    return NextResponse.json({ success: true, message: "Settings updated" });
  } catch (err: any) {
    console.error("[Status API] POST error:", err);
    return NextResponse.json({ error: err.message || "Failed to process status" }, { status: 500 });
  }
}
