import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { executeAICompletion } from "@/lib/ai-orchestrator";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, workspace_id, topic } = body;

    if (!sql) {
      return NextResponse.json({ error: "Database not connected" }, { status: 500 });
    }

    let ws = null;
    if (workspace_id) {
      const wsRows = await sql`SELECT * FROM workspaces WHERE id = ${workspace_id} LIMIT 1`;
      if (wsRows && wsRows.length > 0) ws = wsRows[0];
    } else if (slug) {
      const wsRows = await sql`SELECT * FROM workspaces WHERE LOWER(slug) = ${slug.toLowerCase().trim()} LIMIT 1`;
      if (wsRows && wsRows.length > 0) ws = wsRows[0];
    }

    if (!ws) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const businessName = ws.name || "Our Business";
    const bioContext = ws.bio_context || "High quality products and client service.";
    const catalogJson = JSON.stringify(ws.catalog_items || []);

    const userPrompt = `
You are the Chief Marketing Copywriter for "${businessName}".
Business Bio & Knowledge:
${bioContext}

Product / Service Catalog:
${catalogJson}

User Focus / Request:
${topic || "Create a high-converting, engaging WhatsApp status post to drive direct orders and inquiries today."}

Write 3 distinct WhatsApp Status post variations:
1. "Flash Promo": Urgent, exciting deal or product highlight with a clear call to action to reply to the status.
2. "Value & Trust": A quick tip or why clients love working with us.
3. "Engagement Starter": A fun question or poll-style status that makes contacts reply immediately.

Formatting Guidelines:
- Use standard WhatsApp formatting: *bold* for key hooks, clean emojis.
- Keep each post concise (2-5 lines maximum), perfectly sized for a mobile WhatsApp Status story screen.
- Include a clear call to action (e.g. "👉 Reply to this status to lock yours in before stock ends!").

Return ONLY a valid JSON object matching this structure:
{
  "variations": [
    { "type": "Flash Promo", "content": "..." },
    { "type": "Value & Trust", "content": "..." },
    { "type": "Engagement Starter", "content": "..." }
  ]
}
`;

    const aiRes = await executeAICompletion({
      systemPrompt: "You are an elite WhatsApp direct-response copywriter. Output only pure JSON.",
      userPrompt,
      temperature: 0.7,
    });

    let variations = [];
    try {
      const cleanJson = aiRes.text.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
      variations = parsed.variations || [];
    } catch {
      variations = [
        {
          type: "Flash Promo",
          content: `🔥 Special offer from *${businessName}*!\n\nGet exclusive deals on our top products today.\n\n👉 Reply directly to this status now to place your order!`,
        },
        {
          type: "Value & Trust",
          content: `✨ Quality and reliability you can trust.\n\nAt *${businessName}*, we make sure you get only the best.\n\n💬 Send us a message to get started today!`,
        },
      ];
    }

    return NextResponse.json({ variations });
  } catch (err: any) {
    console.error("[Status Gen] error:", err);
    return NextResponse.json({ error: err.message || "Failed to generate status post" }, { status: 500 });
  }
}
