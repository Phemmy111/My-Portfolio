import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { dbGetWorkspaceById, dbGetWorkspaceBySlug, sql } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { sendWhatsAppMessage } from "@/lib/whatsapp-gateway";

const FEMI_PHONE = "2348120934828";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const paystackSecret =
      (await getSetting("PAYSTACK_SECRET_KEY")) || process.env.PAYSTACK_SECRET_KEY;

    // Verify signature if secret key is configured
    if (paystackSecret) {
      const signature = req.headers.get("x-paystack-signature");
      const hash = crypto
        .createHmac("sha512", paystackSecret)
        .update(rawBody)
        .digest("hex");

      if (signature !== hash) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;
    const data = payload.data;

    if (event === "charge.success") {
      const metadata = data.metadata || {};
      const workspaceId = metadata.workspace_id;
      const workspaceSlug = metadata.workspace_slug;
      const plan = metadata.plan || "pro";

      let ws = null;
      if (workspaceId) {
        ws = await dbGetWorkspaceById(workspaceId);
      } else if (workspaceSlug) {
        ws = await dbGetWorkspaceBySlug(workspaceSlug);
      }

      if (ws) {
        await sql`
          UPDATE workspaces
          SET plan = ${plan},
              subscription_status = 'active',
              updated_at = NOW()
          WHERE id = ${ws.id}
        `;

        // Send confirmation alert to owner and Femi
        const alertMsg = `🎉 *Obey Business Subscription Activated!*\n\n• *Business:* ${ws.name}\n• *Plan:* ${plan.toUpperCase()}\n• *Amount:* ₦${(data.amount / 100).toLocaleString()}\n• *Reference:* ${data.reference}\n\nYour workspace has been upgraded with unlimited leads and premium features!`;

        if (ws.owner_phone) {
          await sendWhatsAppMessage(alertMsg, ws.owner_phone);
        }
        if (ws.owner_phone !== FEMI_PHONE) {
          await sendWhatsAppMessage(
            `💰 *New Subscription Received!*\n\n• Business: ${ws.name} (+${ws.owner_phone})\n• Plan: ${plan.toUpperCase()}\n• Amount: ₦${(data.amount / 100).toLocaleString()}`,
            FEMI_PHONE
          );
        }
      }
    }

    return NextResponse.json({ status: "success" });
  } catch (error: any) {
    console.error("[Paystack Webhook] Error:", error);
    return NextResponse.json(
      { error: error.message || "Webhook handling failed" },
      { status: 500 }
    );
  }
}
