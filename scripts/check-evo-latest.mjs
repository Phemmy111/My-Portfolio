import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_JjwKqG1xtk4W@ep-dawn-feather-b5pjlp0o.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require');

async function main() {
  const rows = await sql`
    SELECT id, key, message, "messageTimestamp", status
    FROM evolution."Message"
    ORDER BY "messageTimestamp" DESC
    LIMIT 5
  `;
  console.log('Latest messages in evolution.Message:');
  for (const r of rows) {
    console.log(r.id, r.key, JSON.stringify(r.message), r.status, new Date(r.messageTimestamp * 1000).toISOString());
  }
}

main().catch(console.error);
