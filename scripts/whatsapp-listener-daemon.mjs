import http from 'http';
import { neon } from '@neondatabase/serverless';

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_JjwKqG1xtk4W@ep-dawn-feather-b5pjlp0o.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require';
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://obeyai.vercel.app/api/obey/whatsapp/webhook';

// The Evolution v2 instance UUID for "obey"
const OBEY_INSTANCE_ID = '74f619e3-3793-4aa1-8208-32dda0e38a8f';

const sql = neon(DATABASE_URL);
const processingIds = new Set();

// Fallback: poll Evolution API directly for messages (in case DB saving is off)
const EVO_SEEN_MSG_IDS = new Set();

async function pollEvolutionAPIDirect() {
  try {
    const res = await fetch(`${EVO_URL}/chat/findMessages/obey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
      body: JSON.stringify({ where: { key: { fromMe: false } }, limit: 5 }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return;
    const data = await res.json();
    const msgs = Array.isArray(data?.messages?.records) ? data.messages.records : (Array.isArray(data) ? data : []);

    for (const msg of msgs) {
      const msgId = msg.key?.id || msg.id;
      if (!msgId || EVO_SEEN_MSG_IDS.has(msgId)) continue;
      if (msg.key?.fromMe) continue;

      // Only process messages from last 2 minutes
      const ts = msg.messageTimestamp || 0;
      const now = Math.floor(Date.now() / 1000);
      if (now - ts > 120) {
        EVO_SEEN_MSG_IDS.add(msgId);
        continue;
      }

      EVO_SEEN_MSG_IDS.add(msgId);
      processingIds.add(msgId);

      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      console.log(`[WA Direct] New message via EVO API: "${text}" (id: ${msgId})`);

      try {
        const wres = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'messages.upsert',
            instance: 'obey',
            data: { ...msg, instanceId: OBEY_INSTANCE_ID }
          })
        });
        console.log(`[WA Direct] Webhook triggered. Status: ${wres.status}`);
      } catch (err) {
        console.error('[WA Direct] Webhook dispatch error:', err?.message || err);
      }
    }
  } catch (err) {
    // Silent - Evolution API may be sleeping
  }
}

async function poll() {
  try {
    // Filter strictly to the "obey" instance - NOT the autolearn-spot instance
    const [latestBot] = await sql`
      SELECT id, "messageTimestamp"
      FROM evolution."Message"
      WHERE (key->>'fromMe')::boolean = true
        AND "instanceId" = ${OBEY_INSTANCE_ID}
      ORDER BY "messageTimestamp" DESC
      LIMIT 1
    `;

    const [latestUser] = await sql`
      SELECT id, key, message, "messageTimestamp", "instanceId", "pushName"
      FROM evolution."Message"
      WHERE (key->>'fromMe')::boolean = false
        AND "instanceId" = ${OBEY_INSTANCE_ID}
        AND (key->>'remoteJid') NOT LIKE '%@g.us'
        AND (key->>'remoteJid') != 'status@broadcast'
      ORDER BY "messageTimestamp" DESC
      LIMIT 1
    `;

    if (!latestUser) {
      // DB saving may be off – fallback to direct API polling
      await pollEvolutionAPIDirect();
      return;
    }

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

const EVO_URL = process.env.EVOLUTION_API_URL || 'https://obey-whatsapp-api.onrender.com';
const EVO_KEY = process.env.EVOLUTION_API_KEY || 'FemiObey2026!';
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || 'obey';

async function checkEvolutionKeepAlive() {
  try {
    const res = await fetch(`${EVO_URL}/instance/fetchInstances`, {
      headers: { apikey: EVO_KEY },
    });
    if (!res.ok) {
      console.warn(`[WA Keepalive] Evolution fetchInstances HTTP ${res.status}. Ping connect...`);
      await fetch(`${EVO_URL}/instance/connect/${EVO_INSTANCE}`, { headers: { apikey: EVO_KEY } });
      return;
    }
    const instances = await res.json();
    const inst = Array.isArray(instances) ? instances.find((i) => i.name === EVO_INSTANCE) : null;
    const isConnected = Boolean(inst && inst.connectionStatus === 'open');

    if (!isConnected) {
      console.log(`[WA Keepalive] Instance '${EVO_INSTANCE}' is ${inst?.connectionStatus || 'offline'}. Reconnecting...`);
      await fetch(`${EVO_URL}/instance/connect/${EVO_INSTANCE}`, { headers: { apikey: EVO_KEY } });
    } else {
      console.log(`[WA Keepalive] WhatsApp instance '${EVO_INSTANCE}' is active and connected.`);
    }
  } catch (err) {
    console.warn('[WA Keepalive] Ping error:', err?.message || err);
  }
}

const KEEPALIVE_URL = process.env.KEEPALIVE_URL || 'https://obeyai.vercel.app/api/obey/whatsapp/keepalive';

async function pingKeepalive() {
  try {
    const res = await fetch(KEEPALIVE_URL);
    if (!res.ok) {
      console.warn(`[WA Daemon Keepalive] HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn('[WA Daemon Keepalive] Ping error:', err?.message || err);
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

  // Ping Evolution API every 3 minutes (180,000ms) so Render never spins down into inactivity sleep
  setInterval(checkEvolutionKeepAlive, 180000);
  checkEvolutionKeepAlive();

  // Ping Vercel keepalive every 20s to ensure instant reminder dispatch & scheduled tasks
  setInterval(pingKeepalive, 20000);
  pingKeepalive();
});

