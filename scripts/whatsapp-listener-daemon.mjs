import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_JjwKqG1xtk4W@ep-dawn-feather-b5pjlp0o.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require');
const processingIds = new Set();

async function poll() {
  try {
    const [latestBot] = await sql`
      SELECT id, "messageTimestamp"
      FROM evolution."Message"
      WHERE (key->>'fromMe')::boolean = true
      ORDER BY "messageTimestamp" DESC
      LIMIT 1
    `;

    const [latestUser] = await sql`
      SELECT id, key, message, "messageTimestamp", "instanceId"
      FROM evolution."Message"
      WHERE (key->>'fromMe')::boolean = false
      ORDER BY "messageTimestamp" DESC
      LIMIT 1
    `;

    if (!latestUser) return;

    const botTs = latestBot?.messageTimestamp || 0;
    const userTs = latestUser?.messageTimestamp || 0;

    // If user message is newer than bot's reply and not currently processing:
    if (userTs > botTs && !processingIds.has(latestUser.id)) {
      processingIds.add(latestUser.id);
      const text = latestUser.message?.conversation || latestUser.message?.extendedTextMessage?.text || '';
      console.log(`[WA Listener] New unreplied message from user: "${text}" (id: ${latestUser.id})`);

      try {
        const res = await fetch('https://femiadelekeportfolio.vercel.app/api/obey/whatsapp/webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'messages.upsert',
            instance: 'obey',
            data: latestUser
          })
        });
        console.log(`[WA Listener] Dispatched to webhook, response status: ${res.status}`);
      } catch (err) {
        console.error('[WA Listener] Webhook dispatch error:', err);
        processingIds.delete(latestUser.id);
      }
    }
  } catch (err) {
    console.error('[WA Listener] Poll error:', err?.message || err);
  }
}

async function main() {
  console.log('[WA Listener] Real-time WhatsApp Sync Daemon active. Monitoring Neon DB every 2s...');
  setInterval(poll, 2000);
}

main().catch(console.error);
