import { NextRequest, NextResponse } from "next/server";
import { dbListWorkspaces, dbUpdateWorkspaceWhatsAppStatus } from "@/lib/db";

export const maxDuration = 45;
export const dynamic = "force-dynamic";

/**
 * 24/7 Keep-Alive & Auto-Reconnect Daemon for Evolution API (Render Free Web Service)
 * Prevents Render from sleeping and auto-heals Baileys socket disconnections for:
 * 1. Main Obey instance ('obey')
 * 2. ALL Business client workspaces (e.g. 'obey-autolearn-spot', 'obey-moonvibez', etc.)
 */
export async function GET(req: NextRequest) {
  const evoUrl = process.env.EVOLUTION_API_URL || "https://evolution-api-latest-cx3y.onrender.com";
  const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
  const mainInstance = process.env.EVOLUTION_INSTANCE_NAME || "obey";

  try {
    // 1. Fetch live instances from Evolution API
    let instRes = await fetch(`${evoUrl}/instance/fetchInstances`, {
      headers: { apikey: evoKey },
      cache: "no-store",
    });

    if (!instRes.ok) {
      // Wake up Render if asleep
      try {
        await fetch(`${evoUrl}/instance/connect/${mainInstance}`, {
          headers: { apikey: evoKey },
        });
      } catch {}
      return NextResponse.json({
        success: false,
        connected: false,
        error: `Evolution API returned HTTP ${instRes.status}. Triggered wake-up request.`,
      });
    }

    const liveInstances: any[] = (await instRes.json()) || [];
    const liveMap = new Map<string, any>(
      Array.isArray(liveInstances) ? liveInstances.map((i: any) => [i.name?.toLowerCase(), i]) : []
    );

    // 2. Fetch all registered business workspaces from DB
    const allWorkspaces = await dbListWorkspaces();
    const instancesToMonitor = new Map<string, { workspaceId?: string; slug?: string }>();

    // Always include Main Obey
    instancesToMonitor.set(mainInstance.toLowerCase(), {});

    // Include every registered workspace
    for (const ws of allWorkspaces) {
      const instName = (ws.whatsapp_instance_name || `obey-${ws.slug}`).toLowerCase().trim();
      instancesToMonitor.set(instName, { workspaceId: ws.id, slug: ws.slug });
    }

    const report: Array<{
      instance: string;
      slug?: string;
      status: string;
      connected: boolean;
      reconnected: boolean;
    }> = [];

    // 3. Keep alive and auto-heal every instance
    for (const [instName, meta] of instancesToMonitor.entries()) {
      const live = liveMap.get(instName);
      const isConnected = Boolean(
        live &&
        live.connectionStatus === "open" &&
        !live.disconnectionReasonCode
      );

      let reconnected = false;
      if (!isConnected) {
        console.log(`[WA Keepalive] Instance '${instName}' status: ${live?.connectionStatus || 'offline'}. Reconnecting...`);
        try {
          const connRes = await fetch(`${evoUrl}/instance/connect/${instName}`, {
            headers: { apikey: evoKey },
          });
          reconnected = connRes.ok;
        } catch (connErr) {
          console.warn(`[WA Keepalive] Reconnect error for '${instName}':`, connErr);
        }
      }

      // Sync status to workspace in Neon DB
      if (meta.workspaceId) {
        try {
          await dbUpdateWorkspaceWhatsAppStatus(
            meta.workspaceId,
            instName,
            isConnected ? "connected" : "connecting"
          );
        } catch {}
      }

      report.push({
        instance: instName,
        slug: meta.slug,
        status: isConnected ? "open" : live?.connectionStatus || "disconnected",
        connected: isConnected,
        reconnected,
      });
    }

    // 4. Automatically check & dispatch any due scheduled WhatsApp status stories
    let scheduledReport = null;
    try {
      const { dispatchDueScheduledStatuses } = await import("@/lib/status-scheduler");
      scheduledReport = await dispatchDueScheduledStatuses();
    } catch (schedErr) {
      console.warn("[WA Keepalive] Scheduled status dispatcher warning:", schedErr);
    }

    // 5. Automatically check & dispatch any due scheduled reminders & research tasks
    let scheduledTasksReport = null;
    try {
      const { dispatchDueScheduledTasks } = await import("@/lib/scheduled-task-engine");
      scheduledTasksReport = await dispatchDueScheduledTasks();
    } catch (taskErr) {
      console.warn("[WA Keepalive] Scheduled tasks dispatcher warning:", taskErr);
    }

    // 6. Ghost Hunter: Check active real-time web & social watcher jobs
    let webWatchersReport = 0;
    try {
      const { runActiveWebWatchers } = await import("@/lib/web-watcher");
      webWatchersReport = await runActiveWebWatchers();
    } catch (watchErr) {
      console.warn("[WA Keepalive] Web watcher error:", watchErr);
    }

    // 7. Autonomous Lead Closer (Disabled to prevent bulk messages)
    let leadCloserReport = null;
    /*
    try {
      const { runAutonomousLeadCloser } = await import("@/lib/lead-closer");
      leadCloserReport = await runAutonomousLeadCloser();
    } catch (closerErr) {
      console.warn("[WA Keepalive] Lead closer error:", closerErr);
    }
    */

    // 8. Morning Executive Briefing (fires at 7:30 AM WAT daily)
    let morningBriefingReport = null;
    try {
      const { dispatchMorningExecutiveBriefing } = await import("@/lib/morning-briefing");
      morningBriefingReport = await dispatchMorningExecutiveBriefing();
    } catch (briefErr) {
      console.warn("[WA Keepalive] Morning briefing error:", briefErr);
    }

    return NextResponse.json({
      success: true,
      instancesChecked: report.length,
      report,
      scheduledStatusDispatched: scheduledReport,
      scheduledTasksDispatched: scheduledTasksReport,
      webWatchersTriggered: webWatchersReport,
      leadCloserResult: leadCloserReport,
      morningBriefingResult: morningBriefingReport,
      timestamp: new Date().toISOString(),
    });

  } catch (err: any) {
    console.error("[WA Keepalive] Global error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
