import { executeAICompletion } from "./ai-orchestrator";
import { saveUserPersonalMemory, getUserFullMemory } from "./image-generator";
import { getSetting, setSetting } from "./settings";

/**
 * Autonomous Memory Learner for Obey.
 * Automatically analyzes user messages in background and extracts persistent personal
 * facts, courses, projects, relationships, schedules, and preferences.
 */
export async function autoLearnUserMemory(params: {
  userIdentifier: string;
  userText: string;
  userName?: string;
  isOwner?: boolean;
}): Promise<{ memoryCaptured: boolean; memoryText?: string }> {
  const { userIdentifier, userText, userName, isOwner } = params;
  if (!userText || userText.length < 15) {
    return { memoryCaptured: false };
  }

  // 1. Check for explicit memory commands
  const explicitMatch = userText.match(
    /^(?:please\s+)?(?:remember|keep in mind|note that|don't forget|save this)(?:\s+that|\s*:|\s+to\s+memory)?\s+([\s\S]+)/i
  );

  // 2. Check for implicit memory signals (courses, projects, people, goals, personal facts)
  const hasMemorySignals =
    explicitMatch ||
    /\b(course|module|modules|studying|exam|quiz|boyfriend|girlfriend|husband|wife|friend|meeting with|project|working on|apply for|applying|grant|grants|remote job|jobs|career|schedule|my name is|i am a|i work as|i live in|allergic|prefer|my goal|routine)\b/i.test(
      userText
    );

  if (!hasMemorySignals) {
    return { memoryCaptured: false };
  }

  try {
    // 3. Use fast AI completion to distill concise memory facts
    const extractionPrompt = `You are the memory engine for Obey AI.
Extract only concise, permanent facts about the user from their message below.
Focus on:
- Courses, studies, modules, degrees, or certifications
- Relationships, partners, friends, or collaborators mentioned (e.g. boyfriend, friend Isaac Moon)
- Projects, businesses, jobs, or grants they are applying for
- Specific goals, schedules, preferences, or personal facts

RULES:
- Return ONLY 1 to 4 bullet points starting with "• ".
- Be concise, objective, and factual.
- Do NOT include temporary small talk (e.g. "wants food breaks" or "checking X for updates").
- If there are no permanent personal facts to retain, return "NONE".

User Statement:
"${userText}"`;

    const aiRes = await executeAICompletion({
      systemPrompt: "You are a concise fact extractor.",
      userPrompt: extractionPrompt,
      temperature: 0.2,
      maxTokens: 150,
    });

    const extracted = (aiRes.text || "").trim();
    if (!extracted || extracted.includes("NONE") || extracted.length < 5) {
      return { memoryCaptured: false };
    }

    // 4. Save to persistent user memory in Neon DB
    await saveUserPersonalMemory({
      userIdentifier,
      userNotes: extracted,
      userName: userName || undefined,
    });

    console.log(`[Memory Engine] Learned new facts for ${userIdentifier}:\n${extracted}`);

    // 5. If this is the owner (Femi) giving core business knowledge
    if (isOwner && explicitMatch) {
      try {
        const existingKnowledge = (await getSetting("OBEY_BRAIN_KNOWLEDGE")) || "";
        const updatedKnowledge = `${existingKnowledge}\n• ${explicitMatch[1].trim()}`;
        await setSetting("OBEY_BRAIN_KNOWLEDGE", updatedKnowledge);
      } catch (err) {
        console.warn("[Memory Engine] Failed to append to OBEY_BRAIN_KNOWLEDGE:", err);
      }
    }

    return { memoryCaptured: true, memoryText: extracted };
  } catch (err) {
    console.warn("[Memory Engine] autoLearnUserMemory error:", err);
    return { memoryCaptured: false };
  }
}
