import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_JjwKqG1xtk4W@ep-dawn-feather-b5pjlp0o.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require');

async function main() {
  const row = await sql`
    SELECT * FROM evolution."Message"
    WHERE id = 'cmv7hikq4000j9e50ym7gexhn'
  `;
  if (!row[0]) return console.log('Message not found');

  const m = row[0];
  console.log('Sending message to webhook:', m.message.conversation);

  const res = await fetch('https://femiadelekeportfolio.vercel.app/api/obey/whatsapp/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'messages.upsert',
      instance: 'obey',
      data: m
    })
  });

  console.log('Webhook status:', res.status, await res.json());
}

main().catch(console.error);
