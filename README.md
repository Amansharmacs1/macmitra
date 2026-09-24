# MacMitra (Phase 1)

MacMitra is a local CLI tool to automate actions on your Mac, built as the first phase before integrating with WhatsApp and Gemini.

## Requirements
- macOS
- Node.js 20+

## Setup

1. **Install dependencies:**
   \`\`\`bash
   npm install
   \`\`\`

2. **Configure environment:**
   Copy the example environment file and add your YouTube API Key:
   \`\`\`bash
   cp .env.example .env
   \`\`\`
   Edit \`.env\` and replace \`your_api_key_here\` with a valid YouTube Data API v3 key.

3. **Make the CLI executable (optional):**
   \`\`\`bash
   chmod +x cli.js
   \`\`\`

## Example Commands

- **Check status:**
  \`\`\`bash
  node cli.js status
  \`\`\`
  Confirms the local agent is working.

- **Play a song:**
  \`\`\`bash
  node cli.js play bohemian rhapsody
  \`\`\`
  Searches for the song on YouTube and opens the first video result.
  *(Note: Browser autoplay policies might prevent the video from playing automatically.)*

- **Take a photo:**
  \`\`\`bash
  node cli.js take-photo
  \`\`\`
  Opens Photo Booth and triggers the shutter. You may need to grant Accessibility permissions to Terminal/Node, and Camera permissions to Photo Booth. The script will try to verify if the photo was saved successfully.

- **Open an app:**
  \`\`\`bash
  node cli.js open-app Calculator
  \`\`\`
  Opens an application from the explicitly allowed list (e.g., Notes, Calculator, Calendar, Safari, Music, Photo Booth, Maps, Weather).

- **Open a URL:**
  \`\`\`bash
  node cli.js open-url https://en.wikipedia.org/wiki/Main_Page
  \`\`\`
  Opens the provided HTTPS URL in the default browser.

## Known Limits
- **YouTube Autoplay:** Depending on your browser's strict autoplay policies, the opened YouTube video might be paused by default and require a click to play.
- **Permissions:** \`take-photo\` uses AppleScript and System Events, which requires explicit Accessibility permissions for your terminal application (e.g., Terminal, iTerm, VS Code). If it fails, macOS might prompt you, or you may need to manually add your terminal in System Settings -> Privacy & Security -> Accessibility. Photo Booth itself also requires Camera access.
- **Verifying Photo Save:** The \`take-photo\` action verifies a photo was saved by looking for new files in \`~/Pictures/Photo Booth Library/Pictures\`. Depending on system speed, the 3-second countdown plus save time might occasionally cause the polling script to miss it if it takes longer than 10 seconds.
- **App Allowlist:** Only a hardcoded list of harmless applications can be opened via \`open-app\`.
- **URL Restriction:** Only \`https://\` URLs are allowed via \`open-url\`.
