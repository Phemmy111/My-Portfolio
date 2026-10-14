import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const sql = neon(url);

  console.log("Cleaning up generic/fake seed data in Neon DB...");

  // 1. Delete generic fake leads
  await sql`
    DELETE FROM leads 
    WHERE id IN ('lead-1', 'lead-2', 'lead-3', 'lead-wa-1791950586670', 'lead-wa-1791950654611', 'lead-wa-1791951069155')
       OR email IN ('tunde@apexlogistics.ng', 'sophia@luminarybeauty.com', 'david@afrovibemedia.io', 'contact@swiftdrop.ng')
  `;

  // 2. Delete any generic fake proposals
  await sql`
    DELETE FROM proposals 
    WHERE id = 'prop-1' 
       OR job_title LIKE '%automated customer onboarding pipeline%'
  `;

  // 3. Delete any generic fake inquiries
  await sql`
    DELETE FROM inquiries 
    WHERE id = 'inq-1' 
       OR email = 'kola@zenithenterprises.org'
  `;

  // 4. Upsert REAL WhatsApp Inbound Lead (God's Grace Ambassador)
  await sql`
    INSERT INTO leads (
      id, name, company, email, service_needed, status, niche, notes, draft_subject, draft_body, created_at
    ) VALUES (
      'lead-wa-2349074027451',
      'God''s Grace Ambassador 🔥',
      'Grace Cakes & Pastries',
      '2349074027451@whatsapp.contact',
      'Web Development',
      'replied',
      'Bakery & E-Commerce Booking',
      'Inbound WhatsApp client requesting a bespoke e-commerce platform & custom cake booking system (flavors, tiers, delivery date picker) inspired by the Jeweller Hub showcase.',
      'Re: Custom E-Commerce & Cake Ordering Platform Build',
      'Hello,\n\nFollowing up on our conversation regarding the e-commerce platform for your cake business.\n\nHere is how we can structure the build:\n1. Interactive Showcase Catalog & Custom Booking Flow (flavors, tiers, delivery date picker)\n2. Seamless Online Checkout & WhatsApp Order Notifications\n3. Real-Time Admin Inventory & Order Management Dashboard\n\nLooking forward to speaking further on the discovery call.\n\nBest regards,\nFemi Adeleke',
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      company = EXCLUDED.company,
      service_needed = EXCLUDED.service_needed,
      status = EXCLUDED.status,
      niche = EXCLUDED.niche,
      notes = EXCLUDED.notes,
      draft_subject = EXCLUDED.draft_subject,
      draft_body = EXCLUDED.draft_body
  `;

  // 5. Upsert REAL Web Visitor Inquiry
  await sql`
    INSERT INTO inquiries (
      id, name, email, service, message, status, created_at
    ) VALUES (
      'inq-web-session-live',
      'Website Visitor (Live Web Chat)',
      'visitor@femiadelekeportfolio.vercel.app',
      'Custom Web Application',
      'Inbound live chat inquiry: "I need a custom web application. How can I book a discovery call with Femi to discuss architecture and MVP timeline?"',
      'unread',
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      message = EXCLUDED.message,
      status = EXCLUDED.status
  `;

  console.log("✅ Neon DB successfully purged of generic data and updated with real records!");

  const finalLeads = await sql`SELECT count(*) FROM leads`;
  const finalProps = await sql`SELECT count(*) FROM proposals`;
  const finalInqs = await sql`SELECT count(*) FROM inquiries`;

  console.log("Current Live DB Records:", {
    leads: finalLeads[0].count,
    proposals: finalProps[0].count,
    inquiries: finalInqs[0].count
  });
}

main().catch(console.error);
