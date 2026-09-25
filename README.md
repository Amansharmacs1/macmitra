# MacMitra

MacMitra is a local tool to automate actions on your Mac, controllable via a local CLI (Phase 1) and WhatsApp Cloud API (Phase 2).

## Requirements
- macOS
- Node.js 20+

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   Copy the example environment file and add your credentials:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and fill in your keys:
   - **YouTube API Key**: Get it from Google Cloud Console.
   - **Gemini API Key (Phase 3)**: Go to [Google AI Studio](https://aistudio.google.com/), click "Get API key", create one, and paste it as `GEMINI_API_KEY`. (Your key stays securely on your Mac and is never logged or exposed).
   - **Meta API Credentials**: See WhatsApp setup below.

## WhatsApp Cloud API Setup (Phase 2)

1. **Create a Meta App:**
   - Go to [Meta for Developers](https://developers.facebook.com/) and create an app with "Other" > "Business".
   - Add the **WhatsApp** product.
   
2. **Retrieve Credentials:**
   - Go to WhatsApp > API Setup. Note the **Temporary Access Token** (or create a permanent one) and the **Phone Number ID** (not the phone number itself).
   - Go to App Settings > Basic. Note the **App Secret**.
   
3. **Configure Environment:**
   Update your `.env` file:
   ```bash
   WA_APP_SECRET=your_app_secret
   WA_VERIFY_TOKEN=make_up_a_custom_token
   WA_PHONE_NUMBER_ID=your_phone_number_id
   WA_ACCESS_TOKEN=your_access_token
   OWNER_WA_ID=your_number_with_country_code # e.g. 15551234567
   ```

4. **Expose Local Server:**
   - Start the local server:
     ```bash
     node server.js
     ```
   - Use an HTTPS tunnel to expose it (e.g. ngrok):
     ```bash
     ngrok http 3000
     ```

5. **Configure Webhook in Meta:**
   - Go to WhatsApp > Configuration.
   - Edit Webhook.
   - Enter your ngrok HTTPS URL + `/webhook` (e.g. `https://your-ngrok.ngrok-free.app/webhook`).
   - Enter the `WA_VERIFY_TOKEN` you created in your `.env`.
   - Click "Verify and Save".
   - Under "Webhook fields", subscribe to the `messages` event.

6. **Test with a real message:**
   Send a WhatsApp message from your `OWNER_WA_ID` number to the test number provided in the Meta API Setup page.
   Try sending: `status` or `take a photo`.

## Mac Deployment & LaunchAgent (Phase 4)

To keep MacMitra running automatically in the background and recovering from crashes, we deploy it as a macOS LaunchAgent.
*Note: Camera and UI actions (like opening apps) strictly require an active, logged-in desktop session.*

1. **Prepare the Plist File:**
   Edit the included `com.macmitra.plist` file.
   - Replace `REPLACE_WITH_YOUR_MACMITRA_PATH` with your absolute path (e.g., `/Users/amansharma/Desktop/MacMitra`).
   - If your `node` path is different (find via `which node`), update `/usr/local/bin/node` to the correct path (e.g., `/opt/homebrew/bin/node`).

2. **Install the LaunchAgent:**
   ```bash
   cp com.macmitra.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.macmitra.plist
   ```
   *To stop or uninstall:*
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.macmitra.plist
   ```

3. **Check Logs:**
   Logs are securely redacted to hide your phone number, API keys, and message contents.
   ```bash
   tail -f macmitra.log
   tail -f macmitra.error.log
   ```

4. **Health Check:**
   You can verify your configuration locally without exposing secrets:
   ```bash
   curl http://localhost:3000/health
   ```

## Troubleshooting & Permissions
- **Mac Action Permissions Not Ready:** If `/health` reports permissions are not ready, you need to grant **Accessibility** permissions. Go to `System Settings > Privacy & Security > Accessibility` and add your Terminal (or `node`). `take-photo` will require **Camera** permissions for Photo Booth.
- **WhatsApp Errors:** If the logs show "Invalid OAuth access token", verify your `WA_ACCESS_TOKEN` is current (test tokens expire every 24h).
- **Missed Commands:** Phase 4 stores states in `state.json`. If a webhook arrives while your Mac is offline, Meta retries it. Once your Mac turns on, MacMitra queues the webhooks sequentially and never repeats completed tasks. 

## End-to-End Checklist
- [ ] Dependencies installed (`npm install`).
- [ ] `.env` filled with YouTube, Meta, and Gemini keys.
- [ ] `node server.js` runs without crashing.
- [ ] Local `curl http://localhost:3000/health` returns `running` and `configured`.
- [ ] Ngrok tunnel active and configured in Meta Webhooks.
- [ ] LaunchAgent loaded.
- [ ] Tested sending "status" from your authorized WhatsApp number.

## Example WhatsApp Commands
MacMitra supports both **Direct Commands** (faster, strictly matched) and **Gemini-Interpreted Commands** (natural language, multilingual).

### Direct Commands
- `status`
- `play <song>`
- `take a photo` (Requires a 2-minute `confirm <code>` reply)
- `open <app>` (e.g. `open Safari`)
- `open <https://url>`
- `help`

### Gemini Commands (Phase 3)
- *"Can you play Kesariya on my Mac?"* -> Maps to `play Kesariya`
- *"Safari khol do"* -> Maps to `open Safari`
- *"Take a picture using my Mac camera"* -> Maps to `take-photo`

## Known Limits
- **App Allowlist & URLs:** Only a hardcoded list of harmless applications (`Notes`, `Safari`, `Calculator`, etc.) and `https://` URLs are allowed.
- **Photo Save Check:** The `take-photo` action verifies a photo was saved by polling `~/Pictures/Photo Booth Library/Pictures` for 10 seconds.
