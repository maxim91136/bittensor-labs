// API handler for treasury data
// Fetches treasury data from Cloudflare KV Namespace via API

const fetch = require('node-fetch');

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_KV_NAMESPACE_ID = process.env.CF_KV_NAMESPACE_ID;
const CF_KV_KEY = process.env.CF_KV_KEY || 'treasury_data';
const CF_API_TOKEN = process.env.CF_API_TOKEN;

module.exports = async (req, res) => {
  if (!CF_ACCOUNT_ID || !CF_KV_NAMESPACE_ID || !CF_KV_KEY || !CF_API_TOKEN) {
    res.status(500).json({ error: 'Cloudflare KV credentials missing.' });
    return;
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/values/${CF_KV_KEY}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      res.status(response.status).json({ error: 'Failed to fetch treasury data from KV.' });
      return;
    }
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching treasury data from KV.' });
  }
};
