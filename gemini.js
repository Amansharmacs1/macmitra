const { GoogleGenAI } = require('@google/genai');

async function interpretCommand(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing.');
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const systemInstruction = `You are MacMitra, an assistant that controls a Mac. 
Interpret the user's natural language command (which may be in English or Hinglish) and return ONE structured JSON object.
Do NOT return anything except the JSON object.
The JSON object must have a "command" field, which can only be one of:
- "play": if the user wants to play a song on YouTube. Must include an "args" field with the song name.
- "take-photo": if the user wants to take a picture/photo using the Mac camera.
- "open-app": if the user wants to open an application. Must include an "args" field with the app name.
- "open-url": if the user wants to open a website. Must include an "args" field with the full HTTPS URL.
- "status": if the user wants to check the status or if the system is ready.
- "unsupported": if the request is unclear, needs multiple steps, or asks for something not supported. Include a "reason" field with a short explanation to send to the user.

Example outputs:
{"command": "play", "args": "Kesariya"}
{"command": "take-photo"}
{"command": "open-app", "args": "Safari"}
{"command": "open-url", "args": "https://example.com"}
{"command": "status"}
{"command": "unsupported", "reason": "I can only play songs, open apps/URLs, or take photos."}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: text,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0,
        responseMimeType: 'application/json'
      }
    });

    const output = response.text;
    const parsed = JSON.parse(output);
    return parsed;
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw error;
  }
}

module.exports = { interpretCommand };
