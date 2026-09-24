const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const crypto = require('crypto');
// Mock environment variables for tests
process.env.WA_APP_SECRET = 'test_secret';
process.env.WA_VERIFY_TOKEN = 'test_verify_token';
process.env.WA_PHONE_NUMBER_ID = '12345';
process.env.OWNER_WA_ID = '98765';
process.env.WA_ACCESS_TOKEN = 'test_access_token';

const { app, processedMessages, pendingConfirmations } = require('./server');

function generateSignature(body, secret) {
  const hash = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${hash}`;
}

test('Webhook GET verification succeeds with correct token', async () => {
  const res = await request(app)
    .get('/webhook?hub.mode=subscribe&hub.verify_token=test_verify_token&hub.challenge=CHALLENGE123');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.text, 'CHALLENGE123');
});

test('Webhook GET verification fails with incorrect token', async () => {
  const res = await request(app)
    .get('/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=CHALLENGE123');
  assert.strictEqual(res.status, 403);
});

test('Webhook POST rejects missing signature', async () => {
  const res = await request(app)
    .post('/webhook')
    .send({ object: 'whatsapp_business_account' });
  assert.strictEqual(res.status, 401);
});

test('Webhook POST rejects invalid signature', async () => {
  const bodyString = JSON.stringify({ object: 'whatsapp_business_account' });
  const res = await request(app)
    .post('/webhook')
    .set('x-hub-signature-256', 'sha256=invalidhash')
    .set('Content-Type', 'application/json')
    .send(bodyString);
  assert.strictEqual(res.status, 401);
});

test('Webhook POST accepts valid signature and ignores unauthorized sender', async () => {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: '12345' },
          messages: [{
            id: 'msg1',
            type: 'text',
            from: 'unauthorized_number', // Not OWNER_WA_ID
            text: { body: 'status' }
          }]
        }
      }]
    }]
  };
  const bodyString = JSON.stringify(payload);
  const signature = generateSignature(bodyString, process.env.WA_APP_SECRET);

  const res = await request(app)
    .post('/webhook')
    .set('x-hub-signature-256', signature)
    .set('Content-Type', 'application/json')
    .send(bodyString);
  
  assert.strictEqual(res.status, 200);
  // msg1 should be recorded as processed, but command not handled for unauthorized sender
  assert.strictEqual(processedMessages.has('msg1'), true);
});

test('Webhook POST correctly handles duplicate delivery', async () => {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: '12345' },
          messages: [{
            id: 'msg2',
            type: 'text',
            from: '98765',
            text: { body: 'status' }
          }]
        }
      }]
    }]
  };
  const bodyString = JSON.stringify(payload);
  const signature = generateSignature(bodyString, process.env.WA_APP_SECRET);

  // Send first time
  const res1 = await request(app)
    .post('/webhook')
    .set('x-hub-signature-256', signature)
    .set('Content-Type', 'application/json')
    .send(bodyString);
  assert.strictEqual(res1.status, 200);

  // Send second time (duplicate)
  const res2 = await request(app)
    .post('/webhook')
    .set('x-hub-signature-256', signature)
    .set('Content-Type', 'application/json')
    .send(bodyString);
  assert.strictEqual(res2.status, 200);
  // It shouldn't crash or re-process. 
});

test('Webhook POST sets pending confirmation for take photo', async () => {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: '12345' },
          messages: [{
            id: 'msg3',
            type: 'text',
            from: '98765',
            text: { body: 'take a photo' }
          }]
        }
      }]
    }]
  };
  const bodyString = JSON.stringify(payload);
  const signature = generateSignature(bodyString, process.env.WA_APP_SECRET);

  const res = await request(app)
    .post('/webhook')
    .set('x-hub-signature-256', signature)
    .set('Content-Type', 'application/json')
    .send(bodyString);
  
  assert.strictEqual(res.status, 200);
  assert.strictEqual(pendingConfirmations.has('98765'), true);
});

test('Webhook POST expires old confirmation', async () => {
  // Insert an expired confirmation
  pendingConfirmations.set('98765', { code: '1234', action: 'take-photo', timestamp: Date.now() - 130000 });
  
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: '12345' },
          messages: [{
            id: 'msg4',
            type: 'text',
            from: '98765',
            text: { body: 'confirm 1234' }
          }]
        }
      }]
    }]
  };
  const bodyString = JSON.stringify(payload);
  const signature = generateSignature(bodyString, process.env.WA_APP_SECRET);

  const res = await request(app)
    .post('/webhook')
    .set('x-hub-signature-256', signature)
    .set('Content-Type', 'application/json')
    .send(bodyString);
  
  assert.strictEqual(res.status, 200);
  assert.strictEqual(pendingConfirmations.has('98765'), false); // it should have deleted the expired confirmation
});
