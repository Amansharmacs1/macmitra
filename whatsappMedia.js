const fs = require('fs');
const path = require('path');
const logger = require('./logger');

async function sendWhatsAppImage(to, imagePath) {
  const WA_ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN;
  const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID;

  if (!WA_ACCESS_TOKEN || !WA_PHONE_NUMBER_ID) {
    logger.error('Missing WA_ACCESS_TOKEN or WA_PHONE_NUMBER_ID');
    return false;
  }

  try {
    // 1. Upload Media
    const fileStat = fs.statSync(imagePath);
    const fileBuffer = fs.readFileSync(imagePath);
    const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const filename = path.basename(imagePath);

    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer], { type: mimeType }), filename);
    formData.append('type', mimeType);
    formData.append('messaging_product', 'whatsapp');

    const uploadRes = await fetch(`https://graph.facebook.com/v17.0/${WA_PHONE_NUMBER_ID}/media`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WA_ACCESS_TOKEN}`
      },
      body: formData
    });

    if (!uploadRes.ok) {
      const errorText = await uploadRes.text();
      logger.error('WhatsApp Media Upload Error:', errorText);
      return false;
    }

    const uploadData = await uploadRes.json();
    const mediaId = uploadData.id;

    // 2. Send Image Message
    const sendRes = await fetch(`https://graph.facebook.com/v17.0/${WA_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        type: 'image',
        image: { id: mediaId }
      })
    });

    if (!sendRes.ok) {
      const errorText = await sendRes.text();
      logger.error('WhatsApp Image Send Error:', errorText);
      return false;
    }

    return true;
  } catch (err) {
    logger.error('Failed to send image:', err);
    return false;
  }
}

module.exports = { sendWhatsAppImage };
