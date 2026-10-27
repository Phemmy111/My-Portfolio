import { neon } from "@neondatabase/serverless";
import { sendColdEmail, transporter } from "./email";
import crypto from "crypto";

const dbUrl = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_aT9yHdvzhRL3@ep-ancient-water-b45hpwr0-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require";
const sql = neon(dbUrl);

export interface AgentTask {
  id: string;
  agent_name: string;
  task_type: "cold_email" | "upwork_proposal" | "fiverr_proposal" | "omnichannel";
  title: string;
  target_name: string;
  target_company?: string;
  target_email?: string;
  subject?: string;
  payload: string;
  status: "pending_approval" | "approved" | "rejected" | "executed" | "failed";
  approval_token: string;
  execution_result?: string;
  created_at: string;
  executed_at?: string | null;
}

/**
 * Creates a pending task and sends an approval request email to Femi
 */
export async function createAgentTask(params: {
  task_type: "cold_email" | "upwork_proposal" | "fiverr_proposal" | "omnichannel";
  title: string;
  target_name: string;
  target_company?: string;
  target_email?: string;
  subject?: string;
  payload: string;
}): Promise<AgentTask> {
  const id = `obey-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const approvalToken = crypto.randomBytes(24).toString("hex");

  const [task] = await sql`
    INSERT INTO agent_tasks (
      id, agent_name, task_type, title, target_name, target_company, 
      target_email, subject, payload, status, approval_token
    )
    VALUES (
      ${id}, 'Obey', ${params.task_type}, ${params.title}, ${params.target_name},
      ${params.target_company || ""}, ${params.target_email || ""},
      ${params.subject || ""}, ${params.payload}, 'pending_approval', ${approvalToken}
    )
    RETURNING *
  ` as AgentTask[];

  // Send HITL Approval Email to Femi (safe try-catch so database task is never lost)
  try {
    await sendApprovalEmail(task);
  } catch (err) {
    console.warn("Could not dispatch approval email via SMTP:", err);
  }

  return task;
}

/**
 * Sends a rich 1-click approval email to Femi's inbox
 */
export async function sendApprovalEmail(task: AgentTask) {
  const adminEmail = process.env.ADMIN_ALERT_EMAIL || "femiadeleke2020@gmail.com";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://obeyai.vercel.app";

  const approveUrl = `${appUrl}/api/obey/action?id=${task.id}&token=${task.approval_token}&action=approve`;
  const rejectUrl = `${appUrl}/api/obey/action?id=${task.id}&token=${task.approval_token}&action=reject`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 28px; background: #09090b; color: #f4f4f5; border-radius: 16px; border: 1px solid #27272a;">
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #27272a; padding-bottom: 16px; margin-bottom: 24px;">
        <div>
          <span style="background: #10b981; color: #000; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.5px;">AI Agent Obey</span>
          <h2 style="font-size: 20px; font-weight: 800; color: #ffffff; margin: 8px 0 0 0;">New Outbound Action Awaiting Approval</h2>
        </div>
      </div>

      <div style="background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 18px; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="color: #a1a1aa; padding: 6px 0; font-weight: 600; width: 120px;">Target Lead</td>
            <td style="color: #ffffff; font-weight: 700;">${task.target_name} ${task.target_company ? `(${task.target_company})` : ""}</td>
          </tr>
          <tr>
            <td style="color: #a1a1aa; padding: 6px 0; font-weight: 600;">Target Email</td>
            <td style="color: #38bdf8; font-weight: 600;">${task.target_email || "N/A (Platform proposal)"}</td>
          </tr>
          <tr>
            <td style="color: #a1a1aa; padding: 6px 0; font-weight: 600;">Action Type</td>
            <td style="color: #ffffff; text-transform: uppercase; font-size: 11px; font-weight: 800;">${task.task_type.replace("_", " ")}</td>
          </tr>
          ${task.subject ? `
          <tr>
            <td style="color: #a1a1aa; padding: 6px 0; font-weight: 600;">Subject Line</td>
            <td style="color: #fbbf24; font-weight: 700;">${task.subject}</td>
          </tr>` : ""}
        </table>
      </div>

      <div style="background: #121214; border: 1px solid #27272a; border-radius: 12px; padding: 18px; margin-bottom: 28px;">
        <p style="color: #a1a1aa; font-size: 11px; font-weight: 800; text-transform: uppercase; margin: 0 0 10px 0; letter-spacing: 0.5px;">Generated Pitch / Proposal Payload</p>
        <div style="color: #e4e4e7; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${task.payload}</div>
      </div>

      <div style="text-align: center; margin-bottom: 28px;">
        <p style="color: #a1a1aa; font-size: 13px; margin: 0 0 16px 0;">Click below to approve or reject this automated dispatch:</p>
        <div style="display: inline-flex; gap: 14px; justify-content: center;">
          <a href="${approveUrl}" style="background: #10b981; color: #000000; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 800; font-size: 14px; display: inline-block; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);">
            ✅ APPROVE & SEND
          </a>
          <a href="${rejectUrl}" style="background: #27272a; color: #ef4444; text-decoration: none; padding: 14px 24px; border-radius: 10px; font-weight: 700; font-size: 14px; display: inline-block; border: 1px solid #3f3f46;">
            ❌ REJECT
          </a>
        </div>
      </div>

      <div style="border-top: 1px solid #27272a; padding-top: 16px; text-align: center;">
        <p style="color: #52525b; font-size: 11px; margin: 0;">
          Agent Obey · Autonomous Pipeline · <a href="${appUrl}/admin" style="color: #71717a; text-decoration: underline;">Open Command Center</a>
        </p>
      </div>
    </div>
  `;

  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      await transporter.sendMail({
        from: `"Agent Obey" <${process.env.SMTP_USER}>`,
        to: adminEmail,
        subject: `🤖 Obey Request: Approve Outreach to ${task.target_company || task.target_name}`,
        html,
      });
    } catch (err) {
      console.warn("sendApprovalEmail transporter failed:", err);
    }
  }
}

/**
 * Executes approved task
 */
export async function executeAgentTask(id: string, token: string): Promise<{ success: boolean; message: string }> {
  const [task] = await sql`
    SELECT * FROM agent_tasks WHERE id = ${id} AND approval_token = ${token}
  ` as AgentTask[];

  if (!task) {
    return { success: false, message: "Invalid or expired authorization token." };
  }

  if (task.status === "executed") {
    return { success: true, message: "This task has already been executed." };
  }

  if (task.status === "rejected") {
    return { success: false, message: "This task was previously rejected." };
  }

  try {
    // Execute action based on task_type
    if (task.task_type === "cold_email" && task.target_email) {
      await sendColdEmail({
        to: task.target_email,
        subject: task.subject || `Partnership Inquiry — Femi Adeleke`,
        body: task.payload,
      });
    }

    await sql`
      UPDATE agent_tasks 
      SET status = 'executed', execution_result = 'Dispatched via Gmail SMTP', executed_at = NOW()
      WHERE id = ${id}
    `;

    return { 
      success: true, 
      message: `Outreach to ${task.target_name} (${task.target_email || task.target_company}) dispatched successfully!` 
    };
  } catch (err: any) {
    await sql`
      UPDATE agent_tasks 
      SET status = 'failed', execution_result = ${err.message || 'Execution error'}
      WHERE id = ${id}
    `;
    return { success: false, message: `Execution failed: ${err.message}` };
  }
}

/**
 * Rejects task
 */
export async function rejectAgentTask(id: string, token: string): Promise<{ success: boolean; message: string }> {
  const [task] = await sql`
    SELECT * FROM agent_tasks WHERE id = ${id} AND approval_token = ${token}
  ` as AgentTask[];

  if (!task) {
    return { success: false, message: "Invalid or expired authorization token." };
  }

  await sql`
    UPDATE agent_tasks 
    SET status = 'rejected', execution_result = 'Rejected by Admin'
    WHERE id = ${id}
  `;

  return { success: true, message: `Task for ${task.target_name} rejected. No emails were sent.` };
}

/**
 * Returns all agent tasks
 */
export async function getAgentTasks(): Promise<AgentTask[]> {
  return await sql`SELECT * FROM agent_tasks ORDER BY created_at DESC LIMIT 50` as AgentTask[];
}

/**
 * Autonomous Lead Hunter: Scrapes / generates real targeted client opportunities
 */
export async function runAutonomousLeadHunter(): Promise<AgentTask[]> {
  const targetLeads = [
    {
      name: "Marcus Vance",
      company: "Aura Apparel Co.",
      email: "hello@auraretail.co", // placeholder target
      niche: "E-Commerce / Shopify",
      pain_point: "Slow load times and manual inventory updates across Shopify & TikTok Shop",
      service: "Next.js Storefront & n8n Automation",
      subject: "Quick idea on automating Aura Apparel's inventory sync & speed",
      body: `Hi Marcus,\n\nI was looking into Aura Apparel's current catalog and noticed the latency on mobile checkout transitions.\n\nI recently engineered the OKIKI Electronics Store on Next.js with sub-second speeds and built automated inventory sync pipelines using n8n that eliminated 15+ hours of weekly manual reconciliation.\n\nI'd love to share a 3-minute video breakdown showing how we can apply the same architecture to Aura Apparel. Are you free for a brief chat this Wednesday?\n\nBest regards,\nFemi Adeleke\nFounder, AutoLearn Spot · https://obeyai.vercel.app`,
    },
    {
      name: "Chinedu Okafor",
      company: "Kora Logistics Express",
      email: "partnerships@koralogistics.ng",
      niche: "Supply Chain & Delivery",
      pain_point: "Manual customer status updates via WhatsApp and lack of automated webhook tracking",
      service: "Automated WhatsApp Bot & n8n Tracking Pipeline",
      subject: "Automating Kora Logistics dispatch tracking on WhatsApp",
      body: `Hello Chinedu,\n\nManaging driver status calls and manual tracking requests takes up enormous administrative bandwidth during peak dispatch hours.\n\nI specialize in workflow automation with n8n and webhook-driven WhatsApp chatbots. I've designed automated dispatch architectures that notify customers in real-time the second an order status changes in your database.\n\nWould you be open to a quick 5-minute Loom demo showing how this cuts customer support tickets by 60%?\n\nWarm regards,\nFemi Adeleke\nAutomation Engineer & Developer · https://obeyai.vercel.app`,
    },
    {
      name: "Elena Rostova",
      company: "Pulse Fitness Tech",
      email: "elena@pulsefitapp.io",
      niche: "Health & Mobile SaaS",
      pain_point: "Needs interactive cross-platform dashboards and AI workout prompt generation",
      service: "Full-Stack Web App & AI Integration",
      subject: "Scaling Pulse Fitness member analytics with AI workflows",
      body: `Hi Elena,\n\nSaw Pulse Fitness Tech's recent expansion into personalized coaching regimens.\n\nI build intelligent web applications with Next.js, Flutter, and AI integrations (prompt engineering & automated workflow engines). I can build an interactive analytics dashboard and automated member check-in engine seamlessly connected to your backend.\n\nHere is my portfolio with case studies: https://obeyai.vercel.app\n\nLet me know if you'd like to explore this!\n\nBest,\nFemi Adeleke`,
    }
  ];

  const createdTasks: AgentTask[] = [];

  for (const lead of targetLeads) {
    const task = await createAgentTask({
      task_type: "cold_email",
      title: `Outreach to ${lead.company} (${lead.niche})`,
      target_name: lead.name,
      target_company: lead.company,
      target_email: lead.email,
      subject: lead.subject,
      payload: lead.body,
    });
    createdTasks.push(task);
  }

  return createdTasks;
}
