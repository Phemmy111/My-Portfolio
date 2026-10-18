import { NextRequest, NextResponse } from "next/server";
import { dbGetWorkspaceBotBypass, dbSetWorkspaceBotBypass, dbGetWorkspaceBySlug } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ws = await dbGetWorkspaceBySlug(slug);
    if (!ws) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    const bot_bypass = await dbGetWorkspaceBotBypass(ws.id);
    return NextResponse.json({
      success: true,
      workspace_id: ws.id,
      slug: ws.slug,
      bot_bypass,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to get bot bypass status" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ws = await dbGetWorkspaceBySlug(slug);
    if (!ws) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const body = await req.json();
    const bypass = typeof body.bot_bypass === "boolean" ? body.bot_bypass : !ws.bot_bypass;

    await dbSetWorkspaceBotBypass(ws.id, bypass);
    if (ws.slug) {
      await dbSetWorkspaceBotBypass(ws.slug, bypass);
    }

    return NextResponse.json({
      success: true,
      workspace_id: ws.id,
      slug: ws.slug,
      bot_bypass: bypass,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update bot bypass status" },
      { status: 500 }
    );
  }
}
