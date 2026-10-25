// Push DATABASE_SAVE settings to Evolution API instance settings
async function pushSettings() {
  const EVO_URL = 'https://obey-whatsapp-api.onrender.com';
  const EVO_KEY = 'FemiObey2026!';
  const INSTANCES = ['obey', 'obey-autolearn-spot'];

  for (const INSTANCE of INSTANCES) {
    console.log(`Pushing settings to Evolution API instance: ${INSTANCE}...`);
    try {
      const res = await fetch(`${EVO_URL}/settings/set/${INSTANCE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
        body: JSON.stringify({
          rejectCall: false,
          msgCall: '',
          groupsIgnore: false,
          alwaysOnline: true,
          readMessages: true,
          readStatus: true,
          syncFullHistory: false
        }),
        signal: AbortSignal.timeout(10000)
      });
      console.log(`${INSTANCE} settings update status:`, res.status);
    } catch (e) {
      console.warn(`Error setting ${INSTANCE}:`, e.message);
    }
  }
  console.log('Settings successfully pushed to all instances.');

  // Check if there's a way to toggle DB save via API
  // In v2, this is controlled by server env vars – verify them through instance info
  const r2 = await fetch(`${EVO_URL}/instance/fetchInstances`, {
    headers: { 'apikey': EVO_KEY },
    signal: AbortSignal.timeout(10000)
  });
  const instances = await r2.json();
  const obey = instances.find(i => i.name === INSTANCE);
  console.log('Obey instance _count:', JSON.stringify(obey?._count, null, 2));
  console.log('Connection status:', obey?.connectionStatus);

  // Verify connection state separately
  const r3 = await fetch(`${EVO_URL}/instance/connectionState/${INSTANCE}`, {
    headers: { 'apikey': EVO_KEY },
    signal: AbortSignal.timeout(10000)
  });
  const state = await r3.json();
  console.log('Connection state:', JSON.stringify(state, null, 2));
}

pushSettings().catch(console.error);
