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

export async function dbGetLeadById(id: string) {
  try {
    const [row] = await sql`SELECT * FROM leads WHERE id = ${id} LIMIT 1`;
    return row || null;
  } catch (err) {
    console.warn("dbGetLeadById error:", err);
    return null;
  }
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

export async function dbUpdateUserActionStatus(id: string, status: "executed" | "rejected" | "failed" | "expired" | "cancelled") {
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
  trial_ends_at?: string | null;
  owner_clerk_id?: string | null;
  whatsapp_instance_name?: string | null;
  whatsapp_status?: string | null;
  auto_view_status?: boolean;
  auto_comment_status?: boolean;
  comment_tone?: string;
  comment_rate_limit?: string;
  auto_save_contacts?: boolean;
  status_excluded_phones?: StatusExcludedContact[];
  bot_bypass?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface StatusExcludedContact {
  phone: string;
  name?: string;
  reason?: string;
  excluded_at?: string;
}

export interface WorkspaceSettings {
  workspace_id: string;
  business_bio?: string | null;
  catalog_summary?: string | null;
  voice_greeting?: string | null;
  whatsapp_welcome?: string | null;
  fallback_action?: string | null;
  voice_id?: string | null;
  voice_personality?: string | null;
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
  is_saved?: boolean;
  auto_save?: boolean;
  profile_pic_url?: string | null;
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

    // Ensure trial_ends_at and owner_clerk_id columns exist
    await db`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'`;
    await db`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS owner_clerk_id TEXT`;
    await db`CREATE INDEX IF NOT EXISTS idx_workspaces_owner_clerk_id ON workspaces(owner_clerk_id)`;

    // Ensure platform_pricing table exists
    await db`
      CREATE TABLE IF NOT EXISTS platform_pricing (
        id TEXT PRIMARY KEY DEFAULT 'default',
        starter_price INTEGER DEFAULT 9500,
        pro_price INTEGER DEFAULT 22500,
        enterprise_price INTEGER DEFAULT 55000,
        trial_days INTEGER DEFAULT 7,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await db`
      INSERT INTO platform_pricing (id, starter_price, pro_price, enterprise_price, trial_days)
      VALUES ('default', 9500, 22500, 55000, 7)
      ON CONFLICT (id) DO NOTHING
    `;

    // Ensure status auto-view, auto-comment, tone, and rate limit columns exist in workspaces
    await db`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS auto_view_status BOOLEAN DEFAULT TRUE`;
    await db`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS auto_comment_status BOOLEAN DEFAULT FALSE`;
    await db`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS comment_tone TEXT DEFAULT 'friendly'`;
    await db`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS comment_rate_limit TEXT DEFAULT 'plan_based'`;
    await db`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS auto_save_contacts BOOLEAN DEFAULT TRUE`;
    await db`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS status_excluded_phones JSONB DEFAULT '[]'`;
    await db`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS bot_bypass BOOLEAN DEFAULT FALSE`;

    // Ensure contact auto-save and phone status columns exist in workspace_leads
    await db`ALTER TABLE workspace_leads ADD COLUMN IF NOT EXISTS is_saved BOOLEAN DEFAULT FALSE`;
    await db`ALTER TABLE workspace_leads ADD COLUMN IF NOT EXISTS auto_save BOOLEAN DEFAULT TRUE`;
    await db`ALTER TABLE workspace_leads ADD COLUMN IF NOT EXISTS profile_pic_url TEXT`;

    // Ensure workspace_status_comments table exists for tracking viewed/replied WhatsApp statuses
    await db`
      CREATE TABLE IF NOT EXISTS workspace_status_comments (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        instance_name TEXT,
        poster_phone TEXT NOT NULL,
        status_id TEXT,
        status_text TEXT,
        comment_sent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await db`CREATE INDEX IF NOT EXISTS idx_status_comments_poster ON workspace_status_comments(poster_phone)`;

    // Ensure workspace_statuses table exists for publishing and scheduling WhatsApp Status stories
    await db`
      CREATE TABLE IF NOT EXISTS workspace_statuses (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        content TEXT,
        media_url TEXT,
        media_type TEXT DEFAULT 'text',
        background_color TEXT DEFAULT '#075E54',
        text_color TEXT DEFAULT '#FFFFFF',
        font INTEGER DEFAULT 1,
        status TEXT DEFAULT 'posted',
        error_message TEXT,
        message_id TEXT,
        view_count INTEGER DEFAULT 0,
        scheduled_at TIMESTAMPTZ,
        posted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await db`CREATE INDEX IF NOT EXISTS idx_workspace_statuses_ws ON workspace_statuses(workspace_id)`;
    await db`CREATE INDEX IF NOT EXISTS idx_workspace_statuses_sched ON workspace_statuses(status, scheduled_at)`;
    await db`ALTER TABLE workspace_statuses ADD COLUMN IF NOT EXISTS background_color TEXT DEFAULT '#075E54'`;
    await db`ALTER TABLE workspace_statuses ADD COLUMN IF NOT EXISTS text_color TEXT DEFAULT '#FFFFFF'`;
    await db`ALTER TABLE workspace_statuses ADD COLUMN IF NOT EXISTS font INTEGER DEFAULT 1`;
    await db`ALTER TABLE workspace_statuses ADD COLUMN IF NOT EXISTS message_id TEXT`;
    await db`ALTER TABLE workspace_statuses ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0`;
    await db`ALTER TABLE workspace_statuses ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ`;
    await db`ALTER TABLE workspace_statuses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`;

    // Ensure workspace_contact_buckets table exists for custom contact lists / buckets
    await db`
      CREATE TABLE IF NOT EXISTS workspace_contact_buckets (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        contact_phones JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await db`CREATE INDEX IF NOT EXISTS idx_workspace_buckets_ws ON workspace_contact_buckets(workspace_id)`;
  } catch (err) {
    console.warn("createWorkspaceTables warning:", err);
  }
}

export function getPlanScheduledPostLimit(plan?: string): number {
  const p = (plan || "starter").toLowerCase();
  if (p === "enterprise" || p === "founder" || p === "lifetime") return 999999;
  if (p === "pro") return 10;
  return 3;
}

export function getPlanBucketLimit(plan?: string): number {
  const p = (plan || "starter").toLowerCase();
  if (p === "enterprise" || p === "founder" || p === "lifetime") return 999999;
  if (p === "pro") return 10;
  return 2;
}

export interface ContactBucket {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  contact_phones: string[];
  created_at: string;
  updated_at: string;
}

export async function dbCreateContactBucket(params: {
  workspaceId: string;
  name: string;
  phones: string[];
  description?: string;
}): Promise<ContactBucket | null> {
  const db = getSql();
  if (!db) return null;
  try {
    await createWorkspaceTables();
    const id = `bkt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const cleanedPhones = Array.from(
      new Set(params.phones.map((p) => p.replace(/\D/g, "")).filter((p) => p.length >= 8))
    );
    const [row] = await db`
      INSERT INTO workspace_contact_buckets (
        id, workspace_id, name, description, contact_phones, created_at, updated_at
      ) VALUES (
        ${id},
        ${params.workspaceId},
        ${params.name.trim()},
        ${params.description ? params.description.trim() : null},
        ${JSON.stringify(cleanedPhones)}::jsonb,
        NOW(),
        NOW()
      )
      RETURNING *
    `;
    if (!row) return null;
    return {
      ...row,
      contact_phones: Array.isArray(row.contact_phones)
        ? row.contact_phones
        : typeof row.contact_phones === "string"
        ? JSON.parse(row.contact_phones)
        : [],
    } as ContactBucket;
  } catch (err) {
    console.error("dbCreateContactBucket error:", err);
    return null;
  }
}

export async function dbGetContactBuckets(workspaceId: string): Promise<ContactBucket[]> {
  const db = getSql();
  if (!db) return [];
  try {
    await createWorkspaceTables();
    const rows = await db`
      SELECT * FROM workspace_contact_buckets
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at ASC
    `;
    return (rows || []).map((r: any) => ({
      ...r,
      contact_phones: Array.isArray(r.contact_phones)
        ? r.contact_phones
        : typeof r.contact_phones === "string"
        ? JSON.parse(r.contact_phones)
        : [],
    })) as ContactBucket[];
  } catch (err) {
    console.error("dbGetContactBuckets error:", err);
    return [];
  }
}

export async function dbGetContactBucketById(bucketId: string): Promise<ContactBucket | null> {
  const db = getSql();
  if (!db) return null;
  try {
    await createWorkspaceTables();
    const rows = await db`
      SELECT * FROM workspace_contact_buckets
      WHERE id = ${bucketId}
      LIMIT 1
    `;
    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    return {
      ...r,
      contact_phones: Array.isArray(r.contact_phones)
        ? r.contact_phones
        : typeof r.contact_phones === "string"
        ? JSON.parse(r.contact_phones)
        : [],
    } as ContactBucket;
  } catch (err) {
    console.error("dbGetContactBucketById error:", err);
    return null;
  }
}

export async function dbFindBucketByName(
  workspaceId: string,
  bucketName: string
): Promise<ContactBucket | null> {
  const db = getSql();
  if (!db) return null;
  try {
    await createWorkspaceTables();
    const cleanName = bucketName.trim().toLowerCase();
    const rows = await db`
      SELECT * FROM workspace_contact_buckets
      WHERE workspace_id = ${workspaceId}
        AND (
          LOWER(name) = ${cleanName}
          OR LOWER(name) LIKE ${`%${cleanName}%`}
        )
      ORDER BY 
        CASE WHEN LOWER(name) = ${cleanName} THEN 0 ELSE 1 END,
        created_at ASC
      LIMIT 1
    `;
    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    return {
      ...r,
      contact_phones: Array.isArray(r.contact_phones)
        ? r.contact_phones
        : typeof r.contact_phones === "string"
        ? JSON.parse(r.contact_phones)
        : [],
    } as ContactBucket;
  } catch (err) {
    console.error("dbFindBucketByName error:", err);
    return null;
  }
}

export async function dbUpdateContactBucket(params: {
  bucketId: string;
  workspaceId: string;
  name?: string;
  description?: string;
  phones?: string[];
}): Promise<ContactBucket | null> {
  const db = getSql();
  if (!db) return null;
  try {
    await createWorkspaceTables();
    const cleanedPhones = params.phones
      ? Array.from(
          new Set(params.phones.map((p) => p.replace(/\D/g, "")).filter((p) => p.length >= 8))
        )
      : undefined;

    const [row] = await db`
      UPDATE workspace_contact_buckets
      SET name = COALESCE(${params.name ? params.name.trim() : null}, name),
          description = COALESCE(${params.description ? params.description.trim() : null}, description),
          contact_phones = COALESCE(${cleanedPhones ? JSON.stringify(cleanedPhones) : null}::jsonb, contact_phones),
          updated_at = NOW()
      WHERE id = ${params.bucketId} AND workspace_id = ${params.workspaceId}
      RETURNING *
    `;
    if (!row) return null;
    return {
      ...row,
      contact_phones: Array.isArray(row.contact_phones)
        ? row.contact_phones
        : typeof row.contact_phones === "string"
        ? JSON.parse(row.contact_phones)
        : [],
    } as ContactBucket;
  } catch (err) {
    console.error("dbUpdateContactBucket error:", err);
    return null;
  }
}

export async function dbDeleteContactBucket(
  bucketId: string,
  workspaceId: string
): Promise<boolean> {
  const db = getSql();
  if (!db) return false;
  try {
    await createWorkspaceTables();
    await db`
      DELETE FROM workspace_contact_buckets
      WHERE id = ${bucketId} AND workspace_id = ${workspaceId}
    `;
    return true;
  } catch (err) {
    console.error("dbDeleteContactBucket error:", err);
    return false;
  }
}

export interface ContactMatch {
  name: string;
  phone: string;
  formattedPhone: string;
  source: string;
}

export async function dbGetContactsOverview(params: {
  workspaceId: string;
  instanceName?: string;
}): Promise<{
  totalContacts: number;
  totalLeads: number;
  sampleContacts: ContactMatch[];
}> {
  const db = getSql();
  if (!db) return { totalContacts: 0, totalLeads: 0, sampleContacts: [] };

  let instName = params.instanceName;
  if (!instName && params.workspaceId) {
    if (params.workspaceId === "ws_femi_default" || params.workspaceId === "femi-adeleke") {
      instName = "obey";
    } else {
      const ws = await dbGetWorkspaceById(params.workspaceId);
      instName = ws?.whatsapp_instance_name || undefined;
    }
  }
  if (!instName) {
    instName = "obey";
  }

  try {
    await createWorkspaceTables();

    // 1. Count distinct WhatsApp contacts for the instance
    const waCountRows = await db`
      SELECT COUNT(DISTINCT c."remoteJid")::int as total
      FROM evolution."Contact" c
      JOIN evolution."Instance" i ON c."instanceId" = i.id
      WHERE i.name = ${instName}
        AND c."remoteJid" LIKE '%@s.whatsapp.net'
        AND c."remoteJid" NOT LIKE '0@%'
    `;
    const totalContacts = waCountRows?.[0]?.total || 0;

    // 2. Count CRM leads
    const leadCountRows = await db`
      SELECT COUNT(*)::int as total
      FROM workspace_leads
      WHERE workspace_id = ${params.workspaceId}
    `;
    const totalLeads = leadCountRows?.[0]?.total || 0;

    // 3. Fetch recent named contacts
    const sampleRows = await db`
      SELECT c."remoteJid", c."pushName"
      FROM (
        SELECT DISTINCT ON (c."remoteJid") c."remoteJid", c."pushName", c."updatedAt"
        FROM evolution."Contact" c
        JOIN evolution."Instance" i ON c."instanceId" = i.id
        WHERE i.name = ${instName}
          AND c."remoteJid" LIKE '%@s.whatsapp.net'
          AND c."remoteJid" NOT LIKE '0@%'
          AND c."pushName" IS NOT NULL
          AND TRIM(c."pushName") != ''
        ORDER BY c."remoteJid", c."updatedAt" DESC NULLS LAST
      ) c
      ORDER BY c."updatedAt" DESC NULLS LAST
      LIMIT 10
    `;

    const sampleContacts: ContactMatch[] = sampleRows.map((r: any) => {
      const phone = (r.remoteJid || "").replace(/\D/g, "");
      return {
        name: r.pushName || `Contact ${phone.slice(-4)}`,
        phone,
        formattedPhone: phone.startsWith("234")
          ? `+234 ${phone.slice(3, 6)} ${phone.slice(6, 9)} ${phone.slice(9)}`
          : `+${phone}`,
        source: "whatsapp_phone",
      };
    });

    return { totalContacts, totalLeads, sampleContacts };
  } catch (err) {
    console.warn("dbGetContactsOverview error:", err);
    return { totalContacts: 0, totalLeads: 0, sampleContacts: [] };
  }
}

export async function dbFindContactsByNameOrPhone(params: {
  workspaceId: string;
  query: string;
  instanceName?: string;
}): Promise<ContactMatch[]> {
  const db = getSql();
  const q = (params.query || "").toLowerCase().trim();
  let instName = params.instanceName;
  if (!instName && params.workspaceId) {
    if (params.workspaceId === "ws_femi_default" || params.workspaceId === "femi-adeleke") {
      instName = "obey";
    } else {
      const ws = await dbGetWorkspaceById(params.workspaceId);
      instName = ws?.whatsapp_instance_name || undefined;
    }
  }
  if (!instName) {
    instName = "obey";
  }

  const resultsMap = new Map<string, ContactMatch>();
  if (!db) return [];

  try {
    await createWorkspaceTables();
    const cleanDigits = q.replace(/\D/g, "");
    const isWildcard = !q || q === "*" || q === "all" || q === "list";

    // 1. Direct query into evolution."Contact" (Neon Postgres)
    try {
      let evoRows: any[] = [];
      if (isWildcard) {
        evoRows = await db`
          SELECT c."remoteJid", c."pushName"
          FROM (
            SELECT DISTINCT ON (c."remoteJid") c."remoteJid", c."pushName", c."updatedAt"
            FROM evolution."Contact" c
            JOIN evolution."Instance" i ON c."instanceId" = i.id
            WHERE i.name = ${instName}
              AND c."remoteJid" LIKE '%@s.whatsapp.net'
              AND c."remoteJid" NOT LIKE '0@%'
              AND c."pushName" IS NOT NULL
              AND TRIM(c."pushName") != ''
            ORDER BY c."remoteJid", c."updatedAt" DESC NULLS LAST
          ) c
          ORDER BY c."updatedAt" DESC NULLS LAST
          LIMIT 25
        `;
      } else {
        evoRows = await db`
          SELECT c."remoteJid", c."pushName"
          FROM evolution."Contact" c
          JOIN evolution."Instance" i ON c."instanceId" = i.id
          WHERE i.name = ${instName}
            AND c."remoteJid" LIKE '%@s.whatsapp.net'
            AND c."remoteJid" NOT LIKE '0@%'
            AND (
              LOWER(COALESCE(c."pushName", '')) LIKE ${`%${q}%`}
              OR (${cleanDigits.length >= 3} AND c."remoteJid" LIKE ${`%${cleanDigits}%`})
            )
          ORDER BY c."updatedAt" DESC NULLS LAST
          LIMIT 25
        `;
      }

      for (const row of evoRows) {
        const phone = (row.remoteJid || "").replace(/\D/g, "");
        if (phone && phone.length >= 8) {
          const name = (row.pushName || "").trim() || `Contact ${phone.slice(-4)}`;
          resultsMap.set(phone, {
            name,
            phone,
            formattedPhone: phone.startsWith("234")
              ? `+234 ${phone.slice(3, 6)} ${phone.slice(6, 9)} ${phone.slice(9)}`
              : `+${phone}`,
            source: "whatsapp_phone",
          });
        }
      }
    } catch (evoErr) {
      console.warn("dbFindContactsByNameOrPhone evolution query warning:", evoErr);
    }

    // 2. Query workspace_leads
    try {
      let leadRows: any[] = [];
      if (isWildcard) {
        leadRows = await db`
          SELECT name, phone FROM workspace_leads
          WHERE workspace_id = ${params.workspaceId}
          ORDER BY created_at DESC
          LIMIT 25
        `;
      } else {
        leadRows = await db`
          SELECT name, phone FROM workspace_leads
          WHERE workspace_id = ${params.workspaceId}
            AND (
              LOWER(COALESCE(name, '')) LIKE ${`%${q}%`}
              OR (${cleanDigits.length >= 3} AND phone LIKE ${`%${cleanDigits}%`})
            )
          ORDER BY created_at DESC
          LIMIT 25
        `;
      }

      for (const r of leadRows) {
        const clean = (r.phone || "").replace(/\D/g, "");
        if (clean && clean.length >= 8) {
          const existing = resultsMap.get(clean);
          const name = r.name || existing?.name || `Contact ${clean.slice(-4)}`;
          resultsMap.set(clean, {
            name,
            phone: clean,
            formattedPhone: clean.startsWith("234")
              ? `+234 ${clean.slice(3, 6)} ${clean.slice(6, 9)} ${clean.slice(9)}`
              : `+${clean}`,
            source: existing ? existing.source : "crm_leads",
          });
        }
      }
    } catch (leadErr) {
      console.warn("dbFindContactsByNameOrPhone lead query warning:", leadErr);
    }
  } catch (e) {
    console.warn("dbFindContactsByNameOrPhone general error:", e);
  }

  return Array.from(resultsMap.values());
}

export async function dbGetWorkspaceStatuses(workspaceId: string, limit: number = 50) {
  const db = getSql();
  if (!db) return [];
  try {
    await createWorkspaceTables();
    const rows = await db`
      SELECT * FROM workspace_statuses
      WHERE workspace_id = ${workspaceId} AND status != 'deleted'
      ORDER BY 
        CASE WHEN status = 'scheduled' THEN 0 ELSE 1 END,
        COALESCE(scheduled_at, posted_at, created_at) DESC
      LIMIT ${limit}
    `;
    return rows || [];
  } catch (err) {
    console.error("dbGetWorkspaceStatuses error:", err);
    return [];
  }
}

export async function dbGetScheduledStatusesCount(workspaceId: string): Promise<number> {
  const db = getSql();
  if (!db) return 0;
  try {
    await createWorkspaceTables();
    const rows = await db`
      SELECT COUNT(*)::int as count FROM workspace_statuses
      WHERE workspace_id = ${workspaceId} AND status = 'scheduled'
    `;
    return rows?.[0]?.count || 0;
  } catch {
    return 0;
  }
}

export async function dbGetDueScheduledStatuses(): Promise<any[]> {
  const db = getSql();
  if (!db) return [];
  try {
    await createWorkspaceTables();
    const rows = await db`
      SELECT s.*, w.whatsapp_instance_name, w.slug as workspace_slug, w.name as workspace_name, w.owner_phone
      FROM workspace_statuses s
      JOIN workspaces w ON s.workspace_id = w.id
      WHERE s.status = 'scheduled'
        AND s.scheduled_at IS NOT NULL
        AND s.scheduled_at <= NOW()
      ORDER BY s.scheduled_at ASC
      LIMIT 15
    `;
    return rows || [];
  } catch (err) {
    console.error("dbGetDueScheduledStatuses error:", err);
    return [];
  }
}

export async function dbMarkStatusPosted(statusId: string, messageId?: string) {
  const db = getSql();
  if (!db) return;
  try {
    await db`
      UPDATE workspace_statuses
      SET status = 'posted',
          posted_at = NOW(),
          message_id = COALESCE(${messageId || null}, message_id),
          updated_at = NOW()
      WHERE id = ${statusId}
    `;
  } catch (err) {
    console.error("dbMarkStatusPosted error:", err);
  }
}

export async function dbDeleteStatusPost(statusId: string, workspaceId: string) {
  const db = getSql();
  if (!db) return null;
  try {
    await createWorkspaceTables();
    const [row] = await db`
      DELETE FROM workspace_statuses
      WHERE id = ${statusId} AND (workspace_id = ${workspaceId} OR ${workspaceId} = 'all')
      RETURNING *
    `;
    return row;
  } catch (err) {
    console.error("dbDeleteStatusPost error:", err);
    return null;
  }
}

export async function dbRecordStatusComment(params: {
  workspace_id?: string | null;
  instance_name?: string | null;
  poster_phone: string;
  status_id?: string | null;
  status_text?: string | null;
  comment_sent: string;
}) {
  const db = getSql();
  if (!db) return null;
  try {
    const id = `stat_cmt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const [row] = await db`
      INSERT INTO workspace_status_comments (id, workspace_id, instance_name, poster_phone, status_id, status_text, comment_sent)
      VALUES (${id}, ${params.workspace_id || null}, ${params.instance_name || null}, ${params.poster_phone}, ${params.status_id || null}, ${params.status_text || null}, ${params.comment_sent})
      RETURNING *
    `;
    return row;
  } catch (e) {
    console.warn("[Status Comments] dbRecordStatusComment error:", e);
    return null;
  }
}

export async function dbHasRecentStatusComment(
  posterPhone: string,
  hours: number = 12,
  workspaceId?: string | null,
  instanceName?: string | null
): Promise<boolean> {
  const db = getSql();
  if (!db) return false;
  try {
    if (hours <= 0) {
      // For unlimited: 2-minute safety debounce per contact so rapid multi-story dumps don't get flooded
      const rows = await db`
        SELECT id FROM workspace_status_comments
        WHERE poster_phone = ${posterPhone}
          AND (${!workspaceId && !instanceName} OR workspace_id = ${workspaceId || null} OR instance_name = ${instanceName || null})
          AND created_at > NOW() - INTERVAL '2 minutes'
        LIMIT 1
      `;
      return Boolean(rows && rows.length > 0);
    }
    const rows = await db`
      SELECT id FROM workspace_status_comments
      WHERE poster_phone = ${posterPhone}
        AND (${!workspaceId && !instanceName} OR workspace_id = ${workspaceId || null} OR instance_name = ${instanceName || null})
        AND created_at > NOW() - (${hours} || ' hours')::INTERVAL
      LIMIT 1
    `;
    return Boolean(rows && rows.length > 0);
  } catch {
    return false;
  }
}

export async function dbGetStatusCommentsTodayCount(workspaceIdOrInstance: string): Promise<number> {
  const db = getSql();
  if (!db) return 0;
  try {
    const rows = await db`
      SELECT COUNT(*)::int as count FROM workspace_status_comments
      WHERE (workspace_id = ${workspaceIdOrInstance} OR instance_name = ${workspaceIdOrInstance})
        AND created_at > NOW() - INTERVAL '24 hours'
    `;
    return rows?.[0]?.count || 0;
  } catch {
    return 0;
  }
}

export async function dbCreateWorkspace(params: {
  name: string;
  slug: string;
  owner_name: string;
  owner_phone: string;
  owner_email?: string;
  owner_clerk_id?: string;
  plan?: string;
}): Promise<Workspace | null> {
  const db = getSql();
  if (!db) return null;
  try {
    await createWorkspaceTables();
    const pricing = await dbGetPlatformPricing();
    const trialDays = pricing.trial_days || 7;
    const id = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const selectedPlan = (params.plan === 'trial' || !params.plan) ? 'pro' : params.plan;
    const [created] = await db`
      INSERT INTO workspaces (id, name, slug, owner_name, owner_phone, owner_email, owner_clerk_id, plan, subscription_status, trial_ends_at)
      VALUES (
        ${id},
        ${params.name},
        ${params.slug.toLowerCase().trim()},
        ${params.owner_name},
        ${params.owner_phone.trim()},
        ${params.owner_email || null},
        ${params.owner_clerk_id || null},
        ${selectedPlan},
        'trial',
        NOW() + (${trialDays + ' days'})::interval
      )
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

export async function dbGetWorkspacesByOwnerClerkId(
  clerkId: string,
  email?: string,
  phone?: string
): Promise<Workspace[]> {
  const db = getSql();
  if (!db) return [];
  try {
    await createWorkspaceTables();
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanPhone = (phone || "").trim().replace(/[^0-9]/g, "");

    const isFemi = cleanEmail === "femiadeleke2020@gmail.com" || cleanEmail === "femiadeleke.work@gmail.com";

    const rows = await db`
      SELECT * FROM workspaces
      WHERE owner_clerk_id = ${clerkId}
         OR (${cleanEmail} != '' AND LOWER(COALESCE(owner_email, '')) = ${cleanEmail})
         OR (${cleanPhone} != '' AND REGEXP_REPLACE(owner_phone, '\\D', '', 'g') = ${cleanPhone})
         OR (${isFemi} AND slug = 'femi-adeleke')
      ORDER BY created_at DESC
    `;

    // Auto-backfill owner_clerk_id if matched by email or phone
    if (rows && rows.length > 0) {
      for (const ws of rows) {
        if (!ws.owner_clerk_id) {
          await db`UPDATE workspaces SET owner_clerk_id = ${clerkId} WHERE id = ${ws.id}`;
          ws.owner_clerk_id = clerkId;
        }
      }
    }

    return (rows || []) as Workspace[];
  } catch (err) {
    console.error("dbGetWorkspacesByOwnerClerkId error:", err);
    return [];
  }
}

export async function dbClaimWorkspaceForClerkUser(
  slug: string,
  clerkId: string,
  email?: string
): Promise<Workspace | null> {
  const db = getSql();
  if (!db) return null;
  try {
    await createWorkspaceTables();
    const cleanSlug = slug.toLowerCase().trim();
    const rows = await db`
      UPDATE workspaces
      SET owner_clerk_id = ${clerkId},
          owner_email = COALESCE(owner_email, ${email || null})
      WHERE LOWER(slug) = ${cleanSlug}
        AND (owner_clerk_id IS NULL OR owner_clerk_id = ${clerkId})
      RETURNING *
    `;
    return rows && rows.length > 0 ? (rows[0] as Workspace) : null;
  } catch (err) {
    console.error("dbClaimWorkspaceForClerkUser error:", err);
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
  if (!db || !instanceName) return null;
  try {
    await createWorkspaceTables();
    const clean = instanceName.toLowerCase().trim();
    // 1. Direct match on whatsapp_instance_name
    let rows = await db`
      SELECT * FROM workspaces 
      WHERE LOWER(whatsapp_instance_name) = ${clean} 
      LIMIT 1
    `;
    if (rows && rows.length > 0) return rows[0] as Workspace;

    // 2. Check if clean instanceName is an Evolution instance UUID, name, or phone number in evolution."Instance"
    try {
      const evoInstances = await db`
        SELECT name, "ownerJid" FROM evolution."Instance"
        WHERE id = ${clean} 
           OR LOWER(name) = ${clean} 
           OR "ownerJid" LIKE ${`%${clean}%`}
        LIMIT 1
      `;
      if (evoInstances && evoInstances.length > 0) {
        const evoName = evoInstances[0].name.toLowerCase().trim();
        rows = await db`
          SELECT * FROM workspaces 
          WHERE LOWER(whatsapp_instance_name) = ${evoName} 
          LIMIT 1
        `;
        if (rows && rows.length > 0) return rows[0] as Workspace;
      }
    } catch {}

    return null;
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

export async function dbUpdateWorkspaceProfile(
  idOrSlug: string,
  params: {
    owner_name?: string;
    owner_phone?: string;
    name?: string;
  }
): Promise<Workspace | null> {
  const db = getSql();
  if (!db) return null;
  try {
    let cleanPhone = params.owner_phone ? params.owner_phone.replace(/\D/g, "") : undefined;
    if (cleanPhone && cleanPhone.startsWith("0") && cleanPhone.length === 11) {
      cleanPhone = "234" + cleanPhone.slice(1);
    }

    const nameVal = params.name && params.name.trim() ? params.name.trim() : null;
    const ownerNameVal = params.owner_name && params.owner_name.trim() ? params.owner_name.trim() : null;
    const ownerPhoneVal = cleanPhone || null;

    const rows = await db`
      UPDATE workspaces 
      SET 
        owner_name = COALESCE(${ownerNameVal}, owner_name),
        owner_phone = COALESCE(${ownerPhoneVal}, owner_phone),
        name = COALESCE(${nameVal}, name),
        updated_at = NOW()
      WHERE id = ${idOrSlug} OR slug = ${idOrSlug}
      RETURNING *
    `;
    return (rows && rows[0]) ? (rows[0] as Workspace) : null;
  } catch (err) {
    console.error("dbUpdateWorkspaceProfile error:", err);
    return null;
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
      INSERT INTO workspace_settings (workspace_id, business_bio, catalog_summary, voice_greeting, whatsapp_welcome, fallback_action, voice_id, voice_personality, updated_at)
      VALUES (
        ${workspaceId},
        ${settings.business_bio ?? null},
        ${settings.catalog_summary ?? null},
        ${settings.voice_greeting ?? null},
        ${settings.whatsapp_welcome ?? null},
        ${settings.fallback_action ?? 'ai_reply'},
        ${settings.voice_id ?? 'nigerian_male'},
        ${settings.voice_personality ?? 'professional'},
        NOW()
      )
      ON CONFLICT (workspace_id) DO UPDATE SET
        business_bio = COALESCE(EXCLUDED.business_bio, workspace_settings.business_bio),
        catalog_summary = COALESCE(EXCLUDED.catalog_summary, workspace_settings.catalog_summary),
        voice_greeting = COALESCE(EXCLUDED.voice_greeting, workspace_settings.voice_greeting),
        whatsapp_welcome = COALESCE(EXCLUDED.whatsapp_welcome, workspace_settings.whatsapp_welcome),
        fallback_action = COALESCE(EXCLUDED.fallback_action, workspace_settings.fallback_action),
        voice_id = COALESCE(EXCLUDED.voice_id, workspace_settings.voice_id),
        voice_personality = COALESCE(EXCLUDED.voice_personality, workspace_settings.voice_personality),
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
  is_saved?: boolean;
  auto_save?: boolean;
  profile_pic_url?: string | null;
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
      INSERT INTO workspace_leads (
        id, workspace_id, phone, name, email, source, status,
        is_saved, auto_save, profile_pic_url,
        intent_summary, last_message, metadata, updated_at
      )
      VALUES (
        ${id},
        ${params.workspace_id},
        ${cleanPhone},
        ${params.name || null},
        ${params.email || null},
        ${params.source || 'whatsapp'},
        ${params.status || 'lead'},
        ${params.is_saved ?? false},
        ${params.auto_save ?? true},
        ${params.profile_pic_url || null},
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
        is_saved = COALESCE(EXCLUDED.is_saved, workspace_leads.is_saved),
        auto_save = COALESCE(EXCLUDED.auto_save, workspace_leads.auto_save),
        profile_pic_url = COALESCE(EXCLUDED.profile_pic_url, workspace_leads.profile_pic_url),
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

export async function dbMarkLeadsSaved(
  workspaceId: string,
  phones: string[],
  isSaved: boolean = true
): Promise<number> {
  const db = getSql();
  if (!db || phones.length === 0) return 0;
  try {
    await createWorkspaceTables();
    const cleanPhones = phones.map(p => p.replace(/\D/g, "")).filter(Boolean);
    if (cleanPhones.length === 0) return 0;
    const result = await db`
      UPDATE workspace_leads
      SET is_saved = ${isSaved}, updated_at = NOW()
      WHERE workspace_id = ${workspaceId}
        AND phone = ANY(${cleanPhones})
      RETURNING id
    `;
    return result.length;
  } catch (err) {
    console.error("dbMarkLeadsSaved error:", err);
    return 0;
  }
}

export async function dbMarkAllUnsavedLeads(
  workspaceId: string,
  isSaved: boolean = true
): Promise<number> {
  const db = getSql();
  if (!db) return 0;
  try {
    await createWorkspaceTables();
    const result = await db`
      UPDATE workspace_leads
      SET is_saved = ${isSaved}, updated_at = NOW()
      WHERE workspace_id = ${workspaceId}
        AND (is_saved IS FALSE OR is_saved IS NULL)
      RETURNING id
    `;
    return result.length;
  } catch (err) {
    console.error("dbMarkAllUnsavedLeads error:", err);
    return 0;
  }
}

export async function dbToggleLeadAutoSave(
  workspaceId: string,
  phone: string,
  autoSave: boolean
): Promise<boolean> {
  const db = getSql();
  if (!db) return false;
  try {
    await createWorkspaceTables();
    const cleanPhone = phone.replace(/\D/g, "");
    await db`
      UPDATE workspace_leads
      SET auto_save = ${autoSave}, updated_at = NOW()
      WHERE workspace_id = ${workspaceId} AND phone = ${cleanPhone}
    `;
    return true;
  } catch (err) {
    console.error("dbToggleLeadAutoSave error:", err);
    return false;
  }
}

export async function dbToggleWorkspaceAutoSave(
  workspaceId: string,
  enabled: boolean
): Promise<boolean> {
  const db = getSql();
  if (!db) return false;
  try {
    await createWorkspaceTables();
    await db`
      UPDATE workspaces
      SET auto_save_contacts = ${enabled}, updated_at = NOW()
      WHERE id = ${workspaceId}
    `;
    return true;
  } catch (err) {
    console.error("dbToggleWorkspaceAutoSave error:", err);
    return false;
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

// ==============================================================
// MASTER ADMIN & PLATFORM CONTROLS
// ==============================================================

export interface PlatformPricing {
  starter_price: number;
  pro_price: number;
  enterprise_price: number;
  trial_days: number;
}

export async function dbGetPlatformPricing(): Promise<PlatformPricing> {
  const db = getSql();
  if (!db) return { starter_price: 9500, pro_price: 22500, enterprise_price: 55000, trial_days: 7 };
  try {
    await createWorkspaceTables();
    const rows = await db`SELECT * FROM platform_pricing WHERE id = 'default' LIMIT 1`;
    if (rows && rows.length > 0) {
      return {
        starter_price: Number(rows[0].starter_price) || 9500,
        pro_price: Number(rows[0].pro_price) || 22500,
        enterprise_price: Number(rows[0].enterprise_price) || 55000,
        trial_days: Number(rows[0].trial_days) || 7,
      };
    }
  } catch (e) {
    console.warn("dbGetPlatformPricing error:", e);
  }
  return { starter_price: 9500, pro_price: 22500, enterprise_price: 55000, trial_days: 7 };
}

export async function dbUpdatePlatformPricing(pricing: Partial<PlatformPricing>): Promise<PlatformPricing> {
  const db = getSql();
  if (!db) return { starter_price: 9500, pro_price: 22500, enterprise_price: 55000, trial_days: 7 };
  try {
    await createWorkspaceTables();
    const current = await dbGetPlatformPricing();
    const updated = { ...current, ...pricing };
    await db`
      INSERT INTO platform_pricing (id, starter_price, pro_price, enterprise_price, trial_days, updated_at)
      VALUES ('default', ${updated.starter_price}, ${updated.pro_price}, ${updated.enterprise_price}, ${updated.trial_days}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        starter_price = EXCLUDED.starter_price,
        pro_price = EXCLUDED.pro_price,
        enterprise_price = EXCLUDED.enterprise_price,
        trial_days = EXCLUDED.trial_days,
        updated_at = NOW()
    `;
    return updated;
  } catch (e) {
    console.error("dbUpdatePlatformPricing error:", e);
    return { starter_price: 9500, pro_price: 22500, enterprise_price: 55000, trial_days: 7 };
  }
}

export interface WorkspaceWithStats extends Workspace {
  lead_count: number;
  call_count: number;
  rule_count: number;
}

export async function dbGetAllWorkspacesWithStats(): Promise<WorkspaceWithStats[]> {
  const db = getSql();
  if (!db) return [];
  try {
    await createWorkspaceTables();
    const rows = await db`
      SELECT 
        w.*,
        COALESCE(leads.cnt, 0)::int AS lead_count,
        COALESCE(calls.cnt, 0)::int AS call_count,
        COALESCE(rules.cnt, 0)::int AS rule_count
      FROM workspaces w
      LEFT JOIN (SELECT workspace_id, COUNT(*) AS cnt FROM workspace_leads GROUP BY workspace_id) leads ON leads.workspace_id = w.id
      LEFT JOIN (SELECT workspace_id, COUNT(*) AS cnt FROM workspace_call_logs GROUP BY workspace_id) calls ON calls.workspace_id = w.id
      LEFT JOIN (SELECT workspace_id, COUNT(*) AS cnt FROM workspace_rules GROUP BY workspace_id) rules ON rules.workspace_id = w.id
      ORDER BY w.created_at DESC
    `;
    return rows as WorkspaceWithStats[];
  } catch (err) {
    console.error("dbGetAllWorkspacesWithStats error:", err);
    return [];
  }
}

export async function dbUpdateWorkspacePlan(id: string, params: {
  plan?: string;
  subscription_status?: string;
  trial_ends_at?: string | null;
}): Promise<Workspace | null> {
  const db = getSql();
  if (!db) return null;
  try {
    await createWorkspaceTables();
    const [updated] = await db`
      UPDATE workspaces SET
        plan = COALESCE(${params.plan || null}, plan),
        subscription_status = COALESCE(${params.subscription_status || null}, subscription_status),
        trial_ends_at = ${params.trial_ends_at !== undefined ? params.trial_ends_at : null},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return (updated || null) as Workspace | null;
  } catch (err) {
    console.error("dbUpdateWorkspacePlan error:", err);
    return null;
  }
}

export async function dbDeleteWorkspace(id: string): Promise<boolean> {
  const db = getSql();
  if (!db) return false;
  try {
    await db`DELETE FROM workspaces WHERE id = ${id}`;
    return true;
  } catch (err) {
    console.error("dbDeleteWorkspace error:", err);
    return false;
  }
}

export async function dbGetGlobalActivityFeed(limit = 40): Promise<{
  leads: any[];
  calls: any[];
}> {
  const db = getSql();
  if (!db) return { leads: [], calls: [] };
  try {
    await createWorkspaceTables();
    const [leads, calls] = await Promise.all([
      db`
        SELECT l.*, w.name AS workspace_name, w.slug AS workspace_slug
        FROM workspace_leads l
        JOIN workspaces w ON w.id = l.workspace_id
        ORDER BY l.updated_at DESC
        LIMIT ${limit}
      `,
      db`
        SELECT c.*, w.name AS workspace_name, w.slug AS workspace_slug
        FROM workspace_call_logs c
        JOIN workspaces w ON w.id = c.workspace_id
        ORDER BY c.created_at DESC
        LIMIT ${limit}
      `
    ]);
    return { leads: leads || [], calls: calls || [] };
  } catch (err) {
    console.error("dbGetGlobalActivityFeed error:", err);
    return { leads: [], calls: [] };
  }
}

// ==========================================
// STATUS COMMENTING EXCLUSIONS (OPT-OUTS)
// ==========================================

export function normalizePhoneForMatch(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 11) {
    return "234" + digits.slice(1);
  }
  return digits;
}

export function phonesMatch(phoneA: string, phoneB: string): boolean {
  const a = normalizePhoneForMatch(phoneA);
  const b = normalizePhoneForMatch(phoneB);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 10 && b.length >= 10 && a.slice(-10) === b.slice(-10)) return true;
  return false;
}

export async function dbGetStatusExclusions(workspaceId: string): Promise<StatusExcludedContact[]> {
  const db = getSql();
  if (!db || !workspaceId) return [];
  try {
    await createWorkspaceTables();
    const rows = await db`
      SELECT status_excluded_phones FROM workspaces 
      WHERE id = ${workspaceId} OR LOWER(slug) = ${workspaceId.toLowerCase().trim()} 
      LIMIT 1
    `;
    if (!rows || rows.length === 0) return [];
    const raw = rows[0].status_excluded_phones;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  } catch (err) {
    console.error("dbGetStatusExclusions error:", err);
    return [];
  }
}

export async function dbIsPhoneExcludedFromStatusComments(
  workspaceId: string | null | undefined,
  phone: string
): Promise<boolean> {
  const db = getSql();
  if (!phone) return false;
  const cleanPhone = normalizePhoneForMatch(phone);

  try {
    // 1. Check workspace specific exclusions
    if (workspaceId && db) {
      const exclusions = await dbGetStatusExclusions(workspaceId);
      if (exclusions.some((ex) => phonesMatch(ex.phone, cleanPhone))) {
        return true;
      }
    }

    // 2. Also check global / Main Obey setting ONLY if Main Obey
    const isMainObey = !workspaceId || workspaceId === "ws_femi_default" || workspaceId === "femi-adeleke";
    if (isMainObey) {
      const { getSetting } = await import("@/lib/settings");
      const globalRaw = await getSetting("STATUS_EXCLUDED_PHONES");
      if (globalRaw) {
        try {
          const parsed: (StatusExcludedContact | string)[] = JSON.parse(globalRaw);
          if (Array.isArray(parsed)) {
            const match = parsed.some((item) => {
              const p = typeof item === "string" ? item : item.phone;
              return phonesMatch(p, cleanPhone);
            });
            if (match) return true;
          }
        } catch {}
      }
    }
  } catch (err) {
    console.warn("dbIsPhoneExcludedFromStatusComments error:", err);
  }
  return false;
}

export async function dbAddStatusExclusion(
  workspaceId: string,
  phone: string,
  name?: string,
  reason: string = "Contact requested opt-out"
): Promise<StatusExcludedContact[]> {
  const db = getSql();
  if (!db || !workspaceId || !phone) return [];
  try {
    await createWorkspaceTables();
    const cleanPhone = normalizePhoneForMatch(phone);
    const current = await dbGetStatusExclusions(workspaceId);

    const filtered = current.filter((item) => !phonesMatch(item.phone, cleanPhone));
    const newEntry: StatusExcludedContact = {
      phone: cleanPhone,
      name: name?.trim() || `Contact ${cleanPhone.slice(-4)}`,
      reason: reason.trim(),
      excluded_at: new Date().toISOString(),
    };
    const updated = [newEntry, ...filtered];

    await db`
      UPDATE workspaces 
      SET status_excluded_phones = ${JSON.stringify(updated)}::jsonb,
          updated_at = NOW()
      WHERE id = ${workspaceId} OR LOWER(slug) = ${workspaceId.toLowerCase().trim()}
    `;

    if (
      workspaceId === "ws_femi_default" ||
      workspaceId === "femi" ||
      workspaceId.toLowerCase() === "femi-adeleke"
    ) {
      const { setSetting } = await import("@/lib/settings");
      await setSetting("STATUS_EXCLUDED_PHONES", JSON.stringify(updated));
    }

    return updated;
  } catch (err) {
    console.error("dbAddStatusExclusion error:", err);
    return [];
  }
}

export async function dbRemoveStatusExclusion(
  workspaceId: string,
  phone: string
): Promise<StatusExcludedContact[]> {
  const db = getSql();
  if (!db || !workspaceId || !phone) return [];
  try {
    await createWorkspaceTables();
    const cleanPhone = normalizePhoneForMatch(phone);
    const current = await dbGetStatusExclusions(workspaceId);
    const updated = current.filter((item) => !phonesMatch(item.phone, cleanPhone));

    await db`
      UPDATE workspaces 
      SET status_excluded_phones = ${JSON.stringify(updated)}::jsonb,
          updated_at = NOW()
      WHERE id = ${workspaceId} OR LOWER(slug) = ${workspaceId.toLowerCase().trim()}
    `;

    if (
      workspaceId === "ws_femi_default" ||
      workspaceId === "femi" ||
      workspaceId.toLowerCase() === "femi-adeleke"
    ) {
      const { setSetting } = await import("@/lib/settings");
      await setSetting("STATUS_EXCLUDED_PHONES", JSON.stringify(updated));
    }

    return updated;
  } catch (err) {
    console.error("dbRemoveStatusExclusion error:", err);
    return [];
  }
}

export async function dbSetWorkspaceBotBypass(
  workspaceIdOrSlug: string,
  bypass: boolean
): Promise<boolean> {
  const db = getSql();
  if (!db || !workspaceIdOrSlug) return false;
  try {
    await createWorkspaceTables();
    await db`
      UPDATE workspaces 
      SET bot_bypass = ${bypass},
          updated_at = NOW()
      WHERE id = ${workspaceIdOrSlug} OR LOWER(slug) = ${workspaceIdOrSlug.toLowerCase().trim()}
    `;

    if (
      workspaceIdOrSlug === "ws_femi_default" ||
      workspaceIdOrSlug === "femi" ||
      workspaceIdOrSlug.toLowerCase() === "femi-adeleke"
    ) {
      try {
        const { setSetting } = await import("@/lib/settings");
        await setSetting("OBEY_BOT_BYPASS", bypass ? "true" : "false");
      } catch {}
    }

    return true;
  } catch (err) {
    console.error("dbSetWorkspaceBotBypass error:", err);
    return false;
  }
}

export async function dbGetWorkspaceBotBypass(
  workspaceIdOrSlug: string
): Promise<boolean> {
  const db = getSql();
  if (!db || !workspaceIdOrSlug) return false;
  try {
    await createWorkspaceTables();
    const rows = await db`
      SELECT bot_bypass FROM workspaces
      WHERE id = ${workspaceIdOrSlug} OR LOWER(slug) = ${workspaceIdOrSlug.toLowerCase().trim()}
      LIMIT 1
    `;
    if (rows && rows.length > 0) {
      return Boolean(rows[0].bot_bypass);
    }
    return false;
  } catch (err) {
    console.error("dbGetWorkspaceBotBypass error:", err);
    return false;
  }
}
