import { NextRequest, NextResponse } from "next/server";
import {
  sql,
  dbGetWorkspaceStatuses,
  dbGetScheduledStatusesCount,
  getPlanScheduledPostLimit,
  dbDeleteStatusPost,
  dbGetStatusExclusions,
  dbAddStatusExclusion,
  dbRemoveStatusExclusion,
} from "@/lib/db";
import {
  sendWhatsAppStatusPost,
  deleteWhatsAppStatusPost,
  setEvolutionInstanceSettings,
} from "@/lib/whatsapp-gateway";
import { getSetting, setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    const workspaceId = searchParams.get("workspace_id");

    if (!sql) {
      return NextResponse.json({ statuses: [], scheduledCount: 0, scheduledLimit: 3 });
    }

    // Passively run due scheduled status check to ensure near real-time posting
    try {
      const { dispatchDueScheduledStatuses } = await import("@/lib/status-scheduler");
      dispatchDueScheduledStatuses().catch(() => {});
    } catch {}

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
      comment_rate_limit =
        ws.comment_rate_limit ||
        (plan === "enterprise" || plan === "founder" || plan === "lifetime"
          ? "unlimited"
          : plan === "pro"
          ? "8h"
          : "24h");
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

    const status_excluded_phones = targetWorkspaceId
      ? await dbGetStatusExclusions(targetWorkspaceId)
      : await dbGetStatusExclusions("ws_femi_default");

    if (!targetWorkspaceId) {
      return NextResponse.json({
        statuses: [],
        scheduledCount: 0,
        scheduledLimit: 3,
        auto_view_status,
        auto_comment_status,
        comment_tone,
        comment_rate_limit,
        auto_status_enabled,
        auto_status_interval,
        status_excluded_phones,
      });
    }

    const statuses = await dbGetWorkspaceStatuses(targetWorkspaceId, 50);
    const scheduledCount = await dbGetScheduledStatusesCount(targetWorkspaceId);
    const scheduledLimit = getPlanScheduledPostLimit(ws?.plan);

    return NextResponse.json({
      statuses: statuses || [],
      scheduledCount,
      scheduledLimit,
      auto_view_status,
      auto_comment_status,
      comment_tone,
      comment_rate_limit,
      auto_status_enabled,
      auto_status_interval,
      auto_lead_closer_enabled: Boolean(ws?.auto_lead_closer_enabled),
      status_excluded_phones,
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
      mode = "post_now", // "post_now" | "schedule"
      scheduled_at,
      scheduled_time_ms,
      background_color = "#075E54",
      text_color = "#FFFFFF",
      font = 0,
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
      const auto_lead_closer_enabled = typeof body.auto_lead_closer_enabled === "boolean" ? body.auto_lead_closer_enabled : null;
      await sql`
        UPDATE workspaces
        SET auto_status_enabled = COALESCE(${auto_status_enabled}, auto_status_enabled),
            auto_status_interval = COALESCE(${auto_status_interval}, auto_status_interval),
            auto_lead_closer_enabled = COALESCE(${auto_lead_closer_enabled}, auto_lead_closer_enabled),
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

    // Handle status comment exclusion actions
    const action = body.action;
    if (action === "add_exclusion") {
      const { phone, name, reason } = body;
      if (!phone) {
        return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
      }
      const targetId = ws ? ws.id : "ws_femi_default";
      const updated = await dbAddStatusExclusion(targetId, phone, name, reason);
      return NextResponse.json({ success: true, status_excluded_phones: updated });
    }

    if (action === "remove_exclusion") {
      const { phone } = body;
      if (!phone) {
        return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
      }
      const targetId = ws ? ws.id : "ws_femi_default";
      const updated = await dbRemoveStatusExclusion(targetId, phone);
      return NextResponse.json({ success: true, status_excluded_phones: updated });
    }

    if (Array.isArray(body.status_excluded_phones) && ws) {
      await sql`
        UPDATE workspaces
        SET status_excluded_phones = ${JSON.stringify(body.status_excluded_phones)}::jsonb,
            updated_at = NOW()
        WHERE id = ${ws.id}
      `;
    }

    // If publishing or scheduling a new status update
    const hasText = Boolean(content && content.trim());
    const hasMedia = Boolean(media_url && media_url.trim());

    if (hasText || hasMedia) {
      const instanceName = ws ? (ws.whatsapp_instance_name || `obey-${ws.slug}`) : "obey";
      const targetWsId = ws ? ws.id : "ws_femi_default";
      const statusId = `stat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      const isScheduled = mode === "schedule";

      // If scheduling, check plan limit and validate schedule time within next 24 hours
      let scheduledIso: string | null = null;
      if (isScheduled) {
        const planLimit = getPlanScheduledPostLimit(ws?.plan);
        const currentCount = await dbGetScheduledStatusesCount(targetWsId);

        if (currentCount >= planLimit) {
          return NextResponse.json(
            {
              error: `You have reached your plan limit of ${planLimit} scheduled post${
                planLimit > 1 ? "s" : ""
              }. Upgrade your plan to schedule more.`,
            },
            { status: 400 }
          );
        }

        if (!scheduled_at) {
          return NextResponse.json(
            { error: "Please select a scheduled time within the next 24 hours." },
            { status: 400 }
          );
        }

        const schedDate =
          typeof scheduled_time_ms === "number" && !isNaN(scheduled_time_ms)
            ? new Date(scheduled_time_ms)
            : new Date(scheduled_at);
        const now = new Date();
        const maxTime = new Date(now.getTime() + 24 * 60 * 60 * 1000 + 5 * 60 * 1000); // 24h + 5m buffer

        if (isNaN(schedDate.getTime())) {
          return NextResponse.json({ error: "Invalid scheduled time format." }, { status: 400 });
        }
        if (schedDate.getTime() <= now.getTime()) {
          return NextResponse.json(
            { error: "Scheduled time must be in the future." },
            { status: 400 }
          );
        }
        if (schedDate.getTime() > maxTime.getTime()) {
          return NextResponse.json(
            { error: "Status posts can only be scheduled within the next 24 hours." },
            { status: 400 }
          );
        }

        scheduledIso = schedDate.toISOString();
      }

      let postSuccess = false;
      let errorMsg: string | null = null;
      let messageId: string | null = null;

      const normalizedMediaType: "image" | "video" | undefined =
        media_type === "video" ? "video" : (media_type === "image" || hasMedia ? "image" : undefined);

      const initialStatus = isScheduled ? "scheduled" : "posted";

      await sql`
        INSERT INTO workspace_statuses (
          id,
          workspace_id,
          content,
          media_url,
          media_type,
          background_color,
          text_color,
          font,
          message_id,
          status,
          error_message,
          scheduled_at,
          posted_at,
          view_count,
          created_at,
          updated_at
        ) VALUES (
          ${statusId},
          ${targetWsId},
          ${(content || "").trim()},
          ${media_url || null},
          ${media_type || (hasMedia ? "image" : "text")},
          ${background_color || "#075E54"},
          ${text_color || "#FFFFFF"},
          ${font || 1},
          NULL,
          ${initialStatus},
          NULL,
          ${scheduledIso},
          ${!isScheduled ? new Date().toISOString() : null},
          0,
          NOW(),
          NOW()
        )
      `;

      // Dispatch to WhatsApp Status asynchronously so client returns in <50ms without 504 timeout
      if (!isScheduled && auto_post_now) {
        sendWhatsAppStatusPost({
          text: (content || "").trim(),
          mediaUrl: media_url ? media_url.trim() : undefined,
          mediaType: normalizedMediaType,
          instanceName,
          backgroundColor: background_color || "#075E54",
          textColor: text_color || "#FFFFFF",
          font: typeof font === "number" ? font : 0,
        })
          .then(async (dispatchRes) => {
            if (dispatchRes.success && dispatchRes.messageId) {
              await sql`
                UPDATE workspace_statuses
                SET message_id = ${dispatchRes.messageId},
                    status = 'posted',
                    posted_at = NOW(),
                    updated_at = NOW()
                WHERE id = ${statusId}
              `;
            } else if (!dispatchRes.success) {
              await sql`
                UPDATE workspace_statuses
                SET error_message = ${dispatchRes.error || "Evolution broadcast error"},
                    updated_at = NOW()
                WHERE id = ${statusId}
              `;
            }
          })
          .catch((err) => {
            console.error("[Status Broadcast Background] Error:", err);
          });
      }

      const createdStatusObj = {
        id: statusId,
        workspace_id: targetWsId,
        content: (content || "").trim(),
        media_url: media_url || null,
        media_type: media_type || (hasMedia ? "image" : "text"),
        background_color: background_color || "#075E54",
        text_color: text_color || "#FFFFFF",
        font: typeof font === "number" ? font : 0,
        message_id: null,
        status: initialStatus,
        error_message: null,
        scheduled_at: scheduledIso,
        posted_at: !isScheduled ? new Date().toISOString() : null,
        view_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      return NextResponse.json({
        success: true,
        statusId,
        newStatus: createdStatusObj,
        message: isScheduled
          ? `Status scheduled for ${new Date(scheduledIso!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}!`
          : "Status successfully published to WhatsApp Broadcast & synced to My Status!",
      });
    }

    return NextResponse.json({ success: true, message: "Settings updated" });
  } catch (err: any) {
    console.error("[Status API] POST error:", err);
    return NextResponse.json({ error: err.message || "Failed to process status" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const statusId = searchParams.get("id");
    const workspaceId = searchParams.get("workspace_id");
    const slug = searchParams.get("slug");

    if (!sql) {
      return NextResponse.json({ error: "Database not connected" }, { status: 500 });
    }

    if (!statusId) {
      return NextResponse.json({ error: "Missing status ID" }, { status: 400 });
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
      const wsRows = await sql`SELECT * FROM workspaces WHERE id = ${targetWorkspaceId} LIMIT 1`;
      if (wsRows && wsRows.length > 0) ws = wsRows[0];
    }

    // Find the status record
    const statusRows = await sql`
      SELECT * FROM workspace_statuses WHERE id = ${statusId} LIMIT 1
    `;

    if (!statusRows || statusRows.length === 0) {
      return NextResponse.json({ error: "Status record not found" }, { status: 404 });
    }

    const statusRow = statusRows[0];

    // Determine the exact instance name from the status record's workspace
    let statusWs: any = null;
    if (statusRow.workspace_id) {
      const wsRows = await sql`SELECT * FROM workspaces WHERE id = ${statusRow.workspace_id} LIMIT 1`;
      if (wsRows && wsRows.length > 0) statusWs = wsRows[0];
    }
    const instanceName = statusWs
      ? (statusWs.whatsapp_instance_name || (statusWs.slug ? `obey-${statusWs.slug}` : "obey"))
      : (ws ? (ws.whatsapp_instance_name || `obey-${ws.slug}`) : "obey");

    const messageIdsToRevoke = new Set<string>();
    if (statusRow.message_id) {
      messageIdsToRevoke.add(statusRow.message_id);
    }

    // Also search evolution."Message" for any duplicate or unindexed broadcast messages matching this content
    if (sql) {
      try {
        const snippet = (statusRow.content || "").slice(0, 30).trim();
        if (snippet) {
          const evoMsgRows = await sql`
            SELECT key->>'id' as key_id 
            FROM evolution."Message"
            WHERE "instanceId" = (SELECT id FROM evolution."Instance" WHERE name = ${instanceName} LIMIT 1)
              AND key->>'fromMe' = 'true'
              AND key->>'remoteJid' = 'status@broadcast'
              AND (
                message->>'conversation' ILIKE ${'%' + snippet + '%'}
                OR message::text ILIKE ${'%' + snippet + '%'}
              )
            ORDER BY "messageTimestamp" DESC
            LIMIT 5
          `;
          if (evoMsgRows && evoMsgRows.length > 0) {
            for (const r of evoMsgRows) {
              if (r.key_id) messageIdsToRevoke.add(r.key_id);
            }
          }
        }
      } catch (findErr) {
        console.warn("[Status API] Error looking up message keys in evolution.Message:", findErr);
      }
    }

    // Call WhatsApp remote delete for all identified message IDs
    let revokedCount = 0;
    if (statusRow.status === "posted" || messageIdsToRevoke.size > 0) {
      for (const msgId of messageIdsToRevoke) {
        try {
          const delRes = await deleteWhatsAppStatusPost({
            instanceName,
            messageId: msgId,
          });
          if (delRes.success) {
            revokedCount++;
          } else {
            console.warn(`[Status API] WhatsApp remote delete warning for ${msgId}:`, delRes.error);
          }
        } catch (delErr) {
          console.warn(`[Status API] WhatsApp remote delete exception for ${msgId}:`, delErr);
        }
      }
    }


    // Update in database to 'deleted'
    await dbDeleteStatusPost(statusId, targetWorkspaceId || "all");

    return NextResponse.json({
      success: true,
      message: messageIdsToRevoke.size > 0
        ? "Status successfully deleted from WhatsApp and Control Room."
        : "Status removed from Control Room. (Note: Posted prior to message key tracking, manual removal on phone may be required).",
    });
  } catch (err: any) {
    console.error("[Status API] DELETE error:", err);
    return NextResponse.json({ error: err.message || "Failed to delete status" }, { status: 500 });
  }
}
