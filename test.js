const test = require('node:test');
const assert = require('node:assert');
const { validateApp, validateUrl } = require('./validation');

test('validateApp allows permitted apps', () => {
  assert.strictEqual(validateApp('Notes'), true);
  assert.strictEqual(validateApp('Calculator'), true);
  assert.strictEqual(validateApp('Safari'), true);
});

test('validateApp rejects unknown apps', () => {
  assert.strictEqual(validateApp('Terminal'), false);
  assert.strictEqual(validateApp('Spotify'), false);
  assert.strictEqual(validateApp(''), false);
});

test('validateUrl allows HTTPS urls', () => {
  assert.strictEqual(validateUrl('https://google.com'), true);
  assert.strictEqual(validateUrl('https://www.apple.com/mac/'), true);
  assert.strictEqual(validateUrl('https://github.com/path?query=1'), true);
});

test('validateUrl rejects HTTP and invalid urls', () => {
  assert.strictEqual(validateUrl('http://google.com'), false);
  assert.strictEqual(validateUrl('ftp://files.server.com'), false);
  assert.strictEqual(validateUrl('not-a-url'), false);
  assert.strictEqual(validateUrl('javascript:alert(1)'), false);
});
