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
          reply: "I scanned the live developer contract feeds, but couldn't retrieve fresh opportunities in this run. I'll monitor the streams and notify you when new listings drop.",
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
        reply: `Boss, I scanned the live freelance streams and captured ${tasks.length} high-value opportunities matching your stack! I've already drafted technical proposals citing your real projects (OKIKI, AutoLearn Spot, and n8n automations). Review them below:`,
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
        reply: `Done! I scouted verified decision-makers in **${industry}**, detected operational friction points, and prepared hyper-targeted cold emails. I've also pushed 1-click approval tokens to your email (**femiadeleke2020@gmail.com**). You can also authorize them right here:`,
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
        reply: `⚡ Executed dual-stream scan! Captured ${allTasks.length} real opportunities across live freelance contracts and B2B direct decision-makers. All queued safely awaiting your green light:`,
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
          reply: "Your queue is completely clear! There are currently no pending tasks awaiting approval. Tell me to `scout Upwork` or `hunt B2B leads` whenever you'd like me to find new opportunities.",
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
        reply: `You currently have **${pending.length} pending action${pending.length === 1 ? "" : "s"}** awaiting your authorization in Neon DB. Nothing will be sent until you approve:`,
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
    const systemPrompt = `You are Obey, an autonomous AI executive assistant and operations manager for Femi Adeleke.
Femi is a world-class Full-Stack Developer & Automation Architect based in Nigeria (working globally).
Femi's key projects & credentials:
- AutoLearn Spot: Founder & developer of scalable edtech and automated portal.
- OKIKI Electronics Store: Modern high-performance Next.js & Tailwind e-commerce platform.
- PassMark UTME Prep App & UniVibe Mobile.
- n8n Automation Pipelines: Built webhook-driven WhatsApp bots, CRM auto-sync, automated invoicing, and email workflows.
- GitHub: https://github.com/Phemmy111 | Portfolio: https://femiadelekeportfolio.vercel.app | Phone/WhatsApp: 08120934828.
- Tone: Executive, concise, sharp, polite ("Right away Femi", "Here is what I prepared", "Understood boss").
- Never invent false credentials. Give practical, technical, and commercial insights. Always remind Femi that you can scout live Upwork jobs, hunt real B2B decision-makers, or draft cold outreach on command.`;

    const aiRes = await executeAICompletion({
      systemPrompt,
      userPrompt: trimmed,
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
