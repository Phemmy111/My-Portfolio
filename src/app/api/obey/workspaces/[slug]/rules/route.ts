import { NextRequest, NextResponse } from "next/server";
import {
  dbGetWorkspaceBySlug,
  dbCreateWorkspaceRule,
  dbDeleteWorkspaceRule,
} from "@/lib/db";

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
    const { trigger_keywords, response_text, action, priority, trigger_type } = body;

    if (!trigger_keywords || !Array.isArray(trigger_keywords) || trigger_keywords.length === 0) {
      return NextResponse.json(
        { error: "trigger_keywords must be a non-empty array of keywords" },
        { status: 400 }
      );
    }

    if (!response_text || !response_text.trim()) {
      return NextResponse.json(
        { error: "response_text is required" },
        { status: 400 }
      );
    }

    const cleanKeywords = trigger_keywords
      .map((k: string) => k.trim().toLowerCase())
      .filter((k: string) => k.length > 0);

    const created = await dbCreateWorkspaceRule({
      workspace_id: ws.id,
      trigger_keywords: cleanKeywords,
      response_text: response_text.trim(),
      action: action || "reply_only",
      priority: priority !== undefined ? Number(priority) : 5,
      trigger_type: trigger_type || "contains_keyword",
    });

    return NextResponse.json({ success: true, rule: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to create rule" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ws = await dbGetWorkspaceBySlug(slug);
    if (!ws) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const ruleId = searchParams.get("ruleId");

    if (!ruleId) {
      return NextResponse.json({ error: "ruleId is required" }, { status: 400 });
    }

    const success = await dbDeleteWorkspaceRule(ruleId, ws.id);
    return NextResponse.json({ success });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to delete rule" },
      { status: 500 }
    );
  }
}
