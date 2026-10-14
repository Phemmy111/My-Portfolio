async function main() {
  console.log("Simulating webhook call with @lid...");
  const payload = {
    event: "messages.upsert",
    instance: "obey",
    data: {
      key: {
        remoteJid: "164213964194040@lid",
        fromMe: false,
        id: "TEST_" + Date.now()
      },
      pushName: "Femi Adeleke",
      message: {
        conversation: "Hello Obey, are you online?"
      }
    }
  };

  const res = await fetch("https://femiadelekeportfolio.vercel.app/api/obey/whatsapp/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  console.log("Status:", res.status);
  const data = await res.json();
  console.log("Response:", data);
}

main().catch(console.error);
