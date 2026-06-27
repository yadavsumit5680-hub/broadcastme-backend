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

function startClient() {
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
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
    console.log('WhatsApp Connected!');
  });

  client.on('disconnected', () => {
    isReady = false;
    console.log('Disconnected');
    startClient();
  });

  client.initialize();
}

startClient();

app.get('/qr', (req, res) => {
  if (isReady) return res.json({ status: 'connected' });
  res.json({ qr: qrCodeData });
});

app.get('/status', (req, res) => {
  res.json({ connected: isReady });
});

app.post('/send', async (req, res) => {
  const { phone, message } = req.body;
  if (!isReady) return res.status(400).json({ error: 'WhatsApp not connected' });
  try {
    const number = phone.replace(/\D/g, '');
    await client.sendMessage(`${number}@c.us`, message);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/disconnect', async (req, res) => {
  await client.logout();
  isReady = false;
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
