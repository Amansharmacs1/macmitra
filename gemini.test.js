const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const crypto = require('crypto');

// Set env vars
process.env.WA_APP_SECRET = 'test_secret';
process.env.WA_VERIFY_TOKEN = 'test_verify_token';
process.env.WA_PHONE_NUMBER_ID = '12345';
process.env.OWNER_WA_ID = '98765';
process.env.WA_ACCESS_TOKEN = 'test_access_token';
process.env.GEMINI_API_KEY = 'test_gemini_key';

const { app, processedMessages, pendingConfirmations } = require('./server');
const gemini = require('./gemini');

function generateSignature(body, secret) {
  const hash = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${hash}`;
}

function makePayload(text, msgId) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: '12345' },
          messages: [{
            id: msgId,
            type: 'text',
            from: '98765',
            text: { body: text }
          }]
        }
      }]
    }]
  });
}

test('Gemini Fallback: English request to open app', async (t) => {
  t.mock.method(gemini, 'interpretCommand', async (text) => {
    assert.strictEqual(text, 'Can you please open Safari for me?');
    return { command: 'open-app', args: 'Safari' };
  });

  const body = makePayload('Can you please open Safari for me?', 'gemini1');
  const sig = generateSignature(body, 'test_secret');
  
  const res = await request(app).post('/webhook').set('x-hub-signature-256', sig).set('Content-Type', 'application/json').send(body);
  assert.strictEqual(res.status, 200);
});

test('Gemini Fallback: Hinglish request to play song', async (t) => {
  t.mock.method(gemini, 'interpretCommand', async (text) => {
    assert.strictEqual(text, 'Mera favourite gaana Kesariya play kardo');
    return { command: 'play', args: 'Kesariya' };
  });

  const body = makePayload('Mera favourite gaana Kesariya play kardo', 'gemini2');
  const sig = generateSignature(body, 'test_secret');
  
  const res = await request(app).post('/webhook').set('x-hub-signature-256', sig).set('Content-Type', 'application/json').send(body);
  assert.strictEqual(res.status, 200);
});

test('Gemini Fallback: Unsupported action', async (t) => {
  t.mock.method(gemini, 'interpretCommand', async (text) => {
    return { command: 'unsupported', reason: 'I cannot delete files.' };
  });

  const body = makePayload('delete all my files', 'gemini3');
  const sig = generateSignature(body, 'test_secret');
  
  const res = await request(app).post('/webhook').set('x-hub-signature-256', sig).set('Content-Type', 'application/json').send(body);
  assert.strictEqual(res.status, 200);
});

test('Gemini Fallback: Malformed model output', async (t) => {
  t.mock.method(gemini, 'interpretCommand', async (text) => {
    return { invalid_field: 'something' }; // Missing 'command'
  });

  const body = makePayload('do something weird', 'gemini4');
  const sig = generateSignature(body, 'test_secret');
  
  const res = await request(app).post('/webhook').set('x-hub-signature-256', sig).set('Content-Type', 'application/json').send(body);
  assert.strictEqual(res.status, 200); // Should catch error and reply Unknown command
});

test('Gemini Fallback: Gemini API failure', async (t) => {
  t.mock.method(gemini, 'interpretCommand', async (text) => {
    throw new Error('API Rate Limit Exceeded');
  });

  const body = makePayload('hello', 'gemini5');
  const sig = generateSignature(body, 'test_secret');
  
  const res = await request(app).post('/webhook').set('x-hub-signature-256', sig).set('Content-Type', 'application/json').send(body);
  assert.strictEqual(res.status, 200); // Server catches error gracefully
});

test('Gemini Fallback: Confirmation after Gemini photo request', async (t) => {
  t.mock.method(gemini, 'interpretCommand', async (text) => {
    return { command: 'take-photo' };
  });

  const body1 = makePayload('Take a picture using my Mac camera', 'gemini6');
  const sig1 = generateSignature(body1, 'test_secret');
  
  await request(app).post('/webhook').set('x-hub-signature-256', sig1).set('Content-Type', 'application/json').send(body1);
  
  // Verify confirmation was set
  assert.strictEqual(pendingConfirmations.has('98765'), true);
  const code = pendingConfirmations.get('98765').code;

  // Now confirm it
  const body2 = makePayload(`confirm ${code}`, 'gemini7');
  const sig2 = generateSignature(body2, 'test_secret');
  
  await request(app).post('/webhook').set('x-hub-signature-256', sig2).set('Content-Type', 'application/json').send(body2);
  
  // Verify confirmation is gone and action executed
  assert.strictEqual(pendingConfirmations.has('98765'), false);
});
