import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import {
  dbListWorkspaces,
  dbCreateWorkspace,
  dbGetWorkspaceBySlug,
  dbGetWorkspaceByOwnerPhone,
  dbGetWorkspacesByOwnerClerkId,
  dbClaimWorkspaceForClerkUser,
  dbCreateWorkspaceRule,
} from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    const phone = searchParams.get("phone");
    const { userId } = await auth();

    if (slug) {
      if (userId) {
        const user = await currentUser();
        const primaryEmail = user?.emailAddresses?.[0]?.emailAddress;
        await dbClaimWorkspaceForClerkUser(slug, userId, primaryEmail);
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
      return NextResponse.json({ workspace: ws });
    }

    // Authenticated user: return only their owned workspaces for security
    if (userId) {
      const user = await currentUser();
      const primaryEmail = user?.emailAddresses?.[0]?.emailAddress;
      const primaryPhone = user?.phoneNumbers?.[0]?.phoneNumber?.replace(/[^0-9]/g, "");

      const workspaces = await dbGetWorkspacesByOwnerClerkId(userId, primaryEmail, primaryPhone);
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
