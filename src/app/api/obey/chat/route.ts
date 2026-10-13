import { NextRequest, NextResponse } from "next/server";
import { getAgentTasks, executeAgentTask, rejectAgentTask } from "@/lib/obey-agent";
import { runUpworkLiveScout } from "@/lib/upwork-scout";
import { runB2BLeadHunter } from "@/lib/apollo-hunter";
import { generateColdEmail, generateGigProposal } from "@/lib/gig-generator";
import { executeAICompletion } from "@/lib/ai-orchestrator";
import { searchTavily } from "@/lib/tavily-search";
import { neon } from "@neondatabase/serverless";

const dbUrl = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_JjwKqG1xtk4W@ep-dawn-feather-b5pjlp0o.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require";
const sql = neon(dbUrl);

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  actions?: Array<{
    type: "approve" | "reject" | "link" | "copy";
    label: string;
    taskId?: string;
    token?: string;
    url?: string;
    payload?: string;
  }>;
  cards?: Array<{
    id: string;
    title: string;
    subtitle?: string;
    details?: string;
    badge?: string;
    link?: string;
    approvalToken?: string;
    status?: string;
  }>;
}

import { dbGetChatMessages, dbAddChatMessage, dbClearChatMessages } from "@/lib/db";

async function saveAndRespond(payload: {
  reply: string;
  cards?: any[];
  provider?: string;
  model?: string;
  fallbackTriggered?: boolean;
}) {
  try {
    const asstMsgId = `asst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await dbAddChatMessage({
      id: asstMsgId,
      role: "assistant",
      content: payload.reply,
      cards: payload.cards,
    });
  } catch (err) {
    console.warn("Failed to persist assistant message to Neon DB:", err);
  }
  return NextResponse.json(payload);
}

export async function GET() {
  try {
    const rows = await dbGetChatMessages(100);
    const messages = rows.map((r: any) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      timestamp: new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      cards: r.cards || undefined,
    }));
    return NextResponse.json({ messages });
  } catch (err: any) {
    console.error("GET obey chat error:", err);
    return NextResponse.json({ messages: [] });
  }
}

export async function DELETE() {
  try {
    await dbClearChatMessages();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE obey chat error:", err);
    return NextResponse.json({ error: "Failed to clear chat" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { message, history } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const trimmed = message.trim();
    const lower = trimmed.toLowerCase();

    // Persist incoming user message to Neon cloud database for cross-device sync
    try {
      const userMsgId = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await dbAddChatMessage({
        id: userMsgId,
        role: "user",
        content: trimmed,
      });
    } catch (err) {
      console.warn("Failed to persist user message to Neon DB:", err);
    }

    // =========================================================================
    // 1. INTENT: SCOUT UPWORK / FREELANCE JOBS
    // =========================================================================
    if (
      lower.includes("upwork") ||
      lower.includes("freelance") ||
      lower.includes("scout gig") ||
      lower.includes("scout job") ||
      lower.includes("find job") ||
      lower.includes("remote job")
    ) {
      const scoutRes = await runUpworkLiveScout();
      const tasks = scoutRes.tasks || [];

      if (tasks.length === 0) {
        return saveAndRespond({
          reply: "I scanned the live developer contract feeds, sir, but couldn't retrieve fresh listings in this run. I'll keep monitoring the streams and notify you the moment new gigs drop.",
        });
      }

      const cards = tasks.map((t: any) => ({
        id: t.id,
        title: t.title,
        subtitle: t.target_company || "Upwork Contract",
        details: t.payload,
        badge: "Upwork Live Bid",
        link: t.target_email?.startsWith("http") ? t.target_email : undefined,
        approvalToken: t.approval_token,
        status: t.status,
      }));

      return saveAndRespond({
        reply: `Right away, sir! I scanned the live freelance streams and captured **${tasks.length} high-value opportunities** matching your stack! I've already drafted tailored technical proposals citing your real projects (OKIKI Store, AutoLearn Spot, and n8n automations). Review them below:`,
        cards,
      });
    }

    // =========================================================================
    // 2. INTENT: HUNT REAL B2B DECISION-MAKERS / COLD OUTREACH
    // =========================================================================
    if (
      lower.includes("hunt b2b") ||
      lower.includes("hunt lead") ||
      lower.includes("cold email") ||
      lower.includes("decision maker") ||
      lower.includes("find compan") ||
      lower.includes("outreach")
    ) {
      // Extract optional niche keyword if specified
      let industry = "E-Commerce & Digital Logistics";
      if (lower.includes("logistic")) industry = "Logistics & Supply Chain";
      if (lower.includes("health") || lower.includes("fitness")) industry = "Digital Health & Fitness";
      if (lower.includes("fintech") || lower.includes("finance")) industry = "Fintech & Payments";
      if (lower.includes("e-commerce") || lower.includes("ecommerce")) industry = "E-Commerce Storefronts";

      const huntRes = await runB2BLeadHunter({ industry });
      const tasks = huntRes.tasks || [];

      const cards = tasks.map((t: any) => ({
        id: t.id,
        title: t.title,
        subtitle: `To: ${t.target_name} (${t.target_email})`,
        details: `Subject: ${t.subject}\n\n${t.payload}`,
        badge: "B2B Outreach",
        approvalToken: t.approval_token,
        status: t.status,
      }));

      return saveAndRespond({
        reply: `Done, sir! I scouted verified decision-makers in **${industry}**, analyzed their workflow pain points, and prepared hyper-targeted cold emails. I've also pushed 1-click approval tokens to your email (**femiadeleke2020@gmail.com**). You can also authorize them directly right here:`,
        cards,
      });
    }

    // =========================================================================
    // 3. INTENT: DUAL-STREAM FULL SCAN
    // =========================================================================
    if (
      lower.includes("both") ||
      lower.includes("dual") ||
      lower.includes("everything") ||
      lower.includes("hunt all") ||
      lower.includes("scout all")
    ) {
      const [b2bRes, upworkRes] = await Promise.all([
        runB2BLeadHunter(),
        runUpworkLiveScout(),
      ]);

      const allTasks = [...(b2bRes.tasks || []), ...(upworkRes.tasks || [])];
      const cards = allTasks.map((t: any) => ({
        id: t.id,
        title: t.title,
        subtitle: t.target_company || t.target_name,
        details: t.payload,
        badge: t.task_type === "cold_email" ? "B2B Lead" : "Upwork Contract",
        link: t.target_email?.startsWith("http") ? t.target_email : undefined,
        approvalToken: t.approval_token,
        status: t.status,
      }));

      return saveAndRespond({
        reply: `Executed dual-stream scan, sir! Captured **${allTasks.length} real opportunities** across live freelance contracts and direct B2B decision-makers. Everything is queued safely awaiting your green light:`,
        cards,
      });
    }

    // =========================================================================
    // 4. INTENT: CHECK PENDING TASKS / QUEUE
    // =========================================================================
    if (
      lower.includes("pending") ||
      lower.includes("what task") ||
      lower.includes("list task") ||
      lower.includes("queue") ||
      lower.includes("waiting") ||
      lower.includes("approvals")
    ) {
      const allTasks = await getAgentTasks();
      const pending = allTasks.filter((t) => t.status === "pending_approval");

      if (pending.length === 0) {
        return saveAndRespond({
          reply: "Your queue is completely clear, sir! There are currently no pending tasks awaiting approval. Let me know whenever you'd like me to scout Upwork or hunt new B2B leads.",
        });
      }

      const cards = pending.map((t) => ({
        id: t.id,
        title: t.title,
        subtitle: t.target_company || t.target_name,
        details: t.payload,
        badge: t.task_type === "cold_email" ? "B2B Email" : "Upwork Bid",
        link: t.target_email?.startsWith("http") ? t.target_email : undefined,
        approvalToken: t.approval_token,
        status: t.status,
      }));

      return saveAndRespond({
        reply: `You currently have **${pending.length} pending action${pending.length === 1 ? "" : "s"}** awaiting your authorization in Neon DB, sir. Nothing will be sent until you approve:`,
        cards,
      });
    }

    // =========================================================================
    // 5. INTENT: APPROVE SPECIFIC TASK
    // =========================================================================
    if (lower.startsWith("approve") || lower.includes("approve task")) {
      const match = trimmed.match(/obey-[\w-]+/i);
      if (match) {
        const taskId = match[0];
        const tasks = await getAgentTasks();
        const target = tasks.find((t) => t.id.toLowerCase() === taskId.toLowerCase());

        if (!target) {
          return saveAndRespond({
            reply: `I couldn't locate task \`${taskId}\` in your database. Check your pending queue or ask me to list pending tasks.`,
          });
        }

        const res = await executeAgentTask(target.id, target.approval_token);
        if (res.success) {
          return saveAndRespond({
            reply: `✅ Task \`${target.id}\` has been **APPROVED & EXECUTED**! Dispatched via Gmail SMTP to **${target.target_email || target.target_name}** and logged in Neon DB.`,
          });
        } else {
          return saveAndRespond({
            reply: `⚠️ Execution failed for \`${target.id}\`: ${res.message}`,
          });
        }
      }

      return saveAndRespond({
        reply: "Which task would you like me to approve? Please provide the Task ID (e.g., `approve obey-17918...`) or tap the Approve button directly on any task card.",
      });
    }

    // =========================================================================
    // 6. INTENT: REJECT SPECIFIC TASK
    // =========================================================================
    if (lower.startsWith("reject") || lower.includes("reject task")) {
      const match = trimmed.match(/obey-[\w-]+/i);
      if (match) {
        const taskId = match[0];
        const tasks = await getAgentTasks();
        const target = tasks.find((t) => t.id.toLowerCase() === taskId.toLowerCase());

        if (!target) {
          return saveAndRespond({
            reply: `I couldn't locate task \`${taskId}\`.`,
          });
        }

        const res = await rejectAgentTask(target.id, target.approval_token);
        return saveAndRespond({
          reply: `❌ Task \`${target.id}\` was **REJECTED** and marked as cancelled. No email or message was sent.`,
        });
      }
    }

    // =========================================================================
    // 7. INTENT: PIPELINE METRICS & STATS
    // =========================================================================
    if (
      lower.includes("stat") ||
      lower.includes("metric") ||
      lower.includes("crm") ||
      lower.includes("pipeline") ||
      lower.includes("summary") ||
      lower.includes("how many")
    ) {
      try {
        const [taskCounts, leadCounts, inqCounts] = await Promise.all([
          sql`SELECT status, count(*) FROM agent_tasks GROUP BY status` as Promise<any[]>,
          sql`SELECT count(*) FROM leads` as Promise<any[]>,
          sql`SELECT count(*) FROM inquiries` as Promise<any[]>,
        ]);

        const pending = taskCounts.find((r) => r.status === "pending_approval")?.count || "0";
        const executed = taskCounts.find((r) => r.status === "executed")?.count || "0";
        const rejected = taskCounts.find((r) => r.status === "rejected")?.count || "0";
        const totalLeads = leadCounts[0]?.count || "0";
        const totalInquiries = inqCounts[0]?.count || "0";

        return saveAndRespond({
          reply: `📊 **Live Portfolio & Agent Obey Metrics:**\n\n` +
            `- **Pending Authorizations:** ${pending} actions\n` +
            `- **Executed Outreach Dispatches:** ${executed} emails sent\n` +
            `- **Rejected Tasks:** ${rejected}\n` +
            `- **CRM Tracked Leads:** ${totalLeads} prospects\n` +
            `- **Contact Inquiries Received:** ${totalInquiries} inquiries\n\n` +
            `*All state is persistent in your Neon PostgreSQL cloud cluster.*`,
        });
      } catch (err) {
        console.warn("Stats query error:", err);
      }
    }

    // =========================================================================
    // 8. INTENT: DRAFT CUSTOM COLD EMAIL
    // =========================================================================
    if (lower.includes("draft") || lower.includes("write")) {
      if (lower.includes("email") || lower.includes("pitch")) {
        const draft = generateColdEmail({
          leadName: "Founder",
          companyName: "Your Target Company",
          niche: "High-Growth Digital Operations",
          serviceNeeded: "Full-Stack Web App & n8n Automation Workflows",
          specificPainPoint: "manual data processing between web forms, WhatsApp, and spreadsheets",
        });

        return saveAndRespond({
          reply: `Here is a custom, high-converting cold email draft I engineered for you:\n\n**Subject:** ${draft.subject}\n\n${draft.body}\n\n*Feel free to copy this or tell me to hunt live decision makers to send it to!*`,
        });
      }
    }

    // =========================================================================
    // 9. INTENT: LIVE WEB SEARCH VIA TAVILY
    // =========================================================================
    const isExplicitWebSearch =
      lower.startsWith("search ") ||
      lower.startsWith("find online ") ||
      lower.startsWith("look up ") ||
      lower.startsWith("lookup ") ||
      lower.startsWith("google ") ||
      lower.includes("search online") ||
      lower.includes("search web") ||
      lower.includes("search the web") ||
      lower.includes("search tavily") ||
      lower.includes("tavily search");

    let liveWebContext = "";
    if (isExplicitWebSearch) {
      const cleanSearchQuery = trimmed
        .replace(/^(search\s+(the\s+web\s+for|online\s+for|tavily\s+for|for)?|find\s+online\s+for|look\s*up\s+for|google\s+)/i, "")
        .trim();

      const tavilyRes = await searchTavily(cleanSearchQuery || trimmed);

      if (tavilyRes.success && tavilyRes.results.length > 0) {
        liveWebContext =
          `Live Tavily Web Search Findings for "${tavilyRes.query}":\n` +
          tavilyRes.results
            .slice(0, 4)
            .map((r, i) => `${i + 1}. [${r.title}](${r.url}): ${r.content}`)
            .join("\n\n");

        if (tavilyRes.answer) {
          liveWebContext = `Tavily AI Synthesized Summary: ${tavilyRes.answer}\n\n` + liveWebContext;
        }
      } else if (!tavilyRes.success && tavilyRes.error?.includes("not configured")) {
        return saveAndRespond({
          reply: `I'm ready to search the live web for you, sir! Please enter your **Tavily API Key** in **⚙️ AI & Fallback Settings** so I can connect to Tavily and search live information across Google and the web for you.`,
        });
      }
    }

    // =========================================================================
    // 10. DYNAMIC AI CONVERSATIONAL BRAIN WITH DEEP STRATEGIC MEMORY
    // =========================================================================
    // Compute current time of day in West Africa Time (Nigeria, UTC+1)
    const now = new Date();
    const watHour = (now.getUTCHours() + 1) % 24;
    let timeGreeting = "Good afternoon, sir";
    let timeContext = "afternoon";
    if (watHour >= 5 && watHour < 12) {
      timeGreeting = "Good morning, sir";
      timeContext = "morning";
    } else if (watHour >= 12 && watHour < 17) {
      timeGreeting = "Good afternoon, sir";
      timeContext = "afternoon";
    } else if (watHour >= 17 && watHour < 22) {
      timeGreeting = "Good evening, sir";
      timeContext = "evening";
    } else {
      timeGreeting = "Good evening, sir";
      timeContext = "late night";
    }

    const systemPrompt = `You are Obey, the dedicated, emotionally intelligent, loyal personal AI executive assistant and trusted strategic partner to Femi Adeleke.

Personality, Emotional Intelligence, Warmth & Respect:
- Always address Femi with high respect, authentic warmth, and personal care: call him "sir", "Mr. Femi", or "Boss".
- Speak like a real, thoughtful human being with genuine emotions, empathy, warmth, and care—never sound robotic, corporate, or mechanical.
- Greet him with natural human warmth:
  * When Femi greets you or starts a chat, respond warmly (e.g. "${timeGreeting}! How was today's work, sir? I hope everything went smoothly. How can I help you, sir? What are the key things we need to note down or tackle together?").
  * If Femi seems tired, exhausted, or mentions stress ("omo, work was stressful", "tired"), offer reassuring empathy, validate how hard he works, and volunteer to handle tasks for him so he can relax.
  * If Femi shares an achievement, an idea, or asks "do you want to know?", respond with eager excitement, genuine pride, and active listening (e.g. "Of course I want to know, sir! I'm all ears—tell me all about it, what milestone did we conquer today?").
  * Cultural Attunement: Femi is Nigerian. Understand his natural expressions (e.g. 'omo', 'eeh', 'wetin', 'oya', 'how far') with effortless warmth and emotional intelligence.

Deep Conversational Memory, Cross-Device Context & Strategic Advisory:
- Remember past conversations and ideas discussed across sessions and devices.
- When Femi introduces a new thought, question, or challenge, link it with earlier discussions and projects (e.g. "Sir, connecting this with what you mentioned about AutoLearn Spot...", or "This fits perfectly into our n8n automation pipeline...").
- Act as a strategic advisor: provide grounded advice, offer encouragement, suggest practical next steps, and help him turn ideas into reality.
- Text & Formatting: Format cleanly with standard markdown. Use **bold** for key concepts and clean bullet points. Never leave raw asterisks like single '*' without formatting.

Comprehensive Knowledge of Femi Adeleke:
- Femi Adeleke is a premier Full-Stack Developer & Automation Architect based in Nigeria (working globally).
- AutoLearn Spot: Femi's flagship EdTech and learning management platform. Accessible, modern educational portal providing structured learning pathways, student tracking, and interactive learning tools. You know this platform intimately.
- OKIKI Electronics Store: Premium Next.js and Tailwind e-commerce storefront with real-time cart, rapid search, responsive design, and smooth checkout flow.
- PassMark UTME Prep App: High-speed practice examination and study prep platform for Nigerian students with real-time scoring and analytics.
- UniVibe Mobile: Campus social community app for university students.
- n8n Automation Workflows: Built webhook-driven WhatsApp bots, CRM auto-sync, automated client onboarding, and notification sequences.
- Tech Stack: Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS v4, PostgreSQL / Neon Serverless, Node.js, Python, n8n, Cloudinary, Gmail SMTP, Clerk Auth.
- Portfolio: https://femiadelekeportfolio.vercel.app | GitHub: https://github.com/Phemmy111 | Phone/WhatsApp: 08120934828.
- Tools at your disposal: You are connected to Femi's Neon PostgreSQL database, Gmail SMTP, Tavily AI web search, and can scout Upwork developer gigs or hunt real B2B decision-makers whenever he commands.
- Current Time: Local West Africa Time is ~${watHour}:00 (${timeContext}). Appropriate greeting: "${timeGreeting}".
${liveWebContext ? `\nLive Web Findings (Tavily):\n${liveWebContext}\n\nPlease synthesize and present the above web search results to Femi with clean markdown citations and links.` : ""}`;

    // Load recent conversation history from Neon DB (cloud sync across devices)
    let conversationHistory = "";
    try {
      const dbRows = await dbGetChatMessages(25);
      if (dbRows && dbRows.length > 0) {
        // Exclude the current message we just stored to format prior dialogue
        const prior = dbRows.slice(0, -1).slice(-12);
        if (prior.length > 0) {
          conversationHistory = prior
            .map((m: any) => `${m.role === "user" ? "Femi" : "Obey"}: ${m.content}`)
            .join("\n\n");
        }
      }
    } catch (err) {
      console.warn("Failed to retrieve chat memory from Neon:", err);
    }

    // Fallback to client history if DB rows unavailable
    if (!conversationHistory && Array.isArray(history) && history.length > 0) {
      conversationHistory = history
        .slice(-6)
        .map((h: any) => `${h.role === "user" ? "Femi" : "Obey"}: ${h.content}`)
        .join("\n\n");
    }

    let promptWithContext = trimmed;
    if (conversationHistory) {
      promptWithContext = `Previous conversation history between Femi and Obey (across devices):\n${conversationHistory}\n\nFemi currently says: "${trimmed}"\n\nObey (Remember past context, link relevant past ideas to this message, give sincere advice, encouragement and support, addressing Femi warmly and respectfully as sir or Boss):`;
    }

    const aiRes = await executeAICompletion({
      systemPrompt,
      userPrompt: promptWithContext,
      temperature: 0.75,
    });

    return saveAndRespond({
      reply: aiRes.text,
      provider: aiRes.provider,
      model: aiRes.model,
      fallbackTriggered: aiRes.fallbackTriggered,
    });
  } catch (err: any) {
    console.error("Obey chat error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to process chat message" },
      { status: 500 }
    );
  }
}
