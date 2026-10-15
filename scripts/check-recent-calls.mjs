import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL);
  
  const guestMsgs = await sql`
    SELECT * FROM guest_chat_messages 
    ORDER BY created_at DESC 
    LIMIT 6
  `;
  console.log("=== Latest guest_chat_messages ===");
  console.log(JSON.stringify(guestMsgs, null, 2));

  const obeyMsgs = await sql`
    SELECT * FROM obey_chat_messages 
    ORDER BY created_at DESC 
    LIMIT 4
  `;
  console.log("=== Latest obey_chat_messages ===");
  console.log(JSON.stringify(obeyMsgs, null, 2));
}

main().catch(console.error);
