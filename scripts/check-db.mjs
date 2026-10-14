import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_JjwKqG1xtk4W@ep-dawn-feather-b5pjlp0o.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require');

async function main() {
  const rows = await sql`SELECT id, role, content, created_at FROM obey_chat_messages ORDER BY created_at DESC LIMIT 20`;
  console.log('Total recent messages in obey_chat_messages:', rows.length);
  for (const r of rows) {
    console.log(`[${r.created_at}] ${r.role} (${r.id}): ${r.content?.slice(0, 100)}`);
  }
}

main().catch(console.error);
