import http from 'http';
import { neon } from '@neondatabase/serverless';

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_JjwKqG1xtk4W@ep-dawn-feather-b5pjlp0o.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require';
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://femiadelekeportfolio.vercel.app/api/obey/whatsapp/webhook';

const sql = neon(DATABASE_URL);
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
      console.log(`[WA Listener] New unreplied message: "${text}" (id: ${latestUser.id})`);

      try {
        const res = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'messages.upsert',
            instance: 'obey',
            data: latestUser
          })
        });
        console.log(`[WA Listener] Webhook triggered. Status: ${res.status}`);
      } catch (err) {
        console.error('[WA Listener] Webhook dispatch error:', err?.message || err);
        processingIds.delete(latestUser.id);
      }
    }
  } catch (err) {
    console.error('[WA Listener] Poll error:', err?.message || err);
  }
}

// Lightweight HTTP server for Render Free Web Service health checks and keep-alive pings
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'healthy',
    service: 'obey-whatsapp-daemon',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  }));
});

server.listen(PORT, () => {
  console.log(`[WA Listener] Daemon HTTP server running on port ${PORT}`);
  console.log('[WA Listener] Real-time WhatsApp sync loop active (2s interval).');
  setInterval(poll, 2000);
});
