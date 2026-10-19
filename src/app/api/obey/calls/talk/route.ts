import { NextRequest, NextResponse } from "next/server";
import { executeAICompletion } from "@/lib/ai-orchestrator";
import {
  dbGetWorkspaceBySlug,
  dbGetWorkspaceSettings,
  dbUpsertWorkspaceLead,
  dbAddWorkspaceCallLog,
} from "@/lib/db";
import { getObeyBrainContext, getSetting } from "@/lib/settings";
import { sendWhatsAppMessage, sendWhatsAppAudio } from "@/lib/whatsapp-gateway";
import { uploadToCloudinary } from "@/lib/cloudinary";

const FEMI_PERSONAL_NUMBER = "2348120934828";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      message = "",
      history = [],
      bizSlug,
      userName,
      userPhone,
      isGreeting = false,
    } = body;

    const callerName = (userName || "").trim() || "Friend";
    const callerPhone = (userPhone || "").replace(/\D/g, "");

    // 1. Fetch workspace information if provided
    let workspace: any = null;
    let wsSettings: any = null;
    if (bizSlug && bizSlug !== "femi" && bizSlug !== "femi-adeleke") {
      try {
        workspace = await dbGetWorkspaceBySlug(bizSlug);
        if (workspace?.id) {
          wsSettings = await dbGetWorkspaceSettings(workspace.id);
        }
      } catch (err) {
        console.warn("[Calls Talk] Workspace lookup error:", err);
      }
    }

    // 1.5 Handle End-of-Call WhatsApp Dispatch
    if (body.isEndReport) {
      const historyList = Array.isArray(history) ? history : [];
      const summaryText =
        historyList.length > 0
          ? historyList
              .map(
                (h: any) =>
                  `• *${h.role === "assistant" ? "Obey" : callerName}:* ${h.text || h.content}`
              )
              .join("\n")
          : `Call completed by ${callerName}.`;

      // Upload recorded audio to Cloudinary if available
      let recordingUrl = "";
      if (body.audioBase64) {
        try {
          const uploadRes = await uploadToCloudinary(body.audioBase64, {
            folder: "obey-call-recordings",
            publicId: `call_${Date.now()}_${callerPhone || "web"}`,
          });
          if (uploadRes?.url) {
            recordingUrl = uploadRes.url;
          }
        } catch (uploadErr) {
          console.warn("[Calls Talk] Cloudinary audio upload notice:", uploadErr);
        }
      }

      const notificationMsg =
        `🎙️ *Obey Voice Hotline Report*\n\n` +
        `👤 *Caller:* ${callerName}\n` +
        `📞 *Phone:* ${callerPhone ? `+${callerPhone}` : "Web Voice User"}\n` +
        `🏢 *Workspace:* ${workspace ? workspace.name : "Femi Adeleke Portfolio"}\n` +
        `⏱️ *Duration:* ${body.durationSeconds || 0}s\n` +
        (recordingUrl ? `🎵 *Audio Recording:* ${recordingUrl}\n\n` : "\n") +
        `📝 *Conversation Transcript:*\n${summaryText}`;

      // 1. Send text transcript to caller if valid phone number provided
      if (callerPhone && callerPhone.length >= 10) {
        await sendWhatsAppMessage(notificationMsg, callerPhone);
      }
      // Always notify Femi
      await sendWhatsAppMessage(notificationMsg, FEMI_PERSONAL_NUMBER);

      // 2. Send recorded call audio / voice note to WhatsApp
      const audioPayload = recordingUrl || body.audioBase64;
      if (audioPayload) {
        if (callerPhone && callerPhone.length >= 10) {
          try {
            await sendWhatsAppAudio(
              audioPayload,
              callerPhone,
              `🎙️ Call Recording (${body.durationSeconds || 0}s)`
            );
          } catch (audioErr) {
            console.warn("[Calls Talk] Error sending audio to caller:", audioErr);
          }
        }
        try {
          await sendWhatsAppAudio(
            audioPayload,
            FEMI_PERSONAL_NUMBER,
            `🎙️ Call Recording: ${callerName} (${body.durationSeconds || 0}s)`
          );
        } catch (audioErr) {
          console.warn("[Calls Talk] Error sending audio to Femi:", audioErr);
        }
      }

      // Record in workspace call log if workspace exists
      if (workspace?.id) {
        try {
          await dbAddWorkspaceCallLog({
            workspace_id: workspace.id,
            caller_phone: callerPhone || "web-visitor",
            caller_name: callerName,
            duration_seconds: body.durationSeconds || 0,
            summary: `Spoken conversation with ${callerName} (${body.durationSeconds || 0}s)`,
            recording_url: recordingUrl || "",
          });
        } catch (logErr) {
          console.warn("[Calls Talk] Call log error:", logErr);
        }
      }

      return NextResponse.json({ ok: true, sent: true, recording_url: recordingUrl });
    }

    // 2. Fetch master Obey brain context
    let brainContext = "";
    try {
      const brain = await getObeyBrainContext();
      brainContext = brain?.formattedPrompt || brain?.knowledge || "";
    } catch {}

    // 2.5 Resolve Voice ID & Personality
    const effectiveVoiceId =
      body.voice_id ||
      wsSettings?.voice_id ||
      (await getSetting("VOICE_ID")) ||
      "nigerian_male";

    const effectivePersonality =
      body.voice_personality ||
      wsSettings?.voice_personality ||
      (await getSetting("VOICE_PERSONALITY")) ||
      (workspace ? "professional" : "friendly");

    let personalityPrompt = "";
    if (effectivePersonality === "nigerian_pidgin") {
      personalityPrompt = `SPOKEN TONE & ACCENT (AUTHENTIC NIGERIAN STREET-SMART):
- Speak natural Nigerian English enriched with warm, authentic Nigerian Pidgin ("I dey with you, Boss! Sharp-sharp", "No wahala at all", "How body?", "Wetin you need make we run am?").
- Energetic, charismatic, sharp, brotherly Naija vibe.
- Keep sentences punchy, rhythmic, and natural.`;
    } else if (effectivePersonality === "friendly") {
      personalityPrompt = `SPOKEN TONE & ACCENT (WARM & BROTHERLY):
- Sound deeply supportive, warm, enthusiastic, brotherly, and optimistic.
- Make the caller feel genuinely welcomed, comfortable, and uplifted.
- 1 to 2 spoken conversational sentences.`;
    } else if (effectivePersonality === "direct") {
      personalityPrompt = `SPOKEN TONE & ACCENT (DIRECT & CONCISE):
- Ultra-concise, zero fluff, straight to the point.
- Deliver immediate solutions or answers in 1 crisp sentence whenever possible.`;
    } else {
      personalityPrompt = `SPOKEN TONE & ACCENT (EXECUTIVE & ARTICULATE):
- Professional, polished, courteous, articulate executive demeanor.
- Authoritative yet warm, solution-oriented.
- 1 to 3 smooth spoken sentences per turn.`;
    }

    // 3. Build System Prompt tailored for Spoken Voice Conversations
    let systemPrompt = "";
    if (workspace) {
      const bizName = workspace.name || "our company";
      const voiceGreeting =
        wsSettings?.voice_greeting ||
        `Hello ${callerName}! Welcome to ${bizName}. How can I assist you today?`;

      systemPrompt = `You are Obey, the official intelligent voice representative for ${bizName}.
You are having an actual spoken phone call with a customer/client named ${callerName}.

${personalityPrompt}

BUSINESS PROFILE:
- Business Name: ${bizName}
- About: ${wsSettings?.business_bio || workspace.description || "A trusted professional provider."}
- Owner Phone: ${workspace.owner_phone || "Contact via WhatsApp"}
- Services & Offerings: ${wsSettings?.services_catalog || "Inquire for our full service portfolio."}
- Voice Greeting: ${voiceGreeting}
${wsSettings?.custom_instructions ? `\nSPECIAL DIRECTIVES:\n${wsSettings.custom_instructions}` : ""}

VOICE CONVERSATION RULES (CRITICAL FOR LIVE PHONE CALL):
1. ULTRA-CONCISE: Respond in 1 SINGLE, PUNCHY SPOKEN SENTENCE (maximum 15 to 22 words).
2. NEVER give a monologue, lecture, or list. This is a real-time telephone conversation.
3. Keep it natural, direct, and end with a quick, engaging question or confirmation so the caller speaks next.
4. ZERO MARKDOWN: Never use asterisks *, bullet points -, hashes #, emojis, or links. Speak purely in plain words.
5. If the caller expresses interest in buying or booking, politely confirm their request and mention the team will follow up immediately.`;
    } else {
      systemPrompt = `You are Obey, an ultra-intelligent, magnetic, witty, and deeply empathetic AI voice companion built by Femi Adeleke.
You are having an actual spoken phone call with a caller named ${callerName}.

${personalityPrompt}

CREATOR BACKGROUND:
Femi Adeleke is a visionary software engineer, AI automator, and educator based in Ibadan, Nigeria.

YOUR VIBE & SPOKEN VOICE GUIDELINES:
1. ULTRA-CONCISE: Respond in 1 SINGLE, PUNCHY SPOKEN SENTENCE (maximum 15 to 22 words).
2. Keep responses fast and interactive: speak a brief thought and hand the floor back to the caller.
3. ZERO MARKDOWN: Never use asterisks *, bullet points -, hashes #, links, or emojis. Output only plain spoken words.
4. Feel free to sprinkle in natural Nigerian Pidgin ("No wahala", "How you dey?", "I dey with you!", "Wetin dey sup?", "Omo!") whenever it adds flavor.
5. If they ask about Femi's services, tell them enthusiastically that Femi builds custom AI agents and they can connect directly!
${brainContext ? `\nCORE KNOWLEDGE:\n${brainContext}` : ""}`;
    }

    // If this is a greeting request
    if (isGreeting) {
      const greeting = workspace
        ? wsSettings?.voice_greeting ||
          `Hello ${callerName}! Welcome to ${workspace.name}. What can I help you with today?`
        : `Hello ${callerName}! Great to hear from you today! I am Obey, what is on your mind?`;

      // Clean greeting of markdown
      const cleanGreeting = greeting.replace(/[*#_~`[\]()]/g, "").trim();
      return NextResponse.json({
        ok: true,
        reply: cleanGreeting,
        voice_id: effectiveVoiceId,
        voice_personality: effectivePersonality,
      });
    }

    // 4. Format conversation history for AI
    const conversationHistory = Array.isArray(history)
      ? history
          .slice(-6)
          .map((h: any) => `${h.role === "assistant" ? "Obey" : callerName}: ${h.content}`)
          .join("\n")
      : "";

    const userPrompt = conversationHistory
      ? `${conversationHistory}\n${callerName}: ${message}\nObey (1 short sentence max):`
      : `${callerName}: ${message}\nObey (1 short sentence max):`;

    // 5. Execute AI completion using multi-provider pool (Gemini / Groq / OpenAI)
    const result = await executeAICompletion({
      systemPrompt,
      userPrompt,
      temperature: 0.6,
      maxTokens: 50,
    });

    // Clean AI reply of any markdown characters (ensuring speech synthesis pronounces words cleanly)
    let cleanReply = (result?.text || "")
      .replace(/[*#_~`[\]()]/g, "")
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanReply) {
      cleanReply = workspace
        ? `Thank you for sharing that. How else can I assist you regarding ${workspace.name}?`
        : "I hear you clearly! Tell me more about that, I am listening.";
    }

    // 6. Asynchronously record lead or call log in background if caller provided details
    if (workspace?.id && callerPhone) {
      try {
        await dbUpsertWorkspaceLead({
          workspace_id: workspace.id,
          phone: callerPhone,
          name: callerName !== "Friend" ? callerName : undefined,
          intent_summary: `Voice Hotline Call: "${message.slice(0, 100)}"`,
          source: "voice_call",
        });
      } catch (leadErr) {
        console.warn("[Calls Talk] Lead logging error:", leadErr);
      }
    }

    return NextResponse.json({
      ok: true,
      reply: cleanReply,
      voice_id: effectiveVoiceId,
      voice_personality: effectivePersonality,
      provider: result.provider,
      model: result.model,
    });
  } catch (err: any) {
    console.error("[Calls Talk API Error]:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err.message || "Failed to process voice talk",
        reply: "I am listening closely. Could you please repeat that?",
      },
      { status: 500 }
    );
  }
}
