const express = require('express');
const crypto = require('crypto');
const { play, takePhoto, takeScreenshot, createReminder, openApp, openUrl, status, setVolume, mute, unmute } = require('./actions');
const { sendWhatsAppImage } = require('./whatsappMedia');
const { validateApp, validateUrl } = require('./validation');
const store = require('./store');
const logger = require('./logger');
require('dotenv').config();

const app = express();

const APP_SECRET = process.env.WA_APP_SECRET;
const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN;
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID;
const OWNER_WA_ID = process.env.OWNER_WA_ID;
const WA_ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN;

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

// Phase 4: Health check endpoint
app.get('/health', (req, res) => {
  const waConfigured = !!(APP_SECRET && VERIFY_TOKEN && WA_PHONE_NUMBER_ID && WA_ACCESS_TOKEN && OWNER_WA_ID);
  
  let macReady = false;
  try {
    const result = require('child_process').spawnSync('osascript', ['-e', 'tell application "System Events" to return true'], { timeout: 2000 });
    macReady = result.status === 0;
  } catch (e) {
    // Ignore error
  }

  res.json({
    server: 'running',
    whatsapp: waConfigured ? 'configured' : 'missing_credentials',
    mac_permissions: macReady ? 'ready' : 'not_ready'
  });
});

async function sendWhatsAppReply(to, text, retries = 3) {
  if (!WA_ACCESS_TOKEN || !WA_PHONE_NUMBER_ID) {
    logger.error('Missing WA_ACCESS_TOKEN or WA_PHONE_NUMBER_ID');
    return false;
  }
  
  const maxRetries = process.env.NODE_ENV === 'test' ? 1 : retries;
  for (let i = 0; i < maxRetries; i++) {
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
      if (res.ok) {
        return true;
      }
      const errorText = await res.text();
      logger.error(`WhatsApp API Error (Attempt ${i + 1}):`, errorText);
    } catch (err) {
      logger.error(`WhatsApp request failed (Attempt ${i + 1}):`, err);
    }
    // Exponential backoff
    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
  }
  return false;
}

function generateCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

let isProcessingQueue = false;

async function processQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  try {
    let pendingTasks = store.getPendingMessages();
    while (pendingTasks.length > 0) {
      const task = pendingTasks[0];
      logger.info(`Processing task`, { id: task.id, from: task.from });
      
      try {
        await handleCommand(task.id, task.from, task.text);
        store.setProcessedMessage(task.id, { status: 'success' });
        logger.info(`Task completed`, { id: task.id });
      } catch (err) {
        logger.error(`Task failed`, err, { id: task.id });
        store.setProcessedMessage(task.id, { status: 'failed', result: err.message });
      }
      
      // Re-fetch in case new tasks arrived
      pendingTasks = store.getPendingMessages();
    }
  } finally {
    isProcessingQueue = false;
  }
}

app.post('/webhook', (req, res) => {
  if (!APP_SECRET) {
    logger.error('WA_APP_SECRET is not configured');
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

  let tasksAdded = false;

  const entries = body.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const value = change.value;
      if (!value || !value.messages) continue;
      
      if (value.metadata && value.metadata.phone_number_id !== WA_PHONE_NUMBER_ID) {
        continue;
      }
      
      for (const message of value.messages) {
        if (message.type !== 'text') continue;

        const messageId = message.id;
        
        // Deduplicate messages across restarts
        const existing = store.getProcessedMessage(messageId);
        if (existing) {
          logger.info(`Skipping duplicate webhook`, { id: messageId });
          continue;
        }

        const from = message.from;
        if (from !== OWNER_WA_ID) {
          logger.info(`Ignoring unauthorized sender`, { from });
          continue;
        }

        const text = message.text.body.trim();
        
        // Save to store as pending
        store.setProcessedMessage(messageId, {
          id: messageId,
          from: from,
          text: text,
          status: 'pending'
        });
        tasksAdded = true;
      }
    }
  }

  // Phase 4: Acknowledge valid webhooks promptly
  res.sendStatus(200);

  if (tasksAdded) {
    // Process queue asynchronously
    processQueue();
  }
});

async function handleCommand(msgId, from, text) {
  // Process pending confirmation
  const confirmation = store.getPendingConfirmation(from);
  if (confirmation) {
    // Phase 4: Expiry logic for persistency
    if (Date.now() - confirmation.timestamp > 120000) {
      store.deletePendingConfirmation(from);
      await sendWhatsAppReply(from, 'Previous confirmation code expired.');
    } else {
      const lower = text.toLowerCase();
      if (lower.startsWith('confirm')) {
        const parts = lower.split(' ');
        if (parts[1] === confirmation.code) {
           store.deletePendingConfirmation(from);
           await executeAction(from, confirmation.action, confirmation.args);
           return;
        } else {
           await sendWhatsAppReply(from, 'Invalid confirmation code.');
           return;
        }
      } else if (lower === 'cancel') {
        store.deletePendingConfirmation(from);
        await sendWhatsAppReply(from, 'Action cancelled.');
        return;
      }
    }
  }

  const lowerText = text.toLowerCase();
  
  if (lowerText === 'status') {
     await sendWhatsAppReply(from, 'Local agent is working. System ready.');
  } else if (lowerText === 'help') {
     await sendWhatsAppReply(from, 'Commands: status, play <song>, open <app>, open <url>, take a photo, screenshot, volume <0-100|mute|unmute>, remind me to <title>, help');
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
     store.setPendingConfirmation(from, code, 'take-photo');
     await sendWhatsAppReply(from, `Action: Take a Photo using Photo Booth.\nReply with "confirm ${code}" within 2 minutes to execute, or "cancel" to abort.`);
  } else if (lowerText === 'screenshot' || lowerText === 'take screenshot' || lowerText === 'take a screenshot') {
     const code = generateCode();
     store.setPendingConfirmation(from, code, 'take-screenshot');
     await sendWhatsAppReply(from, `Action: Take a screenshot.\nReply with "confirm ${code}" within 2 minutes to execute, or "cancel" to abort.`);
  } else if (lowerText.startsWith('volume ')) {
     const level = lowerText.substring(7).trim();
     try {
       if (level === 'mute') mute();
       else if (level === 'unmute') unmute();
       else setVolume(level);
       await sendWhatsAppReply(from, `Volume set to ${level}.`);
     } catch (e) {
       await sendWhatsAppReply(from, `Error setting volume: ${e.message}`);
     }
  } else if (lowerText.startsWith('remind me to ')) {
     const title = text.substring(13).trim();
     const code = generateCode();
     store.setPendingConfirmation(from, code, 'create-reminder', { title, datetime: '' });
     await sendWhatsAppReply(from, `Action: Create reminder "${title}".\nReply with "confirm ${code}" within 2 minutes to execute, or "cancel" to abort.`);
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
          store.setPendingConfirmation(from, code, 'take-photo');
          await sendWhatsAppReply(from, `Action: Take a Photo using Photo Booth.\nReply with "confirm ${code}" within 2 minutes to execute, or "cancel" to abort.`);
       } else if (aiResult.command === 'take-screenshot') {
          const code = generateCode();
          store.setPendingConfirmation(from, code, 'take-screenshot');
          await sendWhatsAppReply(from, `Action: Take a screenshot.\nReply with "confirm ${code}" within 2 minutes to execute, or "cancel" to abort.`);
       } else if (aiResult.command === 'volume') {
          if (!aiResult.args) throw new Error('Missing args for volume');
          try {
            const level = aiResult.args;
            if (level === 'mute') mute();
            else if (level === 'unmute') unmute();
            else setVolume(level);
            await sendWhatsAppReply(from, `Volume set to ${level}.`);
          } catch (e) {
            await sendWhatsAppReply(from, `Error setting volume: ${e.message}`);
          }
       } else if (aiResult.command === 'create-reminder') {
          if (!aiResult.args || !aiResult.args.title) throw new Error('Missing title for reminder');
          const code = generateCode();
          store.setPendingConfirmation(from, code, 'create-reminder', aiResult.args);
          await sendWhatsAppReply(from, `Action: Create reminder "${aiResult.args.title}"${aiResult.args.datetime ? ' at ' + aiResult.args.datetime : ''}.\nReply with "confirm ${code}" within 2 minutes to execute, or "cancel" to abort.`);
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
       logger.error('Gemini interpretation failed:', err);
       await sendWhatsAppReply(from, 'Unknown command and AI interpretation failed. Send "help" for a list of commands.');
     }
  }
}

async function executeAction(from, action, args = null) {
  if (action === 'take-photo') {
    try {
      const imagePath = await takePhoto();
      await sendWhatsAppReply(from, 'Photo successfully taken. Uploading...');
      await sendWhatsAppImage(from, imagePath);
    } catch (e) {
      await sendWhatsAppReply(from, `Error taking photo: ${e.message}`);
    }
  } else if (action === 'take-screenshot') {
    try {
      const imagePath = await takeScreenshot();
      await sendWhatsAppReply(from, 'Screenshot successfully taken. Uploading...');
      await sendWhatsAppImage(from, imagePath);
    } catch (e) {
      await sendWhatsAppReply(from, `Error taking screenshot: ${e.message}`);
    }
  } else if (action === 'create-reminder') {
    try {
      createReminder(args.title, args.datetime);
      await sendWhatsAppReply(from, `Reminder created: "${args.title}"${args.datetime ? ' at ' + args.datetime : ''}`);
    } catch (e) {
      await sendWhatsAppReply(from, `Error creating reminder: ${e.message}`);
    }
  }
}

module.exports = { app, processQueue };

// If started directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT}`);
    // Recover queued tasks from state on startup
    processQueue();
  });
}
