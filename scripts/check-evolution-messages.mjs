import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_JjwKqG1xtk4W@ep-dawn-feather-b5pjlp0o.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require');

async function main() {
  const msgs = await sql`SELECT * FROM evolution."Message" LIMIT 10`;
  console.log('Total in evolution.Message:', msgs.length);
  for (const m of msgs) {
    console.log(m.id, m.key, m.message);
  }
}

main().catch(console.error);
