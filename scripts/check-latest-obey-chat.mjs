import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_JjwKqG1xtk4W@ep-dawn-feather-b5pjlp0o.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require');

async function main() {
  const msgs = await sql`
    SELECT id, phone_number, sender_name, channel, role, content, created_at
    FROM guest_chat_messages
    ORDER BY created_at DESC
    LIMIT 10
  `;
  console.log('--- LATEST GUEST CHAT MESSAGES ---');
  for (const m of msgs) {
    const ts = new Date(m.created_at).toLocaleTimeString();
    console.log(`[${ts}] [${m.channel}] ${m.phone_number} (${m.role}): "${m.content.slice(0, 100)}"`);
  }
}

main().catch(console.error);
