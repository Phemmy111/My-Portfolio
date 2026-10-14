import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_JjwKqG1xtk4W@ep-dawn-feather-b5pjlp0o.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require');

async function main() {
  const webhooks = await sql`SELECT * FROM evolution."Webhook"`;
  console.log('Webhooks in DB:', JSON.stringify(webhooks, null, 2));
}

main().catch(console.error);
