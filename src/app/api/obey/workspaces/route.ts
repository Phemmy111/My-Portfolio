import { NextRequest, NextResponse } from "next/server";
import {
  dbListWorkspaces,
  dbCreateWorkspace,
  dbGetWorkspaceBySlug,
  dbGetWorkspaceByOwnerPhone,
  dbCreateWorkspaceRule,
} from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    const phone = searchParams.get("phone");

    if (slug) {
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

    const workspaces = await dbListWorkspaces();
    return NextResponse.json({ workspaces });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch workspaces" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, slug, owner_name, owner_phone, owner_email, plan } = body;

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
      plan: plan || "starter",
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
      action: "collect_order",
      priority: 9,
    });

    await dbCreateWorkspaceRule({
      workspace_id: created.id,
      trigger_keywords: ["human", "agent", "real person", "call me", "speak to someone"],
      response_text: `Got it! I am notifying the ${name} team right now so someone can connect with you directly. You can also tap our dedicated call hotline anytime!`,
      action: "notify_owner",
      priority: 8,
    });

    return NextResponse.json({ success: true, workspace: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create workspace" }, { status: 500 });
  }
}
