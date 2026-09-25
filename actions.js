const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
require('dotenv').config();

function runCommand(command, args) {
  return spawnSync(command, args, { encoding: 'utf-8' });
}

async function play(songName) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new Error('YOUTUBE_API_KEY is missing or invalid in .env');
  }

  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(songName)}&type=video&key=${apiKey}`);
  const data = await res.json();

  if (data.error) {
    throw new Error(`YouTube API Error: ${data.error.message}`);
  }

  if (!data.items || data.items.length === 0) {
    throw new Error('No videos found.');
  }

  const video = data.items[0];
  const videoId = video.id.videoId;
  const title = video.snippet.title;
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  console.log(`Found video: ${title}`);
  console.log(`Opening URL: ${url}`);
  console.log('Note: Browser autoplay policies might prevent the video from playing automatically.');

  const result = runCommand('open', [url]);
  if (result.error) {
    throw result.error;
  }
}

async function takePhoto() {
    const pbPicturesDir = path.join(os.homedir(), 'Pictures', 'Photo Booth Library', 'Pictures');
    let beforeFiles = [];
    try {
        if (fs.existsSync(pbPicturesDir)) {
            beforeFiles = fs.readdirSync(pbPicturesDir);
        }
    } catch (e) {
        // directory might not exist yet
    }

    const script = `
try
    tell application "Photo Booth"
        activate
    end tell
    delay 1.5
    tell application "System Events"
        if not (exists process "Photo Booth") then
            error "Photo Booth process not found"
        end if
        tell process "Photo Booth"
            click menu item "Take Photo" of menu "File" of menu bar 1
        end tell
    end tell
    return "Success"
on error errMsg number errNum
    return "Error: " & errMsg
end try
`;

    const result = runCommand('osascript', ['-e', script]);
    if (result.stdout && result.stdout.includes("Error:")) {
        throw new Error(`Failed to take photo. You may need to grant Accessibility permissions to your terminal, or Camera access to Photo Booth. Details: ${result.stdout.trim()}`);
    } else if (result.error) {
        throw result.error;
    }

    console.log("Triggered Photo Booth shutter (waiting for countdown to complete)...");
    
    let newPhotoPath = null;
    for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
            if (fs.existsSync(pbPicturesDir)) {
                const afterFiles = fs.readdirSync(pbPicturesDir);
                const newFiles = afterFiles.filter(f => !beforeFiles.includes(f));
                if (newFiles.length > 0) {
                    console.log(`Photo verified saved: ${newFiles[0]}`);
                    newPhotoPath = path.join(pbPicturesDir, newFiles[0]);
                    break;
                }
            }
        } catch(e) {
            // ignore
        }
    }
    
    if (!newPhotoPath) {
        throw new Error("Could not verify that a photo was saved. The camera might require permission or the process was interrupted.");
    }
    return newPhotoPath;
}

function takeScreenshot() {
  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filepath = path.join(screenshotsDir, `screenshot_${timestamp}.png`);
  
  const result = runCommand('screencapture', ['-x', filepath]);
  if (result.status !== 0 || result.error || !fs.existsSync(filepath)) {
    throw new Error(`Failed to take screenshot: ${result.stderr || (result.error && result.error.message) || 'File not created'}`);
  }
  return filepath;
}

function createReminder(title, datetime) {
  // datetime should be a valid string format that AppleScript can parse, e.g., "9/26/2026 14:00"
  // If datetime is empty, it makes a generic reminder
  let script = `tell application "Reminders"\n`;
  script += `  set newReminder to make new reminder with properties {name:"${title.replace(/"/g, '\\"')}"}\n`;
  if (datetime) {
    script += `  try\n`;
    script += `    set remindDate to date "${datetime}"\n`;
    script += `    set due date of newReminder to remindDate\n`;
    script += `  on error\n`;
    script += `    error "Could not parse date/time. Reminders expects system-locale date format."\n`;
    script += `  end try\n`;
  }
  script += `end tell\n`;
  
  const result = runCommand('osascript', ['-e', script]);
  if (result.status !== 0 || result.error || (result.stderr && result.stderr.includes('error'))) {
    throw new Error(`Failed to create reminder: ${result.stderr || (result.error && result.error.message)}`);
  }
  return true;
}

function openApp(appName) {
  const result = runCommand('open', ['-a', appName]);
  if (result.status !== 0 || result.error) {
    throw new Error(`Failed to open app: ${result.stderr || (result.error && result.error.message)}`);
  }
  console.log(`Opened app: ${appName}`);
}

function openUrl(url) {
  const result = runCommand('open', [url]);
  if (result.status !== 0 || result.error) {
    throw new Error(`Failed to open URL: ${result.stderr || (result.error && result.error.message)}`);
  }
  console.log(`Opened URL: ${url}`);
}

function status() {
  console.log("Local agent is working. System ready.");
}

function setVolume(level) {
  const vol = parseInt(level, 10);
  if (isNaN(vol) || vol < 0 || vol > 100) {
    throw new Error('Volume must be a number between 0 and 100.');
  }
  const result = runCommand('osascript', ['-e', `set volume output volume ${vol}`]);
  if (result.status !== 0 || result.error) throw new Error('Failed to set volume.');
}

function mute() {
  const result = runCommand('osascript', ['-e', 'set volume with output muted']);
  if (result.status !== 0 || result.error) throw new Error('Failed to mute volume.');
}

function unmute() {
  const result = runCommand('osascript', ['-e', 'set volume without output muted']);
  if (result.status !== 0 || result.error) throw new Error('Failed to unmute volume.');
}

module.exports = {
  play,
  takePhoto,
  takeScreenshot,
  createReminder,
  openApp,
  openUrl,
  status,
  setVolume,
  mute,
  unmute
};
