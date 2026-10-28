import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getAuthSession } from "@/lib/auth-session";
import {
  dbListWorkspaces,
  dbCreateWorkspace,
  dbGetWorkspaceBySlug,
  dbGetWorkspaceByOwnerPhone,
  dbGetWorkspacesByOwnerClerkId,
  dbClaimWorkspaceForClerkUser,
  dbCreateWorkspaceRule,
} from "@/lib/db";
import { createEvolutionInstance, sendWhatsAppMessage } from "@/lib/whatsapp-gateway";
import { sendNewRegistrationAlertEmail } from "@/lib/email";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    const phone = searchParams.get("phone");
    const { userId } = await auth();
    const obeySession = await getAuthSession();

    const isFemiCaller = (email?: string, phone?: string) => {
      const sessPhone = (phone || obeySession?.phone || "").replace(/\D/g, "");
      const sessEmail = (email || obeySession?.email || "").toLowerCase().trim();
      return (
        sessPhone === "2348120934828" ||
        sessPhone.endsWith("8120934828") ||
        sessEmail === "femiadeleke2020@gmail.com" ||
        sessEmail === "femiadeleke.work@gmail.com"
      );
    };

    if (slug) {
      const cleanSlug = slug.toLowerCase().trim();
      let clerkEmail: string | undefined;
      let clerkPhone: string | undefined;

      if (userId) {
        const user = await currentUser();
        clerkEmail = user?.emailAddresses?.[0]?.emailAddress;
        clerkPhone = user?.phoneNumbers?.[0]?.phoneNumber?.replace(/[^0-9]/g, "");
        if (cleanSlug !== "femi-adeleke" || isFemiCaller(clerkEmail, clerkPhone)) {
          await dbClaimWorkspaceForClerkUser(slug, userId, clerkEmail);
        }
      }

      // STRICT SECURITY: Restrict femi-adeleke strictly to Femi
      if (cleanSlug === "femi-adeleke" && !isFemiCaller(clerkEmail, clerkPhone)) {
        return NextResponse.json({ error: "Access denied to flagship workspace." }, { status: 403 });
      }

      const ws = await dbGetWorkspaceBySlug(slug);
      if (!ws) {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      }
      return NextResponse.json({ workspace: ws });
    }

    if (phone) {
      const ws = await dbGetWorkspaceByOwnerPhone(phone);
      if (!ws) {
        return NextResponse.json({ error: "Workspace not found for this phone" }, { status: 404 });
      }
      if (ws.slug === "femi-adeleke" && !isFemiCaller(undefined, phone)) {
        return NextResponse.json({ error: "Access denied to flagship workspace." }, { status: 403 });
      }
      return NextResponse.json({ workspace: ws });
    }

    // Authenticated user via Clerk
    if (userId) {
      const user = await currentUser();
      const primaryEmail = user?.emailAddresses?.[0]?.emailAddress;
      const primaryPhone = user?.phoneNumbers?.[0]?.phoneNumber?.replace(/[^0-9]/g, "");

      let workspaces = await dbGetWorkspacesByOwnerClerkId(userId, primaryEmail, primaryPhone);
      const isFemi = isFemiCaller(primaryEmail, primaryPhone);
      workspaces = workspaces.filter((w) => w.slug !== "femi-adeleke" || isFemi);
      return NextResponse.json({ workspaces });
    }

    // Authenticated user via Direct Obey OTP Session
    if (obeySession) {
      const primaryEmail = obeySession.email;
      const primaryPhone = obeySession.phone;
      const userKey = "session_" + (primaryPhone || primaryEmail);
      let workspaces = await dbGetWorkspacesByOwnerClerkId(userKey, primaryEmail, primaryPhone);
      const isFemi = isFemiCaller(primaryEmail, primaryPhone);

      // If session specifically points to a workspace slug, ensure it is in the list
      if (obeySession.workspaceSlug) {
        if (obeySession.workspaceSlug === "femi-adeleke" && !isFemi) {
          // Block non-Femi from inheriting femi-adeleke
        } else {
          const sessionWs = await dbGetWorkspaceBySlug(obeySession.workspaceSlug);
          if (sessionWs && !workspaces.some((w) => w.id === sessionWs.id)) {
            workspaces = [sessionWs, ...workspaces];
          }
        }
      }

      // If Femi's flagship account
      if (workspaces.length === 0 && isFemi) {
        const flagship = await dbGetWorkspaceBySlug("femi-adeleke");
        if (flagship) return NextResponse.json({ workspaces: [flagship] });
      }

      // Final air-tight filter
      workspaces = workspaces.filter((w) => w.slug !== "femi-adeleke" || isFemi);
      return NextResponse.json({ workspaces });
    }

    // Unauthenticated: return empty list for privacy
    return NextResponse.json({ workspaces: [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch workspaces" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, slug, owner_name, owner_phone, owner_email, plan } = body;
    const { userId } = await auth();

    if (!name || !slug || !owner_name || !owner_phone) {
      return NextResponse.json(
        { error: "Missing required fields: name, slug, owner_name, owner_phone" },
        { status: 400 }
      );
    }

    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-");
    const existing = await dbGetWorkspaceBySlug(cleanSlug);
    if (existing) {
      return NextResponse.json(
        { error: `Workspace with slug '${cleanSlug}' already exists. Please pick a unique handle.` },
        { status: 409 }
      );
    }

    // Enterprise / Founder plan restriction: non-enterprise users cannot add more than 1 business, enterprise users max 2
    if (userId) {
      const existingUserWorkspaces = await dbGetWorkspacesByOwnerClerkId(userId);
      if (existingUserWorkspaces.length >= 1) {
        const hasEnterprise = existingUserWorkspaces.some(
          (w) => w.plan === "enterprise" || w.plan === "lifetime"
        );
        if (!hasEnterprise) {
          return NextResponse.json(
            {
              error:
                "Adding an additional business is exclusive to the Enterprise / Founder Plan. Please upgrade your current workspace to Enterprise to manage a second business.",
            },
            { status: 403 }
          );
        }
        if (existingUserWorkspaces.length >= 2) {
          return NextResponse.json(
            {
              error:
                "Your Enterprise / Founder Plan allows a maximum of 2 business workspaces. Limit reached.",
            },
            { status: 403 }
          );
        }
      }
    }

    const created = await dbCreateWorkspace({
      name,
      slug: cleanSlug,
      owner_name,
      owner_phone,
      owner_email,
      owner_clerk_id: userId || undefined,
      plan: plan || "trial",
    });

    if (!created) {
      return NextResponse.json({ error: "Failed to create workspace in database" }, { status: 500 });
    }

    // Pre-provision Evolution API instance in background so it exists immediately
    createEvolutionInstance(`obey-${cleanSlug}`).catch(() => {});

    // Notify Femi Adeleke immediately via WhatsApp and Email upon any new registration
    const waAlert = `🎉 *New Obey Business Registration!*\n\n` +
      `🏢 *Business:* ${name}\n` +
      `🔗 *Handle:* /call?biz=${cleanSlug}\n` +
      `👤 *Owner:* ${owner_name}\n` +
      `📱 *Phone:* +${owner_phone}\n` +
      `📧 *Email:* ${owner_email || "Not provided"}\n` +
      `💼 *Plan:* ${(plan || "trial").toUpperCase()}\n\n` +
      `⚡ *View in Master Control Room:*\nhttps://obeyai.vercel.app/admin`;

    sendWhatsAppMessage(waAlert, "2348120934828").catch((err) =>
      console.warn("[Registration Alert] WhatsApp dispatch warning:", err)
    );

    sendNewRegistrationAlertEmail({
      businessName: name,
      slug: cleanSlug,
      ownerName: owner_name,
      ownerPhone: owner_phone,
      ownerEmail: owner_email,
      plan: plan || "trial",
    }).catch((err) =>
      console.warn("[Registration Alert] Email dispatch warning:", err)
    );

    // Seed default smart rules for this workspace
    await dbCreateWorkspaceRule({
      workspace_id: created.id,
      trigger_keywords: ["price", "pricing", "cost", "how much", "rate", "charge"],
      response_text: `Here is our current pricing and package info for ${name}:\n\nPlease let us know which package or item suits your needs, and we can finalize your order right away!`,
      action: "send_catalog",
      priority: 10,
    });

    await dbCreateWorkspaceRule({
      workspace_id: created.id,
      trigger_keywords: ["order", "buy", "purchase", "payment", "bank", "account"],
      response_text: `Thank you for your interest in ordering from ${name}! 💳\n\nTo make a direct transfer or confirm your order, kindly state the item and quantity, and our team will lock it in immediately.`,
      action: "request_payment",
      priority: 10,
    });

    await dbCreateWorkspaceRule({
      workspace_id: created.id,
      trigger_keywords: ["location", "address", "where", "office", "shop"],
      response_text: `We are delighted to serve you! Please let us know your location or delivery address so our team can coordinate with you right away.`,
      action: "share_location",
      priority: 8,
    });

    return NextResponse.json({ workspace: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create workspace" }, { status: 500 });
  }
}
