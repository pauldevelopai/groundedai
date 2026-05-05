const fs = require('fs').promises;
const path = require('path');

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// Ensure uploads dir exists immediately when required
fs.mkdir(UPLOADS_DIR, { recursive: true }).catch(console.error);

/**
 * MOCK S3 (Local Disk Fallback)
 * Using local file system to simulate S3 to unblock local dev.
 */
async function uploadToS3({ buffer, key, contentType }) {
  const filePath = path.join(UPLOADS_DIR, key);
  
  // Create directories if key has slashes
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
  
  return {
    key,
    bucket: 'local-uploads',
    url: `/uploads/${key}`
  };
}

async function getSignedUrl(key) {
  // Mock endpoint that would theoretically serve the local file
  return `/api/archive/download?key=${encodeURIComponent(key)}`;
}

async function deleteFromS3(key) {
  const filePath = path.join(UPLOADS_DIR, key);
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

module.exports = {
  uploadToS3,
  getSignedUrl,
  deleteFromS3
};
