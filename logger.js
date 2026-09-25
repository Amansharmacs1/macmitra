function maskPhone(phone) {
  if (!phone || phone.length <= 4) return phone;
  return phone.slice(0, -4).replace(/./g, '*') + phone.slice(-4);
}

function redactText(text) {
  if (!text) return text;
  // Simple redaction: log only length or a snippet if needed, but for safety return masked
  return `[REDACTED_TEXT: ${text.length} chars]`;
}

const logger = {
  info: (msg, data = {}) => {
    const safeData = { ...data };
    if (safeData.from) safeData.from = maskPhone(safeData.from);
    if (safeData.text) safeData.text = redactText(safeData.text);
    console.log(`[INFO] ${msg}`, Object.keys(safeData).length ? safeData : '');
  },
  error: (msg, err, data = {}) => {
    const safeData = { ...data };
    if (safeData.from) safeData.from = maskPhone(safeData.from);
    if (safeData.text) safeData.text = redactText(safeData.text);
    console.error(`[ERROR] ${msg}`, err || '', Object.keys(safeData).length ? safeData : '');
  }
};

module.exports = logger;
