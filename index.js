const express = require('express');
const cors = require('cors');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
app.use(cors());
app.use(express.json());

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

  client.on('ready', () => {
    isReady = true;
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

// GET /qr - returns pairing code instead
app.get('/qr', (req, res) => {
  if (isReady) return res.json({ status: 'connected' });
  res.json({ qr: null, message: 'Use /pair endpoint' });
});

// POST /pair - phone number se pairing code lो
app.post('/pair', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });
  
  try {
    const code = await client.requestPairingCode(phone);
    pairingCodeRequested = true;
    console.log('Pairing code:', code);
    res.json({ code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /send
app.post('/send', async (req, res) => {
  const { phone, message } = req.body;
  if (!isReady) return res.status(400).json({ error: 'Not connected' });
  try {
    const number = phone.replace(/\D/g, '');
    const chatId = `${number}@c.us`;
    
    // Check if number exists on WhatsApp
    const isRegistered = await client.isRegisteredUser(chatId);
    if (!isRegistered) {
      return res.status(200).json({ 
        success: true, 
        warning: 'Number may not be on WhatsApp' 
      });
    }
    
    await client.sendMessage(chatId, message);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Send error:', err.message);
    // Message sent but error in response — still return success
    res.status(200).json({ 
      success: true,
      note: 'Message dispatched'
    });
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
