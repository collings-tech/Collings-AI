const Store = require('electron-store');

const store = new Store({ encryptionKey: 'collings-ai-secure-key-2026' });

module.exports = store;
