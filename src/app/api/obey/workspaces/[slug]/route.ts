import { NextRequest, NextResponse } from "next/server";
import {
  sql,
  dbGetWorkspaceBySlug,
  dbGetWorkspaceSettings,
  dbUpsertWorkspaceSettings,
  dbGetWorkspaceRules,
  dbGetWorkspaceLeads,
  dbGetWorkspaceCallLogs,
  dbUpdateWorkspaceProfile,
  dbSetWorkspaceBotBypass,
} from "@/lib/db";
import { getVapiProvidersPool, VAPI_VOICE_OPTIONS } from "@/lib/settings";

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

    const [settings, rules, leads, callLogs, statuses] = await Promise.all([
      dbGetWorkspaceSettings(ws.id),
      dbGetWorkspaceRules(ws.id),
      dbGetWorkspaceLeads(ws.id),
      dbGetWorkspaceCallLogs(ws.id),
      sql ? sql`SELECT * FROM workspace_statuses WHERE workspace_id = ${ws.id} ORDER BY created_at DESC LIMIT 30` : [],
    ]);

    return NextResponse.json({
      workspace: ws,
      settings: settings || {
        workspace_id: ws.id,
        business_bio: "",
        catalog_summary: "",
        voice_greeting: "",
        whatsapp_welcome: "",
        fallback_action: "ai_reply",
        voice_id: "nigerian_male",
        voice_personality: "professional",
        website_url: "",
      },
      rules: rules || [],
      leads: leads || [],
      callLogs: callLogs || [],
      statuses: statuses || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to load workspace data" },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
    const {
      owner_name,
      owner_phone,
      name,
      bot_bypass,
      business_bio,
      catalog_summary,
      voice_greeting,
      whatsapp_welcome,
      fallback_action,
      voice_id,
      voice_personality,
      website_url,
      gemini_api_keys,
      huggingface_api_keys,
      cloudflare_api_tokens,
      cloudflare_account_id,
      openai_api_keys,
    } = body;

    let updatedWorkspace = ws;
    if (owner_name !== undefined || owner_phone !== undefined || name !== undefined) {
      const refreshed = await dbUpdateWorkspaceProfile(ws.id, {
        owner_name,
        owner_phone,
        name,
      });
      if (refreshed) {
        updatedWorkspace = refreshed;
      }
    }

    if (bot_bypass !== undefined) {
      await dbSetWorkspaceBotBypass(ws.id, Boolean(bot_bypass));
      updatedWorkspace = {
        ...updatedWorkspace,
        bot_bypass: Boolean(bot_bypass),
      };
    }

    const updatedSettings = await dbUpsertWorkspaceSettings(ws.id, {
      business_bio,
      catalog_summary,
      voice_greeting,
      whatsapp_welcome,
      fallback_action,
      voice_id,
      voice_personality,
      website_url,
      gemini_api_keys,
      huggingface_api_keys,
      cloudflare_api_tokens,
      cloudflare_account_id,
      openai_api_keys,
    });

    if (voice_id) {
      try {
        const pool = await getVapiProvidersPool();
        const primary = pool.find((p) => p.enabled && p.apiKey && p.assistantId);
        if (primary && primary.apiKey && primary.assistantId) {
          const selectedVoice = VAPI_VOICE_OPTIONS.find((v) => v.id === voice_id) || VAPI_VOICE_OPTIONS[0];
          await fetch(`https://api.vapi.ai/assistant/${primary.assistantId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${primary.apiKey.trim()}`,
            },
            body: JSON.stringify({
              voice: {
                provider: selectedVoice.provider,
                voiceId: selectedVoice.voiceId,
                model: selectedVoice.model || "eleven_turbo_v2_5",
              },
            }),
          });
        }
      } catch (err) {
        console.warn("Failed to sync voice to Vapi assistant:", err);
      }
    }

    return NextResponse.json({
      success: true,
      workspace: updatedWorkspace,
      settings: updatedSettings,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update workspace settings" },
      { status: 500 }
    );
  }
}
