const fs = require('fs');
const path = require('path');
const xuiClient = require('./xuiClient');

const DATA_DIR = path.join(__dirname, '../../data');
const TRIALS_FILE = path.join(DATA_DIR, 'trials.json');
const TRIAL_SETTINGS_FILE = path.join(DATA_DIR, 'trial_settings.json');

const DEFAULT_CONFIG = {
  inboundId: parseInt(process.env.TRIAL_INBOUND_ID) || 1,
  expiryDays: parseInt(process.env.TRIAL_EXPIRY_DAYS) || 10,
  totalGB: parseInt(process.env.TRIAL_DATA_GB) || 100,
  ipLimit: parseInt(process.env.TRIAL_IP_LIMIT) || 1,
  maxTrials: parseInt(process.env.TRIAL_MAX_PER_USER) || 1,
};

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(TRIALS_FILE)) {
    fs.writeFileSync(TRIALS_FILE, JSON.stringify({ trials: {} }, null, 2));
  }
}

function loadTrialSettings() {
  if (!fs.existsSync(TRIAL_SETTINGS_FILE)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(TRIAL_SETTINGS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveTrialSettings(settings) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(TRIAL_SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function getTrialConfig() {
  const saved = loadTrialSettings();
  if (saved) {
    return {
      inboundId: saved.inboundId || DEFAULT_CONFIG.inboundId,
      expiryDays: saved.expiryDays || DEFAULT_CONFIG.expiryDays,
      totalGB: saved.totalGB || DEFAULT_CONFIG.totalGB,
      ipLimit: saved.ipLimit || DEFAULT_CONFIG.ipLimit,
      maxTrials: saved.maxTrials || DEFAULT_CONFIG.maxTrials,
      customMessage: saved.customMessage || '',
    };
  }
  return { ...DEFAULT_CONFIG, customMessage: '' };
}

function updateTrialConfig(updates) {
  const current = getTrialConfig();
  const newSettings = { ...current, ...updates };
  saveTrialSettings(newSettings);
  return newSettings;
}

function loadTrials() {
  ensureFile();
  return JSON.parse(fs.readFileSync(TRIALS_FILE, 'utf8'));
}

function saveTrials(data) {
  ensureFile();
  fs.writeFileSync(TRIALS_FILE, JSON.stringify(data, null, 2));
}

function hasUsedTrial(userId) {
  const data = loadTrials();
  const config = getTrialConfig();
  const id = String(userId);
  if (!data.trials[id]) return false;
  return data.trials[id].count >= config.maxTrials;
}

function getTrialInfo(userId) {
  const data = loadTrials();
  return data.trials[String(userId)] || null;
}

function recordTrial(userId, trialData) {
  const data = loadTrials();
  const id = String(userId);

  if (!data.trials[id]) {
    data.trials[id] = { count: 0, keys: [] };
  }

  data.trials[id].count += 1;
  data.trials[id].keys.push({
    ...trialData,
    createdAt: new Date().toISOString(),
  });

  saveTrials(data);
}

async function createTrialKey(userId, username) {
  const config = getTrialConfig();

  if (hasUsedTrial(userId)) {
    return { success: false, msg: 'Trial key ကို တစ်ကြိမ်သာ ထုတ်ခွင့်ရှိပါတယ်။' };
  }

  try {
    const inbound = await xuiClient.getInbound(config.inboundId);
    if (!inbound) {
      return { success: false, msg: 'Inbound not found' };
    }

    const safeName = (username || 'user').replace(/[^a-zA-Z0-9_]/g, '').substring(0, 8);
    const suffix = Math.random().toString(36).substring(2, 6);
    const email = `t_${safeName}_${userId}_${suffix}`;

    const inboundSettings = JSON.parse(inbound.settings);
    const clientConfig = xuiClient.createClientConfig(email, {
      expiryDays: config.expiryDays,
      totalGB: config.totalGB * 1024 * 1024 * 1024,
      limitIp: config.ipLimit,
      tgId: String(userId),
      protocol: inbound.protocol,
      method: inboundSettings.method || 'aes-256-gcm',
    });

    const res = await xuiClient.addClient(config.inboundId, clientConfig);

    if (!res.success) {
      return { success: false, msg: res.msg || 'Failed to create trial key' };
    }

    const serverHost = process.env.XUI_SERVER_HOST || '178.128.80.123';
    const link = xuiClient.generateLink(inbound, clientConfig, serverHost);

    const expiryDate = new Date(Date.now() + config.expiryDays * 24 * 60 * 60 * 1000);

    const trialData = {
      email,
      uuid: clientConfig.id,
      link,
      expiryDate: expiryDate.toISOString(),
      dataGB: config.totalGB,
      ipLimit: config.ipLimit,
      inboundRemark: inbound.remark || '',
    };

    recordTrial(userId, trialData);

    return {
      success: true,
      data: trialData,
    };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

function resetTrial(userId) {
  const data = loadTrials();
  const id = String(userId);
  if (data.trials[id]) {
    delete data.trials[id];
    saveTrials(data);
    return true;
  }
  return false;
}

function removeTrialKeyByEmail(email) {
  const data = loadTrials();
  let removed = false;
  for (const uid of Object.keys(data.trials)) {
    if (data.trials[uid].keys) {
      const before = data.trials[uid].keys.length;
      data.trials[uid].keys = data.trials[uid].keys.filter(k => k.email !== email);
      if (data.trials[uid].keys.length < before) removed = true;
    }
  }
  if (removed) saveTrials(data);
  return removed;
}

module.exports = {
  hasUsedTrial,
  getTrialInfo,
  createTrialKey,
  getTrialConfig,
  updateTrialConfig,
  resetTrial,
  removeTrialKeyByEmail,
};
