/**
 * MOCK DRIVE (No-op for Local Fallback)
 * Simulating Drive mirroring for local dev without credentials.
 */
async function mirrorToDrive({ buffer, filename, parentFolderId }) {
  console.log(`[Mock Drive] Mirrored ${filename} to folder ${parentFolderId || 'default'}`);
  return {
    id: `mock-drive-id-${Date.now()}`
  };
}

module.exports = {
  mirrorToDrive
};
