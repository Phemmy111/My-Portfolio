import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_JjwKqG1xtk4W@ep-dawn-feather-b5pjlp0o.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require');

async function main() {
  const cols = await sql`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_schema = 'evolution' AND table_name = 'Message'
  `;
  console.log('Columns in evolution.Message:', cols.map(c => c.column_name));

  const msgCount = await sql`SELECT COUNT(*) as count FROM evolution."Message"`;
  console.log('Total rows in evolution.Message:', msgCount[0].count);

  const sessions = await sql`SELECT * FROM evolution."Session"`;
  console.log('Sessions count:', sessions.length);

  const instances = await sql`SELECT * FROM evolution."Instance"`;
  console.log('Instances:', instances.map(i => ({ name: i.name, status: i.status, connectionStatus: i.connectionStatus })));
}

main().catch(console.error);
