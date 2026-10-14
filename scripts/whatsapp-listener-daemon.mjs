import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_JjwKqG1xtk4W@ep-dawn-feather-b5pjlp0o.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require');
const processedIds = new Set();

async function init() {
  console.log('[WA Listener] Starting WhatsApp DB Real-time Sync Daemon...');
  
  // Seed with recent messages to avoid duplicate replies on startup
  const recents = await sql`
    SELECT id FROM evolution."Message"
    ORDER BY "messageTimestamp" DESC
    LIMIT 20
  `;
  for (const r of recents) {
    processedIds.add(r.id);
  }
  console.log(`[WA Listener] Initialized with ${processedIds.size} existing messages.`);

  // Poll loop every 2 seconds
  setInterval(async () => {
    try {
      const msgs = await sql`
        SELECT * FROM evolution."Message"
        WHERE (key->>'fromMe')::boolean = false
        ORDER BY "messageTimestamp" DESC
        LIMIT 5
      `;

      for (const m of msgs) {
        if (!processedIds.has(m.id)) {
          processedIds.add(m.id);
          const text = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
          if (!text) continue;

          console.log(`[WA Listener] New incoming message: "${text}" (id: ${m.id})`);
          
          // Dispatch to webhook
          fetch('https://femiadelekeportfolio.vercel.app/api/obey/whatsapp/webhook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'messages.upsert',
              instance: 'obey',
              data: m
            })
          }).then(async res => {
            console.log(`[WA Listener] Dispatched to webhook, status: ${res.status}`);
          }).catch(err => {
            console.error('[WA Listener] Webhook dispatch error:', err);
          });
        }
      }
    } catch (err) {
      console.error('[WA Listener] Loop error:', err?.message || err);
    }
  }, 2000);
}

init().catch(console.error);
