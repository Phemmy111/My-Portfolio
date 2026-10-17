import { NextRequest, NextResponse } from "next/server";
import { sql, dbGetWorkspaceSettings } from "@/lib/db";
import { executeAICompletion } from "@/lib/ai-orchestrator";

const WHATSAPP_COLORS = [
  "#075E54", // Classic Teal
  "#059669", // Emerald Green
  "#1E3A8A", // Midnight Navy
  "#6D28D9", // Royal Purple
  "#991B1B", // Crimson Red
  "#D97706", // Warm Amber
  "#1F2937", // Charcoal Black
  "#BE185D", // Berry Pink
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, workspace_id, topic, style } = body;

    if (!sql) {
      return NextResponse.json({ error: "Database not connected" }, { status: 500 });
    }

    let ws: any = null;
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

    // Fetch rich settings from workspace_settings
    const wsSettings = await dbGetWorkspaceSettings(ws.id);
    const businessName = ws.name || "Our Business";
    const bioContext =
      wsSettings?.business_bio ||
      ws.description ||
      "Direct response business providing exceptional products, services, and fast delivery.";
    const catalogSummary = wsSettings?.catalog_summary || "";

    const userPrompt = `
You are the Chief Direct-Response Marketing Copywriter for "${businessName}".

ABOUT THIS BUSINESS:
Bio & Value Proposition:
${bioContext}

Product / Service Catalog & Highlights:
${catalogSummary || "Standard catalog and customized service offerings."}

CAMPAIGN FOCUS / TOPIC FROM THE OWNER:
${topic ? topic.trim() : "Drive urgent inquiries, direct orders, and replies from WhatsApp contacts today."}
${style ? `Desired Tone / Style: ${style}` : ""}

Generate 4 high-converting, distinct WhatsApp Status variations:
1. "Flash Promo": High urgency, irresistible hook, clear deadline or limited slots.
2. "Value & Insider Tip": Solves a common customer frustration, establishes authority, and invites conversation.
3. "Engagement & Question": Intriguing question or interactive scenario that makes viewers tap reply immediately.
4. "Social Proof & Results": Showcase transformation, client happiness, or reliability that builds confidence.

GUIDELINES:
- Every post must feel authentic, human, and conversational (never generic robotic marketing fluff).
- Format using WhatsApp native markdown: *bold hooks*, clean linebreaks, tasteful emojis.
- Keep each variation concise (3 to 6 lines max) — perfectly fitted to be read in 5 seconds on a mobile WhatsApp story screen.
- Conclude with an irresistible, direct call to action (e.g. "👉 Reply to this status to lock yours in before 6 PM!").
- Assign a recommended background color hex (from: ${WHATSAPP_COLORS.join(", ")}) and recommended font ID (1: Sans, 2: Serif, 3: Cursive, 4: Marker, 5: Monospace).

Output ONLY valid JSON matching this schema:
{
  "variations": [
    {
      "type": "Flash Promo",
      "content": "...",
      "recommended_bg": "#991B1B",
      "recommended_font": 1
    },
    {
      "type": "Value & Insider Tip",
      "content": "...",
      "recommended_bg": "#075E54",
      "recommended_font": 2
    },
    {
      "type": "Engagement & Question",
      "content": "...",
      "recommended_bg": "#6D28D9",
      "recommended_font": 3
    },
    {
      "type": "Social Proof & Results",
      "content": "...",
      "recommended_bg": "#059669",
      "recommended_font": 4
    }
  ]
}
`;

    const aiRes = await executeAICompletion({
      systemPrompt: "You are an elite WhatsApp direct-response marketer and conversion copywriter. Respond with strict JSON only.",
      userPrompt,
      temperature: 0.85,
    });

    let variations = [];
    try {
      const cleanJson = aiRes.text.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
      if (Array.isArray(parsed.variations) && parsed.variations.length > 0) {
        variations = parsed.variations.map((v: any, idx: number) => ({
          type: v.type || `Variation ${idx + 1}`,
          content: v.content || "",
          recommended_bg: v.recommended_bg || WHATSAPP_COLORS[idx % WHATSAPP_COLORS.length],
          recommended_font: typeof v.recommended_font === "number" ? v.recommended_font : 1,
        }));
      }
    } catch (parseErr) {
      console.warn("[Status Gen] JSON parse fallback:", parseErr);
    }

    if (variations.length === 0) {
      variations = [
        {
          type: "Flash Promo",
          content: `🚨 *FLASH UPDATE from ${businessName}* 🚨\n\nWe have a special priority slot open today for our most requested service.\n\n👉 *Reply directly to this status now* to claim yours before it's taken! ⚡`,
          recommended_bg: "#991B1B",
          recommended_font: 1,
        },
        {
          type: "Value & Insider Tip",
          content: `💡 *Quick Pro Tip from ${businessName}*\n\nNever settle for second-rate results when quality and speed can work hand in hand.\n\n💬 Need help deciding the right solution? *Reply to this status* for instant free advice.`,
          recommended_bg: "#075E54",
          recommended_font: 2,
        },
        {
          type: "Engagement & Question",
          content: `🤔 *Quick question for everyone viewing this...*\n\nIf you could solve your biggest headache this week with zero stress, would you start today or next week?\n\nDrop your vote by *replying below*! 👇`,
          recommended_bg: "#6D28D9",
          recommended_font: 3,
        },
        {
          type: "Social Proof & Results",
          content: `🌟 *"Best decision we made this month!"*\n\nAnother happy client just took delivery from ${businessName}. That is why we do what we do.\n\n🚀 Want same-day priority service? *Reply to this status right now!*`,
          recommended_bg: "#059669",
          recommended_font: 4,
        },
      ];
    }

    return NextResponse.json({ variations, businessName });
  } catch (err: any) {
    console.error("[Status Gen] error:", err);
    return NextResponse.json({ error: err.message || "Failed to generate status post" }, { status: 500 });
  }
}

