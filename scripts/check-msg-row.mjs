import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_JjwKqG1xtk4W@ep-dawn-feather-b5pjlp0o.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require');

async function main() {
  const row = await sql`SELECT * FROM evolution."Message" WHERE id = 'cmv7g34pr0003dm4iaeq73t54'`;
  console.log('Row:', JSON.stringify(row[0], null, 2));
}

main().catch(console.error);
