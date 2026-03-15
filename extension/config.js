/**
 * Configuration file for API credentials
 * For production: Store credentials in Chrome extension settings
 * For development: Can be loaded from .env file
 */

// These will be set by the settings page or loaded from storage
let CONFIG = {
  SIGHTENGINE_USER: null,
  SIGHTENGINE_SECRET: null
};

/**
 * Load Sightengine credentials from Chrome storage
 */
async function loadSightengineCredentials() {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve({ user: null, secret: null });
      return;
    }
    
    chrome.storage.sync.get(['sightengineUser', 'sightengineSecret'], (result) => {
      CONFIG.SIGHTENGINE_USER = result.sightengineUser || null;
      CONFIG.SIGHTENGINE_SECRET = result.sightengineSecret || null;
      resolve({
        user: CONFIG.SIGHTENGINE_USER,
        secret: CONFIG.SIGHTENGINE_SECRET
      });
    });
  });
}

/**
 * Get Sightengine credentials
 */
function getSightengineCredentials() {
  return {
    user: CONFIG.SIGHTENGINE_USER,
    secret: CONFIG.SIGHTENGINE_SECRET
  };
}

/**
 * Set Sightengine credentials (for settings page)
 */
async function setSightengineCredentials(user, secret) {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      CONFIG.SIGHTENGINE_USER = user;
      CONFIG.SIGHTENGINE_SECRET = secret;
      resolve();
      return;
    }
    
    chrome.storage.sync.set({ 
      sightengineUser: user, 
      sightengineSecret: secret 
    }, () => {
      CONFIG.SIGHTENGINE_USER = user;
      CONFIG.SIGHTENGINE_SECRET = secret;
      resolve();
    });
  });
}

export { loadSightengineCredentials, getSightengineCredentials, setSightengineCredentials, CONFIG };
