const axios = require('axios');
const db = require('../db/database');

const BASE_URL = 'https://graph.facebook.com/v19.0';

function getHeaders() {
  return { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` };
}

async function sendImage(to, imageUrl, caption) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  await axios.post(`${BASE_URL}/${phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: { link: imageUrl, caption }
  }, { headers: getHeaders() });
}

async function sendDesignUpdates(designs, recipient, baseUrl) {
  for (const design of designs) {
    if (!design.photo_path) continue;
    const imageUrl = `${baseUrl}/uploads/${design.photo_path}`;
    const caption = buildCaption(design);
    await sendImage(recipient, imageUrl, caption);
    // small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }
}

function buildCaption(design) {
  const row = db.prepare("SELECT value FROM settings WHERE key='whatsapp_template'").get();
  const template = row?.value || '*{item_name}* — Design {design_number}\nRate: ₹{rate}\n{pcs_per_set} pcs/set';
  return template
    .replace(/{item_name}/g, design.item_name || '')
    .replace(/{brand_name}/g, design.brand_name || '')
    .replace(/{design_number}/g, design.design_number || '')
    .replace(/{rate}/g, design.rate ?? '')
    .replace(/{pcs_per_set}/g, design.pcs_per_set ?? '')
    .replace(/{fabric_type}/g, design.fabric_type || '')
    .replace(/{colors}/g, design.colors || '')
    .replace(/\n?[^\n]*\{\}[^\n]*/g, '') // remove lines where a field was empty
    .replace(/[ \t]+·[ \t]+\n/g, '\n') // clean up orphan separators
    .trim();
}

module.exports = { sendImage, sendDesignUpdates, buildCaption };
