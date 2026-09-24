function validateApp(appName) {
  const allowed = ['Notes', 'Calculator', 'Calendar', 'Safari', 'Music', 'Photo Booth', 'Maps', 'Weather'];
  return allowed.includes(appName);
}

function validateUrl(input) {
  try {
    const url = new URL(input);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

module.exports = { validateApp, validateUrl };
