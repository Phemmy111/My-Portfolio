import { NextRequest, NextResponse } from "next/server";
import { dbGetWorkspaceBySlug, dbGetPlatformPricing } from "@/lib/db";
import { getSetting } from "@/lib/settings";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, plan = "starter" } = body;

    if (!slug) {
      return NextResponse.json({ error: "Workspace slug is required" }, { status: 400 });
    }

    const ws = await dbGetWorkspaceBySlug(slug);
    if (!ws) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const paystackSecret =
      (await getSetting("PAYSTACK_SECRET_KEY")) || process.env.PAYSTACK_SECRET_KEY;

    const pricing = await dbGetPlatformPricing();
    const priceMap: Record<string, number> = {
      starter: (pricing.starter_price || 9500) * 100,
      pro: (pricing.pro_price || 22500) * 100,
      enterprise: (pricing.enterprise_price || 55000) * 100,
    };

    const amountInKobo = priceMap[plan.toLowerCase()] || 950000;
    const origin = req.headers.get("origin") || "https://femiadelekeportfolio.vercel.app";

    if (!paystackSecret) {
      // Graceful fallback: return direct WhatsApp checkout confirmation link
      const fallbackUrl = `https://wa.me/2348120934828?text=${encodeURIComponent(
        `Hello Femi! I want to activate the ${plan.toUpperCase()} plan for my business workspace: ${ws.name} (Slug: ${ws.slug}).`
      )}`;
      return NextResponse.json({
        success: true,
        authorization_url: fallbackUrl,
        mode: "direct_activation",
      });
    }

    // Call Paystack API to initialize transaction
    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: ws.owner_email || "billing@obey.ai",
        amount: amountInKobo,
        metadata: {
          workspace_id: ws.id,
          workspace_slug: ws.slug,
          plan,
        },
        callback_url: `${origin}/control-room?biz=${ws.slug}&paid=true`,
      }),
    });

    const data = await paystackRes.json();
    if (data.status && data.data?.authorization_url) {
      return NextResponse.json({
        success: true,
        authorization_url: data.data.authorization_url,
        reference: data.data.reference,
      });
    }

    throw new Error(data.message || "Failed to initialize Paystack transaction");
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Payment initialization failed" },
      { status: 500 }
    );
  }
}
