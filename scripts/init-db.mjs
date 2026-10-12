import { neon } from "@neondatabase/serverless";

const dbUrl = "postgresql://neondb_owner:npg_JjwKqG1xtk4W@ep-dawn-feather-b5pjlp0o.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require";
const sql = neon(dbUrl);

async function main() {
  console.log("Connecting to Neon PostgreSQL...");
  const [test] = await sql`SELECT 1 as connected`;
  console.log("Connected successfully:", test);

  console.log("Creating leads table...");
  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      company           TEXT,
      email             TEXT NOT NULL,
      service_needed    TEXT,
      status            TEXT DEFAULT 'new',
      niche             TEXT,
      notes             TEXT,
      draft_subject     TEXT,
      draft_body        TEXT,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      last_contacted_at TIMESTAMPTZ
    )
  `;

  console.log("Creating proposals table...");
  await sql`
    CREATE TABLE IF NOT EXISTS proposals (
      id                  TEXT PRIMARY KEY,
      platform            TEXT NOT NULL,
      job_title           TEXT NOT NULL,
      job_description     TEXT NOT NULL,
      angle               TEXT,
      generated_proposal  TEXT NOT NULL,
      relevant_projects   TEXT[],
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  console.log("Creating inquiries table...");
  await sql`
    CREATE TABLE IF NOT EXISTS inquiries (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      email      TEXT NOT NULL,
      service    TEXT,
      message    TEXT NOT NULL,
      status     TEXT DEFAULT 'unread',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  console.log("Migrating initial seed data...");
  const [existingLead] = await sql`SELECT COUNT(*)::int as count FROM leads`;
  if (existingLead.count === 0) {
    await sql`
      INSERT INTO leads (id, name, company, email, service_needed, status, niche, notes, draft_subject, draft_body)
      VALUES 
      ('lead-1', 'Tunde Bakare', 'Apex Logistics Ltd', 'tunde@apexlogistics.ng', 'Automation / n8n', 'new', 'Supply Chain & Delivery', 'Needs automated tracking via WhatsApp', 'Automating Apex Logistics manual operations', 'Hi Tunde,\n\nI noticed you need automated order tracking...'),
      ('lead-2', 'Sophia Martinez', 'Luminary Beauty', 'sophia@luminarybeauty.com', 'Web Development', 'drafted', 'E-Commerce', 'Shopify to Next.js migration. Reference OKIKI Store.', 'Enhancing Luminary Beauty digital web experience', 'Hi Sophia,\n\nLooking into your e-commerce operations...')
    `;
    console.log("Seeded initial leads!");
  }

  console.log("ALL TABLES CREATED AND READY IN NEON DB!");
}

main().catch(console.error);
