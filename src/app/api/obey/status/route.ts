import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendWhatsAppStatusPost, setEvolutionInstanceSettings } from "@/lib/whatsapp-gateway";
import { getSetting, setSetting } from "@/lib/settings";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    const workspaceId = searchParams.get("workspace_id");

    if (!sql) {
      return NextResponse.json({ statuses: [] });
    }

    let targetWorkspaceId = workspaceId;
    let ws: any = null;

    if (!targetWorkspaceId && slug) {
      const wsRows = await sql`
        SELECT * FROM workspaces WHERE LOWER(slug) = ${slug.toLowerCase().trim()} LIMIT 1
      `;
      if (wsRows && wsRows.length > 0) {
        ws = wsRows[0];
        targetWorkspaceId = ws.id;
      }
    } else if (targetWorkspaceId) {
      const wsRows = await sql`
        SELECT * FROM workspaces WHERE id = ${targetWorkspaceId} LIMIT 1
      `;
      if (wsRows && wsRows.length > 0) {
        ws = wsRows[0];
      }
    }

    // Default settings for Main Obey or Workspace
    let engagementActive = false;
    let comment_tone = "friendly";
    let comment_rate_limit = "unlimited";
    let auto_status_enabled = false;
    let auto_status_interval = 24;

    if (ws) {
      engagementActive = Boolean(ws.auto_comment_status && ws.auto_view_status !== false);
      comment_tone = ws.comment_tone || "friendly";
      const plan = (ws.plan || "starter").toLowerCase();
      comment_rate_limit = ws.comment_rate_limit || (plan === "enterprise" || plan === "founder" || plan === "lifetime" ? "unlimited" : plan === "pro" ? "8h" : "24h");
      auto_status_enabled = Boolean(ws.auto_status_enabled);
      auto_status_interval = ws.auto_status_interval || 24;
    } else {
      const v = await getSetting("AUTO_VIEW_STATUS_ENABLED");
      const c = await getSetting("AUTO_COMMENT_STATUS_ENABLED");
      const r = await getSetting("STATUS_COMMENT_RATE_LIMIT");
      engagementActive = v === "true" && c === "true";
      comment_rate_limit = r || "unlimited";
    }

    const auto_view_status = engagementActive;
    const auto_comment_status = engagementActive;

    if (!targetWorkspaceId) {
      return NextResponse.json({
        statuses: [],
        auto_view_status,
        auto_comment_status,
        comment_tone,
        comment_rate_limit,
        auto_status_enabled,
        auto_status_interval,
      });
    }

    const statuses = await sql`
      SELECT * FROM workspace_statuses
      WHERE workspace_id = ${targetWorkspaceId}
      ORDER BY created_at DESC
      LIMIT 50
    `;

    return NextResponse.json({
      statuses: statuses || [],
      auto_view_status,
      auto_comment_status,
      comment_tone,
      comment_rate_limit,
      auto_status_enabled,
      auto_status_interval,
    });
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
      auto_view_status,
      auto_comment_status,
      comment_tone,
      comment_rate_limit,
    } = body;

    if (!sql) {
      return NextResponse.json({ error: "Database not connected" }, { status: 500 });
    }

    // Unified single feature: auto_view and auto_comment are combined
    const unifiedEngagement =
      auto_comment_status !== undefined
        ? Boolean(auto_comment_status)
        : auto_view_status !== undefined
        ? Boolean(auto_view_status)
        : undefined;

    // Check if this is Main Obey settings toggle
    const isMainObey =
      slug === "femi" ||
      slug === "femi-adeleke" ||
      workspace_id === "femi" ||
      workspace_id === "ws_femi_default" ||
      (!slug && !workspace_id);

    if (isMainObey) {
      if (unifiedEngagement !== undefined) {
        await setSetting("AUTO_VIEW_STATUS_ENABLED", String(unifiedEngagement));
        await setSetting("AUTO_COMMENT_STATUS_ENABLED", String(unifiedEngagement));
        await setEvolutionInstanceSettings("obey", { readStatus: unifiedEngagement });
      }
      if (comment_tone) {
        await setSetting("COMMENT_TONE", String(comment_tone));
      }
      if (comment_rate_limit !== undefined) {
        await setSetting("STATUS_COMMENT_RATE_LIMIT", String(comment_rate_limit));
      }

      // Also sync ws_femi_default in workspaces table
      try {
        await sql`
          UPDATE workspaces
          SET auto_view_status = COALESCE(${unifiedEngagement}, auto_view_status),
              auto_comment_status = COALESCE(${unifiedEngagement}, auto_comment_status),
              comment_tone = COALESCE(${comment_tone}, comment_tone),
              comment_rate_limit = COALESCE(${comment_rate_limit}, comment_rate_limit),
              updated_at = NOW()
          WHERE id = 'ws_femi_default' OR LOWER(slug) IN ('femi', 'femi-adeleke')
        `;
      } catch (e) {
        console.warn("[Status API] ws_femi_default update error:", e);
      }
    }

    // Lookup workspace
    let ws: any = null;
    if (workspace_id && workspace_id !== "femi" && workspace_id !== "ws_femi_default") {
      const wsRows = await sql`SELECT * FROM workspaces WHERE id = ${workspace_id} LIMIT 1`;
      if (wsRows && wsRows.length > 0) ws = wsRows[0];
    } else if (slug && slug !== "femi" && slug !== "femi-adeleke") {
      const wsRows = await sql`SELECT * FROM workspaces WHERE LOWER(slug) = ${slug.toLowerCase().trim()} LIMIT 1`;
      if (wsRows && wsRows.length > 0) ws = wsRows[0];
    }

    // If updating workspace settings
    if (ws) {
      await sql`
        UPDATE workspaces
        SET auto_status_enabled = COALESCE(${auto_status_enabled}, auto_status_enabled),
            auto_status_interval = COALESCE(${auto_status_interval}, auto_status_interval),
            auto_view_status = COALESCE(${unifiedEngagement}, auto_view_status),
            auto_comment_status = COALESCE(${unifiedEngagement}, auto_comment_status),
            comment_tone = COALESCE(${comment_tone}, comment_tone),
            comment_rate_limit = COALESCE(${comment_rate_limit}, comment_rate_limit),
            updated_at = NOW()
        WHERE id = ${ws.id}
      `;

      if (unifiedEngagement !== undefined) {
        const inst = ws.whatsapp_instance_name || `obey-${ws.slug}`;
        await setEvolutionInstanceSettings(inst, { readStatus: unifiedEngagement });
      }
    }

    if (!ws && !isMainObey) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // If posting a new status update (either text content or media exists)
    const hasText = Boolean(content && content.trim());
    const hasMedia = Boolean(media_url && media_url.trim());

    if (hasText || hasMedia) {
      const instanceName = ws.whatsapp_instance_name || `obey-${ws.slug}`;
      const statusId = `stat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      let postSuccess = false;
      let errorMsg: string | null = null;

      const normalizedMediaType: "image" | "video" | undefined =
        media_type === "video" ? "video" : (media_type === "image" || hasMedia ? "image" : undefined);

      if (auto_post_now) {
        const dispatchRes = await sendWhatsAppStatusPost({
          text: (content || "").trim(),
          mediaUrl: media_url ? media_url.trim() : undefined,
          mediaType: normalizedMediaType,
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
          ${(content || "").trim()},
          ${media_url || null},
          ${media_type || (hasMedia ? "image" : "text")},
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
