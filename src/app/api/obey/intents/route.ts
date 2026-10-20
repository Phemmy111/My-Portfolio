import { NextRequest, NextResponse } from "next/server";
import {
  dbGetMissedIntents,
  dbResolveMissedIntent,
  dbRecordMissedIntent,
  dbGetWorkspaceRules,
  dbUpsertWorkspaceLead,
  getSql,
} from "@/lib/db";
import { sendWhatsAppMessage } from "@/lib/whatsapp-gateway";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId") || undefined;
    const status = searchParams.get("status") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const intents = await dbGetMissedIntents({
      workspace_id: workspaceId,
      status,
      limit,
    });

    return NextResponse.json({ ok: true, intents });
  } catch (err: any) {
    console.error("[API Intents GET] error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, id, workspaceId, trainedAnswer, keywords, replyCustomer, recipientPhone, instanceName } = body;

    if (action === "dismiss") {
      if (!id) return NextResponse.json({ ok: false, error: "Missing intent ID" }, { status: 400 });
      await dbResolveMissedIntent({ id, status: "dismissed" });
      return NextResponse.json({ ok: true, message: "Intent dismissed" });
    }

    if (action === "train") {
      if (!id || !trainedAnswer) {
        return NextResponse.json({ ok: false, error: "Missing intent ID or trained answer" }, { status: 400 });
      }

      const sql = getSql();
      const wsId = workspaceId || "ws_femi_default";

      // 1. If keywords are provided, create an automated Workspace Rule
      if (keywords && Array.isArray(keywords) && keywords.length > 0 && sql) {
        const ruleId = `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        try {
          await sql`
            INSERT INTO workspace_rules (
              id, workspace_id, trigger_keywords, response_text, action, is_active, created_at, updated_at
            )
            VALUES (
              ${ruleId}, ${wsId}, ${keywords}, ${trainedAnswer.trim()}, 'custom_response', true, NOW(), NOW()
            );
          `;
        } catch (ruleErr) {
          console.warn("[Train Rule Error]:", ruleErr);
        }
      }

      // 2. Mark Missed Intent as 'trained'
      await dbResolveMissedIntent({
        id,
        status: "trained",
        resolution_notes: trainedAnswer.trim(),
      });

      // 3. Optional: Send trained answer directly to customer on WhatsApp
      let customerReplied = false;
      if (replyCustomer && recipientPhone) {
        const sendInst = instanceName || (wsId === "ws_1792134967173_6ii61" ? "obey-autolearn-spot" : "obey");
        const waRes = await sendWhatsAppMessage(
          `Hello! Regarding your earlier question: \n\n${trainedAnswer.trim()}\n\nLet us know if you need any further assistance! 🙏`,
          recipientPhone,
          sendInst
        );
        customerReplied = waRes.success;
      }

      return NextResponse.json({
        ok: true,
        message: "Successfully trained Obey with new answer!",
        customerReplied,
      });
    }

    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("[API Intents POST] error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
