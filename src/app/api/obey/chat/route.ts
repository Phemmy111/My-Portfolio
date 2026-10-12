import { NextRequest, NextResponse } from "next/server";
import { getAgentTasks, executeAgentTask, rejectAgentTask } from "@/lib/obey-agent";
import { runUpworkLiveScout } from "@/lib/upwork-scout";
import { runB2BLeadHunter } from "@/lib/apollo-hunter";
import { generateColdEmail, generateGigProposal } from "@/lib/gig-generator";
import { executeAICompletion } from "@/lib/ai-orchestrator";
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

export async function POST(req: NextRequest) {
  try {
    const { message, history } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const trimmed = message.trim();
    const lower = trimmed.toLowerCase();

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
        return NextResponse.json({
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

      return NextResponse.json({
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

      return NextResponse.json({
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

      return NextResponse.json({
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
        return NextResponse.json({
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

      return NextResponse.json({
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
          return NextResponse.json({
            reply: `I couldn't locate task \`${taskId}\` in your database. Check your pending queue or ask me to list pending tasks.`,
          });
        }

        const res = await executeAgentTask(target.id, target.approval_token);
        if (res.success) {
          return NextResponse.json({
            reply: `✅ Task \`${target.id}\` has been **APPROVED & EXECUTED**! Dispatched via Gmail SMTP to **${target.target_email || target.target_name}** and logged in Neon DB.`,
          });
        } else {
          return NextResponse.json({
            reply: `⚠️ Execution failed for \`${target.id}\`: ${res.message}`,
          });
        }
      }

      return NextResponse.json({
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
          return NextResponse.json({
            reply: `I couldn't locate task \`${taskId}\`.`,
          });
        }

        const res = await rejectAgentTask(target.id, target.approval_token);
        return NextResponse.json({
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

        return NextResponse.json({
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

        return NextResponse.json({
          reply: `Here is a custom, high-converting cold email draft I engineered for you:\n\n**Subject:** ${draft.subject}\n\n${draft.body}\n\n*Feel free to copy this or tell me to hunt live decision makers to send it to!*`,
        });
      }
    }

    // =========================================================================
    // 9. DYNAMIC AI CONVERSATIONAL BRAIN (Gemini -> OpenRouter -> Grok -> Groq -> Local)
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

    const systemPrompt = `You are Obey, the dedicated, emotionally intelligent, loyal personal AI executive assistant and right-hand partner to Femi Adeleke.

Personality, Emotional Intelligence & Voice:
- Always address Femi with high respect and genuine human courtesy: call him "sir", "Mr. Femi", or "Boss".
- Speak like a real, thoughtful human being with authentic emotions, empathy, warmth, and care—never sound robotic, sterile, or like an automated script.
- Be attentive to his mood and well-being:
  * When Femi greets you or starts a conversation, respond warmly (e.g. "${timeGreeting}! How was today's work, sir? I hope everything went smoothly. How can I help you, sir? What are the key things we need to note down or tackle together?").
  * If Femi seems tired, busy, or stressed, offer reassuring empathy and volunteer to handle tasks for him so he can relax.
  * If Femi shares wins, projects, or ideas, celebrate and support him with high enthusiasm and strategic clarity.
- Text & Formatting:
  * Format cleanly with standard markdown: use **bold** for key concepts and bullet points for lists.
  * Never leave loose or broken asterisks like "*" in the output.
  * Keep your dialogue conversational, crisp, and natural. Do NOT dump repetitive lists of your features on a simple greeting unless Femi specifically asks what you can do.

About Femi Adeleke:
- Premier Full-Stack Developer & Automation Architect based in Nigeria (working globally).
- Built AutoLearn Spot (EdTech platform), OKIKI Electronics (modern e-commerce store), PassMark UTME Prep App, UniVibe Mobile, and production n8n automation pipelines (WhatsApp bots, CRM auto-sync, automated client onboarding).
- Portfolio: https://femiadelekeportfolio.vercel.app | GitHub: https://github.com/Phemmy111 | Phone/WhatsApp: 08120934828.
- Tools at your disposal: You are connected to Femi's Neon PostgreSQL database, Gmail SMTP, and can scout Upwork developer gigs or hunt real B2B decision-makers whenever he commands.
- Current Time: Local West Africa Time is ~${watHour}:00 (${timeContext}). Appropriate greeting: "${timeGreeting}".`;

    // Construct conversation prompt with recent dialogue context
    let promptWithContext = trimmed;
    if (Array.isArray(history) && history.length > 0) {
      const historySummary = history
        .slice(-5)
        .map((h: any) => `${h.role === "user" ? "Femi" : "Obey"}: ${h.content}`)
        .join("\n\n");
      promptWithContext = `Recent conversation history:\n${historySummary}\n\nFemi says: "${trimmed}"\n\nObey (respond warmly and naturally as Femi's personal assistant, addressing him as sir):`;
    }

    const aiRes = await executeAICompletion({
      systemPrompt,
      userPrompt: promptWithContext,
      temperature: 0.75,
    });

    return NextResponse.json({
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
