const crypto = require('crypto');

function generateUUID() {
  return crypto.randomUUID();
}

function generatePassword(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

function generateBase64Key(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64');
}

function generateHexKey(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

function generateShadowsocksPassword(method) {
  const keyLengths = {
    'aes-128-gcm': 16,
    'aes-256-gcm': 32,
    'chacha20-ietf-poly1305': 32,
    'xchacha20-ietf-poly1305': 32,
    '2022-blake3-aes-128-gcm': 16,
    '2022-blake3-aes-256-gcm': 32,
  };
  const len = keyLengths[method] || 32;
  return crypto.randomBytes(len).toString('base64');
}

function generateVPNKey(type = 'all') {
  const keys = {};

  if (type === 'all' || type === 'uuid') {
    keys.uuid = generateUUID();
  }
  if (type === 'all' || type === 'password') {
    keys.password = generatePassword();
  }
  if (type === 'all' || type === 'base64') {
    keys.base64Key = generateBase64Key();
  }
  if (type === 'all' || type === 'hex') {
    keys.hexKey = generateHexKey();
  }

  return keys;
}

module.exports = {
  generateUUID,
  generatePassword,
  generateBase64Key,
  generateHexKey,
  generateShadowsocksPassword,
  generateVPNKey,
};
