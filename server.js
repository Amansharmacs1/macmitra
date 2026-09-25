const express = require('express');
const crypto = require('crypto');
const { play, takePhoto, openApp, openUrl, status } = require('./actions');
const { validateApp, validateUrl } = require('./validation');
require('dotenv').config();

const app = express();

const APP_SECRET = process.env.WA_APP_SECRET;
const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN;
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID;
const OWNER_WA_ID = process.env.OWNER_WA_ID;
const WA_ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN;

const processedMessages = new Set();
const pendingConfirmations = new Map();

// Capture raw body for signature verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }
  return res.sendStatus(400);
});

async function sendWhatsAppReply(to, text) {
  if (!WA_ACCESS_TOKEN || !WA_PHONE_NUMBER_ID) {
    console.error('Missing WA_ACCESS_TOKEN or WA_PHONE_NUMBER_ID');
    return false;
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v17.0/${WA_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: text }
      })
    });
    if (!res.ok) {
        const errorText = await res.text();
        console.error('WhatsApp API Error:', errorText);
        return false;
    }
    return true;
  } catch (err) {
    console.error('WhatsApp request failed:', err);
    return false;
  }
}

function generateCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

app.post('/webhook', async (req, res) => {
  if (!APP_SECRET) {
    console.error('WA_APP_SECRET is not configured');
    return res.sendStatus(500);
  }

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    return res.sendStatus(401);
  }

  const hash = crypto.createHmac('sha256', APP_SECRET).update(req.rawBody).digest('hex');
  const expectedSignature = `sha256=${hash}`;
  if (signature !== expectedSignature) {
    return res.sendStatus(401);
  }

  const body = req.body;
  if (body.object !== 'whatsapp_business_account') {
    return res.sendStatus(404);
  }

  const entries = body.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const value = change.value;
      if (!value) continue;
      
      // Filter out events that aren't messages (e.g. status updates)
      if (!value.messages) continue;
      
      // Ensure the message was sent to the configured phone number
      if (value.metadata && value.metadata.phone_number_id !== WA_PHONE_NUMBER_ID) {
        continue;
      }
      
      for (const message of value.messages) {
        if (message.type !== 'text') continue;

        const messageId = message.id;
        // Deduplicate messages
        if (processedMessages.has(messageId)) {
          continue;
        }
        processedMessages.add(messageId);

        const from = message.from;
        if (from !== OWNER_WA_ID) {
          // Ignore messages from unauthorized senders completely
          continue;
        }

        const text = message.text.body.trim();
        await handleCommand(from, text);
      }
    }
  }

  res.sendStatus(200);
});

async function handleCommand(from, text) {
  // Process pending confirmation
  if (pendingConfirmations.has(from)) {
    const confirmation = pendingConfirmations.get(from);
    if (Date.now() - confirmation.timestamp > 120000) {
      pendingConfirmations.delete(from);
      // Expired. Fall through to standard command parsing or notify user.
      await sendWhatsAppReply(from, 'Previous confirmation code expired.');
    } else {
      const lower = text.toLowerCase();
      if (lower.startsWith('confirm')) {
        const parts = lower.split(' ');
        if (parts[1] === confirmation.code) {
           pendingConfirmations.delete(from);
           await executeAction(from, confirmation.action);
           return;
        } else {
           await sendWhatsAppReply(from, 'Invalid confirmation code.');
           return;
        }
      } else if (lower === 'cancel') {
        pendingConfirmations.delete(from);
        await sendWhatsAppReply(from, 'Action cancelled.');
        return;
      }
    }
  }

  const lowerText = text.toLowerCase();
  
  if (lowerText === 'status') {
     await sendWhatsAppReply(from, 'Local agent is working. System ready.');
  } else if (lowerText === 'help') {
     await sendWhatsAppReply(from, 'Commands: status, play <song>, open <app>, open <url>, take a photo, help');
  } else if (lowerText.startsWith('play ')) {
     const song = text.substring(5).trim();
     try {
       await play(song);
       await sendWhatsAppReply(from, `Playing ${song} on YouTube.`);
     } catch (e) {
       await sendWhatsAppReply(from, `Error playing song: ${e.message}`);
     }
  } else if (lowerText === 'take a photo' || lowerText === 'take photo' || lowerText === 'take-photo') {
     const code = generateCode();
     pendingConfirmations.set(from, { code, action: 'take-photo', timestamp: Date.now() });
     await sendWhatsAppReply(from, `Action: Take a Photo using Photo Booth.\nReply with "confirm ${code}" within 2 minutes to execute, or "cancel" to abort.`);
  } else if (lowerText.startsWith('open ')) {
     const target = text.substring(5).trim();
     if (target.startsWith('https://')) {
       if (validateUrl(target)) {
         try {
           openUrl(target);
           await sendWhatsAppReply(from, `Opened URL: ${target}`);
         } catch (e) {
           await sendWhatsAppReply(from, `Error opening URL: ${e.message}`);
         }
       } else {
         await sendWhatsAppReply(from, 'Invalid URL. Only HTTPS is supported.');
       }
     } else {
       if (validateApp(target)) {
         try {
           openApp(target);
           await sendWhatsAppReply(from, `Opened app: ${target}`);
         } catch (e) {
           await sendWhatsAppReply(from, `Error opening app: ${e.message}`);
         }
       } else {
         await sendWhatsAppReply(from, `App '${target}' is not in the allowlist.`);
       }
     }
  } else {
     // Phase 3: Fallback to Gemini
     try {
       const { interpretCommand } = require('./gemini');
       const aiResult = await interpretCommand(text);
       
       if (aiResult.command === 'status') {
          await sendWhatsAppReply(from, 'Local agent is working. System ready.');
       } else if (aiResult.command === 'play') {
          if (!aiResult.args) throw new Error('Missing args for play');
          try {
            await play(aiResult.args);
            await sendWhatsAppReply(from, `Playing ${aiResult.args} on YouTube.`);
          } catch (e) {
            await sendWhatsAppReply(from, `Error playing song: ${e.message}`);
          }
       } else if (aiResult.command === 'take-photo') {
          const code = generateCode();
          pendingConfirmations.set(from, { code, action: 'take-photo', timestamp: Date.now() });
          await sendWhatsAppReply(from, `Action: Take a Photo using Photo Booth.\nReply with "confirm ${code}" within 2 minutes to execute, or "cancel" to abort.`);
       } else if (aiResult.command === 'open-app') {
          if (!aiResult.args) throw new Error('Missing args for open-app');
          if (validateApp(aiResult.args)) {
            try {
              openApp(aiResult.args);
              await sendWhatsAppReply(from, `Opened app: ${aiResult.args}`);
            } catch (e) {
              await sendWhatsAppReply(from, `Error opening app: ${e.message}`);
            }
          } else {
            await sendWhatsAppReply(from, `App '${aiResult.args}' is not in the allowlist.`);
          }
       } else if (aiResult.command === 'open-url') {
          if (!aiResult.args) throw new Error('Missing args for open-url');
          if (validateUrl(aiResult.args)) {
            try {
              openUrl(aiResult.args);
              await sendWhatsAppReply(from, `Opened URL: ${aiResult.args}`);
            } catch (e) {
              await sendWhatsAppReply(from, `Error opening URL: ${e.message}`);
            }
          } else {
            await sendWhatsAppReply(from, 'Invalid URL. Only HTTPS is supported.');
          }
       } else if (aiResult.command === 'unsupported') {
          await sendWhatsAppReply(from, `Unsupported: ${aiResult.reason || 'I cannot do that.'}`);
       } else {
          await sendWhatsAppReply(from, 'Unknown command derived from AI. Send "help" for a list of commands.');
       }
     } catch (err) {
       console.error('Gemini interpretation failed:', err);
       await sendWhatsAppReply(from, 'Unknown command and AI interpretation failed. Send "help" for a list of commands.');
     }
  }
}

async function executeAction(from, action) {
  if (action === 'take-photo') {
    try {
      await takePhoto();
      await sendWhatsAppReply(from, 'Photo successfully taken and verified.');
    } catch (e) {
      await sendWhatsAppReply(from, `Error taking photo: ${e.message}`);
    }
  }
}

// Ensure the module exports the app and the maps for testing purposes
module.exports = { app, processedMessages, pendingConfirmations };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}
