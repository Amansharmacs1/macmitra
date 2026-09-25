const store = require('./store');
async function drainQueue() {
  while (store.getPendingMessages().length > 0) {
    await new Promise(r => setTimeout(r, 10));
  }
  // extra tick to allow promises to settle
  await new Promise(r => setTimeout(r, 50));
}
module.exports = { drainQueue };
