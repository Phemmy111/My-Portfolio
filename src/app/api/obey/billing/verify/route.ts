import { NextRequest, NextResponse } from "next/server";
import {
  dbGetWorkspaceById,
  dbGetWorkspaceBySlug,
  dbGetPlatformPricing,
  sql,
} from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { sendWhatsAppMessage } from "@/lib/whatsapp-gateway";

const FEMI_PHONE = "2348120934828";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const reference = searchParams.get("reference")?.trim();

    if (!reference) {
      return NextResponse.json({ error: "Transaction reference is required" }, { status: 400 });
    }

    const paystackSecret =
      (await getSetting("PAYSTACK_SECRET_KEY")) || process.env.PAYSTACK_SECRET_KEY;

    if (!paystackSecret) {
      return NextResponse.json(
        { error: "Paystack secret key is not configured on this platform" },
        { status: 500 }
      );
    }

    // Call Paystack verify endpoint
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
      },
      cache: "no-store",
    });

    const data = await res.json();
    if (!res.ok || !data.status) {
      return NextResponse.json(
        { error: data.message || "Failed to verify transaction with Paystack" },
        { status: 400 }
      );
    }

    const txData = data.data;
    if (txData.status !== "success") {
      return NextResponse.json(
        { error: `Payment status is ${txData.status}`, status: txData.status },
        { status: 400 }
      );
    }

    const metadata = txData.metadata || {};
    const workspaceId = metadata.workspace_id;
    const workspaceSlug = metadata.workspace_slug;

    // Resolve plan from metadata or price amount
    let plan = metadata.plan;
    if (!plan) {
      const amount = txData.amount;
      const pricing = await dbGetPlatformPricing();
      if (amount >= (pricing.enterprise_price || 55000) * 100) {
        plan = "enterprise";
      } else if (amount >= (pricing.pro_price || 22500) * 100) {
        plan = "pro";
      } else {
        plan = "starter";
      }
    }

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

      // Dispatch confirmation messages
      const alertMsg = `🎉 *Obey Business Subscription Activated!*\n\n• *Business:* ${ws.name}\n• *Plan:* ${plan.toUpperCase()}\n• *Amount:* ₦${(txData.amount / 100).toLocaleString()}\n• *Reference:* ${reference}\n\nYour workspace has been upgraded with all premium quotas active!`;

      if (ws.owner_phone) {
        await sendWhatsAppMessage(alertMsg, ws.owner_phone, "obey").catch(() => {});
      }
      if (ws.owner_phone !== FEMI_PHONE) {
        await sendWhatsAppMessage(
          `💰 *New Subscription Received!*\n\n• Business: ${ws.name} (+${ws.owner_phone})\n• Plan: ${plan.toUpperCase()}\n• Amount: ₦${(txData.amount / 100).toLocaleString()}\n• Ref: ${reference}`,
          FEMI_PHONE,
          "obey"
        ).catch(() => {});
      }
    }

    return NextResponse.json({
      success: true,
      verified: true,
      reference,
      plan,
      workspace: ws ? { id: ws.id, name: ws.name, slug: ws.slug, plan } : null,
    });
  } catch (err: any) {
    console.error("[Paystack Verify] Error:", err);
    return NextResponse.json(
      { error: err.message || "Payment verification failed" },
      { status: 500 }
    );
  }
}
