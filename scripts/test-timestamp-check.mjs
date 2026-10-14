import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_JjwKqG1xtk4W@ep-dawn-feather-b5pjlp0o.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require');

async function main() {
  const [latestBot] = await sql`
    SELECT id, "messageTimestamp", message
    FROM evolution."Message"
    WHERE (key->>'fromMe')::boolean = true
    ORDER BY "messageTimestamp" DESC
    LIMIT 1
  `;

  const [latestUser] = await sql`
    SELECT id, "messageTimestamp", message
    FROM evolution."Message"
    WHERE (key->>'fromMe')::boolean = false
    ORDER BY "messageTimestamp" DESC
    LIMIT 1
  `;

  console.log('Latest Bot Timestamp:', latestBot?.messageTimestamp, new Date(latestBot?.messageTimestamp * 1000).toISOString());
  console.log('Latest User Timestamp:', latestUser?.messageTimestamp, new Date(latestUser?.messageTimestamp * 1000).toISOString(), latestUser?.message?.conversation);
  console.log('Is User Message newer than Bot Message?', latestUser?.messageTimestamp > latestBot?.messageTimestamp);
}

main().catch(console.error);
