// API handler for treasury data
// Reads the file treasury_data.json and returns it as a JSON response

const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  // Path to treasury data file
  const dataPath = path.join(__dirname, 'treasury_data.json');

  // Check if the file exists
  if (!fs.existsSync(dataPath)) {
    res.status(404).json({ error: 'No treasury data found.' });
    return;
  }

  // Read file and return as JSON
  try {
    const data = fs.readFileSync(dataPath, 'utf8');
    const json = JSON.parse(data);
    res.status(200).json(json);
  } catch (err) {
    res.status(500).json({ error: 'Error reading treasury data.' });
  }
};
