#!/usr/bin/env node

const { play, takePhoto, openApp, openUrl, status } = require('./actions');
const { validateApp, validateUrl } = require('./validation');

async function main() {
  const [,, command, ...args] = process.argv;

  try {
    switch (command) {
      case 'play': {
        const songName = args.join(' ');
        if (!songName) {
          console.error("Usage: node cli.js play <song name>");
          process.exit(1);
        }
        await play(songName);
        break;
      }
      case 'take-photo': {
        await takePhoto();
        break;
      }
      case 'open-app': {
        const appName = args.join(' ');
        if (!appName) {
          console.error("Usage: node cli.js open-app <app name>");
          process.exit(1);
        }
        if (!validateApp(appName)) {
          console.error(`Error: App '${appName}' is not in the allowlist.`);
          process.exit(1);
        }
        openApp(appName);
        break;
      }
      case 'open-url': {
        const url = args[0];
        if (!url) {
          console.error("Usage: node cli.js open-url <HTTPS URL>");
          process.exit(1);
        }
        if (!validateUrl(url)) {
          console.error(`Error: Invalid or non-HTTPS URL '${url}'.`);
          process.exit(1);
        }
        openUrl(url);
        break;
      }
      case 'status': {
        status();
        break;
      }
      default: {
        console.error("Unknown command or missing command.");
        console.error("Available commands: play, take-photo, open-app, open-url, status");
        process.exit(1);
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
