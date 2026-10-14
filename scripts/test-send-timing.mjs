async function testSendLong() {
  const url = 'https://evolution-api-latest-cx3y.onrender.com/message/sendText/obey-session';
  const apikey = 'FemiObey2026!';
  
  console.log('[' + new Date().toISOString() + '] Starting sendText to 2348120934828...');
  
  const startTime = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apikey
      },
      body: JSON.stringify({
        number: '2348120934828',
        text: '⚡ Obey WhatsApp Channel Test — Connected to Neon DB & Render!'
      })
    });
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[${new Date().toISOString()}] Response received in ${duration}s! Status: ${res.status}`);
    const text = await res.text();
    console.log('Body:', text);
  } catch (err) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[${new Date().toISOString()}] Request failed after ${duration}s:`, err.message);
  }
}

testSendLong();
