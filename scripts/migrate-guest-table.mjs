import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_JjwKqG1xtk4W@ep-dawn-feather-b5pjlp0o.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require');

async function run() {
  await sql`
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
  await sql`ALTER TABLE guest_chat_messages ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp'`;
  console.log('Migration complete: guest_chat_messages updated with channel column.');
}

run().catch(console.error);
