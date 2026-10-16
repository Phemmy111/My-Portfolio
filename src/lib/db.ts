import { neon } from "@neondatabase/serverless";

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return null;
  }
  return neon(url);
}

// Fallback/standard sql tagged template helper
export const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null!;

// ==============================================================
// DATABASE SCHEMA SETUP
// Run this once to create the tables in your Neon database
// ==============================================================
export async function createTables() {
  const db = getSql();
  if (!db) return;

  await db`
    CREATE TABLE IF NOT EXISTS obey_chat_messages (
      id         TEXT PRIMARY KEY,
      role       TEXT NOT NULL,
      content    TEXT NOT NULL,
      cards      JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await db`
    CREATE INDEX IF NOT EXISTS idx_obey_messages_created_at ON obey_chat_messages (created_at ASC)
  `;

  await db`
    CREATE TABLE IF NOT EXISTS leads (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      company    TEXT,
      email      TEXT NOT NULL,
      service_needed TEXT,
      status     TEXT DEFAULT 'new',
      niche      TEXT,
      notes      TEXT,
      draft_subject TEXT,
      draft_body    TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_contacted_at TIMESTAMPTZ
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS proposals (
      id                  TEXT PRIMARY KEY,
      platform            TEXT NOT NULL,
      job_title           TEXT NOT NULL,
      job_description     TEXT NOT NULL,
      angle               TEXT,
      generated_proposal  TEXT NOT NULL,
      relevant_projects   TEXT[],
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS inquiries (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      email      TEXT NOT NULL,
      service    TEXT,
      message    TEXT NOT NULL,
      status     TEXT DEFAULT 'unread',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await createWorkspaceTables();

  console.log("✅ Neon DB tables verified/created");
}


// ==============================================================
// LEADS
// ==============================================================
export async function dbGetLeads() {
  return await sql`SELECT * FROM leads ORDER BY created_at DESC`;
}

export async function dbAddLead(lead: {
  id: string;
  name: string;
  company?: string;
  email: string;
  service_needed?: string;
  status?: string;
  niche?: string;
  notes?: string;
  draft_subject?: string;
  draft_body?: string;
}) {
  const [row] = await sql`
    INSERT INTO leads (id, name, company, email, service_needed, status, niche, notes, draft_subject, draft_body)
    VALUES (${lead.id}, ${lead.name}, ${lead.company ?? ""}, ${lead.email},
            ${lead.service_needed ?? "Web Development"}, ${lead.status ?? "new"},
            ${lead.niche ?? ""}, ${lead.notes ?? ""},
            ${lead.draft_subject ?? ""}, ${lead.draft_body ?? ""})
    RETURNING *
  `;
  return row;
}

export async function dbUpdateLead(id: string, updates: Record<string, any>) {
  // Build dynamic SET clause
  const setClauses = Object.entries(updates)
    .map(([k, _v], i) => `${k} = $${i + 2}`)
    .join(", ");
  const values = [id, ...Object.values(updates)];
  // Neon tagged template doesn't support fully dynamic queries, so we do selective updates:
  const { status, notes, draft_subject, draft_body, last_contacted_at } = updates;
  const [row] = await sql`
    UPDATE leads SET
      status = COALESCE(${status ?? null}, status),
      notes  = COALESCE(${notes ?? null}, notes),
      draft_subject = COALESCE(${draft_subject ?? null}, draft_subject),
      draft_body    = COALESCE(${draft_body ?? null}, draft_body),
      last_contacted_at = COALESCE(${last_contacted_at ?? null}::timestamptz, last_contacted_at)
    WHERE id = ${id}
    RETURNING *
  `;
  return row;
}

export async function dbDeleteLead(id: string) {
  await sql`DELETE FROM leads WHERE id = ${id}`;
  return true;
}

// ==============================================================
// PROPOSALS
// ==============================================================
export async function dbGetProposals() {
  return await sql`SELECT * FROM proposals ORDER BY created_at DESC`;
}

export async function dbSaveProposal(prop: {
  id: string;
  platform: string;
  job_title: string;
  job_description: string;
  angle: string;
  generated_proposal: string;
  relevant_projects: string[];
}) {
  const [row] = await sql`
    INSERT INTO proposals (id, platform, job_title, job_description, angle, generated_proposal, relevant_projects)
    VALUES (${prop.id}, ${prop.platform}, ${prop.job_title}, ${prop.job_description},
            ${prop.angle}, ${prop.generated_proposal}, ${prop.relevant_projects})
    RETURNING *
  `;
  return row;
}

export async function dbDeleteProposal(id: string) {
  await sql`DELETE FROM proposals WHERE id = ${id}`;
  return true;
}

// ==============================================================
// INQUIRIES
// ==============================================================
export async function dbGetInquiries() {
  return await sql`SELECT * FROM inquiries ORDER BY created_at DESC`;
}

export async function dbAddInquiry(inq: {
  id: string;
  name: string;
  email: string;
  service: string;
  message: string;
}) {
  const [row] = await sql`
    INSERT INTO inquiries (id, name, email, service, message)
    VALUES (${inq.id}, ${inq.name}, ${inq.email}, ${inq.service}, ${inq.message})
    RETURNING *
  `;
  return row;
}

export async function dbUpdateInquiryStatus(id: string, status: string) {
  const [row] = await sql`
    UPDATE inquiries SET status = ${status} WHERE id = ${id} RETURNING *
  `;
  return row;
}

export async function dbDeleteInquiry(id: string) {
  await sql`DELETE FROM inquiries WHERE id = ${id}`;
  return true;
}

// ==============================================================
// STATS
// ==============================================================
export async function dbGetStats() {
  const [stats] = await sql`
    SELECT
      (SELECT COUNT(*) FROM leads)::int                                    AS total_leads,
      (SELECT COUNT(*) FROM leads WHERE status != 'closed')::int           AS active_leads,
      (SELECT COUNT(*) FROM leads WHERE status = 'converted')::int         AS converted_leads,
      (SELECT COUNT(*) FROM proposals)::int                                AS total_proposals,
      (SELECT COUNT(*) FROM inquiries)::int                                AS total_inquiries,
      (SELECT COUNT(*) FROM inquiries WHERE status = 'unread')::int        AS unread_inquiries
  `;
  return stats;
}

// ==============================================================
// OBEY CHAT CONVERSATION MEMORY (SYNCED TO NEON DB)
// ==============================================================
export async function dbGetChatMessages(limit: number = 100) {
  const db = getSql();
  if (!db) return [];
  try {
    const rows = await db`
      SELECT id, role, content, cards, created_at
      FROM obey_chat_messages
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows ? [...rows].reverse() : [];
  } catch (err) {
    console.warn("dbGetChatMessages fallback:", err);
    return [];
  }
}

export async function dbAddChatMessage(msg: {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards?: any;
}) {
  const db = getSql();
  if (!db) return null;
  try {
    const [row] = await db`
      INSERT INTO obey_chat_messages (id, role, content, cards)
      VALUES (${msg.id}, ${msg.role}, ${msg.content}, ${msg.cards ? JSON.stringify(msg.cards) : null})
      ON CONFLICT (id) DO UPDATE SET
        content = EXCLUDED.content,
        cards = EXCLUDED.cards
      RETURNING *
    `;
    return row;
  } catch (err) {
    console.warn("dbAddChatMessage fallback:", err);
    return null;
  }
}

export async function dbClearChatMessages() {
  const db = getSql();
  if (!db) return true;
  try {
    await db`DELETE FROM obey_chat_messages`;
    return true;
  } catch (err) {
    console.warn("dbClearChatMessages error:", err);
    return false;
  }
}

// ==============================================================
// GUEST OMNICHANNEL CONVERSATION MEMORY (WHATSAPP, TELEGRAM, WEB)
// ==============================================================
export async function createGuestChatTables() {
  const db = getSql();
  if (!db) return;
  try {
    await db`
      CREATE TABLE IF NOT EXISTS guest_chat_messages (
        id           TEXT PRIMARY KEY,
        phone_number TEXT NOT NULL,
        sender_name  TEXT,
        channel      TEXT DEFAULT 'whatsapp',
        role         TEXT NOT NULL,
        content      TEXT NOT NULL,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await db`
      ALTER TABLE guest_chat_messages ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp'
    `;
    await db`
      CREATE INDEX IF NOT EXISTS idx_guest_chat_phone ON guest_chat_messages (phone_number, created_at ASC)
    `;
  } catch (err) {
    console.warn("createGuestChatTables error:", err);
  }
}

export async function dbAddGuestMessage(params: {
  id: string;
  phone_number: string;
  sender_name?: string;
  channel?: "whatsapp" | "telegram" | "web";
  role: "user" | "assistant";
  content: string;
}) {
  const db = getSql();
  if (!db) return null;
  try {
    await createGuestChatTables();
    const channel = params.channel || "whatsapp";
    const [row] = await db`
      INSERT INTO guest_chat_messages (id, phone_number, sender_name, channel, role, content)
      VALUES (${params.id}, ${params.phone_number}, ${params.sender_name || null}, ${channel}, ${params.role}, ${params.content})
      RETURNING *
    `;
    return row;
  } catch (e) {
    console.warn("dbAddGuestMessage fallback:", e);
    return null;
  }
}

export async function dbGetGuestMessages(phoneNumber: string, limit: number = 50) {
  const db = getSql();
  if (!db) return [];
  try {
    await createGuestChatTables();
    const rows = await db`
      SELECT id, phone_number, sender_name, channel, role, content, created_at
      FROM guest_chat_messages
      WHERE phone_number = ${phoneNumber}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows ? [...rows].reverse() : [];
  } catch (e) {
    console.warn("dbGetGuestMessages fallback:", e);
    return [];
  }
}

export async function dbGetRecentActiveGuestNumber(withinMinutes: number = 30): Promise<string | null> {
  const db = getSql();
  if (!db) return null;
  try {
    await createGuestChatTables();
    // 1. First priority: Guest whose recent chat mentions calling or WebRTC link
    const callIntentRows = await db`
      SELECT phone_number
      FROM guest_chat_messages
      WHERE phone_number NOT IN ('2348120934828', '+2348120934828', 'femi', 'admin')
        AND created_at >= NOW() - (${withinMinutes} || ' minutes')::interval
        AND (content ILIKE '%call%' OR content ILIKE '%webrtc%' OR content ILIKE '%/call%')
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (callIntentRows && callIntentRows.length > 0) {
      return callIntentRows[0].phone_number;
    }

    // 2. Second priority: Any recent guest who messaged within the last 15 minutes
    const recentRows = await db`
      SELECT phone_number
      FROM guest_chat_messages
      WHERE phone_number NOT IN ('2348120934828', '+2348120934828', 'femi', 'admin')
        AND created_at >= NOW() - INTERVAL '15 minutes'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (recentRows && recentRows.length > 0) {
      return recentRows[0].phone_number;
    }
    return null;
  } catch (err) {
    console.warn("dbGetRecentActiveGuestNumber fallback:", err);
    return null;
  }
}

export async function dbGetInboxThreads() {
  const db = getSql();
  if (!db) return [];
  try {
    await createGuestChatTables();
    const rows = await db`
      SELECT 
        phone_number AS contact_id,
        MAX(sender_name) AS sender_name,
        COALESCE(MAX(channel), 'whatsapp') AS channel,
        COUNT(*)::int AS total_messages,
        MAX(created_at) AS last_message_at,
        (
          SELECT content 
          FROM guest_chat_messages sub 
          WHERE sub.phone_number = guest_chat_messages.phone_number 
          ORDER BY sub.created_at DESC 
          LIMIT 1
        ) AS last_message,
        (
          SELECT role 
          FROM guest_chat_messages sub 
          WHERE sub.phone_number = guest_chat_messages.phone_number 
          ORDER BY sub.created_at DESC 
          LIMIT 1
        ) AS last_role
      FROM guest_chat_messages
      GROUP BY phone_number
      ORDER BY MAX(created_at) DESC
    `;
    return rows;
  } catch (e) {
    console.warn("dbGetInboxThreads error:", e);
    return [];
  }
}

export async function dbGetAllGuestConversations() {
  const db = getSql();
  if (!db) return [];
  try {
    await createGuestChatTables();
    const rows = await db`
      SELECT id, phone_number, sender_name, channel, role, content, created_at
      FROM guest_chat_messages
      ORDER BY phone_number, created_at ASC
    `;
    return rows;
  } catch (e) {
    console.warn("dbGetAllGuestConversations error:", e);
    return [];
  }
}

// ==============================================================
// MULTI-TENANT PERSONAL AGENT USERS & APPROVAL ACTIONS
// ==============================================================
export async function createPersonalAgentTables() {
  const db = getSql();
  if (!db) return;
  try {
    await db`
      CREATE TABLE IF NOT EXISTS personal_agent_users (
        id                 TEXT PRIMARY KEY,
        phone_number       TEXT,
        telegram_chat_id   TEXT,
        name               TEXT NOT NULL,
        email              TEXT,
        status             TEXT DEFAULT 'active',
        custom_directives  TEXT,
        gmail_connected    BOOLEAN DEFAULT false,
        approval_mode      TEXT DEFAULT 'strict',
        created_at         TIMESTAMPTZ DEFAULT NOW(),
        last_active_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await db`
      CREATE TABLE IF NOT EXISTS agent_user_actions (
        id               TEXT PRIMARY KEY,
        user_identifier  TEXT NOT NULL,
        action_type      TEXT NOT NULL,
        target_recipient TEXT NOT NULL,
        subject          TEXT,
        payload          TEXT NOT NULL,
        status           TEXT DEFAULT 'pending_approval',
        approval_code    TEXT,
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        executed_at      TIMESTAMPTZ
      )
    `;

    await db`
      CREATE INDEX IF NOT EXISTS idx_agent_user_actions_lookup 
      ON agent_user_actions (user_identifier, status, created_at DESC)
    `;
  } catch (err) {
    console.warn("createPersonalAgentTables error:", err);
  }
}

export async function dbGetOrCreatePersonalAgent(params: {
  phone?: string;
  telegramChatId?: string;
  name?: string;
}) {
  const db = getSql();
  if (!db) return null;
  try {
    await createPersonalAgentTables();
    const existing = await db`
      SELECT * FROM personal_agent_users
      WHERE phone_number = ${params.phone || null}
         OR telegram_chat_id = ${params.telegramChatId || null}
      LIMIT 1
    `;

    if (existing && existing.length > 0) {
      await db`
        UPDATE personal_agent_users
        SET last_active_at = NOW(),
            name = COALESCE(${params.name || null}, name)
        WHERE id = ${existing[0].id}
      `;
      return existing[0];
    }

    const id = `agent-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const [created] = await db`
      INSERT INTO personal_agent_users (id, phone_number, telegram_chat_id, name)
      VALUES (${id}, ${params.phone || null}, ${params.telegramChatId || null}, ${params.name || "User"})
      RETURNING *
    `;
    return created;
  } catch (err) {
    console.warn("dbGetOrCreatePersonalAgent fallback:", err);
    return null;
  }
}

export async function dbCreateUserPendingAction(params: {
  userIdentifier: string;
  actionType: "whatsapp_message" | "email_send" | "phone_call";
  targetRecipient: string;
  subject?: string;
  payload: string;
}) {
  const db = getSql();
  if (!db) return null;
  try {
    await createPersonalAgentTables();
    const id = `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const [created] = await db`
      INSERT INTO agent_user_actions (id, user_identifier, action_type, target_recipient, subject, payload, status)
      VALUES (${id}, ${params.userIdentifier}, ${params.actionType}, ${params.targetRecipient}, ${params.subject || null}, ${params.payload}, 'pending_approval')
      RETURNING *
    `;
    return created;
  } catch (err) {
    console.warn("dbCreateUserPendingAction fallback:", err);
    return null;
  }
}

export async function dbGetPendingUserAction(userIdentifier: string) {
  const db = getSql();
  if (!db) return null;
  try {
    await createPersonalAgentTables();
    const rows = await db`
      SELECT * FROM agent_user_actions
      WHERE user_identifier = ${userIdentifier}
        AND status = 'pending_approval'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return rows && rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.warn("dbGetPendingUserAction fallback:", err);
    return null;
  }
}

export async function dbUpdateUserActionStatus(id: string, status: "executed" | "rejected" | "failed") {
  const db = getSql();
  if (!db) return null;
  try {
    await createPersonalAgentTables();
    const [updated] = await db`
      UPDATE agent_user_actions
      SET status = ${status},
          executed_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return updated;
  } catch (err) {
    console.warn("dbUpdateUserActionStatus fallback:", err);
    return null;
  }
}

export async function dbGetLatestExecutedUserAction(userIdentifier: string) {
  const db = getSql();
  if (!db) return null;
  try {
    await createPersonalAgentTables();
    const rows = await db`
      SELECT * FROM agent_user_actions
      WHERE user_identifier = ${userIdentifier}
        AND status = 'executed'
      ORDER BY executed_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `;
    return rows && rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.warn("dbGetLatestExecutedUserAction fallback:", err);
    return null;
  }
}

// ==============================================================
// MULTI-TENANT WORKSPACES & BUSINESS CONTROL ROOM
// ==============================================================

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  owner_name: string;
  owner_phone: string;
  owner_email?: string | null;
  plan?: string;
  subscription_status?: string;
  whatsapp_instance_name?: string | null;
  whatsapp_status?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface WorkspaceSettings {
  workspace_id: string;
  business_bio?: string | null;
  catalog_summary?: string | null;
  voice_greeting?: string | null;
  whatsapp_welcome?: string | null;
  fallback_action?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface WorkspaceRule {
  id: string;
  workspace_id: string;
  trigger_type: "exact_match" | "contains_keyword" | "regex" | "ai_intent";
  trigger_keywords: string[];
  response_text: string;
  action: string;
  is_active: boolean;
  priority: number;
  created_at?: string;
}

export interface WorkspaceLead {
  id: string;
  workspace_id: string;
  phone: string;
  name?: string | null;
  email?: string | null;
  source: string;
  status: string;
  intent_summary?: string | null;
  last_message?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface WorkspaceCallLog {
  id: string;
  workspace_id: string;
  caller_phone?: string | null;
  caller_name?: string | null;
  vapi_call_id?: string | null;
  duration_seconds: number;
  summary?: string | null;
  transcript?: string | null;
  recording_url?: string | null;
  created_at?: string;
}

export async function createWorkspaceTables() {
  const db = getSql();
  if (!db) return;
  try {
    await db`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        owner_name TEXT NOT NULL,
        owner_phone TEXT NOT NULL,
        owner_email TEXT,
        plan TEXT DEFAULT 'starter',
        subscription_status TEXT DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await db`CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces(slug)`;
    await db`CREATE INDEX IF NOT EXISTS idx_workspaces_owner_phone ON workspaces(owner_phone)`;

    await db`
      CREATE TABLE IF NOT EXISTS workspace_settings (
        workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
        business_bio TEXT,
        catalog_summary TEXT,
        voice_greeting TEXT,
        whatsapp_welcome TEXT,
        fallback_action TEXT DEFAULT 'ai_reply',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await db`
      CREATE TABLE IF NOT EXISTS workspace_rules (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        trigger_type TEXT NOT NULL DEFAULT 'contains_keyword',
        trigger_keywords TEXT[] NOT NULL,
        response_text TEXT NOT NULL,
        action TEXT DEFAULT 'reply_only',
        is_active BOOLEAN DEFAULT TRUE,
        priority INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await db`CREATE INDEX IF NOT EXISTS idx_workspace_rules_ws ON workspace_rules(workspace_id)`;

    await db`
      CREATE TABLE IF NOT EXISTS workspace_leads (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        phone TEXT NOT NULL,
        name TEXT,
        email TEXT,
        source TEXT DEFAULT 'whatsapp',
        status TEXT DEFAULT 'lead',
        intent_summary TEXT,
        last_message TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(workspace_id, phone)
      )
    `;
    await db`CREATE INDEX IF NOT EXISTS idx_workspace_leads_ws ON workspace_leads(workspace_id)`;
    await db`CREATE INDEX IF NOT EXISTS idx_workspace_leads_phone ON workspace_leads(phone)`;

    await db`
      CREATE TABLE IF NOT EXISTS workspace_call_logs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        caller_phone TEXT,
        caller_name TEXT,
        vapi_call_id TEXT,
        duration_seconds INTEGER DEFAULT 0,
        summary TEXT,
        transcript TEXT,
        recording_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await db`CREATE INDEX IF NOT EXISTS idx_workspace_call_logs_ws ON workspace_call_logs(workspace_id)`;
  } catch (err) {
    console.warn("createWorkspaceTables warning:", err);
  }
}

export async function dbCreateWorkspace(params: {
  name: string;
  slug: string;
  owner_name: string;
  owner_phone: string;
  owner_email?: string;
  plan?: string;
}): Promise<Workspace | null> {
  const db = getSql();
  if (!db) return null;
  try {
    await createWorkspaceTables();
    const id = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const [created] = await db`
      INSERT INTO workspaces (id, name, slug, owner_name, owner_phone, owner_email, plan, subscription_status)
      VALUES (${id}, ${params.name}, ${params.slug.toLowerCase().trim()}, ${params.owner_name}, ${params.owner_phone.trim()}, ${params.owner_email || null}, ${params.plan || 'starter'}, 'active')
      RETURNING *
    `;
    // Create empty default settings
    await db`
      INSERT INTO workspace_settings (workspace_id, business_bio, catalog_summary, voice_greeting, whatsapp_welcome)
      VALUES (${id}, ${'Welcome to ' + params.name + '. We provide fast, high-quality services.'}, ${'Please ask for our available packages and pricing.'}, ${'Hello! You have reached ' + params.name + '. How can we assist you today?'}, ${'Hello! Thank you for contacting ' + params.name + '. How can we help you today?'})
      ON CONFLICT (workspace_id) DO NOTHING
    `;
    return created as Workspace;
  } catch (err) {
    console.error("dbCreateWorkspace error:", err);
    return null;
  }
}

export async function dbGetWorkspaceBySlug(slug: string): Promise<Workspace | null> {
  const db = getSql();
  if (!db) return null;
  try {
    await createWorkspaceTables();
    const rows = await db`SELECT * FROM workspaces WHERE LOWER(slug) = ${slug.toLowerCase().trim()} LIMIT 1`;
    return (rows && rows.length > 0 ? rows[0] : null) as Workspace | null;
  } catch (err) {
    console.error("dbGetWorkspaceBySlug error:", err);
    return null;
  }
}

export async function dbGetWorkspaceById(id: string): Promise<Workspace | null> {
  const db = getSql();
  if (!db) return null;
  try {
    await createWorkspaceTables();
    const rows = await db`SELECT * FROM workspaces WHERE id = ${id} LIMIT 1`;
    return (rows && rows.length > 0 ? rows[0] : null) as Workspace | null;
  } catch (err) {
    console.error("dbGetWorkspaceById error:", err);
    return null;
  }
}

export async function dbGetWorkspaceByOwnerPhone(phone: string): Promise<Workspace | null> {
  const db = getSql();
  if (!db) return null;
  try {
    await createWorkspaceTables();
    const cleanPhone = phone.replace(/\D/g, "");
    const rows = await db`
      SELECT * FROM workspaces 
      WHERE REGEXP_REPLACE(owner_phone, '\\D', '', 'g') = ${cleanPhone} 
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    return (rows && rows.length > 0 ? rows[0] : null) as Workspace | null;
  } catch (err) {
    console.error("dbGetWorkspaceByOwnerPhone error:", err);
    return null;
  }
}

export async function dbGetWorkspaceByInstanceName(instanceName: string): Promise<Workspace | null> {
  const db = getSql();
  if (!db) return null;
  try {
    await createWorkspaceTables();
    const rows = await db`
      SELECT * FROM workspaces 
      WHERE LOWER(whatsapp_instance_name) = ${instanceName.toLowerCase().trim()} 
      LIMIT 1
    `;
    return (rows && rows.length > 0 ? rows[0] : null) as Workspace | null;
  } catch (err) {
    console.error("dbGetWorkspaceByInstanceName error:", err);
    return null;
  }
}

export async function dbUpdateWorkspaceWhatsAppStatus(
  workspaceId: string,
  instanceName: string,
  status: "connected" | "connecting" | "disconnected"
): Promise<boolean> {
  const db = getSql();
  if (!db) return false;
  try {
    await db`
      UPDATE workspaces 
      SET whatsapp_instance_name = ${instanceName},
          whatsapp_status = ${status},
          updated_at = NOW()
      WHERE id = ${workspaceId}
    `;
    return true;
  } catch (err) {
    console.error("dbUpdateWorkspaceWhatsAppStatus error:", err);
    return false;
  }
}

export async function dbListWorkspaces(): Promise<Workspace[]> {
  const db = getSql();
  if (!db) return [];
  try {
    await createWorkspaceTables();
    const rows = await db`SELECT * FROM workspaces ORDER BY created_at DESC`;
    return (rows || []) as Workspace[];
  } catch (err) {
    console.error("dbListWorkspaces error:", err);
    return [];
  }
}

export async function dbGetWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettings | null> {
  const db = getSql();
  if (!db) return null;
  try {
    await createWorkspaceTables();
    const rows = await db`SELECT * FROM workspace_settings WHERE workspace_id = ${workspaceId} LIMIT 1`;
    return (rows && rows.length > 0 ? rows[0] : null) as WorkspaceSettings | null;
  } catch (err) {
    console.error("dbGetWorkspaceSettings error:", err);
    return null;
  }
}

export async function dbUpsertWorkspaceSettings(
  workspaceId: string,
  settings: Partial<WorkspaceSettings>
): Promise<WorkspaceSettings | null> {
  const db = getSql();
  if (!db) return null;
  try {
    await createWorkspaceTables();
    const [row] = await db`
      INSERT INTO workspace_settings (workspace_id, business_bio, catalog_summary, voice_greeting, whatsapp_welcome, fallback_action, updated_at)
      VALUES (
        ${workspaceId},
        ${settings.business_bio ?? null},
        ${settings.catalog_summary ?? null},
        ${settings.voice_greeting ?? null},
        ${settings.whatsapp_welcome ?? null},
        ${settings.fallback_action ?? 'ai_reply'},
        NOW()
      )
      ON CONFLICT (workspace_id) DO UPDATE SET
        business_bio = COALESCE(EXCLUDED.business_bio, workspace_settings.business_bio),
        catalog_summary = COALESCE(EXCLUDED.catalog_summary, workspace_settings.catalog_summary),
        voice_greeting = COALESCE(EXCLUDED.voice_greeting, workspace_settings.voice_greeting),
        whatsapp_welcome = COALESCE(EXCLUDED.whatsapp_welcome, workspace_settings.whatsapp_welcome),
        fallback_action = COALESCE(EXCLUDED.fallback_action, workspace_settings.fallback_action),
        updated_at = NOW()
      RETURNING *
    `;
    return row as WorkspaceSettings;
  } catch (err) {
    console.error("dbUpsertWorkspaceSettings error:", err);
    return null;
  }
}

export async function dbGetWorkspaceRules(workspaceId: string): Promise<WorkspaceRule[]> {
  const db = getSql();
  if (!db) return [];
  try {
    await createWorkspaceTables();
    const rows = await db`
      SELECT * FROM workspace_rules 
      WHERE workspace_id = ${workspaceId} 
      ORDER BY priority DESC, created_at ASC
    `;
    return (rows || []) as WorkspaceRule[];
  } catch (err) {
    console.error("dbGetWorkspaceRules error:", err);
    return [];
  }
}

export async function dbCreateWorkspaceRule(params: {
  workspace_id: string;
  trigger_type?: "exact_match" | "contains_keyword" | "regex" | "ai_intent";
  trigger_keywords: string[];
  response_text: string;
  action?: string;
  priority?: number;
}): Promise<WorkspaceRule | null> {
  const db = getSql();
  if (!db) return null;
  try {
    await createWorkspaceTables();
    const id = `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const [row] = await db`
      INSERT INTO workspace_rules (id, workspace_id, trigger_type, trigger_keywords, response_text, action, priority, is_active)
      VALUES (${id}, ${params.workspace_id}, ${params.trigger_type || 'contains_keyword'}, ${params.trigger_keywords}, ${params.response_text}, ${params.action || 'reply_only'}, ${params.priority || 0}, TRUE)
      RETURNING *
    `;
    return row as WorkspaceRule;
  } catch (err) {
    console.error("dbCreateWorkspaceRule error:", err);
    return null;
  }
}

export async function dbDeleteWorkspaceRule(id: string, workspaceId: string): Promise<boolean> {
  const db = getSql();
  if (!db) return false;
  try {
    await db`DELETE FROM workspace_rules WHERE id = ${id} AND workspace_id = ${workspaceId}`;
    return true;
  } catch (err) {
    console.error("dbDeleteWorkspaceRule error:", err);
    return false;
  }
}

export async function dbUpsertWorkspaceLead(params: {
  workspace_id: string;
  phone: string;
  name?: string | null;
  email?: string | null;
  source?: string;
  status?: string;
  intent_summary?: string | null;
  last_message?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<WorkspaceLead | null> {
  const db = getSql();
  if (!db) return null;
  try {
    await createWorkspaceTables();
    const cleanPhone = params.phone.replace(/\D/g, "");
    const id = `lead_${cleanPhone}_${params.workspace_id}`;
    const [row] = await db`
      INSERT INTO workspace_leads (id, workspace_id, phone, name, email, source, status, intent_summary, last_message, metadata, updated_at)
      VALUES (
        ${id},
        ${params.workspace_id},
        ${cleanPhone},
        ${params.name || null},
        ${params.email || null},
        ${params.source || 'whatsapp'},
        ${params.status || 'lead'},
        ${params.intent_summary || null},
        ${params.last_message || null},
        ${params.metadata ? JSON.stringify(params.metadata) : '{}'},
        NOW()
      )
      ON CONFLICT (workspace_id, phone) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, workspace_leads.name),
        email = COALESCE(EXCLUDED.email, workspace_leads.email),
        source = COALESCE(EXCLUDED.source, workspace_leads.source),
        status = COALESCE(EXCLUDED.status, workspace_leads.status),
        intent_summary = COALESCE(EXCLUDED.intent_summary, workspace_leads.intent_summary),
        last_message = COALESCE(EXCLUDED.last_message, workspace_leads.last_message),
        metadata = workspace_leads.metadata || EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING *
    `;
    return row as WorkspaceLead;
  } catch (err) {
    console.error("dbUpsertWorkspaceLead error:", err);
    return null;
  }
}

export async function dbGetWorkspaceLeads(workspaceId: string): Promise<WorkspaceLead[]> {
  const db = getSql();
  if (!db) return [];
  try {
    await createWorkspaceTables();
    const rows = await db`
      SELECT * FROM workspace_leads 
      WHERE workspace_id = ${workspaceId} 
      ORDER BY updated_at DESC, created_at DESC
    `;
    return (rows || []) as WorkspaceLead[];
  } catch (err) {
    console.error("dbGetWorkspaceLeads error:", err);
    return [];
  }
}

export async function dbAddWorkspaceCallLog(params: {
  workspace_id: string;
  caller_phone?: string | null;
  caller_name?: string | null;
  vapi_call_id?: string | null;
  duration_seconds?: number;
  summary?: string | null;
  transcript?: string | null;
  recording_url?: string | null;
}): Promise<WorkspaceCallLog | null> {
  const db = getSql();
  if (!db) return null;
  try {
    await createWorkspaceTables();
    const id = `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const [row] = await db`
      INSERT INTO workspace_call_logs (id, workspace_id, caller_phone, caller_name, vapi_call_id, duration_seconds, summary, transcript, recording_url)
      VALUES (${id}, ${params.workspace_id}, ${params.caller_phone || null}, ${params.caller_name || null}, ${params.vapi_call_id || null}, ${params.duration_seconds || 0}, ${params.summary || null}, ${params.transcript || null}, ${params.recording_url || null})
      RETURNING *
    `;
    return row as WorkspaceCallLog;
  } catch (err) {
    console.error("dbAddWorkspaceCallLog error:", err);
    return null;
  }
}

export async function dbGetWorkspaceCallLogs(workspaceId: string): Promise<WorkspaceCallLog[]> {
  const db = getSql();
  if (!db) return [];
  try {
    await createWorkspaceTables();
    const rows = await db`
      SELECT * FROM workspace_call_logs 
      WHERE workspace_id = ${workspaceId} 
      ORDER BY created_at DESC
    `;
    return (rows || []) as WorkspaceCallLog[];
  } catch (err) {
    console.error("dbGetWorkspaceCallLogs error:", err);
    return [];
  }
}


