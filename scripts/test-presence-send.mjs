async function testSend() {
  const base = 'https://evolution-api-latest-cx3y.onrender.com';
  const apikey = 'FemiObey2026!';
  
  console.log('1. Sending presence...');
  const pres = await fetch(base + '/chat/sendPresence/obey', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey },
    body: JSON.stringify({ number: '2348120934828', presence: 'composing', delay: 500 })
  });
  console.log('Presence:', pres.status);

  console.log('2. Sending text...');
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    console.log('Aborting after 20s');
    controller.abort();
  }, 20000);

  try {
    const res = await fetch(base + '/message/sendText/obey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey },
      body: JSON.stringify({
        number: '2348120934828',
        text: 'Hello Boss! This is Obey testing WhatsApp delivery.'
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    console.log('SendText:', res.status, await res.text());
  } catch (e) {
    clearTimeout(timeout);
    console.error('SendText error:', e.message);
  }
}

testSend();
