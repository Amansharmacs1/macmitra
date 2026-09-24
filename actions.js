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
    
    let newPhotoFound = false;
    for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
            if (fs.existsSync(pbPicturesDir)) {
                const afterFiles = fs.readdirSync(pbPicturesDir);
                const newFiles = afterFiles.filter(f => !beforeFiles.includes(f));
                if (newFiles.length > 0) {
                    console.log(`Photo verified saved: ${newFiles[0]}`);
                    newPhotoFound = true;
                    break;
                }
            }
        } catch(e) {
            // ignore
        }
    }
    
    if (!newPhotoFound) {
        throw new Error("Could not verify that a photo was saved. The camera might require permission or the process was interrupted.");
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

module.exports = {
  play,
  takePhoto,
  openApp,
  openUrl,
  status
};
