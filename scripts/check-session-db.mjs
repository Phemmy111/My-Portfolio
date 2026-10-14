import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_JjwKqG1xtk4W@ep-dawn-feather-b5pjlp0o.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require');

async function main() {
  const sessions = await sql`SELECT id, "sessionId" FROM evolution."Session"`;
  console.log('Sessions in DB:', JSON.stringify(sessions, null, 2));

  const instances = await sql`SELECT id, name, "connectionStatus", "ownerJid" FROM evolution."Instance"`;
  console.log('Instances in DB:', JSON.stringify(instances, null, 2));
}

main().catch(console.error);
