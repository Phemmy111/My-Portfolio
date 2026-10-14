import fs from 'fs';

async function main() {
  const url = 'https://evolution-api-latest-cx3y.onrender.com/instance/connect/obey-session';
  const res = await fetch(url, {
    headers: { apikey: 'FemiObey2026!' }
  });
  const data = await res.json();
  console.log('Connect response keys:', Object.keys(data));
  
  const base64 = data.base64 || data.qrcode?.base64 || data.code;
  if (base64) {
    const cleanBase64 = base64.replace(/^data:image\/png;base64,/, '');
    const outPath = 'C:\\Users\\ACER\\.gemini\\antigravity\\brain\\c16a62ad-6f06-479f-8193-91b34d005342\\whatsapp_qr.png';
    fs.writeFileSync(outPath, Buffer.from(cleanBase64, 'base64'));
    console.log('Saved fresh QR code to:', outPath);
  } else {
    console.log('No QR code returned. Full response:', JSON.stringify(data));
  }
}

main().catch(console.error);
