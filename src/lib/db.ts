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
      ORDER BY created_at ASC
      LIMIT ${limit}
    `;
    return rows;
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
      ORDER BY created_at ASC
      LIMIT ${limit}
    `;
    return rows;
  } catch (e) {
    console.warn("dbGetGuestMessages fallback:", e);
    return [];
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


