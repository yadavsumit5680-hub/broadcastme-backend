const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
app.use(cors());
app.use(express.json());

let qrCodeData = '';
let isReady = false;
let client;
let pairingCodeRequested = false;

function startClient() {
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process'
      ]
    }
  });

  client.on('qr', async (qr) => {
    isReady = false;
    qrCodeData = await qrcode.toDataURL(qr);
    console.log('QR Generated');
  });

  client.on('ready', () => {
    isReady = true;
    qrCodeData = '';
    pairingCodeRequested = false;
    console.log('WhatsApp Connected!');
  });

  client.on('disconnected', () => {
    isReady = false;
    pairingCodeRequested = false;
    console.log('Disconnected');
    setTimeout(() => startClient(), 5000);
  });

  client.initialize();
}

startClient();

// GET /status
app.get('/status', (req, res) => {
  res.json({ connected: isReady });
});

// GET /qr
app.get('/qr', (req, res) => {
  if (isReady) return res.json({ status: 'connected' });
  res.json({ qr: qrCodeData });
});

// POST /pair
app.post('/pair', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });
  try {
    const code = await client.requestPairingCode(phone);
    pairingCodeRequested = true;
    console.log('Pairing code generated');
    res.json({ code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /send
app.post('/send', async (req, res) => {
  const { phone, message } = req.body;
  if (!isReady) {
    return res.status(400).json({ error: 'Not connected' });
  }
  try {
    const number = phone.replace(/\D/g, '');
    const chatId = `${number}@c.us`;
    await client.sendMessage(chatId, message);
    console.log(`Message sent to ${number}`);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Send error:', err.message);
    // Restart client on frame error
    if (err.message.includes('detached Frame') || 
        err.message.includes('Session closed')) {
      isReady = false;
      setTimeout(() => startClient(), 3000);
    }
    res.status(200).json({ success: true });
  }
});

// POST /disconnect
app.post('/disconnect', async (req, res) => {
  try {
    await client.logout();
    isReady = false;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Keep alive
setInterval(() => {
  console.log('Server alive...');
}, 4 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
