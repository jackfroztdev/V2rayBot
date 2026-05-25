const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const KEYS_FILE = path.join(DATA_DIR, 'keys.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(KEYS_FILE)) {
    fs.writeFileSync(KEYS_FILE, JSON.stringify({ users: {} }, null, 2));
  }
}

function loadKeys() {
  ensureDataDir();
  const data = fs.readFileSync(KEYS_FILE, 'utf8');
  return JSON.parse(data);
}

function saveKeys(data) {
  ensureDataDir();
  fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
}

function storeKey(userId, keyName, keyData) {
  const data = loadKeys();
  if (!data.users[userId]) {
    data.users[userId] = { keys: {} };
  }
  data.users[userId].keys[keyName] = {
    ...keyData,
    createdAt: new Date().toISOString(),
  };
  saveKeys(data);
  return true;
}

function getKey(userId, keyName) {
  const data = loadKeys();
  if (!data.users[userId] || !data.users[userId].keys[keyName]) {
    return null;
  }
  return data.users[userId].keys[keyName];
}

function getAllKeys(userId) {
  const data = loadKeys();
  if (!data.users[userId]) {
    return {};
  }
  return data.users[userId].keys;
}

function deleteKey(userId, keyName) {
  const data = loadKeys();
  if (!data.users[userId] || !data.users[userId].keys[keyName]) {
    return false;
  }
  delete data.users[userId].keys[keyName];
  saveKeys(data);
  return true;
}

function getKeyCount(userId) {
  const keys = getAllKeys(userId);
  return Object.keys(keys).length;
}

module.exports = {
  storeKey,
  getKey,
  getAllKeys,
  deleteKey,
  getKeyCount,
};
