const fs = require('fs');
const path = require('path');

const stateFile = path.join(__dirname, 'state.json');

// Memory cache
let state = {
  processedMessages: {},     // messageId -> { id, from, text, status, result, timestamp }
  pendingConfirmations: {},  // fromNumber -> { code, action, timestamp }
};

function loadState() {
  if (fs.existsSync(stateFile)) {
    try {
      const data = fs.readFileSync(stateFile, 'utf8');
      state = JSON.parse(data);
    } catch (e) {
      console.error('Failed to load state.json, starting fresh.', e);
    }
  }
}

function saveState() {
  try {
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('Failed to save state.json', e);
  }
}

function getProcessedMessage(id) {
  return state.processedMessages[id];
}

function setProcessedMessage(id, data) {
  state.processedMessages[id] = {
    ...state.processedMessages[id],
    ...data,
    timestamp: Date.now()
  };
  saveState();
}

function getPendingMessages() {
  return Object.values(state.processedMessages)
    .filter(msg => msg.status === 'pending')
    .sort((a, b) => a.timestamp - b.timestamp);
}

function getPendingConfirmation(from) {
  return state.pendingConfirmations[from];
}

function setPendingConfirmation(from, code, action, timestamp = Date.now()) {
  state.pendingConfirmations[from] = { code, action, timestamp };
  saveState();
}

function deletePendingConfirmation(from) {
  delete state.pendingConfirmations[from];
  saveState();
}

// Ensure state is loaded on require
loadState();

module.exports = {
  getProcessedMessage,
  setProcessedMessage,
  getPendingMessages,
  getPendingConfirmation,
  setPendingConfirmation,
  deletePendingConfirmation,
  // For testing
  _resetState: () => {
    state = { processedMessages: {}, pendingConfirmations: {} };
    if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
  }
};
