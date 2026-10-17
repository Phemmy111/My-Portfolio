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

  // 2. Check for implicit memory signals (identity, business, preferences, projects, relationships)
  const hasMemorySignals =
    explicitMatch ||
    /\b(course|module|modules|studying|exam|quiz|boyfriend|girlfriend|husband|wife|friend|brother|sister|partner|meeting with|project|working on|building|app|store|shop|business|company|brand|startup|agency|products|services|sell|selling|pricing|budget|apply for|applying|grant|grants|remote job|jobs|career|schedule|my name is|call me|i am a|i am an|i work as|i live in|based in|located in|allergic|prefer|i prefer|i like|routine|my goal|target)\b/i.test(
      userText
    );

  if (!hasMemorySignals) {
    return { memoryCaptured: false };
  }

  try {
    // 3. Use fast AI completion to distill concise memory facts
    const extractionPrompt = `You are the permanent memory engine for Obey AI.
Extract only concise, permanent facts about the user from their message below to ensure coherent and consistent long-term memory across sessions.
Focus on:
- User identity: Name, profession, role, location, background
- Business & Projects: Brand name, store/company, products/services offered, apps being built, active pipelines
- Preferences & Directives: Preferred tone/language (e.g. Pidgin vs formal), specific operational rules, routines, workflow choices
- Relationships & Collaborators: Partners, clients, teammates, or family mentioned
- Goals & Targets: Key milestones, exams, launches, or budgets

RULES:
- Return ONLY 1 to 4 bullet points starting with "• ".
- Be concise, objective, and factual (e.g. "• Runs an agricultural e-commerce brand called Havilah Touch in Ibadan", "• Prefers communication in Nigerian English / Pidgin").
- Do NOT include temporary transient chatter (e.g. "asked for a 10-second skit", "greeting Obey").
- If there are no permanent personal, project, or business facts to retain, return "NONE".

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

    // 4. Save to persistent user memory in Neon DB (individual user memory)
    await saveUserPersonalMemory({
      userIdentifier,
      userNotes: extracted,
      userName: userName || undefined,
    });

    console.log(`[Memory Engine] Learned new facts for ${userIdentifier}:\n${extracted}`);

    // 5. If this is the owner (Femi), also auto-persist directly into global OBEY_BRAIN_KNOWLEDGE
    if (isOwner) {
      try {
        const existingKnowledge = (await getSetting("OBEY_BRAIN_KNOWLEDGE")) || "";
        if (!existingKnowledge.includes(extracted)) {
          const updatedKnowledge = existingKnowledge ? `${existingKnowledge}\n${extracted}` : extracted;
          await setSetting("OBEY_BRAIN_KNOWLEDGE", updatedKnowledge);
          console.log(`[Memory Engine] Automatically updated OBEY_BRAIN_KNOWLEDGE with owner facts!`);
        }
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
