// Quick setup script to load credentials from .env into Chrome storage
// Run this once in the extension's background context to load your .env credentials

// TO USE:
// 1. Make sure your .env file has the credentials
// 2. Open Chrome DevTools on the extension's background page
// 3. Copy and paste this code into the console
// 4. Press Enter to save the credentials to Chrome storage

const SIGHTENGINE_USER = '99526839';
const SIGHTENGINE_SECRET = 'PcEwBS5q2BmnSoCZzZRPND7qQMHBnTPA';

chrome.storage.sync.set({
  sightengineUser: SIGHTENGINE_USER,
  sightengineSecret: SIGHTENGINE_SECRET
}, () => {
  console.log('✅ Sightengine credentials saved to Chrome storage!');
  console.log('User:', SIGHTENGINE_USER);
  console.log('Secret:', SIGHTENGINE_SECRET.substring(0, 8) + '...');
});
