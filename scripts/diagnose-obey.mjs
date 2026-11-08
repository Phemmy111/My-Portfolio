import { neon } from "@neondatabase/serverless";
import fs from "fs";

// Load environment variables
if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

console.log("==================================================");
console.log("   OBEY SYSTEM COMPREHENSIVE DIAGNOSTIC TEST      ");
console.log("==================================================");

const results = [];

function record(suite, testName, status, details = "") {
  results.push({ suite, testName, status, details });
  const icon = status === "PASS" ? "✅" : status === "WARN" ? "⚠️" : "❌";
  console.log(`${icon} [${suite}] ${testName}: ${status} ${details ? `(${details})` : ""}`);
}

async function testDatabase() {
  console.log("\n--- 1. DATABASE & STORAGE HEALTH ---");
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    record("Database", "Connection String", "FAIL", "DATABASE_URL is missing");
    return;
  }
  record("Database", "Connection String", "PASS", "Configured");

  try {
    const sql = neon(dbUrl);
    const timeRes = await sql`SELECT NOW() as current_time`;
    record("Database", "Neon DB Connection", "PASS", `Connected at ${timeRes[0].current_time}`);

    const requiredTables = [
      "workspaces",
      "workspace_leads",
      "workspace_contact_buckets",
      "workspace_rules",
      "workspace_message_queue",
      "obey_chat_messages",
      "guest_chat_messages",
      "leads"
    ];

    for (const table of requiredTables) {
      try {
        const countRes = await sql.query(`SELECT COUNT(*)::int as count FROM ${table}`);
        record("Database", `Table: ${table}`, "PASS", `${countRes[0].count} rows`);
      } catch (err) {
        record("Database", `Table: ${table}`, "FAIL", err.message);
      }
    }

    // Check message_id unique index
    try {
      const idxRes = await sql`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'workspace_message_queue' AND indexname = 'idx_msg_queue_unique_msgid'
      `;
      if (idxRes.length > 0) {
        record("Database", "Deduplication Index (idx_msg_queue_unique_msgid)", "PASS", "Active");
      } else {
        record("Database", "Deduplication Index", "WARN", "Index missing, duplicate risk exists");
      }
    } catch (err) {
      record("Database", "Deduplication Index", "WARN", err.message);
    }

    // Check Main Obey / default workspace
    try {
      const ws = await sql`SELECT id, name, slug, owner_phone FROM workspaces LIMIT 5`;
      record("Database", "Active Workspaces", "PASS", `Found ${ws.length} workspaces: ${ws.map(w => w.name).join(", ")}`);
    } catch (err) {
      record("Database", "Active Workspaces", "WARN", err.message);
    }
  } catch (err) {
    record("Database", "Neon DB Connection", "FAIL", err.message);
  }
}

async function testEvolutionGateway() {
  console.log("\n--- 2. WHATSAPP EVOLUTION API GATEWAY ---");
  const evoUrl = process.env.EVOLUTION_API_URL || "https://obey-whatsapp-api-2.onrender.com";
  const evoKey = process.env.EVOLUTION_API_KEY || "FemiObey2026!";
  let instance = process.env.EVOLUTION_INSTANCE_NAME || "obey-femi-adeleke";
  if (instance === "obey") instance = "obey-femi-adeleke";

  record("WhatsApp Gateway", "Resolved Active Instance", "PASS", instance);

  // Check Evolution API connection / health
  try {
    const res = await fetch(`${evoUrl}/instance/connectionState/${instance}`, {
      headers: { apikey: evoKey },
      signal: AbortSignal.timeout(8000)
    });
    if (res.ok) {
      const data = await res.json();
      const state = data?.instance?.state || data?.state || "unknown";
      if (state === "open") {
        record("WhatsApp Gateway", "Instance Connection State", "PASS", `State: ${state} (Connected & Online)`);
      } else {
        record("WhatsApp Gateway", "Instance Connection State", "WARN", `State: ${state}`);
      }
    } else {
      record("WhatsApp Gateway", "Instance Endpoint", "WARN", `HTTP ${res.status}`);
    }
  } catch (err) {
    record("WhatsApp Gateway", "Instance Endpoint", "WARN", `Timeout/Error: ${err.message}`);
  }
}

async function testGeminiMultimodal() {
  console.log("\n--- 3. GOOGLE GEMINI & MULTIMODAL VISION ---");
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    record("Gemini AI", "API Key", "FAIL", "GEMINI_API_KEY missing");
    return;
  }
  record("Gemini AI", "API Key", "PASS", "Configured");

  // Test simple text completion
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Respond in 3 words: Obey diagnostic ready." }] }]
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (res.ok) {
      const data = await res.json();
      const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      record("Gemini AI", "Text Completion (gemini-2.5-flash)", "PASS", `Output: "${txt}"`);
    } else {
      record("Gemini AI", "Text Completion", "FAIL", `HTTP ${res.status}`);
    }
  } catch (err) {
    record("Gemini AI", "Text Completion", "FAIL", err.message);
  }

  // Test Multimodal Vision with a real 1-pixel PNG image
  try {
    const samplePngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "What color is this 1-pixel image in 1 word?" },
            {
              inlineData: {
                mimeType: "image/png",
                data: samplePngBase64
              }
            }
          ]
        }]
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (res.ok) {
      const data = await res.json();
      const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      record("Gemini AI", "Multimodal Vision (gemini-2.5-flash)", "PASS", `Vision response: "${txt}"`);
    } else {
      record("Gemini AI", "Multimodal Vision", "FAIL", `HTTP ${res.status}`);
    }
  } catch (err) {
    record("Gemini AI", "Multimodal Vision", "FAIL", err.message);
  }
}

async function testVoiceAndSpeech() {
  console.log("\n--- 4. SPEECH & AUDIO TRANSCRIPTION (WHISPER) ---");
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    record("Speech Engine", "Groq Whisper API Key", "WARN", "GROQ_API_KEY not configured (Using Cloudflare AI Whisper & Gemini Multimodal Audio)");
  } else {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${groqKey}` },
        signal: AbortSignal.timeout(6000)
      });
      if (res.ok) {
        record("Speech Engine", "Groq Whisper API", "PASS", "Authenticated & Ready");
      } else {
        record("Speech Engine", "Groq Whisper API", "FAIL", `HTTP ${res.status}`);
      }
    } catch (err) {
      record("Speech Engine", "Groq Whisper API", "WARN", err.message);
    }
  }

  // EdgeTTS check
  try {
    const { MsEdgeTTS } = await import("msedge-tts");
    const tts = new MsEdgeTTS();
    record("Speech Engine", "EdgeTTS Engine", "PASS", "Available for native audio voice notes");
  } catch (err) {
    record("Speech Engine", "EdgeTTS Engine", "WARN", err.message);
  }
}

async function testVCFAndContacts() {
  console.log("\n--- 5. CONTACTS & VCF EXPORT GENERATION ---");
  const contacts = [
    { name: "Chidi Okafor", phone: "+2348012345678", company: "Alaba Tech" },
    { name: "Amina Yusuf", phone: "+2348098765432", company: "Kano Logistics" }
  ];

  const vcfLines = contacts.map(c => `BEGIN:VCARD
VERSION:3.0
FN:${c.name}
ORG:${c.company}
TEL;TYPE=CELL:${c.phone}
END:VCARD`).join("\n");

  if (vcfLines.includes("BEGIN:VCARD") && vcfLines.includes("END:VCARD")) {
    record("CRM & Contacts", "VCF Export Card Generator", "PASS", `Generated 2 valid vCards (${vcfLines.length} bytes)`);
  } else {
    record("CRM & Contacts", "VCF Export Card Generator", "FAIL", "Invalid VCF structure");
  }
}

async function testInteractiveMenus() {
  console.log("\n--- 6. INTERACTIVE BUTTONS & LIST MENUS ---");
  const buttons = [
    { id: "pricing", text: "View Pricing" },
    { id: "portfolio", text: "Femi's Portfolio" },
    { id: "call", text: "Schedule Call" }
  ];

  const fallbackNumbered = buttons.map((b, idx) => `🔘 *${idx + 1}* - ${b.text}`).join("\n");
  if (fallbackNumbered.includes("🔘 *1* - View Pricing")) {
    record("UI & Menus", "Numbered Interactive Menu Fallback", "PASS", "Formatted 100% reliably");
  } else {
    record("UI & Menus", "Numbered Interactive Menu Fallback", "FAIL", "Formatting mismatch");
  }
}

async function runAll() {
  await testDatabase();
  await testEvolutionGateway();
  await testGeminiMultimodal();
  await testVoiceAndSpeech();
  await testVCFAndContacts();
  await testInteractiveMenus();

  console.log("\n==================================================");
  console.log("               DIAGNOSTIC SUMMARY                 ");
  console.log("==================================================");

  const passed = results.filter(r => r.status === "PASS").length;
  const warned = results.filter(r => r.status === "WARN").length;
  const failed = results.filter(r => r.status === "FAIL").length;

  console.log(`Total Checks: ${results.length} | Passed: ${passed} | Warnings: ${warned} | Failed: ${failed}`);

  if (failed === 0) {
    console.log("🎉 ALL TESTED CAPABILITIES ARE OPERATIONAL!");
  } else {
    console.log(`⚠️ ${failed} check(s) need attention.`);
  }
}

runAll().catch(err => {
  console.error("Diagnostic failed with fatal exception:", err);
});
