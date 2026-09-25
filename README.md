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

## Example WhatsApp Commands

MacMitra supports both **Direct Commands** (faster, strictly matched) and **Gemini-Interpreted Commands** (natural language, multilingual).

### Direct Commands (Phase 1 & 2)
If your message strictly matches these, it bypasses Gemini for instant execution:
- `status`
- `play <song>` (e.g. `play Kesariya`)
- `take a photo` (Requires a 2-minute `confirm <code>` reply)
- `open <app>` (e.g. `open Safari`)
- `open <https://url>`
- `help`

### Gemini Commands (Phase 3)
If a message isn't a direct command, Gemini interprets your intent securely. The resulting action is still validated against the strict local rules.
- *"Can you play Kesariya on my Mac?"* -> Maps to `play Kesariya`
- *"Safari khol do"* -> Maps to `open Safari`
- *"Take a picture using my Mac camera"* -> Maps to `take-photo` (still strictly requires you to reply `confirm <code>` to the generated prompt)
- *"Delete all files"* -> Maps to `unsupported` and safely rejected.

## Example CLI Commands

- **Check status:**
  ```bash
  node cli.js status
  ```
- **Play a song:**
  ```bash
  node cli.js play bohemian rhapsody
  ```
- **Take a photo:**
  ```bash
  node cli.js take-photo
  ```
- **Open an app:**
  ```bash
  node cli.js open-app Calculator
  ```
- **Open a URL:**
  ```bash
  node cli.js open-url https://en.wikipedia.org/wiki/Main_Page
  ```

## Known Limits
- **WhatsApp Testing:** Free test numbers have strict 24-hour windows and you must send a message to the test number first.
- **YouTube Autoplay:** Depending on your browser's strict autoplay policies, the opened YouTube video might be paused by default and require a click to play.
- **Permissions:** `take-photo` uses AppleScript and System Events, which requires explicit Accessibility permissions for your terminal application. Photo Booth itself also requires Camera access.
- **Verifying Photo Save:** The `take-photo` action verifies a photo was saved by polling `~/Pictures/Photo Booth Library/Pictures` for 10 seconds.
- **App Allowlist:** Only a hardcoded list of harmless applications can be opened via `open-app` / `open <app>`.
- **URL Restriction:** Only `https://` URLs are allowed via `open-url` / `open <url>`.
